import { createSnapshot, SeatQuery } from '@battle/engine';
import { makePlayers } from '@battle/engine/testing';
import { describe, expect, it } from 'vitest';
import { werewolfGame } from '../../src/werewolf';
import type { WerewolfContext } from '../../src/werewolf/rules/context';
import { settleShot } from '../../src/werewolf/rules/death';
import type { WerewolfParams } from '../../src/werewolf/state';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, stateOf, wolvesKill, type Override } from './helpers';

const SEED = 11;
const villagers = roleSeats(SEED, 'villager');
const wolves = roleSeats(SEED, 'werewolf');
const hunter = first(SEED, 'hunter');
const [villagerA = 0, villagerB = 0] = villagers;
const [wolfA = 0] = wolves;

const lastWordsBy = (run: ReturnType<typeof play>) => entries(run, 'speech', 'last_words').map((entry) => entry.seat);

function selfDestruct(seat: number, round: number): Override {
  return (request, snapshot) => request.phaseId === 'day_speech' && request.seat === seat && snapshot.round === round
    ? { speech: '我自爆。', declare: 'selfDestruct' }
    : undefined;
}

describe('last words', () => {
  it('grants last words to first-night deaths but not later nights', () => {
    const run = play(SEED, combine(wolvesKill(villagerA, 1), wolvesKill(villagerB, 2)));
    expect(eliminated(run).map((death) => [death.seat, death.round])).toEqual([[villagerA, 1], [villagerB, 2]]);
    expect(lastWordsBy(run)).toEqual([villagerA]);
  });

  it('grants last words to exiled players', () => {
    const run = play(SEED, everyoneVotes('exile_vote', villagerA, 2));
    expect(lastWordsBy(run)).toEqual([villagerA]);
    expect(entries(run, 'speech', 'last_words')[0]?.round).toBe(2);
  });
});

describe('hunter', () => {
  it('shoots after a wolf kill, and the victim speaks only on day one', () => {
    const shoot = act('hunter_shot', hunter, [villagerB]);
    const nightOne = play(SEED, combine(wolvesKill(hunter, 1), shoot));
    expect(eliminated(nightOne).slice(0, 2).map((death) => death.seat)).toEqual([hunter, villagerB]);
    expect(lastWordsBy(nightOne)).toEqual([hunter, villagerB]);
    expect(entries(nightOne, 'action', 'hunter_shot')[0]).toMatchObject({ channel: 'public', text: `猎人开枪带走 ${villagerB}号` });

    const nightTwo = play(SEED, combine(wolvesKill(hunter, 2), shoot));
    expect(eliminated(nightTwo).slice(0, 2).map((death) => death.seat)).toEqual([hunter, villagerB]);
    expect(lastWordsBy(nightTwo)).toEqual([]);
  });

  it('shoots after being exiled and the victim gets last words', () => {
    const run = play(SEED, combine(everyoneVotes('exile_vote', hunter, 1), act('hunter_shot', hunter, [villagerA])));
    expect(lastWordsBy(run)).toEqual([hunter, villagerA]);
    const phases = entries(run, 'phase_started').filter((entry) => entry.round === 1).map((entry) => entry.title);
    expect(phases.slice(phases.indexOf('放逐投票'))).toEqual(['放逐投票', '遗言', '猎人开枪', '遗言']);
  });

  it('may decline to shoot', () => {
    const run = play(SEED, combine(everyoneVotes('exile_vote', hunter, 1), act('hunter_shot', hunter, [])));
    expect(entries(run, 'action', 'hunter_shot')[0]?.text).toBe('猎人放弃开枪');
    expect(eliminated(run).filter((death) => death.round === 1).map((death) => death.seat)).toEqual([hunter]);
  });

  it('narrates a shot that no longer takes effect because the target is already out', () => {
    // 开枪阶段只给存活目标，正常流程里结算时目标不会已出局；这是防御分支，直接调用结算函数覆盖：
    // 目标在结算前被别的链（如殉情）带走时，不能静默吞掉这一枪
    const snapshot = createSnapshot(werewolfGame, { seed: SEED, players: makePlayers(12) });
    const seats = snapshot.seats.map((seat) => (seat.seat === villagerA ? { ...seat, alive: false } : seat));
    const ctx: WerewolfContext = {
      state: { ...stateOf(snapshot), pendingShot: villagerA },
      params: snapshot.params as WerewolfParams,
      seats: new SeatQuery(seats),
      round: 1,
      phaseId: 'hunter_resolve',
      results: {},
      result: null,
      endReason: 'normal',
      trigger: { kind: 'seat_eliminated', seat: hunter, cause: 'exile', reason: '被放逐' },
      variant: null,
      random: () => { throw new Error('结算开枪不应使用随机数'); },
    };
    const outcome = settleShot(ctx, '被猎人带走');
    expect(outcome.eliminate ?? []).toEqual([]);
    expect(outcome.state?.pendingShot).toBeNull();
    expect(outcome.log).toEqual([{ kind: 'narration', text: `${hunter}号的枪没有生效（${villagerA}号已经出局）。` }]);
  });
});

