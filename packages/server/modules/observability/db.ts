import { getDb } from '../../db';

// ── Row types (match DB schema) ──────────────────────────────────────

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

// ── Input types ──────────────────────────────────────────────────────

interface InsertTraceInput {
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

interface UpdateTraceInput {
  status?: string;
  error_message?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
  llm_call_count?: number;
  agent_decision_count?: number;
  event_count?: number;
}

interface FindTracesParams {
  gameType?: string | null;
  status?: string | null;
  limit?: number;
  offset?: number;
}

interface InsertSpanInput {
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

interface UpdateSpanInput {
  [key: string]: string | number | null | undefined;
}

interface InsertLlmRecordInput {
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

interface InsertDecisionInput {
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

interface InsertEventInput {
  trace_id: string;
  span_id: string | null;
  event_type: string;
  phase: string | null;
  day: number | null;
  event_json: string;
  received_at: string;
}

interface InsertSnapshotInput {
  trace_id: string;
  checkpoint: string;
  day: number | null;
  phase: string | null;
  player_count: number;
  alive_count: number;
  snapshot_json: string;
  created_at: string;
}

// ── Traces ───────────────────────────────────────────────────────────

function insertTrace(row: InsertTraceInput): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO game_traces (id, game_type, game_mode, status, llm_call_count, agent_decision_count, event_count, error_message, created_at, completed_at, duration_ms)
    VALUES (@id, @game_type, @game_mode, @status, @llm_call_count, @agent_decision_count, @event_count, @error_message, @created_at, @completed_at, @duration_ms)
  `).run(row);
}

function updateTraceStatus(id: string, updates: UpdateTraceInput): void {
  const db = getDb();
  const sets: string[] = [];
  const params: Record<string, string | number | null | undefined> = { id };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    sets.push(`${key} = @${key}`);
    params[key] = value;
  }
  if (!sets.length) return;
  db.prepare(`UPDATE game_traces SET ${sets.join(', ')} WHERE id = @id`).run(params);
}

function findTraces({ gameType, status, limit = 50, offset = 0 }: FindTracesParams = {}): GameTraceRow[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: Record<string, string | number> = {};
  if (gameType) { clauses.push('game_type = @gameType'); params.gameType = gameType; }
  if (status) { clauses.push('status = @status'); params.status = status; }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM game_traces ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`).all({ ...params, limit, offset }) as GameTraceRow[];
}

function findTraceById(id: string): GameTraceRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM game_traces WHERE id = @id').get({ id }) as GameTraceRow | undefined;
}

function deleteTrace(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM game_traces WHERE id = @id').run({ id });
}

interface CountRow {
  cnt: number;
}

function deleteOldTraces(beforeDate: string, maxCount: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM game_traces WHERE created_at < @before').run({ before: beforeDate });
    const row = db.prepare('SELECT COUNT(*) AS cnt FROM game_traces').get() as CountRow;
    const count = row.cnt;
    if (count > maxCount) {
      const excess = count - maxCount;
      db.prepare(`DELETE FROM game_traces WHERE id IN (SELECT id FROM game_traces ORDER BY created_at ASC LIMIT @excess)`).run({ excess });
    }
  })();
}

// ── Spans ────────────────────────────────────────────────────────────

