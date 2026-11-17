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

  // 100 局逐请求做结构与文本两层检查，空闲时约 3 秒；机器繁忙时留足余量
  it('never leaks wolf chat, seer results, witch decisions or hidden roles', () => {
    for (const run of runs) assertNoLeak(werewolfGame, run);
  }, 30_000);

  it('keeps hidden roles out of non-wolf prompts', () => {
    for (const run of runs.slice(0, 20)) {
      const proposals = new Set(run.log.flatMap(entry =>
        entry.kind === 'speech' && entry.phaseId === 'wolf_chat' && entry.text !== '同意。' ? [entry.text] : []));
      expect(proposals.size).toBeGreaterThan(0);
      for (const { request, snapshot } of run.requests) {
        const viewer = snapshot.seats.find((seat) => seat.seat === request.seat);
        if (!viewer || viewer.team === 'werewolf' || snapshot.rolesRevealed) continue;
        expect(request.prompt.identity).not.toContain('狼队友');
        for (const proposal of proposals) expect(request.prompt.history).not.toContain(proposal);
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
    // 关键操作的心里话只走观战频道（下面的泄露检查保证它不进入任何 AI 的提示词）
    const asides = log.filter((entry) => entry.kind === 'speech' && entry.purpose === 'aside');
    expect(asides.length).toBeGreaterThan(0);
    expect(asides.every((entry) => entry.channel === 'spectator')).toBe(true);
  });

  it('never leaks in chaos mode', () => {
    for (const run of runs) assertNoLeak(werewolfGame, run);
  });

  it('is deterministic in chaos mode', () => {
    expect(() => assertDeterministic(werewolfGame, { seed: 42, agent: chaosAgent(werewolfGame) })).not.toThrow();
  });
});
