import { createSnapshot, type AiRequest, type LogEntry } from '@battle/engine';
import {
  assertDeterministic,
  assertNoLeak,
  assertTerminates,
  makePlayers,
  runToEnd,
  scriptedAgent,
  type Agent,
  type AgentReply,
} from '@battle/engine/testing';
import { describe, expect, it } from 'vitest';
import { debateSeatLabel } from './rules';
import { debateGame } from './spec';
import type { DebateState } from './state';
import { DEBATE_TOPICS } from './topics';

const TOPIC = { title: '测试辩题', pro: '测试正方观点', con: '测试反方观点' };

function agentWith(override: (request: AiRequest) => AgentReply | undefined): Agent {
  const fallback = scriptedAgent(debateGame);
  return (request, snapshot) => override(request) ?? fallback(request, snapshot);
}

function judgeAgent(verdicts: readonly ('pro' | 'con')[]): Agent {
  let index = 0;
  return agentWith((request) => {
    if (request.action !== 'judge') return undefined;
    const verdict = verdicts[index] ?? 'pro';
    index += 1;
    return { output: { verdict, comment: `评委认为${verdict === 'pro' ? '正方' : '反方'}更有说服力` } };
  });
}

const speechLog = (log: readonly LogEntry[]) =>
  log.filter((entry): entry is Extract<LogEntry, { kind: 'speech' }> => entry.kind === 'speech');

describe('debate setup', () => {
  it('accepts 9-12 players and rejects fewer', () => {
    expect(() => createSnapshot(debateGame, { seed: 1, players: makePlayers(8) })).toThrow(/9-12/);
    for (const count of [9, 12]) {
      const snapshot = createSnapshot(debateGame, { seed: 1, players: makePlayers(count) });
      expect(snapshot.seats.filter((seat) => seat.role === 'judge')).toHaveLength(count - 8);
    }
  });

  it('gives each side four numbered debaters', () => {
    const { seats } = createSnapshot(debateGame, { seed: 3, players: makePlayers(10) });
    for (const side of ['pro', 'con']) {
      const positions = seats.filter((seat) => seat.role === side).map((seat) => seat.position);
      expect(positions).toEqual([1, 2, 3, 4]);
    }
  });

  it('uses the given topic, or draws one by seed', () => {
    const given = createSnapshot(debateGame, { seed: 1, players: makePlayers(9), params: { topic: TOPIC } });
    expect((given.state as DebateState).topic).toEqual(TOPIC);
    const drawn = (seed: number) => (createSnapshot(debateGame, { seed, players: makePlayers(9) }).state as DebateState).topic;
    expect(drawn(5)).toEqual(drawn(5));
    expect(DEBATE_TOPICS).toContainEqual(drawn(5));
    expect(new Set(Array.from({ length: 30 }, (_, seed) => drawn(seed).title)).size).toBeGreaterThan(1);
  });
});

