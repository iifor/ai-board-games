import { describe, expect, it } from 'vitest';
import { advance, createSnapshot, EngineInputError, scriptedOutput } from '../src';
import { makePlayers, runToEnd } from '../src/testing';
import { panelGame } from './fixtures/panelGame';
import { secretGame } from './fixtures/secretGame';

describe('debug', () => {
  it('pauses at breakpoints and continues', () => {
    const snapshot = createSnapshot(secretGame, { seed: 1, players: makePlayers(4), debug: { breakpoints: ['vote'] } });
    let result = advance(secretGame, snapshot, { kind: 'start' });
    const issued = new Map(result.aiRequests.map((request) => [request.id, request]));
    while (result.status === 'waiting_ai') {
      const request = issued.get(result.snapshot.pending[0]?.id ?? '');
      if (!request) throw new Error('找不到待回答的请求');
      const output = scriptedOutput(secretGame, result.snapshot, request);
      result = advance(secretGame, result.snapshot, { kind: 'ai_result', requestId: request.id, output });
      for (const next of result.aiRequests) issued.set(next.id, next);
    }
    expect(result.status).toBe('paused');
    expect(result.snapshot.cursor).toMatchObject({ phaseId: 'vote', entered: false });
    const resumed = advance(secretGame, result.snapshot, { kind: 'debug', command: 'continue' });
    expect(resumed.status).toBe('waiting_ai');
    expect(resumed.snapshot.cursor.phaseId).toBe('vote');
  });

  it('steps phase by phase', () => {
    const paused: string[] = [];
    const run = runToEnd(panelGame, {
      seed: 1,
      playerCount: 3,
      debug: { breakpoints: 'all' },
      onPause: 'step',
      agent: (request, snapshot) => {
        paused.push(snapshot.cursor.phaseId ?? '');
        return { output: scriptedOutput(panelGame, snapshot, request) };
      },
    });
    expect(run.snapshot.status).toBe('completed');
    expect(run.advances).toBeGreaterThan(run.requests.length + 1);
  });

  it('skips the current phase', () => {
    const run = runToEnd(panelGame, { seed: 1, playerCount: 3, debug: { breakpoints: ['pitch'] }, onPause: 'skip' });
    expect(run.log.some((entry) => entry.kind === 'speech')).toBe(false);
    expect(run.log.some((entry) => entry.kind === 'narration' && entry.channel === 'host' && entry.text.includes('跳过'))).toBe(true);
  });

  it('rejects debug commands outside paused debug matches', () => {
    const normal = createSnapshot(panelGame, { seed: 1, players: makePlayers(3) });
    expect(() => advance(panelGame, normal, { kind: 'debug', command: 'continue' })).toThrow(EngineInputError);
    const debugMatch = createSnapshot(panelGame, { seed: 1, players: makePlayers(3), debug: {} });
    const started = advance(panelGame, debugMatch, { kind: 'start' });
    expect(started.status).toBe('waiting_ai');
    expect(() => advance(panelGame, started.snapshot, { kind: 'debug', command: 'run' })).toThrow(/暂停/);
  });

  it('produces scripted outputs that are always accepted', () => {
    const runs = [1, 2, 3].map((seed) => runToEnd(secretGame, { seed }));
    for (const run of runs) expect(run.log.filter((entry) => entry.kind === 'fallback')).toHaveLength(0);
  });
});
