import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, first, play, requestsIn, stateOf, wolvesKill } from '../helpers';

const BOARD = 'evil-knight-guard-12';
const SEED = 10;
const knight = first(SEED, 'evil_knight', BOARD);
const seer = first(SEED, 'seer', BOARD);
const witch = first(SEED, 'witch', BOARD);
const hunter = first(SEED, 'hunter', BOARD);

const poisonKnight = (night: number) => act('witch_poison', witch, [knight], night);
const checkKnight = (night: number) => act('seer_check', seer, [knight], night);
const deathsOn = (run: ReturnType<typeof play>, round: number) =>
  eliminated(run).filter((death) => death.round === round).map((death) => death.seat).sort((a, b) => a - b);

describe('evil knight', () => {
  it('survives the poison and the witch dies that night instead', () => {
    const run = play(SEED, poisonKnight(1), BOARD);
    expect(deathsOn(run, 1)).toEqual([witch]);
    expect(stateOf(run.snapshot).evilKnightReflected).toBe(true);
  });

  it('kills the seer who checks him that night; the seer still learns he is a wolf', () => {
    const run = play(SEED, checkKnight(1), BOARD);
    expect(deathsOn(run, 1)).toEqual([seer]);
    expect(entries(run, 'action', 'seer_check')[0]?.text).toBe(`查验 ${knight}号：狼人`);
  });

  it('only kills the witch when checked and poisoned on the same night', () => {
    const run = play(SEED, combine(checkKnight(1), poisonKnight(1)), BOARD);
    expect(deathsOn(run, 1)).toEqual([witch]);
    expect(requestsIn(run, 'seer_check').length).toBeGreaterThan(1);
  });

  it('reflects only once per game', () => {
    const run = play(SEED, combine(checkKnight(1), poisonKnight(2)), BOARD);
    expect(deathsOn(run, 1)).toEqual([seer]);
    expect(deathsOn(run, 2)).toEqual([]);
    expect(stateOf(run.snapshot).potions.poison).toBe(false);
  });

  it('keeps the reflection when its target dies anyway that night', () => {
    const run = play(SEED, combine(wolvesKill(seer, 1), checkKnight(1), poisonKnight(2)), BOARD);
    expect(deathsOn(run, 1)).toEqual([seer]);
    expect(deathsOn(run, 2)).toEqual([witch]);
  });

  it('survives the gun of a hunter killed at night and cannot self-destruct', () => {
    const run = play(SEED, combine(wolvesKill(hunter, 1), act('hunter_shot', hunter, [knight])), BOARD);
    expect(deathsOn(run, 1)).toEqual([hunter]);
    expect(requestsIn(run, 'day_speech').find((request) => request.seat === knight)?.prompt.output).not.toContain('selfDestruct');
  });
});
