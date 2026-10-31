import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, first, play, requestsIn, roleSeats, wolvesKill, type Override } from '../helpers';

const BOARD = 'heavenly-eye-requester-12';
const SEED = 1;
const eye = first(SEED, 'heavenly_eye', BOARD);
const requester = first(SEED, 'requester', BOARD);
const demon = first(SEED, 'demon', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const witch = first(SEED, 'witch', BOARD);
const wolves = roleSeats(SEED, 'werewolf', BOARD);
const [wolf = 0] = wolves;
const [villager = 0, villagerB = 0] = roleSeats(SEED, 'villager', BOARD);

const pray = (target: number): Override => act('requester_pray', requester, [target], 1);
const ownRules = (run: ReturnType<typeof play>) => requestsIn(run, 'day_speech').find((request) => request.seat === requester)?.prompt.rules ?? '';

describe('heavenly eye', () => {
  it('learns the exact role of the checked player', () => {
    const run = play(SEED, act('heavenly_eye_check', eye, [demon], 1), BOARD);
    expect(entries(run, 'action', 'heavenly_eye_check')[0]).toMatchObject({ channel: `private:${eye}`, text: `查验 ${demon}号：身份是恶魔` });
    expect(requestsIn(run, 'day_speech').find((request) => request.seat === eye)?.prompt.identity).toContain(`第1夜查验 ${demon}号，身份是恶魔`);
  });
});

describe('requester', () => {
  it('votes twice after praying to a villager', () => {
    const run = play(SEED, combine(pray(villager), (request, snapshot) => (request.phaseId === 'exile_vote' && snapshot.round === 1 && request.seat === requester
      ? { target: villagerB }
      : undefined)), BOARD);
    expect(entries(run, 'narration', 'requester_bless')[0]).toMatchObject({ channel: `private:${requester}`, text: `你祈求了 ${villager}号，他是平民：你在白天放逐投票中计为两票。` });
    expect(ownRules(run)).toContain(`你祈求了 ${villager}号`);
    expect(entries(run, 'vote_tallied', 'exile_vote')[0]).toMatchObject({
      ballots: [{ voter: requester, target: villagerB, weight: 2 }],
      tally: [{ target: villagerB, votes: 2 }],
    });
  });

  it('gets the hunter’s gun, which the demon shrugs off at night', () => {
    const run = play(SEED, combine(pray(hunter), wolvesKill(requester, 1), act('gift_shot', requester, [demon])), BOARD);
    expect(eliminated(run)[0]).toEqual({ seat: requester, round: 1, reason: '昨晚死亡' });
    expect(entries(run, 'action', 'gift_shot')[0]).toMatchObject({ channel: 'public', text: `开枪带走 ${demon}号` });
    expect(entries(run, 'narration', 'gift_shot_resolve')[0]?.text).toBe(`${demon}号中枪后没有出局。`);
  });

  it('gets the witch’s poison or one check from the heavenly eye', () => {
    const poisoned = play(SEED, combine(pray(witch), act('gift_poison', requester, [wolf], 1)), BOARD);
    expect(eliminated(poisoned)[0]).toEqual({ seat: wolf, round: 1, reason: '昨晚死亡' });
    const checked = play(SEED, combine(pray(eye), act('gift_check', requester, [demon], 2)), BOARD);
    expect(requestsIn(checked, 'gift_check')).toHaveLength(2);
    expect(entries(checked, 'action', 'gift_check').find((entry) => entry.round === 2)?.text).toBe(`查验 ${demon}号：狼人`);
  });

  it('becomes a lone third party after praying to a wolf and kills past the witch', () => {
    const run = play(SEED, combine(pray(wolf), act('requester_kill', requester, [villager], 1)), BOARD);
    expect(eliminated(run)[0]).toEqual({ seat: villager, round: 1, reason: '昨晚死亡' });
    expect(requestsIn(run, 'witch_save').filter((request) => request.legalTargets?.includes(villager))).toHaveLength(0);
    expect(ownRules(run)).toContain('你成为第三方');
  });

  it('keeps the good side from winning until the third-party requester is out too', () => {
    const exiles = [...wolves, demon, requester];
    const exile: Override = (request, snapshot) => {
      if (request.phaseId !== 'exile_vote') return undefined;
      const target = exiles[snapshot.round - 1] ?? 0;
      return { target: request.legalTargets?.includes(target) ? target : null };
    };
    const run = play(SEED, combine(pray(wolf), exile), BOARD);
    expect(eliminated(run).map((death) => death.seat)).toEqual(exiles);
    expect(run.snapshot.result).toMatchObject({ winner: 'good', summary: expect.stringContaining('狼人与第三方全部出局（第 5 天）') });
  });
});
