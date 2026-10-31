import { describe, expect, it } from 'vitest';
import { advance, compileGame, createSnapshot, EngineInputError, type LogEntry } from '../src';
import { makePlayers, runToEnd } from '../src/testing';
import { agentWith } from './fixtures/agents';
import { secretGame, secretSpec, type SecretState } from './fixtures/secretGame';

const speeches = (log: readonly LogEntry[], channel = 'public') =>
  log.filter((entry): entry is Extract<LogEntry, { kind: 'speech' }> => entry.kind === 'speech' && entry.channel === channel);

describe('speak', () => {
  it('lets later sequential speakers see earlier speeches', () => {
    const run = runToEnd(secretGame, { seed: 7 });
    const [first, second] = run.requests.filter(({ request }) => request.phaseId === 'red_chat');
    expect(first?.request.prompt.history).not.toContain('红队密谈」的发言');
    const firstSpeech = speeches(run.log, 'team:red')[0];
    expect(second?.request.prompt.history).toContain(firstSpeech?.text);
  });

  it('issues parallel speeches at once without peers in history', () => {
    const base = secretSpec.phases.talk;
    if (base?.kind !== 'speak') throw new Error('fixture 中 talk 应为发言阶段');
    const talk = { ...base, mode: 'parallel' as const };
    const game = compileGame({ ...secretSpec, phases: { ...secretSpec.phases, talk } });
    let snapshot = createSnapshot(game, { seed: 2, players: makePlayers(4) });
    let result = advance(game, snapshot, { kind: 'start' });
    while (!result.aiRequests.some((request) => request.phaseId === 'talk')) {
      const request = result.aiRequests[0];
      if (!request) throw new Error('没有待回答的请求');
      snapshot = result.snapshot;
      result = advance(game, snapshot, { kind: 'ai_result', requestId: request.id, output: { speech: `红队-${request.seat}` } });
    }
    const talkRequests = result.aiRequests.filter((request) => request.phaseId === 'talk');
    expect(talkRequests).toHaveLength(4);
    expect(result.snapshot.pending).toHaveLength(4);
  });

  it('retries invalid output with the reason, then falls back', () => {
    const run = runToEnd(secretGame, {
      seed: 3,
      agent: agentWith(secretGame, (request) => (request.phaseId === 'talk' && request.seat === 1 ? { output: { words: 1 } } : undefined)),
    });
    const attempts = run.requests.filter(({ request }) => request.phaseId === 'talk' && request.seat === 1 && request.id.includes('#1:'));
    expect(attempts.map(({ request }) => request.attempt)).toEqual([1, 2]);
    expect(attempts[1]?.request.prompt.output).toContain('上一次的输出不合法');
    expect(speeches(run.log).find((entry) => entry.seat === 1)?.text).toBe('1号没有想好怎么说');
    expect(run.log.find((entry) => entry.kind === 'fallback' && entry.seat === 1)).toMatchObject({ channel: 'host' });
  });

  it('rejects content that fails validation', () => {
    const run = runToEnd(secretGame, {
      seed: 3,
      agent: agentWith(secretGame, (request, snapshot) => request.phaseId === 'talk' && request.seat === 2 && request.attempt === 1
        ? { output: { speech: `我知道${(snapshot.state as SecretState).secret}` } }
        : undefined),
    });
    const retry = run.requests.find(({ request }) => request.phaseId === 'talk' && request.seat === 2 && request.attempt === 2);
    expect(retry?.request.prompt.output).toContain('不能说出机密词');
    expect(speeches(run.log).some((entry) => entry.text.includes('机密词'))).toBe(false);
  });

  it('falls back immediately when the transport reports failure', () => {
    const run = runToEnd(secretGame, {
      seed: 4,
      agent: agentWith(secretGame, (request) => (request.phaseId === 'talk' ? { failed: 'timeout' } : undefined)),
    });
    expect(run.requests.filter(({ request }) => request.phaseId === 'talk' && request.attempt > 1)).toHaveLength(0);
    expect(run.log.filter((entry) => entry.kind === 'fallback' && entry.reason.includes('timeout')).length).toBeGreaterThan(0);
  });
});

