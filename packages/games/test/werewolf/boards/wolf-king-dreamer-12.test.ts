import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, stateOf, wolvesKill, type Override } from '../helpers';

const BOARD = 'wolf-king-dreamer-12';
const SEED = 1;
const dreamer = first(SEED, 'dreamer', BOARD);
const king = first(SEED, 'wolf_king', BOARD);
const witch = first(SEED, 'witch', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const [villager = 0, villagerB = 0] = roleSeats(SEED, 'villager', BOARD);

const dream = (target: number, night: number) => act('dreamer_dream', dreamer, [target], night);
const dawnText = (run: ReturnType<typeof play>, round: number) => entries(run, 'narration', 'dawn').find((entry) => entry.round === round)?.text;
const deathsOn = (run: ReturnType<typeof play>, round: number) =>
  eliminated(run).filter((death) => death.round === round).map((death) => death.seat).sort((a, b) => a - b);

describe('dreamer', () => {
  it('must dream another player every night', () => {
    const run = play(SEED, undefined, BOARD);
    const [offer] = requestsIn(run, 'dreamer_dream');
    expect(offer?.legalTargets).not.toContain(dreamer);
    expect(offer?.prompt.output).not.toContain('空数组');
    expect(entries(run, 'action', 'dreamer_dream')[0]?.channel).toBe(`private:${dreamer}`);
  });

  it('turns the wolf kill on the sleepwalker into an empty knife and wastes potions on him', () => {
    const knifed = play(SEED, combine(dream(villager, 1), wolvesKill(villager, 1)), BOARD);
    expect(dawnText(knifed, 1)).toBe('天亮了，昨晚是平安夜。');

    const poisoned = play(SEED, combine(dream(villager, 1), act('witch_poison', witch, [villager], 1)), BOARD);
    expect(dawnText(poisoned, 1)).toBe('天亮了，昨晚是平安夜。');
    expect(stateOf(poisoned.snapshot).potions.poison).toBe(false);

    const saved = play(SEED, combine(dream(villager, 1), wolvesKill(villager, 1), act('witch_save', witch, [villager], 1)), BOARD);
    expect(dawnText(saved, 1)).toBe('天亮了，昨晚是平安夜。');
    expect(stateOf(saved.snapshot).potions.antidote).toBe(false);
  });

  it('kills the sleepwalker when dreaming the same player two nights in a row', () => {
    const run = play(SEED, combine(dream(villager, 1), dream(villager, 2), dream(villagerB, 3)), BOARD);
    expect(deathsOn(run, 1)).toEqual([]);
    expect(deathsOn(run, 2)).toEqual([villager]);
    const second = requestsIn(run, 'dreamer_dream')[1];
    expect(second?.prompt.identity).toContain(`你上一晚摄梦的是 ${villager}号`);
  });

  it('takes the sleepwalker along when the dreamer dies at night', () => {
    const run = play(SEED, combine(dream(villager, 1), wolvesKill(dreamer, 1)), BOARD);
    expect(deathsOn(run, 1)).toEqual([villager, dreamer].sort((a, b) => a - b));
  });

  it('lets a dream-killed hunter shoot, unlike the wolf king', () => {
    const hunterDies = play(SEED, combine(dream(hunter, 1), dream(hunter, 2), act('death_shot', hunter, [villager])), BOARD);
    expect(requestsIn(hunterDies, 'death_shot').map((request) => request.seat)).toEqual([hunter]);

    const kingDies = play(SEED, combine(dream(king, 1), dream(king, 2)), BOARD);
    expect(deathsOn(kingDies, 2)).toContain(king);
    expect(requestsIn(kingDies, 'death_shot')).toHaveLength(0);
  });
});

describe('wolf king', () => {
  it('shoots when exiled without revealing who is shooting', () => {
    const run = play(SEED, combine(everyoneVotes('exile_vote', king, 1), act('death_shot', king, [villager])), BOARD);
    expect(eliminated(run).slice(0, 2)).toEqual([
      { seat: king, round: 1, reason: '被放逐' },
      { seat: villager, round: 1, reason: '被枪杀' },
    ]);
    expect(entries(run, 'action', 'death_shot')[0]).toMatchObject({ channel: 'public', text: `开枪带走 ${villager}号` });
    expect(entries(run, 'phase_started').some((entry) => entry.title === '猎人开枪')).toBe(false);
  });

  it('cannot shoot when poisoned or after self-destructing', () => {
    const poisoned = play(SEED, act('witch_poison', witch, [king], 1), BOARD);
    expect(deathsOn(poisoned, 1)).toEqual([king]);
    expect(requestsIn(poisoned, 'death_shot')).toHaveLength(0);

    const blast: Override = (request, snapshot) => request.phaseId === 'day_speech' && request.seat === king && snapshot.round === 1
      ? { speech: '我自爆。', declare: 'selfDestruct' }
      : undefined;
    const destructed = play(SEED, blast, BOARD);
    expect(eliminated(destructed)[0]).toEqual({ seat: king, round: 1, reason: '自爆' });
    expect(requestsIn(destructed, 'death_shot')).toHaveLength(0);
  });

  it('makes the hunter shoot through the same neutral phase', () => {
    const run = play(SEED, combine(everyoneVotes('exile_vote', hunter, 1), act('death_shot', hunter, [villager])), BOARD);
    expect(requestsIn(run, 'hunter_shot')).toHaveLength(0);
    expect(entries(run, 'action', 'death_shot')[0]?.text).toBe(`开枪带走 ${villager}号`);
    expect(run.requests[0]?.request.prompt.rules).toContain('本局猎人和狼王开枪时都不翻牌');
  });
});
