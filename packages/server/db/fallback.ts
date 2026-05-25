import fs from 'fs';
import path from 'path';

interface JsonDbData {
  skins: Record<string, unknown>[];
  players: Record<string, unknown>[];
  model_providers: Record<string, unknown>[];
  models: Record<string, unknown>[];
  voice_packages: Record<string, unknown>[];
  werewolf_roles: Record<string, unknown>[];
  werewolf_modes: Record<string, unknown>[];
  games: Record<string, unknown>[];
  game_players: Record<string, unknown>[];
  game_player_selections: Record<string, unknown>[];
  app_settings: Record<string, unknown>[];
}

interface RunResult {
  changes: number;
  lastInsertRowid?: unknown;
}

function now(): string {
  return new Date().toISOString();
}

function firstArg(args: unknown[]): unknown[] {
  return Array.isArray(args[0]) ? args[0] : args;
}

function readJsonDb(filePath: string): JsonDbData {
  const empty: JsonDbData = {
    skins: [],
    players: [],
    model_providers: [],
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
    return migrateLegacyModelProviders({ ...empty, ...JSON.parse(fs.readFileSync(filePath, 'utf8')) });
  } catch {
    return empty;
  }
}

function normalizeSql(sql: unknown): string {
  return String(sql || '').replace(/\s+/g, ' ').trim();
}

function upsertJsonRow(rows: Record<string, unknown>[], row: Record<string, unknown>, key: string): RunResult {
  const timestamp = now();
  const normalized = { ...row };
  if (!normalized.created_at) normalized.created_at = (rows.find((item) => item[key] === normalized[key]) as Record<string, unknown>)?.created_at || timestamp;
  normalized.updated_at = timestamp;
  const index = rows.findIndex((item) => String(item[key]) === String(normalized[key]));
  if (index >= 0) rows[index] = { ...rows[index], ...normalized };
  else rows.push(normalized);
  return { changes: 1, lastInsertRowid: normalized.id };
}

function withAutoId(rows: Record<string, unknown>[], row: Record<string, unknown>): Record<string, unknown> {
  if (row.id) return row;
  return { ...row, id: Math.max(0, ...rows.map((item) => Number(item.id) || 0)) + 1 };
}

function deleteWhere(rows: Record<string, unknown>[], predicate: (row: Record<string, unknown>) => boolean): RunResult {
  const before = rows.length;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (predicate(rows[index])) rows.splice(index, 1);
  }
  return { changes: before - rows.length };
}

function selectSkins(data: JsonDbData, lower: string, values: unknown[], mode: string): unknown {
  let rows = [...data.skins];
  if (lower.includes('where id = ?')) rows = rows.filter((row) => row.id === values[0]);
  if (lower.includes('where enabled = 1')) rows = rows.filter((row) => Number(row.enabled) === 1);
  rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || String(a.name || '').localeCompare(String(b.name || '')));
  return mode === 'get' ? rows[0] : rows;
}

function selectPlayers(data: JsonDbData, lower: string, values: unknown[], mode: string): unknown {
  let rows = [...data.players];
  if (lower.includes('where id = ?')) rows = rows.filter((row) => Number(row.id) === Number(values[0]));
  if (lower.includes('where enabled = 1')) rows = rows.filter((row) => Number(row.enabled) === 1);
  rows.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0));
  return mode === 'get' ? rows[0] : rows;
}

function selectById(rows: Record<string, unknown>[], lower: string, values: unknown[], mode: string, sortKey = 'updated_at'): unknown {
  let result = [...rows];
  if (lower.includes('where id = ?')) result = result.filter((row) => String(row.id) === String(values[0]));
  if (lower.includes('where provider_id = ?')) result = result.filter((row) => Number(row.provider_id) === Number(values[0]));
  result.sort((a, b) => {
    if (sortKey === 'sort_order') return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.name || '').localeCompare(String(b.name || ''));
    return String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || (Number(b.id) || 0) - (Number(a.id) || 0);
  });
  return mode === 'get' ? result[0] : result;
}

