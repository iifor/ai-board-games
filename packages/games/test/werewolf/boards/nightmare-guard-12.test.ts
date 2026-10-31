import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, wolvesKill, type Override } from '../helpers';

const BOARD = 'nightmare-guard-12';
const SEED = 12;
const nightmare = first(SEED, 'nightmare', BOARD);
const seer = first(SEED, 'seer', BOARD);
const witch = first(SEED, 'witch', BOARD);
const guard = first(SEED, 'guard', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const [wolf = 0] = roleSeats(SEED, 'werewolf', BOARD);
const [villager = 0, villagerB = 0] = roleSeats(SEED, 'villager', BOARD);

const fear = (target: number, night: number): Override => act('nightmare_fear', nightmare, [target], night);
const onNight = (run: ReturnType<typeof play>, phaseId: string, night: number) =>
  run.requests.filter(({ request, snapshot }) => request.phaseId === phaseId && snapshot.round === night);

describe('nightmare', () => {
  it('acts first each night, in private, may skip, and never fears himself or the same seat twice in a row', () => {
    const run = play(SEED, fear(villager, 1), BOARD);
    expect(run.requests[0]?.request).toMatchObject({ phaseId: 'nightmare_fear', seat: nightmare });
    const [nightOne, nightTwo] = requestsIn(run, 'nightmare_fear');
    expect(nightOne?.legalTargets).not.toContain(nightmare);
    expect(nightOne?.prompt.output).toContain('空数组');
    expect(nightTwo?.legalTargets).not.toContain(villager);
    expect(entries(run, 'action', 'nightmare_fear')[0]).toMatchObject({ channel: `private:${nightmare}`, text: `恐惧 ${villager}号` });
  });

  it('stops a feared seer from checking and tells him privately', () => {
    const run = play(SEED, fear(seer, 1), BOARD);
    expect(onNight(run, 'seer_check', 1)).toHaveLength(0);
    expect(onNight(run, 'seer_check', 2)).toHaveLength(1);
    expect(entries(run, 'narration', 'night_blocks')[0]).toMatchObject({ channel: `private:${seer}`, text: '你今晚被梦魇恐惧，今晚的夜间技能失效。' });
  });

  it('hides the knife from a feared witch and takes away her potions for the night', () => {
    const run = play(SEED, combine(fear(witch, 1), wolvesKill(villager, 1)), BOARD);
    expect(onNight(run, 'witch_save', 1)).toHaveLength(0);
    expect(onNight(run, 'witch_poison', 1)).toHaveLength(0);
    expect(eliminated(run)[0]).toMatchObject({ seat: villager, round: 1 });
  });

  it('stops a feared guard from guarding', () => {
    const run = play(SEED, combine(fear(guard, 1), act('guard_protect', guard, [villager], 1), wolvesKill(villager, 1)), BOARD);
    expect(onNight(run, 'guard_protect', 1)).toHaveLength(0);
    expect(eliminated(run)[0]).toMatchObject({ seat: villager, round: 1 });
  });

  it('takes the gun from a feared hunter killed that night, but not the next day', () => {
    const shoot = act('hunter_shot', hunter, [villagerB]);
    const killed = play(SEED, combine(fear(hunter, 1), wolvesKill(hunter, 1), shoot), BOARD);
    expect(requestsIn(killed, 'hunter_shot')).toHaveLength(0);
    expect(entries(killed, 'narration', 'night_blocks')[0]?.text).toBe('你今晚被梦魇恐惧：今晚若被狼人击杀，你将不能开枪。');

    const exiled = play(SEED, combine(fear(hunter, 1), everyoneVotes('exile_vote', hunter, 1), shoot), BOARD);
    expect(eliminated(exiled).slice(0, 2).map((death) => death.seat)).toEqual([hunter, villagerB]);
  });

  it('stops the whole wolf team from killing when he fears a wolf', () => {
    const run = play(SEED, combine(fear(wolf, 1), wolvesKill(villager, 1)), BOARD);
    expect(onNight(run, 'wolf_kill', 1)).toHaveLength(0);
    expect(entries(run, 'narration', 'night_blocks')[0]).toMatchObject({ channel: 'team:werewolf' });
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe('天亮了，昨晚是平安夜。');
  });

  it('can self-destruct', () => {
    const run = play(SEED, undefined, BOARD);
    expect(requestsIn(run, 'day_speech').find((request) => request.seat === nightmare)?.prompt.output).toContain('selfDestruct');
  });
});
