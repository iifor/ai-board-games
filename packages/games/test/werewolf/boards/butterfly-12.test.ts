import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, first, play, requestsIn, roleSeats, wolvesKill, type Override } from '../helpers';

const BOARD = 'butterfly-12';
const SEED = 6;
const butterfly = first(SEED, 'butterfly', BOARD);
const seer = first(SEED, 'seer', BOARD);
const stalker = first(SEED, 'stalker', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const [wolf = 0] = roleSeats(SEED, 'werewolf', BOARD);
const [villager = 0, villagerB = 0] = roleSeats(SEED, 'villager', BOARD);

const hug = (target: number, night: number): Override => act('butterfly_hug', butterfly, [target], night);
const onNight = (run: ReturnType<typeof play>, phaseId: string, night: number) =>
  run.requests.filter(({ request, snapshot }) => request.phaseId === phaseId && snapshot.round === night);

describe('butterfly', () => {
  it('has no witch on this board', () => {
    expect(roleSeats(SEED, 'witch', BOARD)).toHaveLength(0);
    const run = play(SEED, undefined, BOARD);
    expect(run.log.some((entry) => entry.phaseId === 'witch_save')).toBe(false);
  });

  it('cancels the night skill of the hugged player and tells him privately', () => {
    const run = play(SEED, hug(seer, 1), BOARD);
    expect(onNight(run, 'seer_check', 1)).toHaveLength(0);
    expect(onNight(run, 'seer_check', 2)).toHaveLength(1);
    const notice = entries(run, 'narration', 'night_blocks')[0];
    expect(notice).toMatchObject({ channel: `private:${seer}`, text: '你今晚被花蝴蝶抱住，今晚的夜间技能失效。' });
    expect(entries(run, 'action', 'butterfly_hug')[0]).toMatchObject({ channel: `private:${butterfly}`, text: `抱住 ${seer}号` });
  });

  it('stops the whole wolf team from killing when it hugs a wolf', () => {
    const run = play(SEED, combine(hug(wolf, 1), wolvesKill(villager, 1)), BOARD);
    expect(onNight(run, 'wolf_chat', 1)).toHaveLength(0);
    expect(onNight(run, 'wolf_kill', 1)).toHaveLength(0);
    expect(entries(run, 'narration', 'night_blocks')[0]).toMatchObject({ channel: 'team:werewolf', text: '今晚有狼人被花蝴蝶抱住，狼队今晚不能击杀。' });
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe('天亮了，昨晚是平安夜。');
  });

  it('hugs at most twice and never itself', () => {
    const run = play(SEED, combine(hug(villager, 1), hug(villagerB, 2)), BOARD);
    const hugs = requestsIn(run, 'butterfly_hug');
    expect(hugs).toHaveLength(2);
    expect(hugs[0]?.legalTargets).not.toContain(butterfly);
    expect(onNight(run, 'butterfly_hug', 3)).toHaveLength(0);
  });

  it('blocks the stalker’s assassination that night', () => {
    const stalkerVotes: Override = (request, snapshot) => {
      if (request.phaseId !== 'exile_vote' || snapshot.round !== 1) return undefined;
      if (request.seat === stalker) return { target: villager };
      return { target: (request.legalTargets ?? []).includes(villagerB) ? villagerB : null };
    };
    const free = play(SEED, stalkerVotes, BOARD);
    expect(onNight(free, 'stalker_assassinate', 2)).toHaveLength(1);
    const hugged = play(SEED, combine(stalkerVotes, hug(stalker, 2)), BOARD);
    expect(onNight(hugged, 'stalker_assassinate', 2)).toHaveLength(0);
    expect(onNight(hugged, 'stalker_assassinate', 3)).toHaveLength(0);
  });

  it('does not take away the hunter’s gun', () => {
    const run = play(SEED, combine(hug(hunter, 1), wolvesKill(hunter, 1), act('hunter_shot', hunter, [villager])), BOARD);
    expect(eliminated(run).slice(0, 2).map((death) => death.seat)).toEqual([hunter, villager]);
  });
});