function migrateLegacyModelProviders(data: JsonDbData): JsonDbData {
  const providers = Array.isArray(data.model_providers) ? data.model_providers : [];
  const models = Array.isArray(data.models) ? data.models : [];
  const bySignature = new Map(providers.map((provider) => [getProviderSignature(provider), provider.id]));
  models.forEach((model) => {
    if (model.provider_id) return;
    const signature = getProviderSignature({
      name: model.provider,
      base_url: model.base_url,
      api_format: model.api_format,
      api_key_cipher: model.api_key_cipher,
      api_key_iv: model.api_key_iv,
      api_key_tag: model.api_key_tag,
      enabled: model.enabled
    });
    let providerId = bySignature.get(signature);
    if (!providerId) {
      providerId = Math.max(0, ...providers.map((provider) => Number(provider.id) || 0)) + 1;
      providers.push({
        id: providerId,
        name: model.provider || '未命名供应商',
        base_url: model.base_url || '',
        api_format: model.api_format || 'openai-compatible',
        api_key_cipher: model.api_key_cipher || '',
        api_key_iv: model.api_key_iv || '',
        api_key_tag: model.api_key_tag || '',
        enabled: Number(model.enabled !== 0),
        created_at: model.created_at || now(),
        updated_at: model.updated_at || now()
      });
      bySignature.set(signature, providerId);
    }
    model.provider_id = providerId;
  });
  data.model_providers = providers;
  return data;
}

function getProviderSignature(provider: Record<string, unknown> = {}): string {
  return [
    provider.name || provider.provider,
    provider.base_url,
    provider.api_format,
    provider.api_key_cipher,
    provider.api_key_iv,
    provider.api_key_tag,
    provider.enabled
  ].map((value) => String(value ?? '')).join('');
}

