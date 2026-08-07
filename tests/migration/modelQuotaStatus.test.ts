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
  } finally {
    db.close();
  }
});
