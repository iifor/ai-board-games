import fs from 'fs';
import path from 'path';
import { migrate, Database } from './migrations';
import { JsonDb } from './fallback';
import { readDatabaseConfig } from './config';
import { createPostgresExecutor } from './postgres';
import { migratePostgres } from './postgres/migrate';
import type { DatabaseConfig } from './config';
import type { DbExecutor } from './types';

const projectRoot = path.join(__dirname, '..', '..');
const DEFAULT_DB_PATH = path.join(projectRoot, 'data', 'ai-presenter.sqlite');
const databasePath = process.env.DATABASE_PATH || DEFAULT_DB_PATH;
const fallbackPath = process.env.JSON_DATABASE_PATH || path.join(projectRoot, 'data', 'ai-presenter.fallback.json');

let connection: Database | JsonDb | null = null;
let postgresConnection: DbExecutor | null = null;

function getDb(): Database | JsonDb {
  if (!connection) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    try {
      const Database = require('better-sqlite3') as new (path: string) => Database;
      connection = new Database(databasePath);
      connection.pragma('journal_mode = WAL');
      connection.pragma('foreign_keys = ON');
      migrate(connection);
    } catch (error: unknown) {
      console.warn(`better-sqlite3 不可用，已切换到 JSON fallback 数据库：${(error as Error).message}`);
      connection = new JsonDb(fallbackPath);
      migrate(connection);
    }
  }
  return connection;
}

function getDatabasePath(): string {
  return (connection as JsonDb)?.isJsonFallback ? fallbackPath : databasePath;
}

async function initializeDb(config: DatabaseConfig = readDatabaseConfig()): Promise<void> {
  if (postgresConnection) return;
  const database = createPostgresExecutor(config);
  try {
    await migratePostgres(database);
    postgresConnection = database;
  } catch (error) {
    await database.close();
    throw error;
  }
}

function getDbExecutor(): DbExecutor {
  if (!postgresConnection) throw new Error('PostgreSQL database has not been initialized');
  return postgresConnection;
}

function setDbExecutorForTests(database: DbExecutor | null): void {
  postgresConnection = database;
}

function closeDb(): void {
  const activeConnection = connection as (Database | JsonDb) & { close?: () => void } | null;
  activeConnection?.close?.();
  connection = null;
}

export { getDb, getDbExecutor, initializeDb, setDbExecutorForTests, getDatabasePath, closeDb };
