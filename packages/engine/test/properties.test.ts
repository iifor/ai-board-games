import { describe, expect, it } from 'vitest';
import { assertDeterministic, assertNoLeak, assertTerminates } from '../src/testing';
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
