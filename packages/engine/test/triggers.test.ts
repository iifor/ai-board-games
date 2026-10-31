import { describe, expect, it } from 'vitest';
import { compileGame, SpecError, type LogEntry } from '../src';
import { assertDeterministic, assertNoLeak, assertTerminates, runToEnd, type Agent } from '../src/testing';
import { agentWith } from './fixtures/agents';
import { chainGame, chainSpec } from './fixtures/chainGame';

type Of<K extends LogEntry['kind']> = Extract<LogEntry, { kind: K }>;
const entries = <K extends LogEntry['kind']>(log: readonly LogEntry[], kind: K) =>
  log.filter((entry): entry is Of<K> => entry.kind === kind);

/** votes[轮次][投票者] = 目标；shot = 猎手开枪目标（null 为放弃）；boomRound = 爆破手在第几轮引爆 */
function scenario(votes: Record<number, Record<number, number>>, shot: number | null, boomRound?: number): Agent {
  return agentWith(chainGame, (request, snapshot) => {
    if (request.phaseId === 'vote') {
      const target = votes[snapshot.round]?.[request.seat];
      return target === undefined ? undefined : { output: { target } };
    }
    if (request.phaseId === 'hunter_shot') return { output: { targets: shot === null ? [] : [shot] } };
    if (request.phaseId === 'talk' && request.seat === 2 && snapshot.round === boomRound) {
      return { output: { speech: '引爆！', declare: 'boom' } };
    }
    return undefined;
  });
}

describe('push triggers', () => {
  const run = runToEnd(chainGame, {
    seed: 1,
    playerCount: 5,
    agent: scenario({ 1: { 1: 3, 2: 1, 3: 1, 4: 1, 5: 1 }, 2: { 2: 3, 3: 2, 5: 2 } }, 4),
  });

  it('inserts last words and the hunter shot after an exile, then resumes', () => {
    const order = run.log
      .filter((entry) => entry.kind === 'phase_started' || entry.kind === 'seat_eliminated')
      .map((entry) => (entry.kind === 'phase_started' ? `${entry.title}@${entry.round}` : `出局${entry.seat}@${entry.round}`));
    expect(order.slice(0, 7)).toEqual(['发言@1', '放逐@1', '出局1@1', '遗言@1', '开枪@1', '出局4@1', '遗言@1']);
    expect(order[7]).toBe('发言@2');
    expect(entries(run.log, 'speech').filter((entry) => entry.phaseId === 'last_words').map((entry) => entry.seat)).toEqual([1, 4]);
    expect(run.snapshot.stack).toEqual([]);
  });

  it('exposes the triggering event to the inserted phases', () => {
    const shot = entries(run.log, 'action').find((entry) => entry.action === '开枪');
    expect(shot).toMatchObject({ seat: 1, targets: [4], channel: 'private:1' });
  });

  it('turns to the game-over phase and drops pending last words', () => {
    const lastPhase = entries(run.log, 'phase_started').map((entry) => entry.title);
    expect(lastPhase[lastPhase.length - 1]).toBe('复盘');
    expect(entries(run.log, 'speech').filter((entry) => entry.phaseId === 'last_words').map((entry) => entry.seat)).not.toContain(2);
    expect(run.snapshot.result).toMatchObject({ winner: 'town' });
  });

  it('reveals all roles after revealRoles', () => {
    const reveal = entries(run.log, 'revealed')[0];
    expect(reveal?.data.roles).toHaveLength(5);
    const lastEvent = run.stageEvents[run.stageEvents.length - 1];
    expect(lastEvent?.view.seats.every((seat) => seat.role !== null)).toBe(true);
    expect(run.stageEvents.find((event) => event.kind === 'speech')?.view.seats.every((seat) => seat.role === null)).toBe(true);
  });
});

describe('jump triggers', () => {
  it('aborts the current phase, clears pending requests and enters the next round', () => {
    const run = runToEnd(chainGame, { seed: 1, playerCount: 5, agent: scenario({}, null, 1) });
    const talk = entries(run.log, 'speech').filter((entry) => entry.phaseId === 'talk');
    expect(talk.map((entry) => entry.seat)).toEqual([1, 2]);
    expect(entries(run.log, 'action')).toEqual([expect.objectContaining({ seat: 2, text: '宣布引爆', channel: 'public' })]);
    expect(entries(run.log, 'seat_eliminated')).toEqual([expect.objectContaining({ seat: 2, round: 2 })]);
    expect(run.snapshot.result?.winner).toBe('town');
  });

  it('only offers the declaration to seats allowed to make it', () => {
    const run = runToEnd(chainGame, { seed: 1, playerCount: 5, agent: scenario({}, null, 1) });
    const talkRequests = run.requests.filter(({ request }) => request.phaseId === 'talk');
    const bomber = talkRequests.find(({ request }) => request.seat === 2);
    const villager = talkRequests.find(({ request }) => request.seat === 1);
    expect(bomber?.request.prompt.output).toContain('boom=引爆');
    expect(villager?.request.prompt.output).not.toContain('boom');
  });
});

