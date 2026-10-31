import { assertDeterministic, assertNoLeak, assertTerminates } from '@battle/engine/testing';
import { describe, expect, it } from 'vitest';
import { boardPlayers, BOARDS } from '../../src/werewolf/boards';
import { werewolfGame } from '../../src/werewolf';
import { act, combine, eliminated, entries, first, play, requestsIn, roleSeats, stateOf, wolvesKill, type Override } from './helpers';

const BOARD = 'white-wolf-king-guard-12';
const SEED = 7;
const guard = first(SEED, 'guard', BOARD);
const witch = first(SEED, 'witch', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const king = first(SEED, 'white_wolf_king', BOARD);
const [villager = 0, villagerB = 0] = roleSeats(SEED, 'villager', BOARD);

const guardOn = (target: number | null, night: number): Override => act('guard_protect', guard, target === null ? [] : [target], night);

describe('board registry', () => {
  it('registers every board as a variant with its player range', () => {
    for (const board of BOARDS) {
      const variant = werewolfGame.spec.variants?.[board.key];
      expect(variant?.name).toBe(board.name);
      expect(variant?.players).toEqual(boardPlayers(board));
    }
    expect(werewolfGame.spec.defaultVariant).toBe('standard-12');
    expect(werewolfGame.spec.players).toEqual({ min: 11, max: 12 });
  });

  it('puts the board rules into the rules layer', () => {
    const run = play(SEED, undefined, BOARD);
    expect(run.requests[0]?.request.prompt.rules).toContain('白狼王&守卫');
    expect(run.requests[0]?.request.prompt.rules).toContain('守卫每晚可以守护一名玩家');
  });

  it('skips phases of roles that are not on the board', () => {
    const standard = play(SEED);
    expect(standard.log.some((entry) => entry.phaseId === 'guard_protect')).toBe(false);
    const board = play(SEED, undefined, BOARD);
    expect(board.log.some((entry) => entry.phaseId === 'guard_protect')).toBe(true);
  });
});

describe('guard', () => {
  it('protects the wolf target', () => {
    const run = play(SEED, combine(wolvesKill(villager), guardOn(villager, 1)), BOARD);
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe('天亮了，昨晚是平安夜。');
  });

  it('kills the target when guarded and saved on the same night', () => {
    const run = play(SEED, combine(wolvesKill(villager), guardOn(villager, 1), act('witch_save', witch, [villager], 1)), BOARD);
    expect(eliminated(run)[0]).toMatchObject({ seat: villager, round: 1 });
  });

  it('cannot guard the same seat two nights in a row but may guard itself', () => {
    const run = play(SEED, combine(guardOn(villager, 1)), BOARD);
    const [nightOne, nightTwo] = requestsIn(run, 'guard_protect');
    expect(nightOne?.legalTargets).toContain(guard);
    expect(nightTwo?.legalTargets).not.toContain(villager);
    expect(stateOf(run.snapshot).guardLastTarget).not.toBe(villager);
  });
});

describe('white wolf king', () => {
  const blastDay: Override = (request, snapshot) => request.phaseId === 'day_speech' && request.seat === king && snapshot.round === 1
    ? { speech: '我自爆。', declare: 'selfDestruct' }
    : undefined;

  it('takes a player when self-destructing; the victim has no last words', () => {
    const run = play(SEED, combine(blastDay, act('white_wolf_king_blast', king, [villagerB])), BOARD);
    expect(eliminated(run).slice(0, 2)).toEqual([
      { seat: king, round: 1, reason: '自爆' },
      { seat: villagerB, round: 1, reason: '被白狼王带走' },
    ]);
    expect(entries(run, 'speech', 'last_words')).toHaveLength(0);
    expect(entries(run, 'action', 'white_wolf_king_blast')[0]).toMatchObject({ channel: 'public', text: `白狼王带走 ${villagerB}号` });
  });

  it('lets a blasted hunter shoot back', () => {
    const run = play(SEED, combine(blastDay, act('white_wolf_king_blast', king, [hunter]), act('hunter_shot', hunter, [villager])), BOARD);
    expect(eliminated(run).slice(0, 3).map((death) => death.seat)).toEqual([king, hunter, villager]);
  });

  it('is an ordinary wolf to the seer and the wolf team', () => {
    const run = play(SEED, act('seer_check', null, [king], 1), BOARD);
    expect(entries(run, 'action', 'seer_check')[0]?.text).toBe(`查验 ${king}号：狼人`);
    expect(requestsIn(run, 'wolf_chat').map((request) => request.seat)).toContain(king);
  });
});

/** 每个板子 20 个种子，按板子的最少人数（12 人以外的人数由服务端端到端测试覆盖）；标准局另有 100 个种子的性质测试 */
describe.each(BOARDS.map((board) => [board.key, boardPlayers(board).min] as const))('board %s properties', (variant, playerCount) => {
  it('terminates, never leaks and is deterministic', { timeout: 30_000 }, () => {
    const runs = assertTerminates(werewolfGame, Array.from({ length: 20 }, (_, index) => index + 1), { variant, playerCount });
    for (const run of runs) {
      assertNoLeak(werewolfGame, run);
      expect(run.log.filter((entry) => entry.kind === 'fallback')).toHaveLength(0);
    }
    expect(() => assertDeterministic(werewolfGame, { seed: 9, variant, playerCount })).not.toThrow();
  });
});
