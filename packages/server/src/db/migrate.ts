import { sql } from 'kysely';
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import type { Db } from './database';
import * as init from './migrations/001_init';
import * as matches from './migrations/002_matches';
import * as resources from './migrations/003_resources';
import * as aiTaskAttempts from './migrations/004_ai_task_attempts';
import * as matchChaos from './migrations/005_match_chaos';

/** 迁移按 key 排序执行；新增迁移在此登记 */
const MIGRATIONS: Readonly<Record<string, Migration>> = {
  '001_init': init,
  '002_matches': matches,
  '003_resources': resources,
  '004_ai_task_attempts': aiTaskAttempts,
  '005_match_chaos': matchChaos,
};

const provider: MigrationProvider = { getMigrations: async () => MIGRATIONS };

export class MigrationError extends Error {
  constructor(name: string, cause: unknown) {
    super(`数据库迁移 ${name} 失败`, { cause });
    this.name = 'MigrationError';
  }
}

/** 启动时执行全部待执行迁移；任一失败则抛错，服务不应继续启动 */
export async function migrateToLatest(db: Db, schema: string): Promise<string[]> {
  const raw = db.withoutPlugins();
  await sql`create schema if not exists ${sql.id(schema)}`.execute(raw);
  const migrator = new Migrator({ db: raw, provider, migrationTableSchema: schema });
  const { error, results = [] } = await migrator.migrateToLatest();
  const failed = results.find((result) => result.status === 'Error');
  if (error || failed) throw new MigrationError(failed?.migrationName ?? '(unknown)', error);
  return results.filter((result) => result.status === 'Success').map((result) => result.migrationName);
}
