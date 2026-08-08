import { getDbExecutor } from '../../db';
import type { DbExecutor } from '../../db/types';

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
  participants_json: string;
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
  participants_json: string;
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

async function insertTrace(row: InsertTraceInput): Promise<void> {
  await getDbExecutor().execute(`
    INSERT INTO game_traces (id, game_type, game_mode, status, llm_call_count, agent_decision_count, event_count, error_message, created_at, completed_at, duration_ms, participants_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, [row.id, row.game_type, row.game_mode, row.status, row.llm_call_count, row.agent_decision_count,
    row.event_count, row.error_message, row.created_at, row.completed_at, row.duration_ms, row.participants_json]);
}

async function updateTraceStatus(id: string, updates: UpdateTraceInput): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const allowed = new Set(['status', 'error_message', 'completed_at', 'duration_ms', 'llm_call_count', 'agent_decision_count', 'event_count']);
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || !allowed.has(key)) continue;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  if (!sets.length) return;
  params.push(id);
  await getDbExecutor().execute(`UPDATE game_traces SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
}

async function incrementTraceCounter(id: string, counter: 'llm_call_count' | 'agent_decision_count' | 'event_count'): Promise<void> {
  await getDbExecutor().execute(`UPDATE game_traces SET ${counter} = ${counter} + 1 WHERE id = $1`, [id]);
}

async function findTraces({ gameType, status, limit = 50, offset = 0 }: FindTracesParams = {}): Promise<GameTraceRow[]> {
  return getDbExecutor().queryMany<GameTraceRow>(`SELECT * FROM game_traces
    WHERE ($1::text IS NULL OR game_type = $1) AND ($2::text IS NULL OR status = $2)
    ORDER BY created_at DESC LIMIT $3 OFFSET $4`, [gameType || null, status || null, limit, offset]);
}

async function findTraceById(id: string): Promise<GameTraceRow | undefined> {
  return (await getDbExecutor().queryOne<GameTraceRow>('SELECT * FROM game_traces WHERE id = $1', [id])) || undefined;
}

interface TraceParticipant {
  seatId: number;
  sourcePlayerId: number;
  nickname: string;
}

async function resolveTraceParticipants(traceId: string): Promise<TraceParticipant[]> {
  const db = getDbExecutor();
  const trace = await findTraceById(traceId);
  const stored = parseParticipants(trace?.participants_json);
  if (stored.length) return stored;

  const rootSpan = await db.queryOne<{ attributes_json?: string }>(`
    SELECT attributes_json FROM trace_spans
    WHERE trace_id = $1 AND span_name = 'game-root'
    ORDER BY created_at ASC LIMIT 1
  `, [traceId]);
  const gameId = readGameId(rootSpan?.attributes_json);
  if (gameId) {
    const match = await db.queryOne<{ state_json?: string }>('SELECT state_json FROM matches WHERE id = $1', [gameId]);
    const participants = readParticipantsFromState(match?.state_json);
    if (participants.length) return participants;
  }

  const ids = await db.queryMany<{ player_id: number }>(`
    SELECT player_id FROM llm_records WHERE trace_id = $1 AND player_id IS NOT NULL
    UNION
    SELECT player_id FROM agent_decisions WHERE trace_id = $1
    ORDER BY player_id
  `, [traceId]);
  return ids.map(({ player_id }) => ({
    seatId: Number(player_id),
    sourcePlayerId: Number(player_id),
    nickname: `${player_id}号`,
  }));
}

function parseParticipants(value: string | undefined): TraceParticipant[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(isTraceParticipant) : [];
  } catch {
    return [];
  }
}

function readGameId(value: string | undefined): string {
  try {
    const parsed = JSON.parse(value || '{}') as Record<string, unknown>;
    return String(parsed['game.id'] || '');
  } catch {
    return '';
  }
}

