import { describe, expect, it } from 'vitest';
import { assertDeterministic, assertNoLeak, assertTerminates, chaosAgent } from '../src/testing';
import { chainGame } from './fixtures/chainGame';
import { panelGame } from './fixtures/panelGame';
import { secretGame } from './fixtures/secretGame';

const SEEDS = Array.from({ length: 100 }, (_, index) => index + 1);

describe.each([
  ['secret', secretGame],
  ['panel', panelGame],
] as const)('engine properties: %s', (_name, game) => {
  it('terminates for 100 seeds without leaking', () => {
    const runs = assertTerminates(game, SEEDS);
    for (const run of runs) assertNoLeak(game, run);
    expect(runs).toHaveLength(100);
  });

  it('is deterministic', () => {
    expect(() => assertDeterministic(game, { seed: 5 })).not.toThrow();
  });
});

describe('engine properties: chaos mode', () => {
  // 混沌脚本会放弃开枪、在发言里声明引爆、给出不合法输出或模拟调用失败；默认脚本永远走不到这些分支
  const seeds = Array.from({ length: 30 }, (_, index) => index + 1);
  const runs = assertTerminates(chainGame, seeds, { agent: chaosAgent(chainGame) });

  it('terminates for 30 seeds without leaking while exercising retries, fallbacks, declarations and declines', () => {
    for (const run of runs) assertNoLeak(chainGame, run);
    const log = runs.flatMap((run) => run.log);
    expect(log.some((entry) => entry.kind === 'fallback')).toBe(true);
    expect(runs.flatMap((run) => run.requests).some(({ request }) => request.attempt > 1)).toBe(true);
    expect(log.some((entry) => entry.kind === 'action' && entry.action === '引爆')).toBe(true);
    expect(log.some((entry) => entry.kind === 'action' && entry.action === '开枪' && entry.targets.length === 0)).toBe(true);
  });

  it('is deterministic in chaos mode', () => {
    expect(() => assertDeterministic(chainGame, { seed: 5, agent: chaosAgent(chainGame) })).not.toThrow();
  });
});
