const fs = require('fs');
const path = require('path');

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
      connection = new JsonDb(fallbackPath);
      migrate(connection);
    }
  }
  return connection;
}

function migrate(db) {
  if (db.isJsonFallback) return;
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
      model TEXT NOT NULL DEFAULT 'deepseek-v4-pro',
      temperature REAL NOT NULL DEFAULT 0.85,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      game_type TEXT NOT NULL DEFAULT 'consensus',
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

    CREATE TABLE IF NOT EXISTS game_player_selections (
      game_type TEXT PRIMARY KEY,
      player_ids_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureColumn(db, 'games', 'game_type', "TEXT NOT NULL DEFAULT 'consensus'");
  db.exec(`
    UPDATE games
    SET game_type = CASE
      WHEN id LIKE 'debate-%' OR id LIKE 'mock-debate-%' OR event_json LIKE '%ai-debate%' THEN 'debate'
      WHEN id LIKE 'werewolf-%' OR id LIKE 'mock-werewolf-%' OR event_json LIKE '%ai-werewolf%' THEN 'werewolf'
      ELSE COALESCE(NULLIF(game_type, ''), 'consensus')
    END
    WHERE game_type IS NULL OR game_type = '' OR game_type = 'consensus'
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_games_type_created ON games(game_type, created_at DESC)');
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function getDatabasePath() {
  return connection?.isJsonFallback ? fallbackPath : databasePath;
}

class JsonDb {
  constructor(filePath) {
    this.isJsonFallback = true;
    this.filePath = filePath;
    this.data = readJsonDb(filePath);
  }

  exec() {}

  pragma() {}

  prepare(sql) {
    return new JsonStatement(this, sql);
  }

  transaction(fn) {
    return (...args) => {
      const result = fn(...args);
      this.save();
      return result;
    };
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }
}

class JsonStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = normalizeSql(sql);
  }

  get(...args) {
    return runJsonQuery(this.db, this.sql, args, 'get');
  }

  all(...args) {
    return runJsonQuery(this.db, this.sql, args, 'all');
  }

  run(...args) {
    const result = runJsonQuery(this.db, this.sql, args, 'run') || { changes: 0 };
    this.db.save();
    return result;
  }
}

function readJsonDb(filePath) {
  const empty = { skins: [], players: [], games: [], game_players: [], game_player_selections: [] };
  try {
    if (!fs.existsSync(filePath)) return empty;
    return { ...empty, ...JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch {
    return empty;
  }
}

function normalizeSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim();
}

function now() {
  return new Date().toISOString();
}

function firstArg(args) {
  return Array.isArray(args[0]) ? args[0] : args;
}

function runJsonQuery(db, sql, args, mode) {
  const lower = sql.toLowerCase();
  const values = firstArg(args);
  const data = db.data;

  if (lower.startsWith('pragma table_info')) return [];
  if (lower.includes('select count(*) as count from skins')) {
    return { count: lower.includes('where enabled = 1') ? data.skins.filter((row) => Number(row.enabled) === 1).length : data.skins.length };
  }
  if (lower.includes('select count(*) as count from players')) {
    return { count: lower.includes('where enabled = 1') ? data.players.filter((row) => Number(row.enabled) === 1).length : data.players.length };
  }
  if (lower.includes('select count(*) as count from games where skin_id = ?')) {
    return { count: data.games.filter((row) => row.skin_id === values[0]).length };
  }
  if (lower.includes('select count(*) as count from game_players where player_id = ?')) {
    return { count: data.game_players.filter((row) => Number(row.player_id) === Number(values[0])).length };
  }
  if (lower === 'select count(*) as count from games') return { count: data.games.length };

  if (lower.startsWith('insert into skins')) return upsertJsonRow(data.skins, values[0], 'id');
  if (lower.startsWith('select * from skins')) return selectSkins(data, lower, values, mode);
  if (lower.startsWith('update skins set enabled')) {
    const row = data.skins.find((item) => item.id === values[1]);
    if (row) Object.assign(row, { enabled: values[0], updated_at: now() });
    return { changes: row ? 1 : 0 };
  }
  if (lower.startsWith('delete from skins')) {
    return deleteWhere(data.skins, (row) => row.id === values[0]);
  }

  if (lower.startsWith('insert into players')) return upsertJsonRow(data.players, values[0], 'id');
  if (lower.startsWith('select * from players')) return selectPlayers(data, lower, values, mode);
  if (lower.includes('select coalesce(max(id), 0) + 1 as nextid from players')) {
    return { nextId: Math.max(0, ...data.players.map((row) => Number(row.id) || 0)) + 1 };
  }
  if (lower.startsWith('update players set enabled')) {
    const row = data.players.find((item) => Number(item.id) === Number(values[1]));
    if (row) Object.assign(row, { enabled: values[0], updated_at: now() });
    return { changes: row ? 1 : 0 };
  }
  if (lower.startsWith('update players set sort_order')) {
    const row = data.players.find((item) => Number(item.id) === Number(values[1]));
    if (row) Object.assign(row, { sort_order: values[0], updated_at: now() });
    return { changes: row ? 1 : 0 };
  }
  if (lower.startsWith('delete from players')) {
    return deleteWhere(data.players, (row) => Number(row.id) === Number(values[0]));
  }

  if (lower.startsWith('insert or replace into games')) {
    const row = { ...values[0], created_at: data.games.find((item) => item.id === values[0].id)?.created_at || now() };
    return upsertJsonRow(data.games, row, 'id');
  }
  if (lower.startsWith('delete from game_players')) return deleteWhere(data.game_players, (row) => row.game_id === values[0]);
  if (lower.startsWith('insert into game_players')) {
    data.game_players.push({ game_id: values[0], player_id: values[1], player_snapshot_json: values[2] });
    return { changes: 1 };
  }
  if (lower.startsWith('select * from games')) return selectGames(data, lower, values, mode);
  if (lower.startsWith('delete from games')) return deleteWhere(data.games, (row) => row.id === values[0]);
  if (lower.includes('select game_type as gametype, count(*) as count from games group by game_type')) {
    const counts = {};
    data.games.forEach((row) => {
      counts[row.game_type || 'consensus'] = (counts[row.game_type || 'consensus'] || 0) + 1;
    });
    return Object.entries(counts).map(([gameType, count]) => ({ gameType, count }));
  }

  if (lower.startsWith('insert into game_player_selections')) {
    const gameType = values[0];
    const playerIdsJson = values[1];
    const row = data.game_player_selections.find((item) => item.game_type === gameType);
    if (row) Object.assign(row, { player_ids_json: playerIdsJson, updated_at: now() });
    else data.game_player_selections.push({ game_type: gameType, player_ids_json: playerIdsJson, updated_at: now() });
    return { changes: 1 };
  }
  if (lower.includes('select game_type as gametype, player_ids_json as playeridsjson from game_player_selections')) {
    return data.game_player_selections.map((row) => ({ gameType: row.game_type, playerIdsJson: row.player_ids_json }));
  }
  if (lower.includes('select player_ids_json as playeridsjson from game_player_selections where game_type = ?')) {
    const row = data.game_player_selections.find((item) => item.game_type === values[0]);
    return row ? { playerIdsJson: row.player_ids_json } : undefined;
  }

  throw new Error(`JSON fallback database does not support SQL: ${sql}`);
}

function upsertJsonRow(rows, row, key) {
  const timestamp = now();
  const normalized = { ...row };
  if (!normalized.created_at) normalized.created_at = rows.find((item) => item[key] === normalized[key])?.created_at || timestamp;
  normalized.updated_at = timestamp;
  const index = rows.findIndex((item) => String(item[key]) === String(normalized[key]));
  if (index >= 0) rows[index] = { ...rows[index], ...normalized };
  else rows.push(normalized);
  return { changes: 1 };
}

function deleteWhere(rows, predicate) {
  const before = rows.length;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (predicate(rows[index])) rows.splice(index, 1);
  }
  return { changes: before - rows.length };
}

function selectSkins(data, lower, values, mode) {
  let rows = [...data.skins];
  if (lower.includes('where id = ?')) rows = rows.filter((row) => row.id === values[0]);
  if (lower.includes('where enabled = 1')) rows = rows.filter((row) => Number(row.enabled) === 1);
  rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || String(a.name || '').localeCompare(String(b.name || '')));
  return mode === 'get' ? rows[0] : rows;
}

function selectPlayers(data, lower, values, mode) {
  let rows = [...data.players];
  if (lower.includes('where id = ?')) rows = rows.filter((row) => Number(row.id) === Number(values[0]));
  if (lower.includes('where enabled = 1')) rows = rows.filter((row) => Number(row.enabled) === 1);
  rows.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0));
  return mode === 'get' ? rows[0] : rows;
}

function selectGames(data, lower, values, mode) {
  let rows = [...data.games];
  if (lower.includes('where id = ?')) rows = rows.filter((row) => row.id === values[0]);
  const params = values[0] && !Array.isArray(values[0]) && typeof values[0] === 'object' ? values[0] : {};
  if (params.gameType) rows = rows.filter((row) => row.game_type === params.gameType);
  if (params.mode) rows = rows.filter((row) => row.mode === params.mode);
  if (params.skinId) rows = rows.filter((row) => row.skin_id === params.skinId);
  if (params.winner) rows = rows.filter((row) => row.winner === params.winner);
  if (params.playerId) {
    const gameIds = new Set(data.game_players.filter((row) => Number(row.player_id) === Number(params.playerId)).map((row) => row.game_id));
    rows = rows.filter((row) => gameIds.has(row.id));
  }
  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  if (!lower.includes('where id = ?')) rows = rows.slice(0, 200);
  return mode === 'get' ? rows[0] : rows;
}

module.exports = {
  getDb,
  getDatabasePath
};
