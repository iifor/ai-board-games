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
      model_id INTEGER,
      voice_package_id INTEGER,
      temperature REAL NOT NULL DEFAULT 0.85,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL,
      FOREIGN KEY (voice_package_id) REFERENCES voice_packages(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      api_format TEXT NOT NULL DEFAULT 'openai-compatible',
      api_key_cipher TEXT NOT NULL DEFAULT '',
      api_key_iv TEXT NOT NULL DEFAULT '',
      api_key_tag TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS voice_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'browser',
      voice_id TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT 'zh-CN',
      gender TEXT NOT NULL DEFAULT '',
      style TEXT NOT NULL DEFAULT '',
      rate TEXT NOT NULL DEFAULT '0%',
      pitch TEXT NOT NULL DEFAULT '0%',
      sample_text TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS werewolf_modes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      roles_json TEXT NOT NULL DEFAULT '[]',
      rules_json TEXT NOT NULL DEFAULT '{}',
      sheriff_json TEXT NOT NULL DEFAULT '{}',
      win_condition TEXT NOT NULL DEFAULT 'side',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS werewolf_roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      faction TEXT NOT NULL DEFAULT 'good',
      role_type TEXT NOT NULL DEFAULT 'villager',
      responsibility TEXT NOT NULL DEFAULT '',
      ability TEXT NOT NULL DEFAULT '',
      key_info TEXT NOT NULL DEFAULT '',
      rule_json TEXT NOT NULL DEFAULT '{}',
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
      topic_json TEXT NOT NULL DEFAULT '{}',
      players_json TEXT NOT NULL,
      rounds_json TEXT NOT NULL,
      event_json TEXT NOT NULL,
      audio_resources_json TEXT NOT NULL DEFAULT '[]',
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

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL DEFAULT 'null',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureColumn(db, 'games', 'game_type', "TEXT NOT NULL DEFAULT 'consensus'");
  ensureColumn(db, 'games', 'topic_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'players', 'model_id', 'INTEGER');
  ensureColumn(db, 'players', 'voice_package_id', 'INTEGER');
  ensureColumn(db, 'voice_packages', 'gender', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'voice_packages', 'style', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'voice_packages', 'rate', "TEXT NOT NULL DEFAULT '0%'");
  ensureColumn(db, 'voice_packages', 'pitch', "TEXT NOT NULL DEFAULT '0%'");
  ensureColumn(db, 'voice_packages', 'sample_text', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'voice_packages', 'temperature', "REAL NOT NULL DEFAULT 0.85");
  ensureColumn(db, 'games', 'audio_resources_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'werewolf_modes', 'roles_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'werewolf_modes', 'rules_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'werewolf_modes', 'sheriff_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'werewolf_modes', 'win_condition', "TEXT NOT NULL DEFAULT 'side'");

  db.exec(`
    UPDATE games
    SET game_type = CASE
      WHEN id LIKE 'debate-%' OR event_json LIKE '%ai-debate%' THEN 'debate'
      WHEN id LIKE 'werewolf-%' OR event_json LIKE '%ai-werewolf%' THEN 'werewolf'
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

module.exports = { migrate };
