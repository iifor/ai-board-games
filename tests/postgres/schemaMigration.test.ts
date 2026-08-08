import assert from 'node:assert/strict';
import test from 'node:test';
import { migratePostgres } from '../../packages/server/db/postgres/migrate';
import { readTestDatabaseUrl, withTestSchema } from './helpers';

const EXPECTED_TABLES = [
  'action_window_epochs', 'admin_users', 'agent_decisions', 'ai_tasks', 'app_settings',
  'game_events', 'game_playback_events', 'game_player_selections', 'game_players', 'game_traces',
  'games', 'llm_records', 'match_snapshots', 'matches', 'memory_snapshots', 'model_providers',
  'models', 'outbox_messages', 'pending_actions', 'player_game_memories', 'players',
  'schema_migrations', 'skins', 'state_snapshots', 'trace_spans', 'voice_packages',
  'werewolf_modes', 'werewolf_roles', 'workflow_effects', 'workflow_events', 'workflow_interrupts',
].sort();

test('test database guard rejects a production-shaped database name', () => {
  assert.throws(
    () => readTestDatabaseUrl({ TEST_DATABASE_URL: 'postgres://localhost/consensus' }),
    /ending in _test/,
  );
});

test('schema migrations create all tables and remain idempotent', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    await migratePostgres(database);

    const rows = await database.queryMany<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
      ORDER BY table_name
    `);
    assert.deepEqual(rows.map((row) => row.table_name), EXPECTED_TABLES);
  });
});

test('game deletion cascades playback events but not player memories', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    await database.execute(`INSERT INTO players (id, nickname) VALUES (1, 'A'), (2, 'B')`);
    await database.execute(`INSERT INTO games (id, mode, players_json, rounds_json, event_json) VALUES ('g1', 'standard', '[]', '[]', '[]')`);
    await database.execute(`INSERT INTO game_playback_events (game_id, sequence, protocol_version, event_type, view_mode, payload_json) VALUES ('g1', 1, 1, 'start', 'public', '{}')`);
    await database.execute(`INSERT INTO player_game_memories (game_type, owner_player_id, subject_player_id) VALUES ('werewolf', 1, 2)`);

    await database.execute(`DELETE FROM games WHERE id = 'g1'`);

    assert.equal((await database.queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM game_playback_events'))?.count, '0');
    assert.equal((await database.queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM player_game_memories'))?.count, '1');
  });
});

test('migration refuses a modified checksum for an applied file', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    await database.execute(`UPDATE schema_migrations SET checksum = 'tampered'`);
    await assert.rejects(migratePostgres(database), /checksum/i);
  });
});

test('driver preserves repository-compatible JSON, timestamp and bigint values', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    await database.execute(`INSERT INTO app_settings (key, value_json) VALUES ('shape', '{"enabled":true}')`);
    const row = await database.queryOne<{ value_json: string; updated_at: string; count: number }>(`
      SELECT value_json, updated_at, COUNT(*) OVER () AS count
      FROM app_settings
      WHERE key = 'shape'
    `);

    assert.equal(row?.value_json, '{"enabled": true}');
    assert.equal(typeof row?.updated_at, 'string');
    assert.equal(typeof row?.count, 'number');
  });
});
