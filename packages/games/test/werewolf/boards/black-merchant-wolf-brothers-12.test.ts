import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, wolvesKill } from '../helpers';

const BOARD = 'black-merchant-wolf-brothers-12';
const SEED = 1;
const elder = first(SEED, 'wolf_elder_brother', BOARD);
const younger = first(SEED, 'wolf_younger_brother', BOARD);
const merchant = first(SEED, 'black_merchant', BOARD);
const seer = first(SEED, 'seer', BOARD);
const [wolf = 0] = roleSeats(SEED, 'werewolf', BOARD);
const [villager = 0, villagerB = 0] = roleSeats(SEED, 'villager', BOARD);

const requestsOn = (run: ReturnType<typeof play>, phaseId: string, round: number) =>
  run.requests.filter(({ request, snapshot }) => request.phaseId === phaseId && snapshot.round === round).map(({ request }) => request);

describe('wolf brothers', () => {
  it('only know each other; the younger stays out of the pack and checks as good while the elder lives', () => {
    const run = play(SEED, act('seer_check', seer, [younger], 1), BOARD);
    const speeches = requestsIn(run, 'day_speech');
    expect(speeches.find((request) => request.seat === younger)?.prompt.identity).toContain(`你的哥哥狼兄是 ${elder}号`);
    expect(speeches.find((request) => request.seat === elder)?.prompt.identity).toContain(`你的弟弟狼弟是 ${younger}号`);
    expect(speeches.find((request) => request.seat === wolf)?.prompt.identity).not.toContain(`${younger}号`);
    expect(requestsIn(run, 'wolf_chat').map((request) => request.seat)).not.toContain(younger);
    expect(requestsIn(run, 'wolf_kill')[0]?.legalTargets).toContain(younger);
    expect(entries(run, 'action', 'seer_check')[0]?.text).toBe(`查验 ${younger}号：好人`);
  });

  it('lets the younger kill alone the night after the elder falls, then join the pack', () => {
    const run = play(SEED, combine(
      everyoneVotes('exile_vote', elder, 1),
      act('younger_brother_kill', younger, [villager], 2),
      act('seer_check', seer, [younger], 2),
    ), BOARD);
    expect(eliminated(run).slice(0, 2)).toEqual([
      { seat: elder, round: 1, reason: '被放逐' },
      { seat: villager, round: 2, reason: '昨晚死亡' },
    ]);
    const [kill] = requestsIn(run, 'younger_brother_kill');
    expect(kill?.legalTargets).not.toContain(younger);
    expect(kill?.legalTargets).not.toContain(elder);
    expect(kill?.legalTargets).toContain(wolf);
    expect(requestsIn(run, 'younger_brother_kill')).toHaveLength(1);
    expect(entries(run, 'action', 'seer_check').find((entry) => entry.round === 2)?.text).toBe(`查验 ${younger}号：狼人`);
    expect(requestsOn(run, 'wolf_chat', 2).map((request) => request.seat)).not.toContain(younger);
    const chat = requestsOn(run, 'wolf_chat', 3);
    expect(chat.map((request) => request.seat)).toContain(younger);
    expect(chat.find((request) => request.seat === wolf)?.prompt.history).toContain(`狼弟 ${younger}号 加入了狼队`);
    expect(run.snapshot.seats.find((seat) => seat.seat === younger)).toMatchObject({ role: 'wolf_younger_brother_pack', team: 'werewolf' });
  });
});

describe('black merchant (any night)', () => {
  it('may deal on any night after the witch, and is warned when the wolves got him', () => {
    const run = play(SEED, combine(wolvesKill(merchant, 1), act('merchant_deal', merchant, [villagerB], 1)), BOARD);
    const [offer] = requestsIn(run, 'merchant_deal');
    expect(offer?.prompt.output).toContain('空数组');
    expect(offer?.prompt.history).toContain('你今晚被狼人击杀，女巫没有救你');
    const order = run.log.filter((entry) => entry.round === 1).map((entry) => entry.phaseId);
    expect(order.indexOf('merchant_deal')).toBeGreaterThan(order.lastIndexOf('witch_poison'));
    expect(entries(run, 'narration', 'merchant_settle')[0]?.channel).toBe(`private:${villagerB}`);
    expect(eliminated(run)[0]).toEqual({ seat: merchant, round: 1, reason: '昨晚死亡' });
  });

  it('keeps offering the deal until it is used, and dies when it goes to the younger brother', () => {
    const passive = play(SEED, undefined, BOARD);
    expect(requestsIn(passive, 'merchant_deal').length).toBeGreaterThan(2);
    const run = play(SEED, act('merchant_deal', merchant, [younger], 2), BOARD);
    expect(eliminated(run)[0]).toEqual({ seat: merchant, round: 2, reason: '昨晚死亡' });
    expect(requestsOn(run, 'merchant_deal', 3)).toHaveLength(0);
  });
});