describe('act', () => {
  it('rejects illegal targets, logs privately and applies decisions', () => {
    const run = runToEnd(secretGame, {
      seed: 5,
      playerCount: 4,
      agent: agentWith(secretGame, (request) => (request.phaseId === 'mark' && request.attempt === 1 ? { output: { targets: [request.seat] } } : undefined)),
    });
    const marks = run.log.filter((entry): entry is Extract<LogEntry, { kind: 'action' }> => entry.kind === 'action');
    for (const mark of marks) {
      expect(mark.channel).toBe(`private:${mark.seat}`);
      expect(mark.targets).not.toContain(mark.seat);
    }
    const firstRoundMarks = (run.requests.find(({ request }) => request.phaseId === 'vote')?.snapshot.state as SecretState).marks;
    expect(Object.keys(firstRoundMarks)).toHaveLength(4);
  });
});

describe('vote', () => {
  it('runs a runoff among tied seats, then breaks the tie by seed', () => {
    // 4 人：1、2 投 3，3、4 投 1 → 1 与 3 平票；复投中候选只剩 1、3，按投票者自身规则再次平票
    const tieAgent = agentWith(secretGame, (request) => {
      if (request.phaseId !== 'vote') return undefined;
      const legal = request.legalTargets ?? [];
      const prefer = request.seat <= 2 ? 3 : 1;
      return { output: { target: legal.includes(prefer) ? prefer : (legal.find((seat) => seat !== request.seat) ?? legal[0]) } };
    });
    const run = runToEnd(secretGame, { seed: 9, playerCount: 4, params: { rounds: 1 }, agent: tieAgent });
    const tallies = run.log.filter((entry): entry is Extract<LogEntry, { kind: 'vote_tallied' }> => entry.kind === 'vote_tallied');
    expect(tallies[0]).toMatchObject({ runoff: 0, tied: [1, 3], outcome: null });
    const runoffRequests = run.requests.filter(({ request }) => request.phaseId === 'vote' && request.id.includes(':r1:'));
    for (const { request } of runoffRequests) expect(request.legalTargets?.every((seat) => [1, 3].includes(seat))).toBe(true);
    const final = tallies[1];
    expect(final?.outcome).toMatchObject({ kind: 'selected', byTieBreak: true });
    // 阶段结果带有最后一轮（复投）的选票，规则可据此知道每个人投给了谁
    expect(final?.ballots).toHaveLength(4);
    expect(run.snapshot.results.vote).toMatchObject({ kind: 'vote', rounds: 2, tied: [1, 3], ballots: final?.ballots });
    const again = runToEnd(secretGame, { seed: 9, playerCount: 4, params: { rounds: 1 }, agent: tieAgent });
    expect(again.log).toEqual(run.log);
  });
});

describe('input validation', () => {
  it('rejects unknown request ids and results while not waiting', () => {
    const snapshot = createSnapshot(secretGame, { seed: 1, players: makePlayers(4) });
    expect(() => advance(secretGame, snapshot, { kind: 'ai_result', requestId: 'x', output: {} })).toThrow(EngineInputError);
    const started = advance(secretGame, snapshot, { kind: 'start' });
    expect(() => advance(secretGame, started.snapshot, { kind: 'ai_result', requestId: 'nope', output: {} })).toThrow(/未知/);
    const [request] = started.aiRequests;
    const answered = advance(secretGame, started.snapshot, { kind: 'ai_result', requestId: request?.id ?? '', output: { speech: '好' } });
    expect(() => advance(secretGame, answered.snapshot, { kind: 'ai_result', requestId: request?.id ?? '', output: { speech: '好' } })).toThrow(/未知/);
  });

  it('ends by budget when AI requests are exhausted', () => {
    const game = compileGame({ ...secretSpec, budget: { maxAiRequests: 3 } });
    const run = runToEnd(game, { seed: 1, playerCount: 4 });
    expect(run.requests).toHaveLength(3);
    expect(run.snapshot.result?.endReason).toBe('budget');
  });
});