function readParticipantsFromState(value: string | undefined): TraceParticipant[] {
  try {
    const state = JSON.parse(value || '{}') as { players?: Array<Record<string, unknown>> };
    return (state.players || []).map((player) => ({
      seatId: Number(player.seatNumber || player.id),
      sourcePlayerId: Number(player.sourcePlayerId || player.id),
      nickname: String(player.nickname || player.name || `${player.seatNumber || player.id}号`),
    })).filter(isTraceParticipant);
  } catch {
    return [];
  }
}

function isTraceParticipant(value: unknown): value is TraceParticipant {
  const participant = value as Partial<TraceParticipant>;
  return Number.isFinite(Number(participant?.seatId))
    && Number.isFinite(Number(participant?.sourcePlayerId))
    && Boolean(participant?.nickname);
}

async function deleteTrace(id: string): Promise<void> {
  await getDbExecutor().execute('DELETE FROM game_traces WHERE id = $1', [id]);
}

async function deleteTracesByGameId(gameId: string, db: DbExecutor = getDbExecutor()): Promise<number> {
  const result = await db.execute(`
    DELETE FROM game_traces
    WHERE id IN (
      SELECT DISTINCT trace_id
      FROM trace_spans
      WHERE parent_span_id IS NULL
        AND attributes_json ->> 'game.id' = $1
    )
  `, [gameId]);
  return result.rowCount;
}

interface CountRow {
  cnt: number;
}

async function deleteOldTraces(beforeDate: string, maxCount: number): Promise<void> {
  await getDbExecutor().withTransaction(async (db) => {
    await db.execute('DELETE FROM game_traces WHERE created_at < $1', [beforeDate]);
    const row = await db.queryOne<CountRow>('SELECT COUNT(*) AS cnt FROM game_traces');
    if (!row) return;
    const count = row.cnt;
    if (count > maxCount) {
      const excess = count - maxCount;
      await db.execute(`DELETE FROM game_traces WHERE id IN
        (SELECT id FROM game_traces ORDER BY created_at ASC LIMIT $1)`, [excess]);
    }
  });
}

// ── Spans ────────────────────────────────────────────────────────────

