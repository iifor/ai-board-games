import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, first, play, requestsIn, roleSeats, type Override } from '../helpers';

const BOARD = 'hidden-wolf-crow-12';
const SEED = 1;
const hidden = first(SEED, 'hidden_wolf', BOARD);
const crow = first(SEED, 'crow', BOARD);
const seer = first(SEED, 'seer', BOARD);
const wolves = roleSeats(SEED, 'werewolf', BOARD);
const [villager = 0, villagerB = 0] = roleSeats(SEED, 'villager', BOARD);

/** 狼队三人在第 1–3 天依次自爆 */
const packSelfDestructs: Override = (request, snapshot) => request.phaseId === 'day_speech' && request.seat === wolves[snapshot.round - 1]
  ? { speech: '我自爆。', declare: 'selfDestruct' }
  : undefined;
const curse = (target: number, night: number) => act('crow_curse', crow, [target], night);

describe('hidden wolf', () => {
  it('knows the pack from the judge while the pack neither knows nor talks with him', () => {
    const run = play(SEED, undefined, BOARD);
    expect(requestsIn(run, 'wolf_chat').map((request) => request.seat)).not.toContain(hidden);
    const chat = requestsIn(run, 'wolf_chat')[0];
    expect(chat?.prompt.identity).not.toContain(`${hidden}号`);
    expect(requestsIn(run, 'wolf_kill').every((request) => request.legalTargets?.includes(hidden))).toBe(true);
    const own = requestsIn(run, 'day_speech').find((request) => request.seat === hidden);
    expect(own?.prompt.identity).toContain(`你的狼同伴是 ${wolves.map((seat) => `${seat}号`).join(' ')}`);
    expect(own?.prompt.history).not.toContain('狼人夜聊」的发言');
    expect(own?.prompt.output).not.toContain('selfDestruct');
  });

  it('is checked as good by the seer', () => {
    const run = play(SEED, act('seer_check', seer, [hidden], 1), BOARD);
    expect(entries(run, 'action', 'seer_check')[0]?.text).toBe(`查验 ${hidden}号：好人`);
  });

  it('inherits the kill once the pack is gone; the witch sees it as the wolf kill', () => {
    const run = play(SEED, combine(packSelfDestructs, act('hidden_wolf_kill', hidden, [villager], 4)), BOARD);
    expect(eliminated(run).slice(0, 3).map((death) => death.seat)).toEqual(wolves);
    const kills = run.requests.filter(({ request }) => request.phaseId === 'hidden_wolf_kill');
    expect(kills[0]?.snapshot.round).toBe(4);
    expect(kills[0]?.request.legalTargets).not.toContain(hidden);
    expect(requestsIn(run, 'witch_save').at(-1)?.legalTargets).toEqual([villager]);
    expect(eliminated(run)[3]).toEqual({ seat: villager, round: 4, reason: '昨晚死亡' });
  });
});

describe('crow', () => {
  it('announces the curse before the exile vote and adds a vote to the cursed player', () => {
    const run = play(SEED, curse(villager, 1), BOARD);
    const announce = entries(run, 'narration', 'crow_announce').find((entry) => entry.round === 1);
    expect(announce?.text).toBe(`昨晚乌鸦诅咒了 ${villager}号：今天的放逐投票中他额外获得 1 票。`);
    const tally = entries(run, 'vote_tallied', 'exile_vote')[0];
    expect(tally).toMatchObject({ ballots: [], tally: [{ target: villager, votes: 1 }], outcome: { kind: 'selected', seat: villager } });
    expect(eliminated(run)[0]).toEqual({ seat: villager, round: 1, reason: '被放逐' });
    const order = run.log.filter((entry) => entry.round === 1).map((entry) => entry.phaseId);
    expect(order.indexOf('crow_announce')).toBeGreaterThan(order.lastIndexOf('day_speech'));
    expect(order.indexOf('crow_announce')).toBeLessThan(order.indexOf('exile_vote'));
    expect(requestsIn(run, 'last_words')[0]?.prompt.history).toContain(`额外票：${villager}号+1`);
  });

  it('curses privately, never itself, and never the same player two nights in a row', () => {
    const run = play(SEED, combine(curse(villagerB, 1), (request, snapshot) => (request.phaseId === 'exile_vote' && snapshot.round === 1 && request.seat !== villagerB
      ? { target: villager }
      : undefined)), BOARD);
    expect(entries(run, 'action', 'crow_curse')[0]).toMatchObject({ channel: `private:${crow}`, text: `诅咒 ${villagerB}号` });
    const [nightOne, nightTwo] = requestsIn(run, 'crow_curse');
    expect(nightOne?.legalTargets).not.toContain(crow);
    expect(nightTwo?.legalTargets).not.toContain(villagerB);
    expect(entries(run, 'narration', 'crow_announce').find((entry) => entry.round === 2)?.text).toBe('今天没有玩家受到乌鸦的诅咒。');
  });
});
