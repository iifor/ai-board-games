export const IMPORT_TABLES = [
  'skins', 'model_providers', 'models', 'voice_packages',
  'players', 'werewolf_modes', 'werewolf_roles', 'app_settings', 'admin_users',
  'games', 'game_players', 'game_player_selections', 'game_playback_events',
  'player_game_memories',
] as const;

export const SKIPPED_TABLES = [
  'matches', 'match_snapshots', 'workflow_events', 'pending_actions', 'ai_tasks', 'outbox_messages',
  'memory_snapshots', 'action_window_epochs', 'workflow_effects', 'workflow_interrupts',
  'game_traces', 'trace_spans', 'llm_records', 'agent_decisions', 'game_events', 'state_snapshots',
] as const;

export const IDENTITY_TABLES = ['model_providers', 'models', 'voice_packages', 'admin_users', 'player_game_memories'] as const;
