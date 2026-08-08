import { Pool } from 'pg';
import { createPostgresExecutor } from '../../packages/server/db/postgres';
import type { DbExecutor } from '../../packages/server/db/types';

function readTestDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const url = environment.TEST_DATABASE_URL?.trim();
  if (!url) throw new Error('TEST_DATABASE_URL is required');
  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL must target a database ending in _test');
  }
  return url;
}

async function withTestSchema(
  operation: (database: DbExecutor, schema: string) => Promise<void>,
): Promise<void> {
  const connectionString = readTestDatabaseUrl();
  const schema = `consensus_test_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const admin = new Pool({ connectionString });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const database = createPostgresExecutor({
    connectionString,
    schema,
    poolMax: 4,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 30_000,
    ssl: false,
  });
  try {
    await operation(database, schema);
  } finally {
    await database.close();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}

export { readTestDatabaseUrl, withTestSchema };
