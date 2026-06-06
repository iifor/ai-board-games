import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from '../../packages/server/db/migrations';
import { JsonDb } from '../../packages/server/db/fallback';

test('SQLite migration adds snapshot event watermark', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE match_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        status TEXT NOT NULL,
        current_step_index INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        blockers_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    migrate(db);
    const columns = db.prepare('PRAGMA table_info(match_snapshots)').all() as Array<{ name: string }>;
    assert.equal(columns.some((column) => column.name === 'last_event_seq'), true);
  } finally {
    db.close();
  }
});

test('JSON fallback persists snapshot event watermark', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-fallback-'));
  const filePath = path.join(directory, 'db.json');
  try {
    const db = new JsonDb(filePath);
    db.prepare(`
      INSERT INTO match_snapshots (
        match_id, version, status, current_step_index, last_event_seq,
        state_json, blockers_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('match-1', 2, 'waiting', 4, 12, '{"ok":true}', '[]', '2026-06-06T00:00:00.000Z');

    const snapshot = db.prepare(
      'SELECT * FROM match_snapshots WHERE match_id = ? ORDER BY version DESC, id DESC LIMIT 1',
    ).get('match-1') as Record<string, unknown>;
    assert.equal(snapshot.last_event_seq, 12);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
