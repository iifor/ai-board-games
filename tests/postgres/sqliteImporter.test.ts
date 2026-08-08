import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migrateSqliteToPostgres } from '../../packages/db-migrator/src';
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