describe('debate flow', () => {
  it('follows the opening, crossfire and closing order', () => {
    const run = runToEnd(debateGame, { seed: 2, playerCount: 9 });
    const label = (side: string, position: number) => {
      const seat = run.snapshot.seats.find((item) => item.role === side && item.position === position);
      if (!seat) throw new Error(`缺少 ${side}${position}`);
      return seat.seat;
    };
    expect(speechLog(run.log).map((entry) => entry.seat)).toEqual([
      label('pro', 1), label('con', 1),
      label('pro', 2), label('con', 2),
      label('con', 2), label('pro', 3),
      label('pro', 3), label('con', 3),
      label('con', 3), label('pro', 2),
      label('con', 4), label('pro', 4),
    ]);
  });

  it('tells crossfire speakers who they are questioning or answering', () => {
    const run = runToEnd(debateGame, { seed: 2, playerCount: 9 });
    const [question, answer] = run.requests.filter(({ request }) => request.phaseId === 'crossfire');
    const seatOf = (seatNo: number | undefined) => run.snapshot.seats.find((seat) => seat.seat === seatNo);
    const target = seatOf(answer?.request.seat);
    const asker = seatOf(question?.request.seat);
    if (!target || !asker) throw new Error('缺少攻辩请求');
    expect(question?.request.prompt.instruction).toContain(`向${debateSeatLabel(target)}提出`);
    expect(answer?.request.prompt.instruction).toContain(`回答${debateSeatLabel(asker)}`);
    expect(answer?.request.prompt.history).toContain(speechLog(run.log)[2]?.text);
  });

  it('puts the topic and side stance into prompts and the audience view', () => {
    const run = runToEnd(debateGame, { seed: 4, playerCount: 9, params: { topic: TOPIC } });
    const opening = run.requests.find(({ request }) => request.phaseId === 'opening');
    expect(opening?.request.prompt.rules).toContain(TOPIC.title);
    expect(opening?.request.prompt.identity).toContain(TOPIC.pro);
    const announcement = run.stageEvents.find((event) => event.kind === 'narration');
    expect(announcement).toMatchObject({ text: expect.stringContaining(TOPIC.title), view: { extra: { topic: TOPIC } } });
  });
});

describe('debate judging', () => {
  it('awards the side with the most judge votes', () => {
    const run = runToEnd(debateGame, { seed: 1, playerCount: 11, agent: judgeAgent(['con', 'pro', 'con']) });
    expect(run.snapshot.result).toMatchObject({ winner: 'con', winnerLabel: '反方胜出' });
    expect(run.snapshot.result?.summary).toContain('评委 1:2');
  });

  it('declares a draw when judges split evenly', () => {
    const run = runToEnd(debateGame, { seed: 1, playerCount: 10, agent: judgeAgent(['pro', 'con']) });
    expect(run.snapshot.result).toMatchObject({ winner: 'draw', winnerLabel: '双方平局' });
  });

  it('retries and then falls back when a judge returns an invalid verdict', () => {
    const run = runToEnd(debateGame, {
      seed: 1,
      playerCount: 9,
      agent: agentWith((request) => (request.action === 'judge' ? { output: { verdict: '都很好', comment: '' } } : undefined)),
    });
    expect(run.requests.filter(({ request }) => request.action === 'judge').map(({ request }) => request.attempt)).toEqual([1, 2]);
    expect(['pro', 'con']).toContain(run.snapshot.result?.winner);
    expect(run.log.filter((entry) => entry.kind === 'fallback')).toHaveLength(1);
  });

  it('only lets judges pick a debater as MVP', () => {
    const run = runToEnd(debateGame, {
      seed: 6,
      playerCount: 9,
      agent: agentWith((request) => (request.action === 'vote' && request.attempt === 1 ? { output: { target: request.seat } } : undefined)),
    });
    const mvpRequests = run.requests.filter(({ request }) => request.phaseId === 'mvp');
    expect(mvpRequests.map(({ request }) => request.attempt)).toEqual([1, 2]);
    const mvp = run.snapshot.result?.mvp;
    expect(run.snapshot.seats.find((seat) => seat.seat === mvp)?.role).toMatch(/^(pro|con)$/);
  });
});

describe('debate properties', () => {
  const seeds = Array.from({ length: 100 }, (_, index) => index + 1);

  it('terminates for 100 seeds across 9-12 players without leaking', () => {
    const runs = [9, 10, 11, 12].flatMap((playerCount) =>
      assertTerminates(debateGame, seeds.slice((playerCount - 9) * 25, (playerCount - 8) * 25), { playerCount }));
    for (const run of runs) {
      assertNoLeak(debateGame, run);
      expect(run.log.filter((entry) => entry.kind === 'fallback')).toHaveLength(0);
    }
    expect(runs).toHaveLength(100);
  });

  it('is deterministic', () => {
    expect(() => assertDeterministic(debateGame, { seed: 8, playerCount: 12 })).not.toThrow();
  });
});
