import { JsonDb } from './fallback';

interface PreparedStatement {
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown;
  run(...args: unknown[]): { changes: number; lastInsertRowid?: unknown };
}

interface Database {
  isJsonFallback?: boolean;
  exec(sql: string): void;
  pragma(pragma: string): void;
  prepare(sql: string): PreparedStatement;
  transaction(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown;
}

function migrate(db: Database | JsonDb): void {
  if ((db as JsonDb).isJsonFallback) return;
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
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL,
      FOREIGN KEY (voice_package_id) REFERENCES voice_packages(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS model_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      api_format TEXT NOT NULL DEFAULT 'openai-compatible',
      api_key_cipher TEXT NOT NULL DEFAULT '',
      api_key_iv TEXT NOT NULL DEFAULT '',
      api_key_tag TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (provider_id) REFERENCES model_providers(id) ON DELETE RESTRICT
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
      play_style_advice TEXT NOT NULL DEFAULT '',
      key_info TEXT NOT NULL DEFAULT '',
      rule_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      game_type TEXT NOT NULL DEFAULT 'werewolf',
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

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      game_type TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      current_step_index INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 0,
      config_json TEXT NOT NULL DEFAULT '{}',
      state_json TEXT NOT NULL DEFAULT '{}',
      blockers_json TEXT NOT NULL DEFAULT '[]',
      error_json TEXT NOT NULL DEFAULT 'null',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS match_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      current_step_index INTEGER NOT NULL,
      state_json TEXT NOT NULL,
      blockers_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_match_snapshots_match ON match_snapshots(match_id, version DESC);

    CREATE TABLE IF NOT EXISTS workflow_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      step_id TEXT,
      player_id TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      visibility TEXT NOT NULL DEFAULT 'public',
      visible_to_player_ids_json TEXT NOT NULL DEFAULT '[]',
      idempotency_key TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      UNIQUE(match_id, seq),
      UNIQUE(match_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_events_match_seq ON workflow_events(match_id, seq);
    CREATE INDEX IF NOT EXISTS idx_workflow_events_type ON workflow_events(type);

    CREATE TABLE IF NOT EXISTS pending_actions (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      epoch_id TEXT,
      player_id TEXT,
      actor_type TEXT NOT NULL,
      action_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload_json TEXT NOT NULL DEFAULT '{}',
      result_event_seq INTEGER,
      idempotency_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      UNIQUE(match_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_pending_actions_match ON pending_actions(match_id, status);

    CREATE TABLE IF NOT EXISTS ai_tasks (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      task_key TEXT NOT NULL,
      epoch_id TEXT,
      player_id TEXT,
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      prompt_json TEXT NOT NULL DEFAULT '{}',
      context_json TEXT NOT NULL DEFAULT '{}',
      raw_output TEXT NOT NULL DEFAULT '',
      result_json TEXT NOT NULL DEFAULT 'null',
      error_json TEXT NOT NULL DEFAULT 'null',
      attempts INTEGER NOT NULL DEFAULT 0,
      visible_event_seq_max INTEGER NOT NULL DEFAULT 0,
      visible_event_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      UNIQUE(match_id, step_id, task_key)
    );
    CREATE INDEX IF NOT EXISTS idx_ai_tasks_match_status ON ai_tasks(match_id, status);

    CREATE TABLE IF NOT EXISTS outbox_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      event_seq INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      UNIQUE(match_id, event_seq)
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_match_status ON outbox_messages(match_id, status);

    CREATE TABLE IF NOT EXISTS memory_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'public',
      owner_id TEXT,
      snapshot_json TEXT NOT NULL DEFAULT '{}',
      source_event_seq INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_memory_snapshots_match ON memory_snapshots(match_id, scope, owner_id);

    CREATE TABLE IF NOT EXISTS action_window_epochs (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      window_json TEXT NOT NULL DEFAULT '{}',
      created_event_seq INTEGER,
      resolved_event_seq INTEGER,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      UNIQUE(match_id, step_id, action_type)
    );
    CREATE INDEX IF NOT EXISTS idx_action_window_epochs_match ON action_window_epochs(match_id, status);
  `);

  ensureColumn(db, 'games', 'game_type', "TEXT NOT NULL DEFAULT 'werewolf'");
  ensureColumn(db, 'games', 'topic_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'players', 'model_id', 'INTEGER');
  ensureColumn(db, 'players', 'voice_package_id', 'INTEGER');
  ensureColumn(db, 'players', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'models', 'provider_id', 'INTEGER');
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
  ensureColumn(db, 'werewolf_roles', 'play_style_advice', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'models', 'thinking_enabled', "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, 'ai_tasks', 'worker_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'ai_tasks', 'claimed_at', 'TEXT');
  migrateLegacyModelProviders(db);

  // Fix null/empty/consensus game types
  db.exec(`
    UPDATE games
    SET game_type = CASE
      WHEN id LIKE 'debate-%' OR event_json LIKE '%ai-debate%' THEN 'debate'
      WHEN id LIKE 'werewolf-%' OR event_json LIKE '%ai-werewolf%' THEN 'werewolf'
      ELSE COALESCE(NULLIF(game_type, ''), 'werewolf')
    END
    WHERE game_type IS NULL OR game_type = '' OR game_type = 'consensus'
  `);
  // Fix debate games that were incorrectly saved as werewolf (missing gameType in serialize)
  db.exec(`
    UPDATE games SET game_type = 'debate'
    WHERE game_type = 'werewolf'
      AND (id LIKE 'debate-%' OR event_json LIKE '%ai-debate%')
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_games_type_created ON games(game_type, created_at DESC)');

  // Observability tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_traces (
      id TEXT PRIMARY KEY,
      game_type TEXT NOT NULL,
      game_mode TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'recording',
      llm_call_count INTEGER NOT NULL DEFAULT 0,
      agent_decision_count INTEGER NOT NULL DEFAULT 0,
      event_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS trace_spans (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL REFERENCES game_traces(id) ON DELETE CASCADE,
      parent_span_id TEXT,
      span_type TEXT NOT NULL,
      span_name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      status TEXT NOT NULL DEFAULT 'ok',
      attributes_json TEXT NOT NULL DEFAULT '{}',
      error_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_spans_trace ON trace_spans(trace_id);
    CREATE INDEX IF NOT EXISTS idx_spans_parent ON trace_spans(parent_span_id);

    CREATE TABLE IF NOT EXISTS llm_records (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL REFERENCES game_traces(id) ON DELETE CASCADE,
      span_id TEXT,
      game_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      api_format TEXT NOT NULL,
      player_id INTEGER,
      player_role TEXT,
      player_faction TEXT,
      messages_json TEXT NOT NULL,
      response_text TEXT NOT NULL DEFAULT '',
      thinking_text TEXT,
      temperature REAL,
      max_tokens INTEGER,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      latency_ms INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_llm_trace ON llm_records(trace_id);
    CREATE INDEX IF NOT EXISTS idx_llm_player ON llm_records(trace_id, player_id);

    CREATE TABLE IF NOT EXISTS agent_decisions (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL REFERENCES game_traces(id) ON DELETE CASCADE,
      span_id TEXT,
      game_type TEXT NOT NULL,
      player_id INTEGER NOT NULL,
      player_role TEXT,
      player_faction TEXT,
      decision_type TEXT NOT NULL,
      phase TEXT,
      day INTEGER,
      prompt_text TEXT,
      response_text TEXT,
      chosen_target INTEGER,
      fallback_used INTEGER NOT NULL DEFAULT 0,
      fallback_reason TEXT,
      skill_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_decisions_trace ON agent_decisions(trace_id);
    CREATE INDEX IF NOT EXISTS idx_decisions_player ON agent_decisions(trace_id, player_id);
    CREATE INDEX IF NOT EXISTS idx_decisions_type ON agent_decisions(decision_type);

    CREATE TABLE IF NOT EXISTS game_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT NOT NULL REFERENCES game_traces(id) ON DELETE CASCADE,
      span_id TEXT,
      event_type TEXT NOT NULL,
      phase TEXT,
      day INTEGER,
      event_json TEXT NOT NULL,
      received_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_trace ON game_events(trace_id);
    CREATE INDEX IF NOT EXISTS idx_events_type ON game_events(event_type);

    CREATE TABLE IF NOT EXISTS state_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT NOT NULL REFERENCES game_traces(id) ON DELETE CASCADE,
      checkpoint TEXT NOT NULL,
      day INTEGER,
      phase TEXT,
      player_count INTEGER,
      alive_count INTEGER,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_trace ON state_snapshots(trace_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_checkpoint ON state_snapshots(trace_id, checkpoint);
  `);
}

function migrateLegacyModelProviders(db: Database): void {
  const models = db.prepare('SELECT * FROM models WHERE provider_id IS NULL').all() as Record<string, unknown>[];
  if (!models.length) return;
  const providers = new Map<string, unknown>();
  const insert = db.prepare(`
    INSERT INTO model_providers (name, base_url, api_format, api_key_cipher, api_key_iv, api_key_tag, enabled, created_at, updated_at)
    VALUES (@name, @base_url, @api_format, @api_key_cipher, @api_key_iv, @api_key_tag, @enabled, @created_at, @updated_at)
  `);
  const update = db.prepare('UPDATE models SET provider_id = ? WHERE id = ?');
  const migrateOne = db.transaction(() => {
    for (const model of models) {
      const key = [
        model.provider, model.base_url, model.api_format,
        model.api_key_cipher, model.api_key_iv, model.api_key_tag, model.enabled
      ].map((value) => String(value ?? '')).join('');
      let providerId = providers.get(key);
      if (!providerId) {
        providerId = insert.run({
          name: model.provider || '未命名供应商',
          base_url: model.base_url || '',
          api_format: model.api_format || 'openai-compatible',
          api_key_cipher: model.api_key_cipher || '',
          api_key_iv: model.api_key_iv || '',
          api_key_tag: model.api_key_tag || '',
          enabled: Number(model.enabled !== 0),
          created_at: model.created_at || new Date().toISOString(),
          updated_at: model.updated_at || new Date().toISOString()
        }).lastInsertRowid;
        providers.set(key, providerId);
      }
      update.run(providerId, model.id);
    }
  });
  migrateOne();
}

function ensureColumn(db: Database, tableName: string, columnName: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export { migrate };
export type { Database };
