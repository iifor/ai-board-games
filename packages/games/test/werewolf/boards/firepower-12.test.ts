import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, wolvesKill, type Override } from '../helpers';

const BOARD = 'firepower-12';
const SEED = 1;
const hidden = first(SEED, 'hidden_wolf_pack', BOARD);
const king = first(SEED, 'white_wolf_king', BOARD);
const demon = first(SEED, 'demon', BOARD);
const fox = first(SEED, 'fox', BOARD);
const idiot = first(SEED, 'idiot', BOARD);
const tree = first(SEED, 'big_tree', BOARD);
const [sapling = 0, saplingB = 0] = roleSeats(SEED, 'sapling', BOARD);

const requestsOn = (run: ReturnType<typeof play>, phaseId: string, round: number) =>
  run.requests.filter(({ request, snapshot }) => request.phaseId === phaseId && snapshot.round === round).map(({ request }) => request);
const kingBlasts: Override = (request, snapshot) => (request.phaseId === 'day_speech' && request.seat === king && snapshot.round === 1
  ? { speech: '我自爆。', declare: 'selfDestruct' }
  : undefined);
const inspect = (center: number, night: number) => act('fox_inspect', fox, [center], night);
/** 狐狸查验以隐狼为中心的三个号码（两侧都不是狼人） */
const around = [hidden - 1, hidden, hidden + 1].map((seat) => `${seat}号`).join('、');

describe('firepower hidden wolf', () => {
  it('knows the pack and kills with it, but cannot self-destruct', () => {
    const run = play(SEED, undefined, BOARD);
    expect(requestsIn(run, 'wolf_chat').map((request) => request.seat)).toContain(hidden);
    expect(requestsIn(run, 'wolf_kill').map((request) => request.seat)).toContain(hidden);
    expect(requestsIn(run, 'wolf_kill').every((request) => !request.legalTargets?.includes(hidden))).toBe(true);
    const own = requestsIn(run, 'day_speech').find((request) => request.seat === hidden);
    expect(own?.prompt.identity).toContain('身份是隐狼');
    expect(own?.prompt.output).not.toContain('selfDestruct');
  });

  it('checks as good while the white wolf king is alive', () => {
    const run = play(SEED, inspect(hidden, 1), BOARD);
    expect(entries(run, 'action', 'fox_inspect')[0]?.text).toBe(`查验 ${around}：没有狼人`);
  });

  it('checks as a wolf once the white wolf king is out', () => {
    const run = play(SEED, combine(kingBlasts, inspect(hidden, 2)), BOARD);
    expect(eliminated(run)[0]).toEqual({ seat: king, round: 1, reason: '自爆' });
    expect(entries(run, 'action', 'fox_inspect').find((entry) => entry.round === 2)?.text).toBe(`查验 ${around}：有狼人`);
  });
});

describe('firepower villagers', () => {
  it('counts the idiot as a villager', () => {
    const run = play(SEED, act('demon_check', demon, [idiot], 1), BOARD);
    expect(entries(run, 'action', 'demon_check')[0]?.text).toBe(`查验 ${idiot}号：平民`);
    expect(run.requests[0]?.request.prompt.rules).toContain('本板子的白痴算作民牌');
  });

  it('fells the big tree when the last sapling is exiled, and the gods lose their skills', () => {
    const run = play(SEED, combine(wolvesKill(sapling, 1), everyoneVotes('exile_vote', saplingB, 1)), BOARD);
    expect(eliminated(run).slice(0, 3)).toEqual([
      { seat: sapling, round: 1, reason: '昨晚死亡' },
      { seat: saplingB, round: 1, reason: '被放逐' },
      { seat: tree, round: 1, reason: '树苗全部出局，大树随之倒下' },
    ]);
    expect(entries(run, 'narration', 'big_tree_fall')[0]).toMatchObject({ channel: 'public', round: 1 });
    expect(requestsOn(run, 'fox_inspect', 1)).toHaveLength(1);
    expect(requestsOn(run, 'fox_inspect', 2)).toHaveLength(0);
  });

  it('fells the big tree at dawn when the last sapling dies at night', () => {
    const run = play(SEED, combine(everyoneVotes('exile_vote', sapling, 1), wolvesKill(saplingB, 2)), BOARD);
    expect(eliminated(run).slice(1, 3)).toEqual([
      { seat: saplingB, round: 2, reason: '昨晚死亡' },
      { seat: tree, round: 2, reason: '树苗全部出局，大树随之倒下' },
    ]);
  });

  it('keeps the tree standing while a sapling survives', () => {
    const run = play(SEED, wolvesKill(sapling, 1), BOARD);
    expect(eliminated(run)).toEqual([{ seat: sapling, round: 1, reason: '昨晚死亡' }]);
  });
});
