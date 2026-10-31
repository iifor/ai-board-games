import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, first, play, requestsIn, roleSeats, stateOf, wolvesKill } from '../helpers';

const BOARD = 'silence-elder-knight-12';
const SEED = 3;
const elder = first(SEED, 'silence_elder', BOARD);
const knight = first(SEED, 'knight', BOARD);
const [wolf = 0] = roleSeats(SEED, 'werewolf', BOARD);
const [villager = 0, villagerB = 0] = roleSeats(SEED, 'villager', BOARD);

const speakersOn = (run: ReturnType<typeof play>, round: number) =>
  entries(run, 'speech', 'day_speech').filter((entry) => entry.round === round).map((entry) => entry.seat);

describe('silence elder', () => {
  it('must silence someone each night, may silence himself, never the same seat twice in a row', () => {
    const run = play(SEED, act('elder_silence', elder, [villager], 1), BOARD);
    const [nightOne, nightTwo] = requestsIn(run, 'elder_silence');
    expect(nightOne?.prompt.output).not.toContain('空数组');
    expect(nightOne?.legalTargets).toContain(elder);
    expect(nightTwo?.legalTargets).not.toContain(villager);
  });

  it('announces the silence with the death news and skips the silenced seat in day speeches', () => {
    const run = play(SEED, combine(act('elder_silence', elder, [villager], 1), act('elder_silence', elder, [villagerB], 2)), BOARD);
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe(`天亮了，昨晚是平安夜。今天被禁言的是 ${villager}号，他在白天发言环节不能发言。`);
    expect(speakersOn(run, 1)).not.toContain(villager);
    expect(speakersOn(run, 1)).toHaveLength(11);
    expect(requestsIn(run, 'exile_vote').some((request) => request.seat === villager)).toBe(true);
    expect(speakersOn(run, 2)).toContain(villager);
    expect(speakersOn(run, 2)).not.toContain(villagerB);
  });

  it('keeps the silence secret until dawn and drops it when the target dies that night', () => {
    const run = play(SEED, combine(act('elder_silence', elder, [villager], 1), wolvesKill(villager, 1)), BOARD);
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe(`天亮了，昨晚死亡的是：${villager}号。`);
    expect(entries(run, 'action', 'elder_silence')[0]?.channel).toBe(`private:${elder}`);
    const nightRequests = run.requests.filter(({ request, snapshot }) => snapshot.round === 1 && request.phaseId === 'wolf_chat');
    for (const { snapshot } of nightRequests) expect(stateOf(snapshot).silencedToday).toBeNull();
  });
});

describe('knight', () => {
  it('kills a dueled wolf, cancels the exile vote and goes straight to night without last words', () => {
    const run = play(SEED, act('knight_duel', knight, [wolf], 1), BOARD);
    expect(entries(run, 'revealed', 'knight_hit')[0]?.text).toBe(`${knight}号翻牌为骑士，决斗 ${wolf}号：${wolf}号是狼人，出局；今天的放逐投票取消，直接进入黑夜。`);
    expect(eliminated(run)[0]).toEqual({ seat: wolf, round: 1, reason: '被骑士决斗' });
    expect(run.requests.some(({ request, snapshot }) => request.phaseId === 'exile_vote' && snapshot.round === 1)).toBe(false);
    expect(entries(run, 'speech', 'last_words')).toHaveLength(0);
    expect(requestsIn(run, 'knight_duel')).toHaveLength(1);
  });

  it('dies when dueling a good player, and the day goes on to the exile vote', () => {
    const run = play(SEED, act('knight_duel', knight, [villager], 1), BOARD);
    expect(eliminated(run)[0]).toEqual({ seat: knight, round: 1, reason: '决斗失败' });
    expect(run.requests.some(({ request, snapshot }) => request.phaseId === 'exile_vote' && snapshot.round === 1)).toBe(true);
    expect(entries(run, 'speech', 'last_words')).toHaveLength(0);
  });

  it('may hold the duel; declining stays private and the duel is offered again the next day', () => {
    const run = play(SEED, undefined, BOARD);
    const duels = requestsIn(run, 'knight_duel');
    expect(duels.length).toBeGreaterThan(1);
    expect(duels[0]?.legalTargets).not.toContain(knight);
    expect(entries(run, 'action', 'knight_duel').every((entry) => entry.channel === `private:${knight}`)).toBe(true);
  });
});
