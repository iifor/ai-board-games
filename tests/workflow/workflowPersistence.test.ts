import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../../packages/server/db/migrations';
import * as dbModule from '../../packages/server/db';
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

test('stale active match query uses a strict seven-day cutoff and cascades deletes', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const originalGetDb = dbModule.getDb;
  Object.assign(dbModule, { getDb: () => db });
  try {
    const insertMatch = db.prepare(`
      INSERT INTO matches (
        id, game_type, workflow_id, status, current_step_index, version,
        config_json, state_json, blockers_json, error_json, created_at, updated_at
      ) VALUES (?, 'werewolf', 'werewolf.workflow.basic.v1', ?, 0, 0,
        '{}', '{}', '[]', 'null', ?, ?)
    `);
    insertMatch.run('stale-running', 'running', '2026-07-01T00:00:00.000Z', '2026-07-11T23:59:59.999Z');
    insertMatch.run('exactly-seven-days', 'waiting', '2026-07-01T00:00:00.000Z', '2026-07-12T00:00:00.000Z');
    insertMatch.run('recent-waiting', 'waiting', '2026-07-01T00:00:00.000Z', '2026-07-18T00:00:00.000Z');
    insertMatch.run('old-completed', 'completed', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z');

    db.prepare(`
      INSERT INTO workflow_events (
        match_id, seq, type, payload_json, visibility,
        visible_to_player_ids_json, created_at
      ) VALUES ('stale-running', 1, 'test', '{}', 'public', '[]', CURRENT_TIMESTAMP)
    `).run();
    db.prepare(`
      INSERT INTO match_snapshots (
        match_id, version, status, current_step_index,
        state_json, blockers_json, created_at
      ) VALUES ('stale-running', 1, 'running', 0, '{}', '[]', CURRENT_TIMESTAMP)
    `).run();
    db.prepare(`
      INSERT INTO ai_tasks (
        id, match_id, step_id, task_key, action, status,
        prompt_json, context_json, result_json, error_json,
        visible_event_ids_json, created_at, updated_at
      ) VALUES (
        'task-1', 'stale-running', 'step-1', 'task-key', 'test', 'queued',
        '{}', '{}', 'null', 'null', '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run();
    db.prepare(`
      INSERT INTO outbox_messages (
        match_id, event_seq, status, payload_json, created_at, updated_at
      ) VALUES ('stale-running', 1, 'pending', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run();

    const candidates = debugRetentionRepo.listStaleActiveMatches('2026-07-12T00:00:00.000Z');
    assert.deepEqual(candidates, [{ id: 'stale-running' }]);
    assert.equal(debugRetentionRepo.deleteMatchCascade('stale-running'), true);
    for (const table of ['workflow_events', 'match_snapshots', 'ai_tasks', 'outbox_messages']) {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE match_id = ?`)
        .get('stale-running') as { count: number };
      assert.equal(row.count, 0, table);
    }
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM matches').get() as { count: number }).count,
      3,
    );
  } finally {
    Object.assign(dbModule, { getDb: originalGetDb });
    db.close();
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
