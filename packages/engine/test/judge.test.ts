import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../src';
import { runToEnd } from '../src/testing';
import { agentWith } from './fixtures/agents';
import { panelGame } from './fixtures/panelGame';

function verdictAgent(verdicts: Record<number, string>) {
  return agentWith(panelGame, (request) =>
    request.action === 'judge' ? { output: { verdict: verdicts[request.seat] ?? 'first', comment: `${request.seat}号评委点评` } } : undefined);
}

describe('judge', () => {
  it('decides by majority', () => {
    const run = runToEnd(panelGame, { seed: 1, playerCount: 5, agent: verdictAgent({ 3: 'second', 4: 'second', 5: 'first' }) });
    expect(run.snapshot.result?.winner).toBe('second');
    expect(run.snapshot.results.review).toMatchObject({ kind: 'judge', counts: { first: 1, second: 2 } });
  });

  it('uses the tie verdict on equal counts', () => {
    const run = runToEnd(panelGame, { seed: 1, playerCount: 4, agent: verdictAgent({ 3: 'first', 4: 'second' }) });
    expect(run.snapshot.result?.winner).toBe('draw');
  });

  it('judges in order and later judges see earlier comments', () => {
    const run = runToEnd(panelGame, { seed: 1, playerCount: 5, agent: verdictAgent({}) });
    const judgeRequests = run.requests.filter(({ request }) => request.action === 'judge');
    expect(judgeRequests.map(({ request }) => request.seat)).toEqual([3, 4, 5]);
    expect(judgeRequests[2]?.request.prompt.history).toContain('4号评委点评');
    const judgements = run.log.filter((entry): entry is Extract<LogEntry, { kind: 'judgement' }> => entry.kind === 'judgement');
    expect(judgements[0]).toMatchObject({ verdictLabel: '支持 1 号位', channel: 'public' });
  });

  it('falls back to a valid verdict when output is invalid', () => {
    const run = runToEnd(panelGame, {
      seed: 1,
      playerCount: 3,
      agent: agentWith(panelGame, (request) => (request.action === 'judge' ? { output: { verdict: 'nobody', comment: '' } } : undefined)),
    });
    expect(['first', 'second']).toContain(run.snapshot.result?.winner);
    expect(run.log.filter((entry) => entry.kind === 'fallback')).toHaveLength(1);
  });

  it('assigns positions and public roles', () => {
    const run = runToEnd(panelGame, { seed: 1, playerCount: 3 });
    expect(run.snapshot.seats.map((seat) => [seat.role, seat.position])).toEqual([['speaker', 1], ['speaker', 2], ['judge', null]]);
    expect(run.stageEvents[0]?.view.seats.every((seat) => seat.role !== null)).toBe(true);
  });
});

describe('judge output contract', () => {
  it('explains what each verdict key means', () => {
    const run = runToEnd(panelGame, { seed: 1, playerCount: 3 });
    const judge = run.requests.find(({ request }) => request.action === 'judge');
    expect(judge?.request.prompt.output).toContain('first=支持 1 号位；second=支持 2 号位');
  });
});