function insertSpan(row: InsertSpanInput): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO trace_spans (id, trace_id, parent_span_id, span_type, span_name, start_time, end_time, status, attributes_json, error_json, created_at)
    VALUES (@id, @trace_id, @parent_span_id, @span_type, @span_name, @start_time, @end_time, @status, @attributes_json, @error_json, @created_at)
  `).run(row);
}

function updateSpan(id: string, updates: UpdateSpanInput): void {
  const db = getDb();
  const sets: string[] = [];
  const params: Record<string, string | number | null | undefined> = { id };
  for (const [key, value] of Object.entries(updates)) {
    sets.push(`${key} = @${key}`);
    params[key] = value;
  }
  if (!sets.length) return;
  db.prepare(`UPDATE trace_spans SET ${sets.join(', ')} WHERE id = @id`).run(params);
}

function findSpansByTrace(traceId: string): TraceSpanRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM trace_spans WHERE trace_id = @traceId ORDER BY start_time ASC').all({ traceId }) as TraceSpanRow[];
}

// ── LLM records ──────────────────────────────────────────────────────

function insertLlmRecord(row: InsertLlmRecordInput): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO llm_records (id, trace_id, span_id, game_type, provider, model, api_format, player_id, player_role, player_faction, messages_json, response_text, thinking_text, temperature, max_tokens, prompt_tokens, completion_tokens, latency_ms, status, error_message, created_at)
    VALUES (@id, @trace_id, @span_id, @game_type, @provider, @model, @api_format, @player_id, @player_role, @player_faction, @messages_json, @response_text, @thinking_text, @temperature, @max_tokens, @prompt_tokens, @completion_tokens, @latency_ms, @status, @error_message, @created_at)
  `).run(row);
}

function findLlmRecordsByTrace(traceId: string): LlmRecordRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM llm_records WHERE trace_id = @traceId ORDER BY created_at ASC').all({ traceId }) as LlmRecordRow[];
}

function findLlmRecordsByPlayer(traceId: string, playerId: number): LlmRecordRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM llm_records WHERE trace_id = @traceId AND player_id = @playerId ORDER BY created_at ASC').all({ traceId, playerId }) as LlmRecordRow[];
}

// ── Agent decisions ──────────────────────────────────────────────────

function insertDecision(row: InsertDecisionInput): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_decisions (id, trace_id, span_id, game_type, player_id, player_role, player_faction, decision_type, phase, day, prompt_text, response_text, chosen_target, fallback_used, fallback_reason, skill_id, created_at)
    VALUES (@id, @trace_id, @span_id, @game_type, @player_id, @player_role, @player_faction, @decision_type, @phase, @day, @prompt_text, @response_text, @chosen_target, @fallback_used, @fallback_reason, @skill_id, @created_at)
  `).run(row);
}

function findDecisionsByTrace(traceId: string): AgentDecisionRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM agent_decisions WHERE trace_id = @traceId ORDER BY created_at ASC').all({ traceId }) as AgentDecisionRow[];
}

function findDecisionsByPlayer(traceId: string, playerId: number): AgentDecisionRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM agent_decisions WHERE trace_id = @traceId AND player_id = @playerId ORDER BY created_at ASC').all({ traceId, playerId }) as AgentDecisionRow[];
}

// ── Game events ──────────────────────────────────────────────────────

function insertEvent(row: InsertEventInput): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO game_events (trace_id, span_id, event_type, phase, day, event_json, received_at)
    VALUES (@trace_id, @span_id, @event_type, @phase, @day, @event_json, @received_at)
  `).run(row);
}

function findEventsByTrace(traceId: string): GameEventRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM game_events WHERE trace_id = @traceId ORDER BY id ASC').all({ traceId }) as GameEventRow[];
}

// ── State snapshots ──────────────────────────────────────────────────

function insertSnapshot(row: InsertSnapshotInput): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO state_snapshots (trace_id, checkpoint, day, phase, player_count, alive_count, snapshot_json, created_at)
    VALUES (@trace_id, @checkpoint, @day, @phase, @player_count, @alive_count, @snapshot_json, @created_at)
  `).run(row);
}

function findSnapshotsByTrace(traceId: string): StateSnapshotRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM state_snapshots WHERE trace_id = @traceId ORDER BY id ASC').all({ traceId }) as StateSnapshotRow[];
}

export type {
  GameTraceRow,
  TraceSpanRow,
  LlmRecordRow,
  AgentDecisionRow,
  GameEventRow,
  StateSnapshotRow,
};

export {
  insertTrace, updateTraceStatus, findTraces, findTraceById, deleteTrace, deleteOldTraces,
  insertSpan, updateSpan, findSpansByTrace,
  insertLlmRecord, findLlmRecordsByTrace, findLlmRecordsByPlayer,
  insertDecision, findDecisionsByTrace, findDecisionsByPlayer,
  insertEvent, findEventsByTrace,
  insertSnapshot, findSnapshotsByTrace,
};
