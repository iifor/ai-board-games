import { assertDeterministic, assertNoLeak, assertTerminates, chaosAgent } from '@battle/engine/testing';
import { describe, expect, it } from 'vitest';
import { werewolfGame } from '../../src/werewolf';

describe('werewolf properties', () => {
  const runs = assertTerminates(werewolfGame, Array.from({ length: 100 }, (_, index) => index + 1));

  it('terminates for 100 seeds with scripted players and never needs a fallback', () => {
    expect(runs).toHaveLength(100);
    for (const run of runs) expect(run.log.filter((entry) => entry.kind === 'fallback')).toHaveLength(0);
    const outcomes = new Set(runs.map((run) => `${run.snapshot.result?.winner}/${run.snapshot.result?.endReason}`));
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('never leaks wolf chat, seer results, witch decisions or hidden roles', () => {
    for (const run of runs) assertNoLeak(werewolfGame, run);
  });

  it('keeps hidden roles out of non-wolf prompts', () => {
    for (const run of runs.slice(0, 20)) {
      const wolves = run.snapshot.seats.filter((seat) => seat.team === 'werewolf').map((seat) => seat.seat);
      for (const { request, snapshot } of run.requests) {
        const viewer = snapshot.seats.find((seat) => seat.seat === request.seat);
        if (!viewer || viewer.team === 'werewolf' || snapshot.rolesRevealed) continue;
        expect(request.prompt.identity).not.toContain('狼队友');
        for (const wolf of wolves) expect(request.prompt.history).not.toContain(`${wolf}号 玩家${wolf}：【调试】${wolf}号 玩家${wolf}在「狼人夜聊」`);
      }
    }
  });

  it('is deterministic', () => {
    expect(() => assertDeterministic(werewolfGame, { seed: 42 })).not.toThrow();
  });
});

describe('werewolf properties: chaos mode', () => {
  // 混沌脚本会弃票、放弃技能、在白天发言里自爆、给出不合法输出或模拟调用失败，覆盖默认脚本永远走不到的分支
  const runs = assertTerminates(werewolfGame, Array.from({ length: 30 }, (_, index) => index + 1), { agent: chaosAgent(werewolfGame) });

  it('terminates for 30 seeds and hits abstentions, self-destructs and fallbacks along the way', () => {
    expect(runs).toHaveLength(30);
    const log = runs.flatMap((run) => run.log);
    expect(log.some((entry) => entry.kind === 'vote_tallied' && entry.abstained.length > 0)).toBe(true);
    expect(log.some((entry) => entry.kind === 'seat_eliminated' && entry.reason === '自爆')).toBe(true);
    expect(log.some((entry) => entry.kind === 'fallback')).toBe(true);
    expect(runs.flatMap((run) => run.requests).some(({ request }) => request.attempt > 1)).toBe(true);
  });

  it('never leaks in chaos mode', () => {
    for (const run of runs) assertNoLeak(werewolfGame, run);
  });

  it('is deterministic in chaos mode', () => {
    expect(() => assertDeterministic(werewolfGame, { seed: 42, agent: chaosAgent(werewolfGame) })).not.toThrow();
  });
});
