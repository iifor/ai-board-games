const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'consensus-mist.sqlite');
const databasePath = process.env.DATABASE_PATH || DEFAULT_DB_PATH;

let connection = null;

function getDb() {
  if (!connection) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    connection = new Database(databasePath);
    connection.pragma('journal_mode = WAL');
    connection.pragma('foreign_keys = ON');
    migrate(connection);
  }
  return connection;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT 'v3.2',
      source TEXT NOT NULL DEFAULT 'admin',
      terms_json TEXT NOT NULL,
      background TEXT NOT NULL,
      truth TEXT NOT NULL DEFAULT '',
      clues_json TEXT NOT NULL,
      noises_json TEXT NOT NULL,
      memory_examples_json TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY,
      nickname TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT '',
      sex TEXT NOT NULL DEFAULT '未知',
      personality TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT 'deepseek',
      model TEXT NOT NULL DEFAULT 'deepseek-chat',
      temperature REAL NOT NULL DEFAULT 0.85,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      skin_id TEXT,
      skin_name TEXT NOT NULL DEFAULT '',
      winner TEXT,
      win_reason TEXT NOT NULL DEFAULT '',
      players_json TEXT NOT NULL,
      rounds_json TEXT NOT NULL,
      event_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (skin_id) REFERENCES skins(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS game_players (
      game_id TEXT NOT NULL,
      player_id INTEGER NOT NULL,
      player_snapshot_json TEXT NOT NULL,
      PRIMARY KEY (game_id, player_id),
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT
    );
  `);
}

function getDatabasePath() {
  return databasePath;
}

module.exports = {
  getDb,
  getDatabasePath
};
