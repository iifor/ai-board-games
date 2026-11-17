import { assertDeterministic, assertNoLeak, assertTerminates, chaosAgent } from '@battle/engine/testing';
import { describe, expect, it } from 'vitest';
import { boardPlayers, BOARDS } from '../../src/werewolf/boards';
import { werewolfGame } from '../../src/werewolf';

// 每个板子的混沌回合：boards.test.ts 的脚本代理永远合法、从不弃票、从不失败、从不自爆，
// 这里让每个板子都走一遍重试、兜底、弃票、放弃技能与声明分支（标准局另有 30 个种子的混沌测试）。
// 人数可变的板子同时跑最少与最多人数。
const SEEDS = Array.from({ length: 15 }, (_, index) => index + 1);
const agent = chaosAgent(werewolfGame);

const CASES = BOARDS.flatMap((board) => {
  const { min, max } = boardPlayers(board);
  return [...new Set([min, max])].map((playerCount) => [board.key, playerCount] as const);
});

describe.each(CASES)('board %s chaos (%i players)', (variant, playerCount) => {
  it('terminates, never leaks, falls back without stalling and is deterministic', { timeout: 30_000 }, () => {
    const runs = assertTerminates(werewolfGame, SEEDS, { variant, playerCount, agent });
    for (const run of runs) {
      assertNoLeak(werewolfGame, run);
      expect(run.snapshot.seats).toHaveLength(playerCount);
    }
    expect(runs.some((run) => run.log.some((entry) => entry.kind === 'fallback'))).toBe(true);
    expect(() => assertDeterministic(werewolfGame, { seed: 11, variant, playerCount, agent })).not.toThrow();
  });
});

describe('board chaos coverage', () => {
  it('covers every board at least once', () => {
    expect(new Set(CASES.map(([variant]) => variant))).toEqual(new Set(BOARDS.map((board) => board.key)));
  });
});