function selectGames(data: JsonDbData, lower: string, values: unknown[], mode: string): unknown {
  let rows = [...data.games];
  const isIdLookup = lower.includes('where id = ?');
  if (isIdLookup) rows = rows.filter((row) => row.id === values[0]);
  const params = isIdLookup
    ? {}
    : values[0] && !Array.isArray(values[0]) && typeof values[0] === 'object'
    ? (values[0] as Record<string, unknown>)
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

function runJsonQuery(db: JsonDb, sql: string, args: unknown[], mode: string): unknown {
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
  if (lower.includes('select count(*) as count from models where provider_id = ?')) {
    return { count: data.models.filter((row) => Number(row.provider_id) === Number(values[0])).length };
  }
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

  if (lower.startsWith('insert into skins')) return upsertJsonRow(data.skins, values[0] as Record<string, unknown>, 'id');
  if (lower.startsWith('select * from skins')) return selectSkins(data, lower, values, mode);
  if (lower.startsWith('update skins set enabled')) {
    const row = data.skins.find((item) => item.id === values[1]);
    if (row) Object.assign(row, { enabled: values[0], updated_at: now() });
    return { changes: row ? 1 : 0 };
  }
  if (lower.startsWith('delete from skins')) return deleteWhere(data.skins, (row) => row.id === values[0]);

  if (lower.startsWith('insert into players')) return upsertJsonRow(data.players, values[0] as Record<string, unknown>, 'id');
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

  if (lower.startsWith('insert into models')) return upsertJsonRow(data.models, withAutoId(data.models, values[0] as Record<string, unknown>), 'id');
  if (lower.startsWith('select * from models')) return selectById(data.models, lower, values, mode);
  if (lower.startsWith('update models')) return upsertJsonRow(data.models, values[0] as Record<string, unknown>, 'id');
  if (lower.startsWith('delete from models')) return deleteWhere(data.models, (row) => Number(row.id) === Number(values[0]));

  if (lower.startsWith('insert into model_providers')) return upsertJsonRow(data.model_providers, withAutoId(data.model_providers, values[0] as Record<string, unknown>), 'id');
  if (lower.startsWith('select * from model_providers')) return selectById(data.model_providers, lower, values, mode);
  if (lower.startsWith('update model_providers')) return upsertJsonRow(data.model_providers, values[0] as Record<string, unknown>, 'id');
  if (lower.startsWith('delete from model_providers')) return deleteWhere(data.model_providers, (row) => Number(row.id) === Number(values[0]));

  if (lower.startsWith('insert into voice_packages')) return upsertJsonRow(data.voice_packages, withAutoId(data.voice_packages, values[0] as Record<string, unknown>), 'id');
  if (lower.startsWith('select * from voice_packages')) return selectById(data.voice_packages, lower, values, mode);
  if (lower.startsWith('update voice_packages')) return upsertJsonRow(data.voice_packages, values[0] as Record<string, unknown>, 'id');
  if (lower.startsWith('delete from voice_packages')) return deleteWhere(data.voice_packages, (row) => Number(row.id) === Number(values[0]));
  if (lower.includes("select voice_id from voice_packages where lower(provider) = 'azure'")) {
    return data.voice_packages
      .filter((row) => String(row.provider || '').toLowerCase() === 'azure')
      .map((row) => ({ voice_id: String(row.voice_id || '').toLowerCase() }));
  }

  if (lower.startsWith('insert into werewolf_roles')) return upsertJsonRow(data.werewolf_roles, values[0] as Record<string, unknown>, 'id');
  if (lower.startsWith('select * from werewolf_roles')) return selectById(data.werewolf_roles, lower, values, mode, 'sort_order');
  if (lower.startsWith('delete from werewolf_roles')) return deleteWhere(data.werewolf_roles, (row) => String(row.id) === String(values[0]));

  if (lower.startsWith('insert into werewolf_modes')) return upsertJsonRow(data.werewolf_modes, values[0] as Record<string, unknown>, 'id');
  if (lower.startsWith('select * from werewolf_modes')) return selectById(data.werewolf_modes, lower, values, mode, 'sort_order');
  if (lower.startsWith('delete from werewolf_modes')) return deleteWhere(data.werewolf_modes, (row) => String(row.id) === String(values[0]));

  if (lower.startsWith('insert or replace into games')) {
    const row = { ...(values[0] as Record<string, unknown>), created_at: (data.games.find((item) => item.id === (values[0] as Record<string, unknown>).id) as Record<string, unknown>)?.created_at || now() };
    return upsertJsonRow(data.games, row, 'id');
  }
  if (lower.startsWith('delete from game_players')) return deleteWhere(data.game_players, (row) => row.game_id === values[0]);
  if (lower.startsWith('insert into game_players')) {
    if (!data.games.some((row) => row.id === values[0])) {
      throw new Error('FOREIGN KEY constraint failed');
    }
    data.game_players.push({ game_id: values[0], player_id: values[1], player_snapshot_json: values[2] });
    return { changes: 1 };
  }
  if (lower.startsWith('select * from games')) return selectGames(data, lower, values, mode);
  if (lower.startsWith('select audio_resources_json from games where id != ?')) {
    return data.games.filter((row) => String(row.id) !== String(values[0])).map((row) => ({ audio_resources_json: row.audio_resources_json || '[]' }));
  }
  if (lower.startsWith('delete from games')) return deleteWhere(data.games, (row) => row.id === values[0]);
  if (lower.includes('select game_type as gametype, count(*) as count from games group by game_type')) {
    const counts: Record<string, number> = {};
    data.games.forEach((row) => { const key = String(row.game_type || 'werewolf'); counts[key] = (counts[key] || 0) + 1; });
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
  isJsonFallback = true;
  filePath: string;
  data: JsonDbData;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.data = readJsonDb(filePath);
  }

  exec(): void {}

  pragma(): void {}

  prepare(sql: string): JsonStatement {
    return new JsonStatement(this, sql);
  }

  transaction(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown {
    return (...args: unknown[]) => {
      const result = fn(...args);
      this.save();
      return result;
    };
  }

  save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }
}

class JsonStatement {
  db: JsonDb;
  sql: string;

  constructor(db: JsonDb, sql: string) {
    this.db = db;
    this.sql = normalizeSql(sql);
  }

  get(...args: unknown[]): unknown {
    return runJsonQuery(this.db, this.sql, args, 'get');
  }

  all(...args: unknown[]): unknown {
    return runJsonQuery(this.db, this.sql, args, 'all');
  }

  run(...args: unknown[]): RunResult {
    const result = (runJsonQuery(this.db, this.sql, args, 'run') as RunResult) || { changes: 0 };
    this.db.save();
    return result;
  }
}

export { JsonDb };
export type { JsonDbData, RunResult };
