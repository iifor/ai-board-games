// Raw database row types — snake_case, matching SQLite column names.

interface SkinRow {
  id: string;
  name: string;
  version: string;
  source: string;
  terms_json: string;
  background: string;
  truth: string;
  clues_json: string;
  noises_json: string;
  memory_examples_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface PlayerRow {
  id: number;
  nickname: string;
  name: string;
  avatar: string;
  sex: string;
  personality: string;
  provider: string;
  model: string;
  model_id: number | null;
  fallback_model_id: number | null;
  voice_package_id: number | null;
  temperature: number;
  enabled: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface PlayerGameMemoryRow {
  id: number;
  game_type: string;
  owner_player_id: number;
  subject_player_id: number;
  games_played: number;
  familiarity_score: number;
  traits_json: string;
  recent_summary: string;
  created_at: string;
  updated_at: string;
}

interface ModelProviderRow {
  id: number;
  name: string;
  base_url: string;
  api_format: string;
  api_key_cipher: string;
  api_key_iv: string;
  api_key_tag: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface ModelRow {
  id: number;
  provider_id: number | null;
  provider: string;
  name: string;
  display_name: string;
  base_url: string;
  api_format: string;
  api_key_cipher: string;
  api_key_iv: string;
  api_key_tag: string;
  enabled: number;
  thinking_enabled: number;
  created_at: string;
  updated_at: string;
}

interface VoicePackageRow {
  id: number;
  name: string;
  provider: string;
  voice_id: string;
  language: string;
  gender: string;
  style: string;
  rate: string;
  pitch: string;
  sample_text: string;
  description: string;
  enabled: number;
  temperature: number;
  created_at: string;
  updated_at: string;
}

interface WerewolfRoleRow {
  id: string;
  name: string;
  faction: string;
  role_type: string;
  responsibility: string;
  ability: string;
  play_style_advice: string;
  key_info: string;
  rule_json: string;
  enabled: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface WerewolfModeRow {
  id: string;
  name: string;
  description: string;
  roles_json: string;
  rules_json: string;
  sheriff_json: string;
  win_condition: string;
  enabled: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface GameRow {
  id: string;
  game_type: string;
  mode: string;
  skin_id: string | null;
  skin_name: string;
  winner: string | null;
  win_reason: string;
  topic_json: string;
  players_json: string;
  rounds_json: string;
  event_json: string;
  audio_resources_json: string;
  created_at: string;
}

interface GamePlayerRow {
  game_id: string;
  player_id: number;
  player_snapshot_json: string;
}

interface GamePlaybackEventRow {
  game_id: string;
  sequence: number;
  protocol_version: number;
  event_type: string;
  view_mode: string;
  payload_json: string;
  media_json: string;
  created_at: string;
}

interface GamePlayerSelectionRow {
  game_type: string;
  player_ids_json: string;
  updated_at: string;
}

interface AppSettingRow {
  key: string;
  value_json: string;
  updated_at: string;
}

interface MatchRow {
  id: string;
  game_type: string;
  workflow_id: string;
  status: string;
  current_step_index: number;
  version: number;
  config_json: string;
  state_json: string;
  blockers_json: string;
  error_json: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface MatchSnapshotRow {
  id: number;
  match_id: string;
  version: number;
  status: string;
  current_step_index: number;
  last_event_seq: number | null;
  state_json: string;
  blockers_json: string;
  created_at: string;
}

interface WorkflowEventRow {
  id: number;
  match_id: string;
  seq: number;
  type: string;
  step_id: string | null;
  player_id: string | null;
  payload_json: string;
  visibility: string;
  channel: string;
  scope_key: string | null;
  visible_to_player_ids_json: string;
  idempotency_key: string | null;
  created_at: string;
}

interface PendingActionRow {
  id: string;
  match_id: string;
  step_id: string;
  epoch_id: string | null;
  player_id: string | null;
  actor_type: string;
  action_type: string;
  status: string;
  payload_json: string;
  result_event_seq: number | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

interface AiTaskRow {
  id: string;
  match_id: string;
  step_id: string;
  task_key: string;
  epoch_id: string | null;
  player_id: string | null;
  action: string;
  status: string;
  prompt_json: string;
  context_json: string;
  raw_output: string;
  result_json: string;
  error_json: string;
  attempts: number;
  visible_event_seq_max: number;
  visible_event_ids_json: string;
  worker_id: string;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface OutboxMessageRow {
  id: number;
  match_id: string;
  event_seq: number;
  status: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

interface MemorySnapshotRow {
  id: number;
  match_id: string;
  scope: string;
  owner_id: string | null;
  snapshot_json: string;
  source_event_seq: number;
  created_at: string;
}

interface ActionWindowEpochRow {
  id: string;
  match_id: string;
  step_id: string;
  action_type: string;
  status: string;
  window_json: string;
  created_event_seq: number | null;
  resolved_event_seq: number | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkflowEffectRow {
  id: string;
  match_id: string;
  step_id: string | null;
  source_event_seq: number | null;
  effect_type: string;
  status: string;
  priority: number;
  payload_json: string;
  applied_event_seq: number | null;
  created_at: string;
  updated_at: string;
}

interface WorkflowInterruptRow {
  id: string;
  match_id: string;
  step_id: string | null;
  effect_id: string | null;
  interrupt_type: string;
  status: string;
  priority: number;
  payload_json: string;
  resolution_json: string;
  created_at: string;
  updated_at: string;
}

interface GameTraceRow {
  id: string;
  game_type: string;
  game_mode: string;
  status: string;
  llm_call_count: number;
  agent_decision_count: number;
  event_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

interface TraceSpanRow {
  id: string;
  trace_id: string;
  parent_span_id: string | null;
  span_type: string;
  span_name: string;
  start_time: string;
  end_time: string | null;
  status: string;
  attributes_json: string;
  error_json: string | null;
  created_at: string;
}

interface LlmRecordRow {
  id: string;
  trace_id: string;
  span_id: string | null;
  game_type: string;
  provider: string;
  model: string;
  api_format: string;
  player_id: number | null;
  player_role: string | null;
  player_faction: string | null;
  messages_json: string;
  response_text: string;
  thinking_text: string | null;
  temperature: number | null;
  max_tokens: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  latency_ms: number;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface AgentDecisionRow {
  id: string;
  trace_id: string;
  span_id: string | null;
  game_type: string;
  player_id: number;
  player_role: string | null;
  player_faction: string | null;
  decision_type: string;
  phase: string | null;
  day: number | null;
  prompt_text: string | null;
  response_text: string | null;
  chosen_target: number | null;
  fallback_used: number;
  fallback_reason: string | null;
  skill_id: string | null;
  created_at: string;
}

interface GameEventRow {
  id: number;
  trace_id: string;
  span_id: string | null;
  event_type: string;
  phase: string | null;
  day: number | null;
  event_json: string;
  received_at: string;
}

interface StateSnapshotRow {
  id: number;
  trace_id: string;
  checkpoint: string;
  day: number | null;
  phase: string | null;
  player_count: number | null;
  alive_count: number | null;
  snapshot_json: string;
  created_at: string;
}

export type {
  SkinRow,
  PlayerRow,
  PlayerGameMemoryRow,
  ModelProviderRow,
  ModelRow,
  VoicePackageRow,
  WerewolfRoleRow,
  WerewolfModeRow,
  GameRow,
  GamePlayerRow,
  GamePlaybackEventRow,
  GamePlayerSelectionRow,
  AppSettingRow,
  MatchRow,
  MatchSnapshotRow,
  WorkflowEventRow,
  PendingActionRow,
  AiTaskRow,
  OutboxMessageRow,
  MemorySnapshotRow,
  ActionWindowEpochRow,
  WorkflowEffectRow,
  WorkflowInterruptRow,
  GameTraceRow,
  TraceSpanRow,
  LlmRecordRow,
  AgentDecisionRow,
  GameEventRow,
  StateSnapshotRow
};
