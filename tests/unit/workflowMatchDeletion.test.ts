import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../../packages/server/db/migrations';
import * as dbModule from '../../packages/server/db';
import { deleteWorkflowMatch } from '../../packages/server/modules/workflow-engine/service';

const WORKFLOW_TABLES = [
  'workflow_events',
  'match_snapshots',
  'ai_tasks',
  'pending_actions',
  'outbox_messages',
  'action_window_epochs',
  'workflow_effects',
  'workflow_interrupts',
  'memory_snapshots',
] as const;

test('complete deletion removes only the terminal match graph', () => {
  withDatabase((db) => {
    seedDeletionGraph(db);

    assert.deepEqual(deleteWorkflowMatch('target-match'), {
      matchId: 'target-match',
      deleted: { match: true, game: true, traces: 1 },
    });

    assert.equal(count(db, 'matches', 'id', 'target-match'), 0);
    assert.equal(count(db, 'games', 'id', 'target-match'), 0);
    assert.equal(count(db, 'game_playback_events', 'game_id', 'target-match'), 0);
    assert.equal(count(db, 'game_traces', 'id', 'target-trace'), 0);
    assert.equal(count(db, 'trace_spans', 'trace_id', 'target-trace'), 0);
    assert.equal(count(db, 'game_events', 'trace_id', 'target-trace'), 0);
    for (const table of WORKFLOW_TABLES) {
      assert.equal(count(db, table, 'match_id', 'target-match'), 0, table);
    }

    assert.equal(count(db, 'matches', 'id', 'control-match'), 1);
    assert.equal(count(db, 'games', 'id', 'control-match'), 1);
    assert.equal(count(db, 'game_traces', 'id', 'control-trace'), 1);
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM player_game_memories').get() as { count: number }).count,
      1,
    );
  });
});

test('complete deletion rejects active matches without partial deletion', () => {
  withDatabase((db) => {
    seedDeletionGraph(db);

    assert.throws(
      () => deleteWorkflowMatch('running-match'),
      (error: unknown) => getHttpStatus(error) === 409,
    );
    assert.equal(count(db, 'matches', 'id', 'running-match'), 1);
    assert.equal(count(db, 'workflow_events', 'match_id', 'running-match'), 1);
  });
});

test('complete deletion returns 404 for an unknown match', () => {
  withDatabase(() => {
    assert.throws(
      () => deleteWorkflowMatch('missing-match'),
      (error: unknown) => getHttpStatus(error) === 404,
    );
  });
});

test('admin requires a terminal loaded match and exact id confirmation', () => {
  const adminApi = readFileSync(resolve('packages/admin/src/services/adminApi.ts'), 'utf8');
  const consolePage = readFileSync(
    resolve('packages/admin/src/pages/WorkflowDebugConsole/index.tsx'),
    'utf8',
  );

  assert.match(
    adminApi,
    /deleteWorkflowMatch\(matchId: string\)[\s\S]*?method: 'DELETE'/,
  );
  assert.match(
    consolePage,
    /DELETABLE_MATCH_STATUSES = new Set\(\['completed', 'failed', 'paused_debug'\]\)/,
  );
  assert.match(consolePage, /loadedMatchId === matchId\.trim\(\)/);
  assert.match(consolePage, /deleteConfirmation !== loadedMatchId/);
  assert.match(consolePage, /彻底删除对局数据/);
  assert.match(consolePage, /setDebug\(null\)/);
  assert.match(consolePage, /setLoadedMatchId\(null\)/);
  assert.match(consolePage, /setMatchId\(''\)/);
});

function withDatabase(run: (db: Database.Database) => void): void {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const originalGetDb = dbModule.getDb;
  Object.assign(dbModule, { getDb: () => db });
  try {
    run(db);
  } finally {
    Object.assign(dbModule, { getDb: originalGetDb });
    db.close();
  }
}

function seedDeletionGraph(db: Database.Database): void {
  db.prepare('INSERT INTO players (id, nickname) VALUES (?, ?)').run(1, '测试玩家一');
  db.prepare('INSERT INTO players (id, nickname) VALUES (?, ?)').run(2, '测试玩家二');
  db.prepare(`
    INSERT INTO player_game_memories (
      game_type, owner_player_id, subject_player_id, games_played
    ) VALUES ('werewolf', 1, 2, 1)
  `).run();

  seedMatch(db, 'target-match', 'completed');
  seedMatch(db, 'control-match', 'completed');
  seedMatch(db, 'running-match', 'running');
  seedWorkflowGraph(db, 'target-match');
  seedWorkflowGraph(db, 'control-match');
  db.prepare(`
    INSERT INTO workflow_events (
      match_id, seq, type, payload_json, visibility, visible_to_player_ids_json
    ) VALUES ('running-match', 1, 'test', '{}', 'system', '[]')
  `).run();

  seedGame(db, 'target-match');
  seedGame(db, 'control-match');
  seedTrace(db, 'target-trace', 'target-match');
  seedTrace(db, 'control-trace', 'control-match');
}

