const fs = require('fs');
const path = require('path');

function now() {
  return new Date().toISOString();
}

function firstArg(args) {
  return Array.isArray(args[0]) ? args[0] : args;
}

function readJsonDb(filePath) {
  const empty = {
    skins: [],
    players: [],
    models: [],
    voice_packages: [],
    werewolf_roles: [],
    werewolf_modes: [],
    games: [],
    game_players: [],
    game_player_selections: [],
    app_settings: []
  };
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

function upsertJsonRow(rows, row, key) {
  const timestamp = now();
  const normalized = { ...row };
  if (!normalized.created_at) normalized.created_at = rows.find((item) => item[key] === normalized[key])?.created_at || timestamp;
  normalized.updated_at = timestamp;
  const index = rows.findIndex((item) => String(item[key]) === String(normalized[key]));
  if (index >= 0) rows[index] = { ...rows[index], ...normalized };
  else rows.push(normalized);
  return { changes: 1, lastInsertRowid: normalized.id };
}

function withAutoId(rows, row) {
  if (row.id) return row;
  return { ...row, id: Math.max(0, ...rows.map((item) => Number(item.id) || 0)) + 1 };
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

function selectById(rows, lower, values, mode, sortKey = 'updated_at') {
  let result = [...rows];
  if (lower.includes('where id = ?')) result = result.filter((row) => String(row.id) === String(values[0]));
  result.sort((a, b) => {
    if (sortKey === 'sort_order') return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.name || '').localeCompare(String(b.name || ''));
    return String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || (Number(b.id) || 0) - (Number(a.id) || 0);
  });
  return mode === 'get' ? result[0] : result;
}

function selectGames(data, lower, values, mode) {
  let rows = [...data.games];
  const isIdLookup = lower.includes('where id = ?');
  if (isIdLookup) rows = rows.filter((row) => row.id === values[0]);
  const params = isIdLookup
    ? {}
    : values[0] && !Array.isArray(values[0]) && typeof values[0] === 'object'
    ? values[0]
    : {
        gameType: values[0],
        mode: values[2],
        skinId: values[4],
        winner: values[6]
      };
  if (params.gameType) rows = rows.filter((row) => row.game_type === params.gameType);
  if (params.mode) rows = rows.filter((row) => row.mode === params.mode);
  if (params.skinId) rows = rows.filter((row) => row.skin_id === params.skinId);
  if (params.winner) rows = rows.filter((row) => row.winner === params.winner);
  if (params.playerId) {
    const gameIds = new Set(data.game_players.filter((row) => Number(row.player_id) === Number(params.playerId)).map((row) => row.game_id));
    rows = rows.filter((row) => gameIds.has(row.id));
  }
  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  if (!isIdLookup) rows = rows.slice(0, 200);
  return mode === 'get' ? rows[0] : rows;
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
  if (lower === 'select count(*) as count from models') return { count: data.models.length };
  if (lower === 'select count(*) as count from voice_packages') return { count: data.voice_packages.length };
  if (lower === 'select count(*) as count from werewolf_roles') return { count: data.werewolf_roles.length };
  if (lower === 'select count(*) as count from werewolf_modes') return { count: data.werewolf_modes.length };
  if (lower.includes('select count(*) as count from werewolf_modes where roles_json like ?')) {
    return { count: data.werewolf_modes.filter((row) => String(row.roles_json || '').includes(String(values[0] || '').replace(/%/g, ''))).length };
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
  if (lower.startsWith('delete from skins')) return deleteWhere(data.skins, (row) => row.id === values[0]);

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
  if (lower.startsWith('update players set model_id = null')) {
    data.players.forEach((row) => { if (Number(row.model_id) === Number(values[0])) row.model_id = null; });
    return { changes: 1 };
  }
  if (lower.startsWith('update players set voice_package_id = null')) {
    data.players.forEach((row) => { if (Number(row.voice_package_id) === Number(values[0])) row.voice_package_id = null; });
    return { changes: 1 };
  }
  if (lower.startsWith('delete from players')) return deleteWhere(data.players, (row) => Number(row.id) === Number(values[0]));

  if (lower.startsWith('insert into models')) return upsertJsonRow(data.models, withAutoId(data.models, values[0]), 'id');
  if (lower.startsWith('select * from models')) return selectById(data.models, lower, values, mode);
  if (lower.startsWith('update models')) return upsertJsonRow(data.models, values[0], 'id');
  if (lower.startsWith('delete from models')) return deleteWhere(data.models, (row) => Number(row.id) === Number(values[0]));

  if (lower.startsWith('insert into voice_packages')) return upsertJsonRow(data.voice_packages, withAutoId(data.voice_packages, values[0]), 'id');
  if (lower.startsWith('select * from voice_packages')) return selectById(data.voice_packages, lower, values, mode);
  if (lower.startsWith('update voice_packages')) return upsertJsonRow(data.voice_packages, values[0], 'id');
  if (lower.startsWith('delete from voice_packages')) return deleteWhere(data.voice_packages, (row) => Number(row.id) === Number(values[0]));
  if (lower.includes("select voice_id from voice_packages where lower(provider) = 'azure'")) {
    return data.voice_packages
      .filter((row) => String(row.provider || '').toLowerCase() === 'azure')
      .map((row) => ({ voice_id: String(row.voice_id || '').toLowerCase() }));
  }

  if (lower.startsWith('insert into werewolf_roles')) return upsertJsonRow(data.werewolf_roles, values[0], 'id');
  if (lower.startsWith('select * from werewolf_roles')) return selectById(data.werewolf_roles, lower, values, mode, 'sort_order');
  if (lower.startsWith('delete from werewolf_roles')) return deleteWhere(data.werewolf_roles, (row) => String(row.id) === String(values[0]));

  if (lower.startsWith('insert into werewolf_modes')) return upsertJsonRow(data.werewolf_modes, values[0], 'id');
  if (lower.startsWith('select * from werewolf_modes')) return selectById(data.werewolf_modes, lower, values, mode, 'sort_order');
  if (lower.startsWith('delete from werewolf_modes')) return deleteWhere(data.werewolf_modes, (row) => String(row.id) === String(values[0]));

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
  if (lower.startsWith('select audio_resources_json from games where id != ?')) {
    return data.games.filter((row) => String(row.id) !== String(values[0])).map((row) => ({ audio_resources_json: row.audio_resources_json || '[]' }));
  }
  if (lower.startsWith('delete from games')) return deleteWhere(data.games, (row) => row.id === values[0]);
  if (lower.includes('select game_type as gametype, count(*) as count from games group by game_type')) {
    const counts = {};
    data.games.forEach((row) => { counts[row.game_type || 'consensus'] = (counts[row.game_type || 'consensus'] || 0) + 1; });
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

  if (lower.startsWith('insert into app_settings')) {
    const key = values[0];
    const valueJson = values[1];
    const row = data.app_settings.find((item) => item.key === key);
    if (row) Object.assign(row, { value_json: valueJson, updated_at: now() });
    else data.app_settings.push({ key, value_json: valueJson, updated_at: now() });
    return { changes: 1 };
  }
  if (lower.includes('select value_json as valuejson from app_settings where key = ?')) {
    const row = data.app_settings.find((item) => item.key === values[0]);
    return row ? { valueJson: row.value_json } : undefined;
  }

  throw new Error(`JSON fallback database does not support SQL: ${sql}`);
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

module.exports = { JsonDb };
