import test from 'node:test';
import assert from 'node:assert/strict';

const {
  buildDebugScenarios,
  createFlowTracker,
  parseApiData,
  validateCompletedGame,
} = require('../../scripts/dev/game-flow-debug-core.cjs');

const health = {
  defaultHostId: 99,
  players: [
    { id: 99 },
    ...Array.from({ length: 12 }, (_, index) => ({ id: index + 1 })),
  ],
};

test('debug flow scenarios reuse the production socket entry with deterministic mode', () => {
  const scenarios = buildDebugScenarios(health);
  assert.deepEqual(scenarios.map((scenario: { key: string }) => scenario.key), ['werewolf', 'debate']);
  for (const scenario of scenarios) {
    assert.equal(scenario.startPayload.type, 'start');
    assert.equal(scenario.startPayload.mode, 'real');
    assert.equal(scenario.startPayload.debugMode, true);
    assert.equal(scenario.startPayload.playerIds.length, 12);
    assert.ok(!scenario.startPayload.playerIds.includes(99));
  }
  assert.deepEqual(scenarios[1].startPayload.debateTeams.proIds, [1, 2, 3, 4]);
  assert.deepEqual(scenarios[1].startPayload.debateTeams.conIds, [5, 6, 7, 8]);
  assert.deepEqual(scenarios[1].startPayload.debateTeams.judgeIds, [9, 10, 11, 12]);
});

test('debug flow refuses an incomplete player roster', () => {
  assert.throws(
    () => buildDebugScenarios({ players: Array.from({ length: 11 }, (_, index) => ({ id: index + 1 })) }),
    /需要 12 名/,
  );
});

test('flow tracker fails closed when socket closes before workflow completion', () => {
  const scenario = buildDebugScenarios(health)[0];
  const tracker = createFlowTracker(scenario);
  tracker.accept({ type: 'phase-changed' });
  assert.throws(() => tracker.assertCompleted(), /workflow-completed 前关闭/);
});

test('flow tracker accepts complete werewolf and debate terminal states', () => {
  const [werewolf, debate] = buildDebugScenarios(health);
  const werewolfTracker = createFlowTracker(werewolf);
  werewolfTracker.accept({ ackId: 1, type: 'phase-changed' });
  werewolfTracker.accept({
    type: 'workflow-completed',
    game: completeGame('werewolf', { rounds: [{ day: 1 }] }),
  });
  const werewolfSummary = werewolfTracker.summary(20);
  assert.equal(werewolfSummary.ok, true);
  assert.equal(werewolfSummary.ackCount, 1);
  assert.equal(werewolfSummary.roundCount, 1);

  const debateTracker = createFlowTracker(debate);
  debateTracker.accept({
    event: {
      type: 'workflow-completed',
      game: completeGame('debate', {
        phases: [{ speeches: [{ playerId: 1, text: '完整发言' }] }],
        mvp: { id: 1 },
      }),
    },
  });
  const debateSummary = debateTracker.summary(30);
  assert.equal(debateSummary.ok, true);
  assert.equal(debateSummary.phaseCount, 1);
  assert.equal(debateSummary.speechCount, 1);
});

test('terminal validation rejects incomplete results and fallback use', () => {
  const [werewolf, debate] = buildDebugScenarios(health);
  assert.throws(
    () => validateCompletedGame(werewolf, completeGame('werewolf', { rounds: [] })),
    /没有产生任何回合/,
  );
  assert.throws(
    () => validateCompletedGame(debate, completeGame('debate', {
      phases: [{ speeches: [{ text: '' }] }],
      mvp: { id: 1 },
    })),
    /发言为空或不完整/,
  );
  assert.throws(
    () => validateCompletedGame(werewolf, completeGame('werewolf', {
      rounds: [{ day: 1 }],
      fallbackAudit: [{ reason: 'unexpected fallback' }],
    })),
    /fallbackAudit/,
  );
});

test('API response unwrapping supports wrapped and legacy health payloads', () => {
  assert.deepEqual(parseApiData({ code: 0, message: 'ok', data: health }), health);
  assert.deepEqual(parseApiData(health), health);
});

function completeGame(type: string, patch: Record<string, unknown> = {}) {
  return {
    id: `${type}-debug-id`,
    type,
    debugMode: true,
    winner: 'pro',
    players: Array.from({ length: 12 }, (_, index) => ({ id: index + 1 })),
    fallbackAudit: [],
    ...patch,
  };
}
