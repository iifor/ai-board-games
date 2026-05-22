const fs = require('fs');
const path = require('path');
const { migrate } = require('./migrations');

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'consensus-mist.sqlite');
const databasePath = process.env.DATABASE_PATH || DEFAULT_DB_PATH;
const fallbackPath = process.env.JSON_DATABASE_PATH || path.join(process.cwd(), 'data', 'consensus-mist.fallback.json');

let connection = null;

function getDb() {
  if (!connection) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    try {
      const Database = require('better-sqlite3');
      connection = new Database(databasePath);
      connection.pragma('journal_mode = WAL');
      connection.pragma('foreign_keys = ON');
      migrate(connection);
    } catch (error) {
      console.warn(`better-sqlite3 不可用，已切换到 JSON fallback 数据库：${error.message}`);
      const { JsonDb } = require('./fallback');
      connection = new JsonDb(fallbackPath);
      migrate(connection);
    }
  }
  return connection;
}

function getDatabasePath() {
  return connection?.isJsonFallback ? fallbackPath : databasePath;
}

module.exports = { getDb, getDatabasePath };
