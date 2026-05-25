import fs from 'fs';
import path from 'path';
import { migrate, Database } from './migrations';
import { JsonDb } from './fallback';

const projectRoot = path.join(__dirname, '..', '..');
const DEFAULT_DB_PATH = path.join(projectRoot, 'data', 'ai-presenter.sqlite');
const databasePath = process.env.DATABASE_PATH || DEFAULT_DB_PATH;
const fallbackPath = process.env.JSON_DATABASE_PATH || path.join(projectRoot, 'data', 'ai-presenter.fallback.json');

let connection: Database | JsonDb | null = null;

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

export { getDb, getDatabasePath };
