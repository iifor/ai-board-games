import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, stateOf, wolvesKill, type Override } from '../helpers';

const BOARD = 'black-merchant-big-tree-12';
const SEED = 1;
const merchant = first(SEED, 'black_merchant', BOARD);
const tree = first(SEED, 'big_tree', BOARD);
const seer = first(SEED, 'seer', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const witch = first(SEED, 'witch', BOARD);
const king = first(SEED, 'white_wolf_king', BOARD);
const [wolf = 0, wolfB = 0] = roleSeats(SEED, 'werewolf', BOARD);
const [lucky = 0, villager = 0] = roleSeats(SEED, 'villager', BOARD);

const dealWith = (target: number): Override => act('merchant_deal_early', merchant, [target], 1);
const pick = (phaseId: string): Override => act(phaseId, merchant, [merchant], 1);
const requestsOn = (run: ReturnType<typeof play>, phaseId: string, round: number) =>
  run.requests.filter(({ request, snapshot }) => request.phaseId === phaseId && snapshot.round === round).map(({ request }) => request);

describe('black merchant (first night)', () => {
  it('deals first on the first night and the lucky villager can check the same night', () => {
    const run = play(SEED, combine(dealWith(lucky), pick('merchant_skill_check'), act('gift_check', lucky, [wolf], 1)), BOARD);
    const [deal] = requestsIn(run, 'merchant_deal_early');
    expect(deal?.prompt.output).not.toContain('空数组');
    expect(requestsIn(run, 'merchant_deal_early')).toHaveLength(1);
    const order = run.log.filter((entry) => entry.round === 1).map((entry) => entry.phaseId);
    expect(order.indexOf('merchant_deal_early')).toBeLessThan(order.indexOf('wolf_chat'));
    expect(entries(run, 'narration', 'merchant_settle')[0]).toMatchObject({ channel: `private:${lucky}`, text: expect.stringContaining('预言家的验') });
    expect(entries(run, 'action', 'gift_check')[0]).toMatchObject({ channel: `private:${lucky}`, text: `查验 ${wolf}号：狼人` });
    expect(requestsOn(run, 'gift_check', 2)).toHaveLength(0);
    expect(requestsIn(run, 'day_speech').find((request) => request.seat === lucky)?.prompt.rules).toContain(`第1夜查验 ${wolf}号，结果是狼人`);
  });

  it('dies at dawn after dealing with a wolf, who learns nothing', () => {
    const run = play(SEED, dealWith(wolf), BOARD);
    expect(eliminated(run)[0]).toEqual({ seat: merchant, round: 1, reason: '昨晚死亡' });
    expect(run.log.some((entry) => entry.channel === `private:${wolf}` && entry.kind === 'narration')).toBe(false);
    expect(stateOf(run.snapshot).gifts[String(wolf)]).toBeUndefined();
  });

  it('gives a gun that fires without revealing the role', () => {
    const run = play(SEED, combine(dealWith(lucky), pick('merchant_skill_gun'), wolvesKill(lucky), act('gift_shot', lucky, [wolfB])), BOARD);
    expect(eliminated(run).slice(0, 2)).toEqual([
      { seat: lucky, round: 1, reason: '昨晚死亡' },
      { seat: wolfB, round: 1, reason: '被枪杀' },
    ]);
    expect(entries(run, 'action', 'gift_shot')[0]).toMatchObject({ channel: 'public', text: `开枪带走 ${wolfB}号` });
  });

  it('gives a poison that can be used later', () => {
    const run = play(SEED, combine(dealWith(lucky), act('gift_poison', lucky, [wolf], 2)), BOARD);
    expect(requestsIn(run, 'gift_poison')[0]?.prompt.rules).toContain('你持有一瓶额外的毒药');
    expect(eliminated(run).find((death) => death.seat === wolf)).toEqual({ seat: wolf, round: 2, reason: '昨晚死亡' });
  });
});

describe('big tree', () => {
  const deal = dealWith(villager);

  it('survives the first wolf kill and dies on the second', () => {
    const run = play(SEED, combine(deal, wolvesKill(tree, 1), wolvesKill(tree, 2)), BOARD);
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe('天亮了，昨晚是平安夜。');
    expect(entries(run, 'narration', 'night_resolve')[0]).toMatchObject({ channel: `private:${tree}`, round: 1 });
    expect(eliminated(run)[0]).toEqual({ seat: tree, round: 2, reason: '昨晚死亡' });
    expect(entries(run, 'phase_started').some((entry) => entry.title === '大树倒下')).toBe(false);
  });

  it('wastes the antidote on a tree that still has two lives', () => {
    const run = play(SEED, combine(deal, wolvesKill(tree, 1), act('witch_save', witch, [tree], 1), wolvesKill(tree, 2)), BOARD);
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe('天亮了，昨晚是平安夜。');
    expect(eliminated(run)[0]).toEqual({ seat: tree, round: 2, reason: '昨晚死亡' });
  });

  it('takes every other god’s skills when it falls to anything but a wolf', () => {
    const run = play(SEED, combine(deal, everyoneVotes('exile_vote', tree, 1), wolvesKill(hunter, 2)), BOARD);
    expect(entries(run, 'narration', 'big_tree_fall')[0]).toMatchObject({ channel: 'public', round: 1 });
    expect(requestsOn(run, 'seer_check', 2)).toHaveLength(0);
    expect(eliminated(run)[1]).toEqual({ seat: hunter, round: 2, reason: '昨晚死亡' });
    expect(requestsIn(run, 'hunter_shot')).toHaveLength(0);
    expect(requestsOn(run, 'gift_poison', 2).map((request) => request.seat)).toEqual([villager]);
    expect(requestsOn(run, 'seer_check', 1).map((request) => request.seat)).toEqual([seer]);
  });

  it('keeps the gods’ skills when taken by the white wolf king', () => {
    const blast: Override = (request, snapshot) => (request.phaseId === 'day_speech' && request.seat === king && snapshot.round === 1
      ? { speech: '我自爆。', declare: 'selfDestruct' }
      : undefined);
    const run = play(SEED, combine(deal, blast, act('white_wolf_king_blast', king, [tree])), BOARD);
    expect(eliminated(run).slice(0, 2).map((death) => death.reason)).toEqual(['自爆', '被白狼王带走']);
    expect(entries(run, 'narration', 'big_tree_fall')).toHaveLength(0);
    expect(requestsOn(run, 'seer_check', 2)).toHaveLength(1);
  });
});