describe('sheriff badge', () => {
  const signUp: Override = (request) => (request.phaseId === 'sheriff_signup' ? { targets: request.seat === hunter ? [hunter] : [] } : undefined);

  it('runs last words, then the shot, then the badge transfer for a dead hunter-sheriff', () => {
    const run = play(SEED, combine(
      signUp,
      everyoneVotes('exile_vote', hunter, 1),
      act('hunter_shot', hunter, []),
      act('badge_transfer', hunter, [villagerA]),
    ));
    const phases = entries(run, 'phase_started').filter((entry) => entry.round === 1).map((entry) => entry.title);
    expect(phases.slice(phases.indexOf('放逐投票'))).toEqual(['放逐投票', '遗言', '猎人开枪', '移交警徽']);
    expect(stateOf(run.snapshot).sheriff).toBe(villagerA);
  });

  it('tears the badge when the sheriff declines', () => {
    const run = play(SEED, combine(signUp, everyoneVotes('exile_vote', hunter, 1), act('badge_transfer', hunter, [])));
    expect(entries(run, 'action', 'badge_transfer')[0]?.text).toBe('撕毁警徽');
    expect(stateOf(run.snapshot).sheriff).toBeNull();
  });
});

describe('self-destruct', () => {
  it('is only offered to wolves during day speeches', () => {
    const run = play(SEED);
    const daySpeech = requestsIn(run, 'day_speech');
    expect(daySpeech.find((request) => request.seat === wolfA)?.prompt.output).toContain('selfDestruct=自爆');
    expect(daySpeech.find((request) => request.seat === villagerA)?.prompt.output).not.toContain('selfDestruct');
    expect(requestsIn(run, 'sheriff_speech').length + requestsIn(run, 'wolf_chat').length).toBeGreaterThan(0);
    expect([...requestsIn(run, 'wolf_chat'), ...requestsIn(run, 'last_words')].every((request) => !request.prompt.output.includes('selfDestruct'))).toBe(true);
  });

  it('stops the day, skips the exile vote and goes to night without last words', () => {
    const run = play(SEED, selfDestruct(wolfA, 1));
    const dayOne = entries(run, 'speech', 'day_speech').filter((entry) => entry.round === 1).map((entry) => entry.seat);
    expect(dayOne[dayOne.length - 1]).toBe(wolfA);
    expect(dayOne.length).toBeLessThanOrEqual(12);
    expect(run.requests.filter(({ request, snapshot }) => request.phaseId === 'exile_vote' && snapshot.round === 1)).toHaveLength(0);
    expect(eliminated(run)[0]).toMatchObject({ seat: wolfA, round: 1, reason: '自爆' });
    expect(lastWordsBy(run)).toEqual([]);
    expect(entries(run, 'phase_started').find((entry) => entry.round === 2)?.title).toBe('黑夜');
  });
});
