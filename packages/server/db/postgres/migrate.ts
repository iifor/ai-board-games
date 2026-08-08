import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { DbExecutor } from '../types';

interface MigrationFile {
  name: string;
  checksum: string;
  sql: string;
}

function loadMigrations(directory = path.join(__dirname, 'migrations')): MigrationFile[] {
  return fs.readdirSync(directory)
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
    .sort()
    .map((name) => {
      const sql = fs.readFileSync(path.join(directory, name), 'utf8');
      return { name, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
    });
}

async function migratePostgres(database: DbExecutor): Promise<void> {
  const migrations = loadMigrations();
  await database.withTransaction(async (transaction) => {
    await transaction.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await transaction.queryOne(`SELECT pg_advisory_xact_lock(hashtext('consensus_schema_migrations'))`);

    for (const migration of migrations) {
      const applied = await transaction.queryOne<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE name = $1',
        [migration.name],
      );
      if (applied) {
        if (applied.checksum !== migration.checksum) {
          throw new Error(`Migration checksum mismatch: ${migration.name}`);
        }
        continue;
      }
      await transaction.execute(migration.sql);
      await transaction.execute(
        'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
        [migration.name, migration.checksum],
      );
    }
  }, { isolationLevel: 'serializable' });
}

export { loadMigrations, migratePostgres };
export type { MigrationFile };
