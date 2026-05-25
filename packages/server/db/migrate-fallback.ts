/**
 * Migrate data from JSON fallback database to SQLite.
 *
 * Usage: node server/db/migrate-fallback.js
 *
 * Reads data/ai-presenter.fallback.json and upserts every row into
 * data/ai-presenter.sqlite.  Existing SQLite rows with matching primary
 * keys are overwritten; new rows are inserted.
 */

import fs from 'fs';
import path from 'path';

const projectRoot = path.join(__dirname, '..', '..');
const JSON_PATH = path.join(projectRoot, 'data', 'ai-presenter.fallback.json');
const SQLITE_PATH = path.join(projectRoot, 'data', 'ai-presenter.sqlite');

interface JsonDbData {
  skins?: Record<string, unknown>[];
  model_providers?: Record<string, unknown>[];
  models?: Record<string, unknown>[];
  voice_packages?: Record<string, unknown>[];
  players?: Record<string, unknown>[];
  werewolf_roles?: Record<string, unknown>[];
  werewolf_modes?: Record<string, unknown>[];
  games?: Record<string, unknown>[];
  game_players?: Record<string, unknown>[];
  game_player_selections?: Record<string, unknown>[];
  app_settings?: Record<string, unknown>[];
}

interface PreparedStatement {
  run(...args: unknown[]): { changes: number; lastInsertRowid?: unknown };
}

interface Database {
  exec(sql: string): void;
  pragma(pragma: string): void;
  prepare(sql: string): PreparedStatement;
  transaction(fn: () => void): () => void;
  close(): void;
}

function main(): void {
  if (!fs.existsSync(JSON_PATH)) {
    console.error('JSON fallback file not found:', JSON_PATH);
    process.exit(1);
  }

  let Database: new (path: string) => Database;
  try {
    Database = require('better-sqlite3') as new (path: string) => Database;
  } catch (error: unknown) {
    console.error('better-sqlite3 is not available:', (error as Error).message);
    process.exit(1);
  }

  const jsonData: JsonDbData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  if (!jsonData || typeof jsonData !== 'object') {
    console.error('Invalid JSON fallback data.');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true });
  const db = new Database(SQLITE_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');

  const { migrate } = require('./migrations');
  migrate(db);

  const tx = db.transaction(() => {
    upsertSkins(db, jsonData.skins || []);
    upsertModelProviders(db, jsonData.model_providers || []);
    upsertModels(db, jsonData.models || []);
    upsertVoicePackages(db, jsonData.voice_packages || []);
    upsertPlayers(db, jsonData.players || []);
    upsertWerewolfRoles(db, jsonData.werewolf_roles || []);
    upsertWerewolfModes(db, jsonData.werewolf_modes || []);
    upsertGames(db, jsonData.games || []);
    upsertGamePlayers(db, jsonData.game_players || []);
    upsertGamePlayerSelections(db, jsonData.game_player_selections || []);
    upsertAppSettings(db, jsonData.app_settings || []);
  });

  try {
    tx();
    db.pragma('foreign_keys = ON');
    console.log('Migration completed successfully.');
  } catch (error: unknown) {
    console.error('Migration failed:', (error as Error).message);
    process.exit(1);
  } finally {
    db.close();
  }
}

const SKIN_COLS = ['id', 'name', 'version', 'source', 'terms_json', 'background', 'truth', 'clues_json', 'noises_json', 'memory_examples_json', 'enabled', 'created_at', 'updated_at'];
const PLAYER_COLS = ['id', 'nickname', 'name', 'avatar', 'sex', 'personality', 'provider', 'model', 'model_id', 'voice_package_id', 'temperature', 'enabled', 'sort_order', 'created_at', 'updated_at'];
const PROVIDER_COLS = ['id', 'name', 'base_url', 'api_format', 'api_key_cipher', 'api_key_iv', 'api_key_tag', 'enabled', 'created_at', 'updated_at'];
const MODEL_COLS = ['id', 'provider_id', 'provider', 'name', 'base_url', 'api_format', 'api_key_cipher', 'api_key_iv', 'api_key_tag', 'enabled', 'created_at', 'updated_at'];
const VOICE_COLS = ['id', 'name', 'provider', 'voice_id', 'language', 'gender', 'style', 'rate', 'pitch', 'sample_text', 'description', 'enabled', 'created_at', 'updated_at'];
const ROLE_COLS = ['id', 'name', 'faction', 'role_type', 'responsibility', 'ability', 'play_style_advice', 'key_info', 'rule_json', 'enabled', 'sort_order', 'created_at', 'updated_at'];
const MODE_COLS = ['id', 'name', 'description', 'roles_json', 'rules_json', 'sheriff_json', 'win_condition', 'enabled', 'sort_order', 'created_at', 'updated_at'];
const GAME_COLS = ['id', 'game_type', 'mode', 'skin_id', 'skin_name', 'winner', 'win_reason', 'topic_json', 'players_json', 'rounds_json', 'event_json', 'audio_resources_json', 'created_at'];
const GP_COLS = ['game_id', 'player_id', 'player_snapshot_json'];
const GPS_COLS = ['game_type', 'player_ids_json'];
const SETTINGS_COLS = ['key', 'value_json'];

function upsert(db: Database, table: string, columns: string[], rows: Record<string, unknown>[]): void {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const placeholders = columns.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
  for (const row of rows) {
    stmt.run(columns.map((col) => col === 'play_style_advice' ? String(row[col] || '') : row[col]));
  }
}

function upsertSkins(db: Database, rows: Record<string, unknown>[]): void { upsert(db, 'skins', SKIN_COLS, rows); }
function upsertPlayers(db: Database, rows: Record<string, unknown>[]): void { upsert(db, 'players', PLAYER_COLS, rows); }
function upsertModelProviders(db: Database, rows: Record<string, unknown>[]): void { upsert(db, 'model_providers', PROVIDER_COLS, rows); }
function upsertModels(db: Database, rows: Record<string, unknown>[]): void { upsert(db, 'models', MODEL_COLS, rows); }
function upsertVoicePackages(db: Database, rows: Record<string, unknown>[]): void { upsert(db, 'voice_packages', VOICE_COLS, rows); }
function upsertWerewolfRoles(db: Database, rows: Record<string, unknown>[]): void { upsert(db, 'werewolf_roles', ROLE_COLS, rows); }
function upsertWerewolfModes(db: Database, rows: Record<string, unknown>[]): void { upsert(db, 'werewolf_modes', MODE_COLS, rows); }
function upsertGames(db: Database, rows: Record<string, unknown>[]): void { upsert(db, 'games', GAME_COLS, rows); }
function upsertGamePlayers(db: Database, rows: Record<string, unknown>[]): void { upsert(db, 'game_players', GP_COLS, rows); }
function upsertGamePlayerSelections(db: Database, rows: Record<string, unknown>[]): void { upsert(db, 'game_player_selections', GPS_COLS, rows); }
function upsertAppSettings(db: Database, rows: Record<string, unknown>[]): void { upsert(db, 'app_settings', SETTINGS_COLS, rows); }

main();
