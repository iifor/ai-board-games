import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, stateOf, wolvesKill } from '../helpers';

const BOARD = 'demon-guard-12';
const SEED = 9;
const demon = first(SEED, 'demon', BOARD);
const seer = first(SEED, 'seer', BOARD);
const witch = first(SEED, 'witch', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const wolves = roleSeats(SEED, 'werewolf', BOARD);
const [villager = 0] = roleSeats(SEED, 'villager', BOARD);

const check = (target: number, night: number) => act('demon_check', demon, [target], night);

describe('demon', () => {
  it('checks a good player each night and privately learns god or villager', () => {
    const run = play(SEED, combine(check(seer, 1), check(villager, 2)), BOARD);
    const [nightOne, nightTwo] = requestsIn(run, 'demon_check');
    expect(nightOne?.legalTargets?.some((seat) => seat === demon || wolves.includes(seat))).toBe(false);
    expect(nightOne?.prompt.output).not.toContain('空数组');
    expect(entries(run, 'action', 'demon_check').slice(0, 2)).toMatchObject([
      { channel: `private:${demon}`, text: `查验 ${seer}号：神职` },
      { channel: `private:${demon}`, text: `查验 ${villager}号：平民` },
    ]);
    expect(nightTwo?.prompt.identity).toContain(`第1夜查验 ${seer}号，结果是神职`);
  });

  it('is a wolf to the seer', () => {
    const run = play(SEED, act('seer_check', seer, [demon], 1), BOARD);
    expect(entries(run, 'action', 'seer_check')[0]?.text).toBe(`查验 ${demon}号：狼人`);
  });

  it('survives the witch’s poison, which is still used up', () => {
    const run = play(SEED, act('witch_poison', witch, [demon], 1), BOARD);
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe('天亮了，昨晚是平安夜。');
    expect(stateOf(run.snapshot).potions.poison).toBe(false);
  });

  it('survives the gun of a hunter killed at night but not of an exiled hunter', () => {
    const night = play(SEED, combine(wolvesKill(hunter, 1), act('hunter_shot', hunter, [demon])), BOARD);
    expect(eliminated(night).filter((death) => death.round === 1).map((death) => death.seat)).toEqual([hunter]);
    expect(entries(night, 'narration', 'hunter_resolve')[0]?.text).toBe(`${demon}号中枪后没有出局。`);

    const day = play(SEED, combine(everyoneVotes('exile_vote', hunter, 1), act('hunter_shot', hunter, [demon])), BOARD);
    expect(eliminated(day).slice(0, 2).map((death) => death.seat)).toEqual([hunter, demon]);
  });

  it('cannot self-destruct', () => {
    const run = play(SEED, undefined, BOARD);
    expect(requestsIn(run, 'day_speech').find((request) => request.seat === demon)?.prompt.output).not.toContain('selfDestruct');
  });
});
