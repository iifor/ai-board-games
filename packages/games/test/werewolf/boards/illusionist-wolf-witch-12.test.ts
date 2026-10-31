import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, wolvesKill, type Override } from '../helpers';

const BOARD = 'illusionist-wolf-witch-12';
const SEED = 1;
const wolfWitch = first(SEED, 'wolf_witch', BOARD);
const illusionist = first(SEED, 'illusionist', BOARD);
const seer = first(SEED, 'seer', BOARD);
const witch = first(SEED, 'witch', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const wolves = roleSeats(SEED, 'werewolf', BOARD);
const [villager = 0, villagerB = 0] = roleSeats(SEED, 'villager', BOARD);

const requestsOn = (run: ReturnType<typeof play>, phaseId: string, round: number) =>
  run.requests.filter(({ request, snapshot }) => request.phaseId === phaseId && snapshot.round === round).map(({ request }) => request);
const curse = (target: number, night = 1): Override => act('wolf_witch_curse', wolfWitch, [target], night);
const illusion = (phantom: number, night = 1): Override => act('illusionist_illusion', illusionist, [phantom], night);

describe('wolf witch', () => {
  it('wakes first and curses a good player, who is told privately and loses that night’s skill', () => {
    const run = play(SEED, curse(seer), BOARD);
    const order = run.log.filter((entry) => entry.round === 1).map((entry) => entry.phaseId);
    expect(order.indexOf('wolf_witch_curse')).toBeLessThan(order.indexOf('illusionist_illusion'));
    expect(order.indexOf('wolf_witch_curse')).toBeLessThan(order.indexOf('wolf_chat'));
    expect(requestsIn(run, 'wolf_witch_curse')[0]?.legalTargets).not.toContain(wolves[0]);
    expect(entries(run, 'action', 'wolf_witch_curse')[0]).toMatchObject({ channel: 'team:werewolf', text: `狼巫诅咒 ${seer}号` });
    expect(entries(run, 'narration', 'wolf_witch_notice')[0]).toMatchObject({ channel: `private:${seer}`, round: 1 });
    expect(requestsOn(run, 'seer_check', 1)).toHaveLength(0);
    expect(requestsOn(run, 'seer_check', 2)).toHaveLength(1);
  });

  it('cools down for one night after cursing', () => {
    const run = play(SEED, curse(seer), BOARD);
    expect(requestsOn(run, 'wolf_witch_curse', 2)).toHaveLength(0);
    expect(requestsOn(run, 'wolf_witch_curse', 3)).toHaveLength(1);
  });

  it('keeps the witch from seeing the knife', () => {
    const run = play(SEED, combine(curse(witch), wolvesKill(villager)), BOARD);
    expect(requestsOn(run, 'witch_save', 1)).toHaveLength(0);
    expect(eliminated(run)[0]).toEqual({ seat: villager, round: 1, reason: '昨晚死亡' });
  });

  it('stops a cursed hunter from shooting until the next night', () => {
    const killed = play(SEED, combine(curse(hunter), wolvesKill(hunter)), BOARD);
    expect(eliminated(killed)[0]).toEqual({ seat: hunter, round: 1, reason: '昨晚死亡' });
    expect(requestsIn(killed, 'hunter_shot')).toHaveLength(0);
    const exiled = play(SEED, combine(curse(hunter), everyoneVotes('exile_vote', hunter, 1)), BOARD);
    expect(eliminated(exiled)[0]).toEqual({ seat: hunter, round: 1, reason: '被放逐' });
    expect(requestsIn(exiled, 'hunter_shot')).toHaveLength(0);
    const later = play(SEED, combine(curse(hunter), wolvesKill(hunter, 2)), BOARD);
    expect(requestsIn(later, 'hunter_shot')).toHaveLength(1);
  });
});

describe('illusionist', () => {
  it('lets the phantom die in his place when knifed, then cools down', () => {
    const run = play(SEED, combine(illusion(villager), wolvesKill(illusionist)), BOARD);
    expect(entries(run, 'action', 'illusionist_illusion')[0]).toMatchObject({ channel: `private:${illusionist}`, text: `以 ${villager}号 为幻象` });
    expect(requestsIn(run, 'illusionist_illusion')[0]?.legalTargets).not.toContain(illusionist);
    expect(eliminated(run)[0]).toEqual({ seat: villager, round: 1, reason: '昨晚死亡' });
    expect(run.snapshot.seats.find((seat) => seat.seat === illusionist)?.alive).toBe(true);
    expect(requestsOn(run, 'illusionist_illusion', 2)).toHaveLength(0);
    expect(requestsOn(run, 'illusionist_illusion', 3)).toHaveLength(1);
  });

  it('lets the phantom take the poison; a poisoned phantom hunter cannot shoot', () => {
    const run = play(SEED, combine(illusion(hunter), act('witch_poison', witch, [illusionist], 1)), BOARD);
    expect(eliminated(run)[0]).toEqual({ seat: hunter, round: 1, reason: '昨晚死亡' });
    expect(requestsIn(run, 'hunter_shot')).toHaveLength(0);
  });

  it('spares the phantom when the illusionist survives the night', () => {
    const run = play(SEED, combine(illusion(villagerB), wolvesKill(illusionist), act('witch_save', witch, [illusionist], 1)), BOARD);
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe('天亮了，昨晚是平安夜。');
  });

  it('cannot cast while cursed by the wolf witch', () => {
    const run = play(SEED, curse(illusionist), BOARD);
    expect(requestsOn(run, 'illusionist_illusion', 1)).toHaveLength(0);
    expect(requestsOn(run, 'illusionist_illusion', 2)).toHaveLength(1);
  });
});
