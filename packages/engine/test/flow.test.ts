import { describe, expect, it } from 'vitest';
import { advance, compileGame, createSnapshot, EngineInputError } from '../src';
import { makePlayers, runToEnd } from '../src/testing';
import { counterSpec } from './fixtures/minimal';
import { secretGame } from './fixtures/secretGame';

describe('flow', () => {
  it('loops through transitions and ends normally', () => {
    const run = runToEnd(compileGame(counterSpec(3)), { seed: 1 });
    expect(run.snapshot.result).toMatchObject({ endReason: 'normal', summary: '计数到 3（normal）' });
    expect(run.snapshot.round).toBe(3);
    expect(run.log.filter((entry) => entry.kind === 'narration').map((entry) => 'text' in entry && entry.text))
      .toEqual(['第1轮开始', '第2轮开始', '第3轮开始']);
  });

  it('ends by budget when rounds exceed maxRounds', () => {
    const run = runToEnd(compileGame(counterSpec(10, { budget: { maxRounds: 2 } })), { seed: 1 });
    expect(run.snapshot.result?.endReason).toBe('budget');
    expect(run.snapshot.round).toBe(2);
  });

  it('ends by budget when a phase exceeds maxVisits', () => {
    const run = runToEnd(compileGame(counterSpec(10, { budget: { maxPhaseVisits: 4 } })), { seed: 1 });
    expect(run.snapshot.result).toMatchObject({ endReason: 'budget', summary: '计数到 4（budget）' });
    expect(run.log.some((entry) => entry.channel === 'host' && entry.kind === 'narration')).toBe(true);
  });

  it('accepts start exactly once and never mutates the input snapshot', () => {
    const game = compileGame(counterSpec(1));
    const snapshot = createSnapshot(game, { seed: 1, players: makePlayers(2) });
    const before = JSON.stringify(snapshot);
    const result = advance(game, snapshot, { kind: 'start' });
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(result.status).toBe('completed');
    expect(() => advance(game, result.snapshot, { kind: 'start' })).toThrow(EngineInputError);
  });

  it('rejects snapshots from another spec version', () => {
    const snapshot = createSnapshot(compileGame(counterSpec(1)), { seed: 1, players: makePlayers(2) });
    expect(() => advance(compileGame(counterSpec(1, { version: 2 })), snapshot, { kind: 'start' })).toThrow(/不匹配/);
  });
});

describe('createSnapshot', () => {
  it('validates player count, uniqueness and params', () => {
    expect(() => createSnapshot(secretGame, { seed: 1, players: makePlayers(3) })).toThrow(/4-6/);
    const duplicated = [...makePlayers(3), ...makePlayers(1)];
    expect(() => createSnapshot(secretGame, { seed: 1, players: duplicated })).toThrow(/重复/);
    expect(() => createSnapshot(secretGame, { seed: 1, players: makePlayers(4), params: { rounds: 9 } })).toThrow(/开局参数/);
    expect(createSnapshot(secretGame, { seed: 1, players: makePlayers(4) }).params).toEqual({ rounds: 2 });
  });

  it('assigns roles deterministically by seed', () => {
    const roles = (seed: number) => createSnapshot(secretGame, { seed, players: makePlayers(6) }).seats.map((seat) => seat.role);
    expect(roles(3)).toEqual(roles(3));
    expect(roles(3).filter((role) => role === 'red')).toHaveLength(2);
    const distinct = new Set(Array.from({ length: 20 }, (_, seed) => roles(seed).join(',')));
    expect(distinct.size).toBeGreaterThan(1);
  });
});
