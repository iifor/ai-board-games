import test from 'node:test';
import assert from 'node:assert/strict';
import * as debugRetentionRepo from '../../packages/server/modules/workflow-engine/debugRetentionRepository';
import {
  createStatePatch,
  applyStatePatch,
} from '../../packages/server/modules/workflow-engine/statePatch';
import {
  cleanupTerminalDebugMatches,
} from '../../packages/server/modules/workflow-engine/debugRetention';
import {
  createPersistenceTiming,
  addBytes,
  finishPersistenceTiming,
} from '../../packages/server/modules/workflow-engine/persistenceTiming';
import { buildStateTransitionEvents } from '../../packages/server/modules/workflow-engine/stateTransition';
import type { Match } from '../../packages/server/types/workflow';

type RetentionRepoPatch = Pick<
  typeof debugRetentionRepo,
  'listTerminalDebugMatches' | 'getMatchLogicalBytes' | 'deleteMatchCascade'
>;

test('state patch uses path operations and replaces arrays atomically', () => {
  const previous = {
    round: { day: 1, phase: 'night', obsolete: true },
    players: [{ id: 1, alive: true }],
  };
  const next = {
    round: { day: 1, phase: 'day' },
    players: [{ id: 1, alive: false }],
  };

  const patch = createStatePatch(previous, next);
  assert.ok(patch);
  assert.deepEqual(
    patch.set.find((operation) => operation.path.join('.') === 'players')?.value,
    next.players,
  );
  assert.equal(patch.remove.some((path) => path.join('.') === 'round.obsolete'), true);
  assert.deepEqual(applyStatePatch(previous, patch), next);
});

test('state transition stores one incremental patch without projectedState', () => {
  const events = buildStateTransitionEvents({
    matchId: 'match-1',
    stepId: 'step-1',
    matchVersion: 3,
    currentStepIndex: 4,
    previousState: { score: 1, stable: true },
    nextState: { score: 2, stable: true },
    result: {
      status: 'COMPLETED',
      state: { score: 2, stable: true },
      events: [
        { type: 'score_changed', payload: { delta: 1 } },
        { type: 'display_only', payload: { message: 'ok' } },
      ],
    },
  });

  const firstPayload = events[0].payload as Record<string, unknown>;
  const secondPayload = events[1].payload as Record<string, unknown>;
  assert.equal('projectedState' in firstPayload, false);
  assert.ok(firstPayload.statePatch);
  assert.equal('statePatch' in secondPayload, false);
});

test('debug retention keeps newest twenty terminal debug matches', () => {
  const original = snapshotRetentionRepo(debugRetentionRepo);
  const deleted: string[] = [];
  try {
    patchRetentionRepo(debugRetentionRepo, {
      listTerminalDebugMatches: () =>
        Array.from({ length: 23 }, (_, index) => debugMatch(`debug-${index}`)),
      getMatchLogicalBytes: () => 100,
      deleteMatchCascade: (matchId) => {
        deleted.push(matchId);
        return true;
      },
    });

    const result = cleanupTerminalDebugMatches(20);
    assert.deepEqual(deleted, ['debug-20', 'debug-21', 'debug-22']);
    assert.equal(result.deleted, 3);
    assert.equal(result.releasedLogicalBytes, 300);
  } finally {
    patchRetentionRepo(debugRetentionRepo, original);
  }
});

test('debug persistence timing emits structured log without workflow writes', () => {
  const originalInfo = console.info;
  const messages: string[] = [];
  try {
    console.info = (message?: unknown) => {
      messages.push(String(message));
    };
    const timing = createPersistenceTiming('correlation-1', 'match-1', 'test', true);
    addBytes(timing, 'eventPayloadBytes', '{"ok":true}');
    finishPersistenceTiming(timing, { eventCount: 1 });
    const payload = JSON.parse(messages[0]) as Record<string, unknown>;
    assert.equal(payload.type, 'workflow-persistence-timing');
    assert.equal(payload.correlationId, 'correlation-1');
    assert.equal((payload.bytes as Record<string, number>).eventPayloadBytes, 11);
  } finally {
    console.info = originalInfo;
  }
});

function debugMatch(id: string): Match {
  return {
    id,
    gameType: 'werewolf',
    workflowId: 'werewolf.workflow.basic.v1',
    status: 'completed',
    currentStepIndex: 1,
    version: 1,
    config: { debugMode: true },
    state: {},
    blockers: [],
    error: null,
    createdAt: '',
    updatedAt: '',
    completedAt: '',
  };
}

function snapshotRetentionRepo(target: typeof debugRetentionRepo): RetentionRepoPatch {
  return {
    listTerminalDebugMatches: target.listTerminalDebugMatches,
    getMatchLogicalBytes: target.getMatchLogicalBytes,
    deleteMatchCascade: target.deleteMatchCascade,
  };
}

function patchRetentionRepo(
  target: typeof debugRetentionRepo,
  patch: Partial<RetentionRepoPatch>,
): void {
  Object.assign(target, patch);
}
