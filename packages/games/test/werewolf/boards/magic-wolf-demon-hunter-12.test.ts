import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, stateOf, wolvesKill, type Override } from '../helpers';

const BOARD = 'magic-wolf-demon-hunter-12';
const SEED = 1;
const magic = first(SEED, 'magic_wolf', BOARD);
const hunter = first(SEED, 'demon_hunter', BOARD);
const witch = first(SEED, 'witch', BOARD);
const wolves = roleSeats(SEED, 'werewolf', BOARD);
const [wolf = 0] = wolves;
const [villager = 0, villagerB = 0] = roleSeats(SEED, 'villager', BOARD);

const requestsOn = (run: ReturnType<typeof play>, phaseId: string, round: number) =>
  run.requests.filter(({ request, snapshot }) => request.phaseId === phaseId && snapshot.round === round).map(({ request }) => request);
/** 第 day 天由 seat 自爆 */
const selfDestruct = (seat: number, day: number): Override => (request, snapshot) => (
  request.phaseId === 'day_speech' && request.seat === seat && snapshot.round === day ? { speech: '我自爆。', declare: 'selfDestruct' } : undefined
);
const hunt = (target: number, night: number) => act('demon_hunter_hunt', hunter, [target], night);

describe('magic wolf', () => {
  it('seals every god skill on the night after self-destructing', () => {
    const run = play(SEED, combine(selfDestruct(magic, 1), wolvesKill(villager, 2)), BOARD);
    expect(eliminated(run)[0]).toEqual({ seat: magic, round: 1, reason: '自爆' });
    expect(entries(run, 'narration', 'magic_wolf_seal')[0]).toMatchObject({ channel: 'public', text: `${magic}号是魔狼：今晚所有神职的技能都被封印。` });
    for (const phase of ['seer_check', 'witch_save', 'witch_poison', 'demon_hunter_hunt']) expect(requestsOn(run, phase, 2)).toHaveLength(0);
    expect(eliminated(run)[1]).toEqual({ seat: villager, round: 2, reason: '昨晚死亡' });
    expect(requestsOn(run, 'seer_check', 3)).toHaveLength(1);
    expect(requestsOn(run, 'demon_hunter_hunt', 3)).toHaveLength(1);
  });

  it('survives an exile as the last wolf, kills once more and fades after the next dawn', () => {
    const packGone = combine(...wolves.map((seat, index) => selfDestruct(seat, index + 1)));
    const run = play(SEED, combine(packGone, everyoneVotes('exile_vote', magic, 4), wolvesKill(villagerB, 5)), BOARD);
    expect(eliminated(run).slice(0, 3).map((death) => death.seat)).toEqual(wolves);
    const reveal = entries(run, 'revealed', 'exile_resolve').find((entry) => entry.round === 4);
    expect(reveal?.text).toContain(`${magic}号翻牌，身份是魔狼`);
    expect(stateOf(run.snapshot).magicWolfDoom).toBe(5);
    expect(requestsOn(run, 'wolf_kill', 5).map((request) => request.seat)).toEqual([magic]);
    expect(eliminated(run).slice(3)).toEqual([
      { seat: villagerB, round: 5, reason: '昨晚死亡' },
      { seat: magic, round: 5, reason: '血脉之力耗尽' },
    ]);
    expect(run.snapshot.result?.winner).toBe('good');
  });

  it('counts as out when the day limit is reached while he waits for the dawn', () => {
    const packGone = combine(...wolves.map((seat, index) => selfDestruct(seat, index + 1)));
    const run = play(SEED, combine(packGone, everyoneVotes('exile_vote', magic, 6)), BOARD);
    expect(stateOf(run.snapshot).magicWolfDoom).toBe(7);
    expect(run.snapshot.result).toMatchObject({ winner: 'good', endReason: 'budget' });
  });

  it('is exiled as usual while other wolves are alive', () => {
    const run = play(SEED, everyoneVotes('exile_vote', magic, 1), BOARD);
    expect(eliminated(run)[0]).toEqual({ seat: magic, round: 1, reason: '被放逐' });
    expect(stateOf(run.snapshot).magicWolfDoom).toBeNull();
  });
});

describe('demon hunter', () => {
  it('hunts from the second night: a wolf target dies', () => {
    const run = play(SEED, hunt(wolf, 2), BOARD);
    expect(requestsOn(run, 'demon_hunter_hunt', 1)).toHaveLength(0);
    expect(entries(run, 'action', 'demon_hunter_hunt')[0]).toMatchObject({ channel: `private:${hunter}`, text: `狩猎 ${wolf}号` });
    expect(requestsIn(run, 'demon_hunter_hunt')[0]?.legalTargets).not.toContain(hunter);
    expect(eliminated(run)[0]).toEqual({ seat: wolf, round: 2, reason: '昨晚死亡' });
  });

  it('dies himself when hunting a good player', () => {
    const run = play(SEED, hunt(villager, 2), BOARD);
    expect(eliminated(run)[0]).toEqual({ seat: hunter, round: 2, reason: '昨晚死亡' });
  });

  it('is immune to the witch’s poison', () => {
    const run = play(SEED, act('witch_poison', witch, [hunter], 1), BOARD);
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe('天亮了，昨晚是平安夜。');
    expect(stateOf(run.snapshot).potions.poison).toBe(false);
  });
});
