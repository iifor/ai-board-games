import { assertDeterministic, assertNoLeak, assertTerminates } from '@battle/engine/testing';
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