async function insertSpan(row: InsertSpanInput): Promise<void> {
  await getDbExecutor().execute(`
    INSERT INTO trace_spans (id, trace_id, parent_span_id, span_type, span_name, start_time, end_time, status, attributes_json, error_json, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [row.id, row.trace_id, row.parent_span_id, row.span_type, row.span_name, row.start_time,
    row.end_time, row.status, row.attributes_json, row.error_json, row.created_at]);
}

async function updateSpan(id: string, updates: UpdateSpanInput): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const allowed = new Set(['parent_span_id', 'span_type', 'span_name', 'start_time', 'end_time', 'status', 'attributes_json', 'error_json']);
  for (const [key, value] of Object.entries(updates)) {
    if (!allowed.has(key)) continue;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  if (!sets.length) return;
  params.push(id);
  await getDbExecutor().execute(`UPDATE trace_spans SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
}

async function findSpansByTrace(traceId: string): Promise<TraceSpanRow[]> {
  return getDbExecutor().queryMany<TraceSpanRow>('SELECT * FROM trace_spans WHERE trace_id = $1 ORDER BY start_time ASC', [traceId]);
}

// ── LLM records ──────────────────────────────────────────────────────

async function insertLlmRecord(row: InsertLlmRecordInput): Promise<void> {
  await getDbExecutor().execute(`
    INSERT INTO llm_records (id, trace_id, span_id, game_type, provider, model, api_format, player_id, player_role, player_faction, messages_json, response_text, thinking_text, temperature, max_tokens, prompt_tokens, completion_tokens, latency_ms, status, error_message, created_at)
    VALUES (${Array.from({ length: 21 }, (_, index) => `$${index + 1}`).join(', ')})
  `, [row.id, row.trace_id, row.span_id, row.game_type, row.provider, row.model, row.api_format,
    row.player_id, row.player_role, row.player_faction, row.messages_json, row.response_text,
    row.thinking_text, row.temperature, row.max_tokens, row.prompt_tokens, row.completion_tokens,
    row.latency_ms, row.status, row.error_message, row.created_at]);
}

async function findLlmRecordsByTrace(traceId: string): Promise<LlmRecordRow[]> {
  return getDbExecutor().queryMany<LlmRecordRow>('SELECT * FROM llm_records WHERE trace_id = $1 ORDER BY created_at ASC', [traceId]);
}

async function findLlmRecordsByPlayer(traceId: string, playerId: number): Promise<LlmRecordRow[]> {
  return getDbExecutor().queryMany<LlmRecordRow>('SELECT * FROM llm_records WHERE trace_id = $1 AND player_id = $2 ORDER BY created_at ASC', [traceId, playerId]);
}

// ── Agent decisions ──────────────────────────────────────────────────

async function insertDecision(row: InsertDecisionInput): Promise<void> {
  await getDbExecutor().execute(`
    INSERT INTO agent_decisions (id, trace_id, span_id, game_type, player_id, player_role, player_faction, decision_type, phase, day, prompt_text, response_text, chosen_target, fallback_used, fallback_reason, skill_id, created_at)
    VALUES (${Array.from({ length: 17 }, (_, index) => `$${index + 1}`).join(', ')})
  `, [row.id, row.trace_id, row.span_id, row.game_type, row.player_id, row.player_role,
    row.player_faction, row.decision_type, row.phase, row.day, row.prompt_text, row.response_text,
    row.chosen_target, row.fallback_used, row.fallback_reason, row.skill_id, row.created_at]);
}

async function findDecisionsByTrace(traceId: string): Promise<AgentDecisionRow[]> {
  return getDbExecutor().queryMany<AgentDecisionRow>('SELECT * FROM agent_decisions WHERE trace_id = $1 ORDER BY created_at ASC', [traceId]);
}

async function findDecisionsByPlayer(traceId: string, playerId: number): Promise<AgentDecisionRow[]> {
  return getDbExecutor().queryMany<AgentDecisionRow>('SELECT * FROM agent_decisions WHERE trace_id = $1 AND player_id = $2 ORDER BY created_at ASC', [traceId, playerId]);
}

// ── Game events ──────────────────────────────────────────────────────

async function insertEvent(row: InsertEventInput): Promise<void> {
  await getDbExecutor().execute(`
    INSERT INTO game_events (trace_id, span_id, event_type, phase, day, event_json, received_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [row.trace_id, row.span_id, row.event_type, row.phase, row.day, row.event_json, row.received_at]);
}

async function findEventsByTrace(traceId: string): Promise<GameEventRow[]> {
  return getDbExecutor().queryMany<GameEventRow>('SELECT * FROM game_events WHERE trace_id = $1 ORDER BY id ASC', [traceId]);
}

// ── State snapshots ──────────────────────────────────────────────────

async function insertSnapshot(row: InsertSnapshotInput): Promise<void> {
  await getDbExecutor().execute(`
    INSERT INTO state_snapshots (trace_id, checkpoint, day, phase, player_count, alive_count, snapshot_json, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [row.trace_id, row.checkpoint, row.day, row.phase, row.player_count, row.alive_count,
    row.snapshot_json, row.created_at]);
}

async function findSnapshotsByTrace(traceId: string): Promise<StateSnapshotRow[]> {
  return getDbExecutor().queryMany<StateSnapshotRow>('SELECT * FROM state_snapshots WHERE trace_id = $1 ORDER BY id ASC', [traceId]);
}

export type {
  GameTraceRow,
  TraceSpanRow,
  LlmRecordRow,
  AgentDecisionRow,
  GameEventRow,
  StateSnapshotRow,
  TraceParticipant,
};

export {
  insertTrace, updateTraceStatus, incrementTraceCounter, findTraces, findTraceById, deleteTrace, deleteTracesByGameId, deleteOldTraces,
  resolveTraceParticipants,
  readParticipantsFromState,
  insertSpan, updateSpan, findSpansByTrace,
  insertLlmRecord, findLlmRecordsByTrace, findLlmRecordsByPlayer,
  insertDecision, findDecisionsByTrace, findDecisionsByPlayer,
  insertEvent, findEventsByTrace,
  insertSnapshot, findSnapshotsByTrace,
};
