import { IDENTITY_TABLES, IMPORT_TABLES } from '../constants';
import type { DbExecutor } from '../../../shared/types/dbExecutor';

export type ValidationDbExecutor = Pick<DbExecutor, 'queryOne' | 'queryMany' | 'close'>;

export interface TableCount { table: string; count: number }
export interface ForeignKeyViolation { constraint: string; table: string; key: string }
export interface IdentityState { table: string; maxId: number | null; lastValue: number; isCalled: boolean }
export interface JsonSemanticViolation { table: string; column: string; expectedType: 'array' | 'object'; count: number }
export interface TimestampViolation { table: string; column: string; count: number }

export interface BusinessSampleDefinition {
  id: string;
  table: string;
  sourceSql: string;
  targetSql: string;
  bigintColumns?: readonly string[];
}

const TABLE_COUNT_SQL = IMPORT_TABLES.map((table) => (
  `SELECT '${table}'::text AS table, COUNT(*)::int AS count FROM "${table}"`
)).join('\nUNION ALL\n');

const FOREIGN_KEY_CHECKS = [
  { constraint: 'models_provider_id_fkey', table: 'models', key: 'provider_id', condition: 'c.provider_id IS NOT NULL AND p.id IS NULL', from: 'models c LEFT JOIN model_providers p ON p.id = c.provider_id' },
  { constraint: 'players_model_id_fkey', table: 'players', key: 'model_id', condition: 'c.model_id IS NOT NULL AND p.id IS NULL', from: 'players c LEFT JOIN models p ON p.id = c.model_id' },
  { constraint: 'players_fallback_model_id_fkey', table: 'players', key: 'fallback_model_id', condition: 'c.fallback_model_id IS NOT NULL AND p.id IS NULL', from: 'players c LEFT JOIN models p ON p.id = c.fallback_model_id' },
  { constraint: 'players_voice_package_id_fkey', table: 'players', key: 'voice_package_id', condition: 'c.voice_package_id IS NOT NULL AND p.id IS NULL', from: 'players c LEFT JOIN voice_packages p ON p.id = c.voice_package_id' },
  { constraint: 'games_skin_id_fkey', table: 'games', key: 'skin_id', condition: 'c.skin_id IS NOT NULL AND p.id IS NULL', from: 'games c LEFT JOIN skins p ON p.id = c.skin_id' },
  { constraint: 'game_players_game_id_fkey', table: 'game_players', key: 'game_id', condition: 'p.id IS NULL', from: 'game_players c LEFT JOIN games p ON p.id = c.game_id' },
  { constraint: 'game_players_player_id_fkey', table: 'game_players', key: 'player_id', condition: 'p.id IS NULL', from: 'game_players c LEFT JOIN players p ON p.id = c.player_id' },
  { constraint: 'game_playback_events_game_id_fkey', table: 'game_playback_events', key: 'game_id', condition: 'p.id IS NULL', from: 'game_playback_events c LEFT JOIN games p ON p.id = c.game_id' },
  { constraint: 'player_game_memories_owner_player_id_fkey', table: 'player_game_memories', key: 'owner_player_id', condition: 'p.id IS NULL', from: 'player_game_memories c LEFT JOIN players p ON p.id = c.owner_player_id' },
  { constraint: 'player_game_memories_subject_player_id_fkey', table: 'player_game_memories', key: 'subject_player_id', condition: 'p.id IS NULL', from: 'player_game_memories c LEFT JOIN players p ON p.id = c.subject_player_id' },
] as const;

const FOREIGN_KEY_SQL = FOREIGN_KEY_CHECKS.map(({ constraint, table, key, condition, from }) => `
  SELECT '${constraint}'::text AS constraint, '${table}'::text AS table, '${key}'::text AS key
  WHERE EXISTS (SELECT 1 FROM ${from} WHERE ${condition})
`).join('\nUNION ALL\n');

const IDENTITY_SQL = IDENTITY_TABLES.map((table) => `
  SELECT '${table}'::text AS table,
    (SELECT MAX(id)::float8 FROM "${table}") AS "maxId",
    last_value::float8 AS "lastValue",
    is_called AS "isCalled"
  FROM "${table}_id_seq"
`).join('\nUNION ALL\n');

const JSON_SEMANTICS = [
  ['skins', 'terms_json', 'object'],
  ['skins', 'clues_json', 'array'],
  ['skins', 'noises_json', 'array'],
  ['skins', 'memory_examples_json', 'array'],
  ['werewolf_modes', 'roles_json', 'array'],
  ['werewolf_modes', 'rules_json', 'object'],
  ['werewolf_modes', 'sheriff_json', 'object'],
  ['werewolf_roles', 'rule_json', 'object'],
  ['games', 'topic_json', 'object'],
  ['games', 'players_json', 'array'],
  ['games', 'rounds_json', 'array'],
  ['games', 'event_json', 'object'],
  ['games', 'audio_resources_json', 'array'],
  ['game_players', 'player_snapshot_json', 'object'],
  ['game_player_selections', 'player_ids_json', 'array'],
  ['game_playback_events', 'payload_json', 'object'],
  ['game_playback_events', 'media_json', 'array'],
  ['player_game_memories', 'traits_json', 'object'],
] as const;

const JSON_SEMANTICS_SQL = JSON_SEMANTICS.map(([table, column, expectedType]) => `
  SELECT '${table}'::text AS table, '${column}'::text AS column,
    '${expectedType}'::text AS "expectedType", COUNT(*)::int AS count
  FROM "${table}"
  WHERE jsonb_typeof("${column}") IS DISTINCT FROM '${expectedType}'
  HAVING COUNT(*) > 0
`).join('\nUNION ALL\n');

