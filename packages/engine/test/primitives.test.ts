import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from '../src/runtime/rng';
import { SeatQuery, toSeatNumbers } from '../src/runtime/seats';
import type { Seat } from '../src/runtime/types';
import { deepFreeze } from '../src/utils/json';

function seat(no: number, role: string, team: string, position: number | null = null, alive = true): Seat {
  return { seat: no, profile: { playerId: `p${no}`, name: `玩家${no}`, persona: '', avatar: null }, role, team, position, alive };
}

describe('rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it('derives independent sequences per label', () => {
    const first = createRng(deriveSeed(42, 'a')).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    const second = createRng(deriveSeed(42, 'b')).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(first).not.toEqual(second);
    expect(deriveSeed(42, 'a')).toBe(deriveSeed(42, 'a'));
  });

  it('keeps int within range and rejects invalid bounds', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i += 1) expect(rng.int(3)).toBeLessThan(3);
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});

describe('SeatQuery', () => {
  const seats = [seat(1, 'pro', 'pro', 1), seat(2, 'pro', 'pro', 2), seat(3, 'con', 'con', 1, false), seat(4, 'judge', 'judge')];
  const query = new SeatQuery(seats);

  it('composes filters without mutating', () => {
    expect(query.alive().inTeam('pro', 'con').ids()).toEqual([1, 2]);
    expect(query.withRole('pro').except(1).ids()).toEqual([2]);
    expect(query.dead().ids()).toEqual([3]);
    expect(query.count()).toBe(4);
  });

  it('requires exactly one seat for position', () => {
    expect(query.inTeam('pro').position(2).seat).toBe(2);
    expect(() => query.position(1)).toThrow();
    expect(() => query.inTeam('judge').position(1)).toThrow();
  });

  it('normalizes selections to seat numbers', () => {
    expect(toSeatNumbers(query.inTeam('pro'))).toEqual([1, 2]);
    expect(toSeatNumbers([seats[3] as Seat, 2])).toEqual([4, 2]);
    expect(toSeatNumbers(seats[0] as Seat)).toEqual([1]);
  });
});

describe('deepFreeze', () => {
  it('freezes nested values', () => {
    const value = deepFreeze({ list: [{ x: 1 }] });
    expect(() => {
      (value.list[0] as { x: number }).x = 2;
    }).toThrow(TypeError);
  });
});
