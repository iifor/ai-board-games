import test from 'node:test';
import assert from 'node:assert/strict';
import { WEREWOLF_EFFECT_TYPES } from '../../packages/shared/types/workflowTypes';
import { auditNightResolutionShadow } from '../../packages/server/modules/werewolf/engineNightResolutionAudit';
import { resolveEngineNightResolution } from '../../packages/server/modules/werewolf/engineNightResolution';

test('NightResolution shadow audit returns matched when engine and legacy agree', () => {
  const state = createState({
    wolfTarget: 2,
    guardTarget: 2,
    witchPoisonTarget: 3,
  });
  const engine = resolveEngineNightResolution(state, 1);

  const audit = auditNightResolutionShadow({
    stateBeforeLegacy: state,
    day: 1,
    legacy: {
      effects: engine.effects,
      deaths: engine.deaths,
    },
  });

  assert.equal(audit.status, 'matched');
  assert.equal(audit.mismatches, undefined);
  assert.deepEqual(audit.engine?.deaths, engine.deaths);
});

test('NightResolution shadow audit returns mismatched when deaths differ', () => {
  const state = createState({
    wolfTarget: 2,
  });

  const audit = auditNightResolutionShadow({
    stateBeforeLegacy: state,
    day: 1,
    legacy: {
      effects: [{ type: WEREWOLF_EFFECT_TYPES.KILL, target: 2 }],
      deaths: [],
    },
  });

  assert.equal(audit.status, 'mismatched');
  assert.ok(audit.mismatches?.some((mismatch) => mismatch.field === 'deaths'));
});

test('NightResolution shadow audit returns audit_failed without dropping legacy result', () => {
  const audit = auditNightResolutionShadow(
    {
      stateBeforeLegacy: createState({ wolfTarget: 2 }),
      day: 1,
      legacy: {
        effects: [{ type: WEREWOLF_EFFECT_TYPES.KILL, target: 2 }],
        deaths: [{ id: 2, reason: 'legacy death' }],
      },
    },
    () => {
      throw new Error('engine unavailable');
    },
  );

  assert.equal(audit.status, 'audit_failed');
  assert.equal(audit.error?.message, 'engine unavailable');
  assert.deepEqual(audit.legacy.deaths, [{ id: 2, reason: 'legacy death' }]);
});

function createState(night: Record<string, unknown>): Record<string, unknown> {
  return {
    players: [
      { id: 2, alive: true },
      { id: 3, alive: true },
    ],
    rounds: [{ day: 1, phase: 'night', night }],
  };
}
