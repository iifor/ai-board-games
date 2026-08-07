import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../../packages/server/db/migrations';

test('SQLite migration adds nullable model quota status fields idempotently', () => {
  const db = new Database(':memory:');
  try {
    migrate(db);
    migrate(db);
    const columns = db.prepare("PRAGMA table_info('models')").all() as Array<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    assert.deepEqual(
      columns
        .filter((column) => ['disabled_reason', 'disabled_at'].includes(column.name))
        .map((column) => [column.name, column.notnull, column.dflt_value]),
      [
        ['disabled_reason', 0, null],
        ['disabled_at', 0, null],
      ],
    );
    const providerColumns = db.prepare("PRAGMA table_info('model_providers')").all() as Array<{ name: string }>;
    assert.deepEqual(
      providerColumns
        .filter((column) => ['disabled_reason', 'disabled_at'].includes(column.name))
        .map((column) => column.name),
      [],
    );
  } finally {
    db.close();
  }
});

test('SQLite migration removes misplaced quota status fields from legacy model providers', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE model_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL DEFAULT '',
        api_format TEXT NOT NULL DEFAULT 'openai-compatible',
        api_key_cipher TEXT NOT NULL DEFAULT '',
        api_key_iv TEXT NOT NULL DEFAULT '',
        api_key_tag TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        disabled_reason TEXT,
        disabled_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO model_providers (name, disabled_reason, disabled_at)
      VALUES ('legacy-provider', 'quota_exhausted', '2026-08-07 12:00:00');
    `);

    migrate(db);
    migrate(db);

    const providerColumns = db.prepare("PRAGMA table_info('model_providers')").all() as Array<{ name: string }>;
    assert.deepEqual(
      providerColumns
        .filter((column) => ['disabled_reason', 'disabled_at'].includes(column.name))
        .map((column) => column.name),
      [],
    );
    const modelColumns = db.prepare("PRAGMA table_info('models')").all() as Array<{ name: string }>;
    assert.deepEqual(
      modelColumns
        .filter((column) => ['disabled_reason', 'disabled_at'].includes(column.name))
        .map((column) => column.name),
      ['disabled_reason', 'disabled_at'],
    );
    assert.equal(db.prepare('SELECT name FROM model_providers WHERE id = 1').get()?.name, 'legacy-provider');
  } finally {
    db.close();
  }
});