const TIMESTAMP_COLUMNS = [
  ['skins', 'created_at'], ['skins', 'updated_at'],
  ['model_providers', 'created_at'], ['model_providers', 'updated_at'],
  ['models', 'disabled_at'], ['models', 'created_at'], ['models', 'updated_at'],
  ['voice_packages', 'created_at'], ['voice_packages', 'updated_at'],
  ['players', 'created_at'], ['players', 'updated_at'],
  ['werewolf_modes', 'created_at'], ['werewolf_modes', 'updated_at'],
  ['werewolf_roles', 'created_at'], ['werewolf_roles', 'updated_at'],
  ['app_settings', 'updated_at'],
  ['admin_users', 'created_at'], ['admin_users', 'updated_at'],
  ['games', 'created_at'],
  ['game_playback_events', 'created_at'],
  ['game_player_selections', 'updated_at'],
  ['player_game_memories', 'created_at'], ['player_game_memories', 'updated_at'],
] as const;

const TIMESTAMP_SQL = TIMESTAMP_COLUMNS.map(([table, column]) => `
  SELECT '${table}'::text AS table, '${column}'::text AS column, COUNT(*)::int AS count
  FROM "${table}"
  WHERE "${column}" IS NOT NULL AND NOT isfinite("${column}")
  HAVING COUNT(*) > 0
`).join('\nUNION ALL\n');

export const BUSINESS_SAMPLES: readonly BusinessSampleDefinition[] = [
  {
    id: 'admin_users',
    table: 'admin_users',
    bigintColumns: ['id'],
    sourceSql: 'SELECT id, username, password_hash, display_name, enabled, must_change_password, created_at, updated_at FROM admin_users ORDER BY id LIMIT 1',
    targetSql: 'SELECT id, username, password_hash, display_name, enabled, must_change_password, created_at, updated_at FROM admin_users ORDER BY id LIMIT 1',
  },
  {
    id: 'app_settings',
    table: 'app_settings',
    sourceSql: 'SELECT key, value_json, updated_at FROM app_settings ORDER BY key LIMIT 1',
    targetSql: 'SELECT key, value_json, updated_at FROM app_settings ORDER BY key LIMIT 1',
  },
  {
    id: 'players',
    table: 'players',
    bigintColumns: ['id', 'model_id', 'fallback_model_id', 'voice_package_id'],
    sourceSql: 'SELECT id, nickname, name, avatar, sex, personality, provider, model, model_id, fallback_model_id, voice_package_id, temperature, enabled, sort_order, created_at, updated_at FROM players ORDER BY id LIMIT 1',
    targetSql: 'SELECT id, nickname, name, avatar, sex, personality, provider, model, model_id, fallback_model_id, voice_package_id, temperature, enabled, sort_order, created_at, updated_at FROM players ORDER BY id LIMIT 1',
  },
  {
    id: 'games',
    table: 'games',
    sourceSql: 'SELECT id, game_type, mode, skin_id, skin_name, winner, win_reason, topic_json, players_json, rounds_json, event_json, audio_resources_json, created_at FROM games ORDER BY id LIMIT 1',
    targetSql: 'SELECT id, game_type, mode, skin_id, skin_name, winner, win_reason, topic_json, players_json, rounds_json, event_json, audio_resources_json, created_at FROM games ORDER BY id LIMIT 1',
  },
  {
    id: 'game_playback_events',
    table: 'game_playback_events',
    sourceSql: 'SELECT game_id, sequence, protocol_version, event_type, view_mode, payload_json, media_json, created_at FROM game_playback_events ORDER BY game_id, sequence LIMIT 1',
    targetSql: 'SELECT game_id, sequence, protocol_version, event_type, view_mode, payload_json, media_json, created_at FROM game_playback_events ORDER BY game_id, sequence LIMIT 1',
  },
  {
    id: 'player_game_memories',
    table: 'player_game_memories',
    bigintColumns: ['id', 'owner_player_id', 'subject_player_id'],
    sourceSql: 'SELECT id, game_type, owner_player_id, subject_player_id, games_played, familiarity_score, traits_json, recent_summary, created_at, updated_at FROM player_game_memories ORDER BY id LIMIT 1',
    targetSql: 'SELECT id, game_type, owner_player_id, subject_player_id, games_played, familiarity_score, traits_json, recent_summary, created_at, updated_at FROM player_game_memories ORDER BY id LIMIT 1',
  },
];

export async function countImportedTables(db: ValidationDbExecutor): Promise<TableCount[]> {
  return db.queryMany<TableCount>(TABLE_COUNT_SQL);
}

export async function findForeignKeyViolations(db: ValidationDbExecutor): Promise<ForeignKeyViolation[]> {
  return db.queryMany<ForeignKeyViolation>(FOREIGN_KEY_SQL);
}

export async function readIdentityStates(db: ValidationDbExecutor): Promise<IdentityState[]> {
  return db.queryMany<IdentityState>(IDENTITY_SQL);
}

export async function findJsonSemanticViolations(db: ValidationDbExecutor): Promise<JsonSemanticViolation[]> {
  return db.queryMany<JsonSemanticViolation>(JSON_SEMANTICS_SQL);
}

export async function findTimestampViolations(db: ValidationDbExecutor): Promise<TimestampViolation[]> {
  return db.queryMany<TimestampViolation>(TIMESTAMP_SQL);
}
