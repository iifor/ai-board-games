import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migrateSqliteToPostgres } from '../../packages/db-migrator/src';
import type { MigrationClient } from '../../packages/db-migrator/src/types';
import { migratePostgres } from '../../packages/server/db/postgres/migrate';
import { withTestSchema } from './helpers';

function fixture(skinJson = '["valid"]'): string {
  const file = path.join(os.tmpdir(), `consensus-migrator-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const db = new Database(file);
  db.exec(`
    CREATE TABLE skins (id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL, source TEXT NOT NULL,
      terms_json TEXT NOT NULL, background TEXT NOT NULL, truth TEXT NOT NULL, clues_json TEXT NOT NULL,
      noises_json TEXT NOT NULL, memory_examples_json TEXT NOT NULL, enabled INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE model_providers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, base_url TEXT NOT NULL,
      api_format TEXT NOT NULL, api_key_cipher TEXT NOT NULL, api_key_iv TEXT NOT NULL, api_key_tag TEXT NOT NULL,
      enabled INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  `);
  db.prepare('INSERT INTO skins VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run('skin-1', 'Skin', 'v1', 'admin', skinJson,
    'bg', 'truth', '[]', '[]', '[]', 1, '2026-08-08T00:00:00.000Z', '2026-08-08T00:00:00.000Z');
  db.prepare('INSERT INTO model_providers VALUES (?,?,?,?,?,?,?,?,?,?)').run(7, 'Provider', '', 'openai-compatible', '', '', '', 1,
    '2026-08-08T00:00:00.000Z', '2026-08-08T00:00:00.000Z');
  db.close();
  return file;
}

function orphanFixture(): string {
  const file = path.join(os.tmpdir(), `consensus-migrator-orphan-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const db = new Database(file);
  db.exec(`
    CREATE TABLE games (id TEXT PRIMARY KEY, game_type TEXT NOT NULL, mode TEXT NOT NULL,
      skin_id TEXT, skin_name TEXT NOT NULL, winner TEXT, win_reason TEXT NOT NULL,
      topic_json TEXT NOT NULL, players_json TEXT NOT NULL, rounds_json TEXT NOT NULL,
      event_json TEXT NOT NULL, audio_resources_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE game_players (game_id TEXT NOT NULL, player_id INTEGER NOT NULL,
      player_snapshot_json TEXT NOT NULL, PRIMARY KEY (game_id, player_id));
  `);
  db.prepare('INSERT INTO games VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    'game-1', 'werewolf', 'standard', null, '', null, '', '{}', '[]', '[]', '[]', '[]',
    '2026-08-08T00:00:00.000Z',
  );
  db.prepare('INSERT INTO game_players VALUES (?,?,?)').run('game-1', 999, '{}');
  db.close();
  return file;
}

test('SQLite importer validates rows, skips runtime history and resets identities', async () => {
  await withTestSchema(async (database, schema) => {
    await migratePostgres(database);
    const sourcePath = fixture();
    try {
      const report = await migrateSqliteToPostgres({ sourcePath, targetUrl: process.env.TEST_DATABASE_URL!, targetSchema: schema });
      assert.equal(report.validation, 'passed');
      assert.equal(report.tables.skins.targetRows, 1);
      assert.ok(report.skippedTables.includes('workflow_events'));
      const inserted = await database.queryOne<{ id: number }>(`INSERT INTO model_providers
        (name,base_url,api_format,api_key_cipher,api_key_iv,api_key_tag,enabled) VALUES ('next','','openai-compatible','','','',1) RETURNING id`);
      assert.equal(Number(inserted?.id), 8);
      await assert.rejects(migrateSqliteToPostgres({ sourcePath, targetUrl: process.env.TEST_DATABASE_URL!, targetSchema: schema }),
        /Target table is not empty/);
    } finally { fs.unlinkSync(sourcePath); }
  });
});

test('SQLite importer rolls back every table when JSON is invalid', async () => {
  await withTestSchema(async (database, schema) => {
    await migratePostgres(database);
    const sourcePath = fixture('{broken');
    try {
      await assert.rejects(migrateSqliteToPostgres({ sourcePath, targetUrl: process.env.TEST_DATABASE_URL!, targetSchema: schema }),
        /contains invalid JSON/);
      assert.equal(Number((await database.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM skins'))?.count), 0);
      assert.equal(Number((await database.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM model_providers'))?.count), 0);
    } finally { fs.unlinkSync(sourcePath); }
  });
});

test('SQLite importer rejects orphan foreign keys and rolls back the game', async () => {
  await withTestSchema(async (database, schema) => {
    await migratePostgres(database);
    const sourcePath = orphanFixture();
    try {
      await assert.rejects(
        migrateSqliteToPostgres({ sourcePath, targetUrl: process.env.TEST_DATABASE_URL!, targetSchema: schema }),
        /foreign key constraint/,
      );
      assert.equal(Number((await database.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM games'))?.count), 0);
    } finally {
      fs.unlinkSync(sourcePath);
    }
  });
});

test('SQLite importer accepts a prepared client factory and still sets the rehearsal search_path explicitly', async () => {
  const sourcePath = path.join(os.tmpdir(), `consensus-migrator-empty-${process.pid}-${Date.now()}.sqlite`);
  new Database(sourcePath).close();
  const queries: string[] = [];
  let ended = false;
  const client: MigrationClient = {
    connect: async () => undefined,
    query: async <T extends object>(sql: string): Promise<{ rows: T[]; rowCount: number | null }> => {
      queries.push(sql);
      if (/information_schema\.columns/i.test(sql)) {
        return { rows: [{ column_name: 'id' }] as T[], rowCount: 1 };
      }
      if (/COUNT\(\*\)/i.test(sql)) return { rows: [{ count: '0' }] as T[], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    end: async () => { ended = true; },
  };
  try {
    const report = await migrateSqliteToPostgres({
      sourcePath,
      targetUrl: 'postgresql://127.0.0.1:1/consensus_test',
      targetSchema: 'consensus_rehearsal_factory',
    }, {
      createClient: async () => client,
    });
    assert.equal(report.status, 'succeeded');
    assert.ok(queries.some((sql) => sql === 'SET search_path TO "consensus_rehearsal_factory", public'));
    assert.equal(ended, true);
  } finally {
    fs.unlinkSync(sourcePath);
  }
});
