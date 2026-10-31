import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, stateOf, wolvesKill, type Override } from '../helpers';

const BOARD = 'spirit-wolf-12';
const SEED = 1;
const spirit = first(SEED, 'spirit_wolf', BOARD);
const seer = first(SEED, 'seer', BOARD);
const witch = first(SEED, 'witch', BOARD);
const guard = first(SEED, 'guard', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const wolves = roleSeats(SEED, 'werewolf', BOARD);
const [villager = 0] = roleSeats(SEED, 'villager', BOARD);

const requestsOn = (run: ReturnType<typeof play>, phaseId: string, round: number) =>
  run.requests.filter(({ request, snapshot }) => request.phaseId === phaseId && snapshot.round === round).map(({ request }) => request);
const learn = (target: number): Override => act('spirit_wolf_learn', spirit, [target], 1);
const check = (target: number, night: number) => act('seer_check_late', seer, [target], night);

describe('spirit wolf', () => {
  it('learns after the witch and before the seer, who wakes late on this board', () => {
    const run = play(SEED, learn(villager), BOARD);
    const order = run.log.filter((entry) => entry.round === 1).map((entry) => entry.phaseId);
    expect(order.indexOf('spirit_wolf_learn')).toBeGreaterThan(order.lastIndexOf('witch_poison'));
    expect(order.indexOf('spirit_wolf_learn')).toBeLessThan(order.indexOf('seer_check_late'));
    expect(requestsIn(run, 'seer_check')).toHaveLength(0);
    const [learnRequest] = requestsIn(run, 'spirit_wolf_learn');
    expect(learnRequest?.legalTargets).not.toContain(wolves[0]);
    expect(learnRequest?.prompt.output).not.toContain('空数组');
    expect(requestsIn(run, 'spirit_wolf_learn')).toHaveLength(1);
  });

  it('learning a villager makes him check as good', () => {
    const run = play(SEED, combine(learn(villager), check(spirit, 1)), BOARD);
    expect(entries(run, 'action', 'spirit_wolf_learn')[0]).toMatchObject({ channel: `private:${spirit}`, text: `学习 ${villager}号的技能：平民（查验视为好人）` });
    expect(entries(run, 'action', 'seer_check_late')[0]?.text).toBe(`查验 ${spirit}号：好人`);
  });

  it('learning the seer checks god or villager from the second night', () => {
    const run = play(SEED, combine(learn(seer), act('spirit_wolf_check', spirit, [hunter], 2)), BOARD);
    expect(requestsOn(run, 'spirit_wolf_check', 1)).toHaveLength(0);
    expect(entries(run, 'action', 'spirit_wolf_check')[0]).toMatchObject({ channel: `private:${spirit}`, text: `查验 ${hunter}号：神职` });
    expect(requestsIn(run, 'spirit_wolf_check')[0]?.legalTargets).not.toContain(wolves[0]);
    const later = requestsOn(run, 'wolf_chat', 3).find((request) => request.seat === spirit);
    expect(later?.prompt.rules).toContain('你首夜学到了预言家的技能');
    expect(later?.prompt.identity).toContain(`第2夜查验 ${hunter}号，结果是神职`);
  });

  it('learning the witch gives one antidote against that night’s poison, never for himself', () => {
    const saved = play(SEED, combine(learn(witch), act('witch_poison', witch, [villager], 1), act('spirit_wolf_antidote', spirit, [villager], 1)), BOARD);
    expect(requestsIn(saved, 'spirit_wolf_antidote')[0]?.legalTargets).toEqual([villager]);
    expect(entries(saved, 'narration', 'dawn')[0]?.text).toBe('天亮了，昨晚是平安夜。');
    expect(stateOf(saved.snapshot).spiritWolf.antidote).toBe(false);
    const self = play(SEED, combine(learn(witch), act('witch_poison', witch, [spirit], 1)), BOARD);
    expect(requestsIn(self, 'spirit_wolf_antidote')).toHaveLength(0);
    expect(eliminated(self)[0]).toEqual({ seat: spirit, round: 1, reason: '昨晚死亡' });
  });

  it('learning the hunter reveals and takes a player when exiled', () => {
    const run = play(SEED, combine(learn(hunter), everyoneVotes('exile_vote', spirit, 1), act('spirit_wolf_shot', spirit, [villager])), BOARD);
    expect(entries(run, 'action', 'spirit_wolf_shot')[0]?.channel).toBe(`private:${spirit}`);
    expect(entries(run, 'revealed', 'spirit_wolf_shot_resolve')[0]).toMatchObject({ channel: 'public', text: expect.stringContaining(`${spirit}号翻牌，身份是灵狼`) });
    expect(eliminated(run).slice(0, 2)).toEqual([
      { seat: spirit, round: 1, reason: '被放逐' },
      { seat: villager, round: 1, reason: '被灵狼带走' },
    ]);
    expect(requestsIn(run, 'last_words').map((request) => request.seat)).toContain(villager);
  });

  it('keeps his identity when the hunter-learned spirit wolf declines to shoot', () => {
    const run = play(SEED, combine(learn(hunter), everyoneVotes('exile_vote', spirit, 1)), BOARD);
    expect(requestsIn(run, 'spirit_wolf_shot')).toHaveLength(1);
    expect(entries(run, 'revealed').filter((entry) => entry.round === 1)).toHaveLength(0);
    expect(entries(run, 'phase_started').some((entry) => entry.phaseId === 'spirit_wolf_shot')).toBe(false);
  });

  it('learning the guard shields against the knife, the poison, a night shot and the seer', () => {
    const run = play(SEED, combine(
      learn(guard),
      act('spirit_wolf_shield', spirit, [villager], 2),
      wolvesKill(hunter, 2),
      act('witch_poison', witch, [villager], 2),
      act('hunter_shot', hunter, [villager], 2),
      check(villager, 2),
    ), BOARD);
    expect(requestsOn(run, 'spirit_wolf_shield', 1)).toHaveLength(0);
    expect(entries(run, 'action', 'seer_check_late').find((entry) => entry.round === 2)?.text).toBe(`查验 ${villager}号：无法验出`);
    expect(entries(run, 'narration', 'dawn').find((entry) => entry.round === 2)?.text).toBe(`天亮了，昨晚死亡的是：${hunter}号。`);
    expect(entries(run, 'narration', 'hunter_resolve')[0]?.text).toBe(`${villager}号中枪后没有出局。`);
    expect(requestsOn(run, 'spirit_wolf_shield', 3)[0]?.legalTargets).not.toContain(villager);
  });

  it('shields against the wolf knife even when the guard and the witch both protect', () => {
    const run = play(SEED, combine(
      learn(guard),
      act('spirit_wolf_shield', spirit, [villager], 2),
      wolvesKill(villager, 2),
      act('guard_protect', guard, [villager], 2),
      act('witch_save', witch, [villager], 2),
    ), BOARD);
    expect(entries(run, 'narration', 'dawn').find((entry) => entry.round === 2)?.text).toBe('天亮了，昨晚是平安夜。');
  });
});
