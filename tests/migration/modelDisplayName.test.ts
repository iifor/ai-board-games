import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../../packages/server/db/migrations';

test('SQLite migration adds an empty model display name without changing the model ID', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL DEFAULT '',
        api_format TEXT NOT NULL DEFAULT 'openai-compatible',
        api_key_cipher TEXT NOT NULL DEFAULT '',
        api_key_iv TEXT NOT NULL DEFAULT '',
        api_key_tag TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO models (provider, name) VALUES ('阿里云百炼', 'qwen3.7-plus');
    `);

    migrate(db);

    const row = db.prepare('SELECT name, display_name FROM models').get() as {
      name: string;
      display_name: string;
    };
    assert.deepEqual(row, { name: 'qwen3.7-plus', display_name: '' });
  } finally {
    db.close();
  }
});