function seedMatch(db: Database.Database, matchId: string, status: string): void {
  db.prepare(`
    INSERT INTO matches (
      id, game_type, workflow_id, status, current_step_index, version,
      config_json, state_json, blockers_json, error_json
    ) VALUES (?, 'werewolf', 'werewolf.workflow.basic.v1', ?, 0, 0, '{}', '{}', '[]', 'null')
  `).run(matchId, status);
}

function seedWorkflowGraph(db: Database.Database, matchId: string): void {
  const suffix = matchId.replace(/[^a-z0-9]/g, '');
  db.prepare(`
    INSERT INTO workflow_events (
      match_id, seq, type, payload_json, visibility, visible_to_player_ids_json
    ) VALUES (?, 1, 'test', '{}', 'system', '[]')
  `).run(matchId);
  db.prepare(`
    INSERT INTO match_snapshots (
      match_id, version, status, current_step_index, state_json, blockers_json
    ) VALUES (?, 1, 'completed', 0, '{}', '[]')
  `).run(matchId);
  db.prepare(`
    INSERT INTO ai_tasks (
      id, match_id, step_id, task_key, action, status, prompt_json,
      context_json, result_json, error_json, visible_event_ids_json
    ) VALUES (?, ?, 'step-1', 'task-key', 'test', 'succeeded', '{}', '{}', '{}', 'null', '[]')
  `).run(`task-${suffix}`, matchId);
  db.prepare(`
    INSERT INTO pending_actions (
      id, match_id, step_id, actor_type, action_type, status,
      payload_json, idempotency_key
    ) VALUES (?, ?, 'step-1', 'player', 'test', 'resolved', '{}', 'action-key')
  `).run(`action-${suffix}`, matchId);
  db.prepare(`
    INSERT INTO outbox_messages (match_id, event_seq, status, payload_json)
    VALUES (?, 1, 'sent', '{}')
  `).run(matchId);
  db.prepare(`
    INSERT INTO action_window_epochs (
      id, match_id, step_id, action_type, status, window_json
    ) VALUES (?, ?, 'step-1', 'test', 'resolved', '{}')
  `).run(`window-${suffix}`, matchId);
  db.prepare(`
    INSERT INTO workflow_effects (
      id, match_id, step_id, effect_type, status, payload_json
    ) VALUES (?, ?, 'step-1', 'test', 'applied', '{}')
  `).run(`effect-${suffix}`, matchId);
  db.prepare(`
    INSERT INTO workflow_interrupts (
      id, match_id, step_id, effect_id, interrupt_type, status,
      payload_json, resolution_json
    ) VALUES (?, ?, 'step-1', ?, 'test', 'resolved', '{}', '{}')
  `).run(`interrupt-${suffix}`, matchId, `effect-${suffix}`);
  db.prepare(`
    INSERT INTO memory_snapshots (match_id, scope, snapshot_json)
    VALUES (?, 'public', '{}')
  `).run(matchId);
}

function seedGame(db: Database.Database, gameId: string): void {
  db.prepare(`
    INSERT INTO games (
      id, game_type, mode, players_json, rounds_json, event_json
    ) VALUES (?, 'werewolf', 'test', '[]', '[]', '{}')
  `).run(gameId);
  db.prepare(`
    INSERT INTO game_players (game_id, player_id, player_snapshot_json)
    VALUES (?, 1, '{}')
  `).run(gameId);
  db.prepare(`
    INSERT INTO game_playback_events (
      game_id, sequence, protocol_version, event_type, view_mode,
      payload_json, media_json
    ) VALUES (?, 1, 1, 'test', 'god', '{}', '[]')
  `).run(gameId);
}

function seedTrace(db: Database.Database, traceId: string, gameId: string): void {
  db.prepare(`
    INSERT INTO game_traces (
      id, game_type, game_mode, status, created_at
    ) VALUES (?, 'werewolf', 'test', 'completed', CURRENT_TIMESTAMP)
  `).run(traceId);
  db.prepare(`
    INSERT INTO trace_spans (
      id, trace_id, parent_span_id, span_type, span_name, start_time,
      status, attributes_json, created_at
    ) VALUES (?, ?, NULL, 'game', 'root', CURRENT_TIMESTAMP, 'ok', ?, CURRENT_TIMESTAMP)
  `).run(`${traceId}-root`, traceId, JSON.stringify({ 'game.id': gameId }));
  db.prepare(`
    INSERT INTO game_events (
      trace_id, event_type, phase, day, event_json, received_at
    ) VALUES (?, 'test', 'day', 1, '{}', CURRENT_TIMESTAMP)
  `).run(traceId);
}

function count(
  db: Database.Database,
  table: string,
  column: string,
  value: string,
): number {
  return (
    db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).get(value) as { count: number }
  ).count;
}

function getHttpStatus(error: unknown): number | undefined {
  return error instanceof Error && 'httpStatus' in error
    ? Number(error.httpStatus)
    : undefined;
}
