import { describe, expect, it } from 'vitest';
import { act, combine, first, play, wolvesKill } from './helpers';

const board = 'white-wolf-king-guard-12';
const seed = 11;
const guard = first(seed, 'guard', board);
const victim = first(seed, 'villager', board);
const witch = first(seed, 'witch', board);

describe('夜间结算动效', () => {
  it.each([
    [true, false, 'shield'], [false, true, 'heal'], [false, false, 'blade'], [true, true, 'blade'],
  ] as const)('守护 %s、解药 %s 的实际狼刀结算为 %s', (protectedSeat, saved, expected) => {
    const record = play(seed, combine(wolvesKill(victim, 1),
      act('guard_protect', guard, protectedSeat ? [victim] : [], 1),
      act('witch_save', witch, saved ? [victim] : [], 1)), board);
    const cues = record.stageEvents.flatMap(e => e.channel === 'spectator' && e.kind === 'revealed' && e.round === 1 && e.data.target === victim ? [e.data.effect] : []);
    expect(cues).toEqual([expected]);
  });
});
