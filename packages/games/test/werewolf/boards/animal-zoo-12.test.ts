import { describe, expect, it } from 'vitest';
import { act, combine, entries, eliminated, first, play, requestsIn, roleSeats, seatsOf, wolvesKill, type Override } from '../helpers';

const BOARD = 'animal-zoo-12';
const PLAYERS = 11;
const SEED = 2;
const at = (role: string, seed = SEED) => first(seed, role, BOARD, PLAYERS);
const bear = at('bear');
const penguin = at('penguin');
const fox = at('fox');
const crow = at('crow');
const wolves = roleSeats(SEED, 'werewolf', BOARD, PLAYERS);
const rabbits = roleSeats(SEED, 'rabbit', BOARD, PLAYERS);
const run = (override?: Override, seed = SEED) => play(seed, override, BOARD, PLAYERS);
const dawnNews = (record: ReturnType<typeof play>, round = 1) => entries(record, 'narration', 'dawn').find((entry) => entry.round === round)?.text;
const requestsOn = (record: ReturnType<typeof play>, phaseId: string, round: number) =>
  record.requests.filter(({ request, snapshot }) => request.phaseId === phaseId && snapshot.round === round).map(({ request }) => request);

describe('animal zoo', () => {
  it('seats 11 players with three rabbits, or 12 with four', () => {
    const record = run();
    expect(record.snapshot.seats).toHaveLength(11);
    expect(rabbits).toHaveLength(3);
    expect(record.requests[0]?.request.prompt.rules).toContain('这是一局 11 人狼人杀，板子：动物园');
    expect(seatsOf(SEED, BOARD, 12).filter((seat) => seat.role === 'rabbit')).toHaveLength(4);
  });

  it('roars at dawn when a wolf sits next to the bear, unless the penguin froze it', () => {
    expect(bear).toBe(6);
    expect(wolves).toContain(5);
    expect(dawnNews(run())).toBe('天亮了，昨晚是平安夜。熊咆哮了。');
    expect(dawnNews(run(act('penguin_freeze', penguin, [bear], 1)))).toBe('天亮了，昨晚是平安夜。熊没有咆哮。');
  });

  it('judges the bear’s neighbours after last night’s deaths', () => {
    const bearOne = first(1, 'bear', BOARD, PLAYERS);
    const [left = 0] = roleSeats(1, 'rabbit', BOARD, PLAYERS);
    expect(left).toBe(bearOne - 1);
    expect(dawnNews(run(undefined, 1))).toBe('天亮了，昨晚是平安夜。熊没有咆哮。');
    expect(dawnNews(run(wolvesKill(left, 1), 1))).toBe(`天亮了，昨晚死亡的是：${left}号。熊咆哮了。`);
  });

  it('freezes a wolf to stop the whole pack, never itself, never twice in a row', () => {
    const record = run(act('penguin_freeze', penguin, [wolves[0] ?? 0], 1));
    expect(requestsOn(record, 'wolf_kill', 1)).toHaveLength(0);
    expect(requestsOn(record, 'wolf_kill', 2).length).toBeGreaterThan(0);
    const [nightOne, nightTwo] = requestsIn(record, 'penguin_freeze');
    expect(nightOne?.legalTargets).not.toContain(penguin);
    expect(nightTwo?.legalTargets).not.toContain(wolves[0]);
    expect(entries(record, 'narration', 'night_blocks')[0]).toMatchObject({ channel: 'team:werewolf', round: 1 });
  });

  it('lets the fox inspect three adjacent seats and lose the power on an all-good trio', () => {
    const found = run(act('fox_inspect', fox, [5], 1));
    expect(entries(found, 'action', 'fox_inspect')[0]).toMatchObject({ channel: `private:${fox}`, text: '查验 4号、5号、6号：有狼人' });
    expect(requestsOn(found, 'fox_inspect', 2)).toHaveLength(1);
    const lost = run(act('fox_inspect', fox, [10], 1));
    expect(entries(lost, 'action', 'fox_inspect')[0]?.text).toBe('查验 9号、10号、11号：没有狼人');
    expect(requestsOn(lost, 'fox_inspect', 2)).toHaveLength(0);
    expect(requestsIn(lost, 'day_speech').find((request) => request.seat === fox)?.prompt.identity).toContain('你已经失去了查验能力');
    expect(requestsOn(run(act('penguin_freeze', penguin, [fox], 1)), 'fox_inspect', 1)).toHaveLength(0);
  });

  it('adds two votes to the crow’s target', () => {
    const [target = 0] = rabbits;
    const record = run(act('crow_curse', crow, [target], 1));
    expect(entries(record, 'narration', 'crow_announce')[0]?.text).toBe(`昨晚乌鸦诅咒了 ${target}号：今天的放逐投票中他额外获得 2 票。`);
    expect(entries(record, 'vote_tallied', 'exile_vote')[0]?.tally).toEqual([{ target, votes: 2 }]);
    expect(eliminated(record)[0]).toEqual({ seat: target, round: 1, reason: '被放逐' });
  });
});