describe('weighted votes and declining actions', () => {
  it('counts a weighted ballot', () => {
    const run = runToEnd(chainGame, {
      seed: 1,
      playerCount: 5,
      agent: scenario({ 1: { 1: 4, 2: 4, 3: 5, 4: 5, 5: 1 } }, null),
    });
    const tally = entries(run.log, 'vote_tallied')[0];
    expect(tally?.tally).toEqual(expect.arrayContaining([{ target: 5, votes: 3 }, { target: 4, votes: 2 }]));
    expect(tally?.ballots.find((ballot) => ballot.voter === 3)?.weight).toBe(2);
    expect(entries(run.log, 'seat_eliminated')[0]?.seat).toBe(5);
  });

  it('records abstentions and resolves to no one when everyone abstains', () => {
    const base = chainSpec();
    const vote = base.phases.vote;
    if (vote?.kind !== 'vote') throw new Error('fixture 中 vote 应为投票阶段');
    const game = compileGame({ ...base, phases: { ...base.phases, vote: { ...vote, allowAbstain: true } } });
    const run = runToEnd(game, {
      seed: 1,
      playerCount: 5,
      maxAdvances: 200,
      agent: agentWith(game, (request) => (request.phaseId === 'vote' ? { output: { target: null } } : undefined)),
    });
    const tally = entries(run.log, 'vote_tallied')[0];
    expect(tally).toMatchObject({ ballots: [], abstained: [1, 2, 3, 4, 5], outcome: { kind: 'none' } });
    expect(run.requests.find(({ request }) => request.phaseId === 'vote')?.request.prompt.output).toContain('null 表示弃票');
  });

  it('adds bonus votes to the tally, limited to candidates, and shows them in the history', () => {
    const base = chainSpec();
    const vote = base.phases.vote;
    if (vote?.kind !== 'vote') throw new Error('fixture 中 vote 应为投票阶段');
    const game = compileGame({
      ...base,
      phases: { ...base.phases, vote: { ...vote, bonus: (ctx) => (ctx.round === 1 ? [{ target: 5, votes: 1 }, { target: 9, votes: 3 }] : []) } },
    });
    const votes: Record<number, number> = { 1: 4, 2: 4, 3: 5, 4: 1, 5: 1 };
    const run = runToEnd(game, {
      seed: 1,
      playerCount: 5,
      agent: agentWith(game, (request, snapshot) => (request.phaseId === 'vote' && snapshot.round === 1
        ? { output: { target: votes[request.seat] } }
        : undefined)),
    });
    const tally = entries(run.log, 'vote_tallied')[0];
    expect(tally?.tally).toEqual([{ target: 5, votes: 3 }, { target: 1, votes: 2 }, { target: 4, votes: 2 }]);
    expect(tally?.ballots.reduce((sum, ballot) => sum + ballot.weight, 0)).toBe(6);
    expect(entries(run.log, 'seat_eliminated')[0]?.seat).toBe(5);
    const later = run.requests.find(({ snapshot }) => snapshot.round === 2);
    expect(later?.request.prompt.history).toContain('额外票：5号+1');
  });

  it('lets the hunter decline to shoot', () => {
    const run = runToEnd(chainGame, { seed: 1, playerCount: 5, agent: scenario({ 1: { 1: 3, 2: 1, 3: 1, 4: 1, 5: 1 } }, null) });
    expect(entries(run.log, 'action').find((entry) => entry.seat === 1)).toMatchObject({ targets: [], text: '放弃开枪' });
    expect(entries(run.log, 'seat_eliminated').filter((entry) => entry.round === 1).map((entry) => entry.seat)).toEqual([1]);
  });
});

describe('trigger budget and compile checks', () => {
  it('ends by budget when inserted phases exceed the stack depth', () => {
    const game = compileGame(chainSpec({ budget: { maxStackDepth: 0 } }));
    const run = runToEnd(game, { seed: 1, playerCount: 5, agent: scenario({ 1: { 1: 3, 2: 1, 3: 1, 4: 1, 5: 1 } }, null) });
    expect(run.snapshot.result?.endReason).toBe('budget');
  });

  it('rejects return on the main flow and malformed triggers', () => {
    const base = chainSpec();
    let issues: readonly string[] = [];
    try {
      compileGame({
        ...base,
        phases: { ...base.phases, vote: { ...(base.phases.vote as object), next: 'return' } as never },
        triggers: [
          { id: 'both', on: 'seat_eliminated', push: 'last_words', jump: 'boom' },
          { id: 'missing', on: 'seat_eliminated', push: 'nowhere' },
          { id: 'round', on: 'seat_eliminated', push: 'hunter_shot', round: 'increment' },
        ],
        gameOver: { when: () => false, goto: 'afterparty' },
      });
    } catch (error) {
      if (!(error instanceof SpecError)) throw error;
      issues = error.issues;
    }
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining('阶段 vote 可从主流程到达，不能 return'),
      expect.stringContaining('必须且只能指定 push 或 jump'),
      expect.stringContaining('push 到不存在的阶段 "nowhere"'),
      expect.stringContaining('round 只能与 jump'),
      expect.stringContaining('gameOver 转入不存在的阶段'),
    ]));
  });
});

describe('chain properties', () => {
  it('terminates, stays deterministic and does not leak', () => {
    const runs = assertTerminates(chainGame, Array.from({ length: 100 }, (_, index) => index + 1), { playerCount: 6 });
    for (const run of runs) assertNoLeak(chainGame, run);
    expect(() => assertDeterministic(chainGame, { seed: 3, playerCount: 6 })).not.toThrow();
  });
});
