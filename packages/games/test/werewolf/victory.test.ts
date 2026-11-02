import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, stateOf, wolvesKill, type Override } from './helpers';

const SEED = 11;
const villagers = roleSeats(SEED, 'villager');
const wolves = roleSeats(SEED, 'werewolf');
const witch = first(SEED, 'witch');
const seer = first(SEED, 'seer');
const hunter = first(SEED, 'hunter');
const idiot = first(SEED, 'idiot');

function selfDestructEachDay(order: readonly number[]): Override {
  return (request, snapshot) => request.phaseId === 'day_speech' && request.seat === order[snapshot.round - 1]
    ? { speech: '我自爆。', declare: 'selfDestruct' }
    : undefined;
}

function killEachNight(order: readonly number[]): Override {
  return (request, snapshot) => (request.phaseId === 'wolf_kill' ? { target: order[snapshot.round - 1] ?? null } : undefined);
}

describe('victory', () => {
  it('ends with a good win after the exiled last wolf gives his last words', () => {
    // 出局连锁（遗言）先结算再判定胜负，所以最后一头狼仍有遗言，赛后紧随其后
    const [w1 = 0, w2 = 0, w3 = 0, w4 = 0] = wolves;
    const run = play(SEED, combine(selfDestructEachDay([w1, w2, w3]), everyoneVotes('exile_vote', w4, 4)));
    expect(run.snapshot.result).toMatchObject({ winner: 'good', endReason: 'normal' });
    expect(entries(run, 'speech', 'last_words').some((entry) => entry.seat === w4)).toBe(true);
    const titles = entries(run, 'phase_started').map((entry) => entry.title);
    expect(titles.slice(titles.lastIndexOf('遗言'), titles.lastIndexOf('遗言') + 2)).toEqual(['遗言', '赛后复盘']);
  });

  it('lets a hunter killed at night fire before the vote-majority rule ends the game', () => {
    // 第 4 夜前只剩狼 w3（警长）、w4、女巫、猎人、村民 v4：狼刀猎人后狼人 2.5 票 > 好人 2 票，
    // 旧实现在天亮时就判狼人胜；现在猎人先开枪带走警长狼，白天把最后一头狼放逐，好人胜。
    const [w1 = 0, w2 = 0, w3 = 0, w4 = 0] = wolves;
    const [v1 = 0, v2 = 0, v3 = 0] = villagers;
    const sheriffWolf: Override = (request) => (request.phaseId === 'sheriff_signup' ? { targets: request.seat === w3 ? [w3] : [] } : undefined);
    const run = play(SEED, combine(
      sheriffWolf,
      killEachNight([seer, v1, v2, hunter]),
      act('witch_poison', witch, [idiot], 1),
      everyoneVotes('exile_vote', w1, 1),
      everyoneVotes('exile_vote', w2, 2),
      everyoneVotes('exile_vote', v3, 3),
      act('hunter_shot', hunter, [w3]),
      everyoneVotes('exile_vote', w4, 4),
    ));
    expect(stateOf(run.requests.find(({ snapshot }) => snapshot.round === 4)?.snapshot ?? run.snapshot).sheriff).toBe(w3);
    expect(entries(run, 'action', 'hunter_shot').find((entry) => entry.round === 4)).toMatchObject({ seat: hunter, targets: [w3] });
    expect(eliminated(run).filter((death) => death.round === 4).map((death) => death.seat)).toEqual([hunter, w3, w4]);
    expect(run.snapshot.result).toMatchObject({ winner: 'good', endReason: 'normal' });
    expect(run.snapshot.result?.summary).toContain('狼人全部出局');
  });

  it('gives wolves the win once every villager is dead', () => {
    const run = play(SEED, killEachNight(villagers));
    expect(run.snapshot.result).toMatchObject({ winner: 'werewolf' });
    expect(run.snapshot.result?.summary).toContain('屠边');
    expect(eliminated(run).map((death) => death.seat)).toEqual(villagers);
  });

  it('locks the wolf win when the kill completes the side even if the last wolf is poisoned', () => {
    const [w1 = 0, w2 = 0, w3 = 0, w4 = 0] = wolves;
    const run = play(SEED, combine(
      selfDestructEachDay([w1, w2, w3]),
      killEachNight(villagers),
      act('witch_poison', witch, [w4], 4),
    ));
    expect(stateOf(run.snapshot).winnerLock).toBe('werewolf');
    expect(run.snapshot.result).toMatchObject({ winner: 'werewolf', summary: expect.stringContaining('狼刀达成屠边') });
    expect(run.snapshot.seats.filter((seat) => seat.alive && seat.team === 'werewolf')).toHaveLength(0);
  });

  it('judges by survivors when the day limit is reached', () => {
    const run = play(SEED);
    expect(run.snapshot.result).toMatchObject({ winner: 'werewolf', endReason: 'budget' });
    expect(run.snapshot.round).toBe(6);
  });
});

describe('postgame', () => {
  const run = play(SEED, killEachNight(villagers));

  it('reveals every role to players and the audience', () => {
    const speech = requestsIn(run, 'postgame_speech')[0];
    for (const wolf of wolves) expect(speech?.prompt.instruction).toContain(`${wolf}号 玩家${wolf}是狼人`);
    const reveal = run.stageEvents.find((event) => event.kind === 'revealed' && event.phaseId === 'postgame_reveal');
    expect(reveal?.view.seats.every((seat) => seat.role !== null)).toBe(true);
  });

  it('lets all twelve players vote for an MVP who speaks last', () => {
    expect(requestsIn(run, 'mvp_vote')).toHaveLength(12);
    const mvp = run.snapshot.result?.mvp;
    expect(mvp).toBeTypeOf('number');
    const speakers = entries(run, 'speech', 'postgame_speech').map((entry) => entry.seat);
    expect(speakers).toHaveLength(12);
    expect(speakers[speakers.length - 1]).toBe(mvp);
  });

  it('picks the winning side’s lowest seat when nobody votes', () => {
    expect(entries(run, 'vote_tallied', 'mvp_vote')[0]?.outcome).toEqual({ kind: 'none' });
    expect(run.snapshot.result?.mvp).toBe(Math.min(...wolves));
  });

  it('keeps the stage in daytime on the final game-over event', () => {
    // 终局记录没有当前阶段，舞台背景不能因此切回夜晚
    const last = run.stageEvents[run.stageEvents.length - 1];
    expect(last?.kind).toBe('game_over');
    expect(last?.view.extra.period).toBe('day');
  });
});
