import { readDatabaseConfig } from './config';
import { createPostgresExecutor } from './postgres';
import { migratePostgres } from './postgres/migrate';
import type { DatabaseConfig } from './config';
import type { DbExecutor } from './types';

let connection: DbExecutor | null = null;

async function initializeDb(config: DatabaseConfig = readDatabaseConfig()): Promise<void> {
  if (connection) return;
  const database = createPostgresExecutor(config);
  try {
    await migratePostgres(database);
    connection = database;
  } catch (error) {
    await database.close();
    throw error;
  }
}

function getDb(): DbExecutor {
  if (!connection) throw new Error('PostgreSQL database has not been initialized');
  return connection;
}

const getDbExecutor = getDb;

function setDbExecutorForTests(database: DbExecutor | null): void {
  connection = database;
}

function getDbExecutorForTests(): DbExecutor | null {
  return connection;
}

async function closeDb(): Promise<void> {
  const active = connection;
  connection = null;
  await active?.close();
}

export { getDb, getDbExecutor, getDbExecutorForTests, initializeDb, setDbExecutorForTests, closeDb };
