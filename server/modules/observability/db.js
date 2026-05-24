const { getDb } = require('../../db');

function insertTrace(row) {
  const db = getDb();
  db.prepare(`
    INSERT INTO game_traces (id, game_type, game_mode, status, llm_call_count, agent_decision_count, event_count, error_message, created_at, completed_at, duration_ms)
    VALUES (@id, @game_type, @game_mode, @status, @llm_call_count, @agent_decision_count, @event_count, @error_message, @created_at, @completed_at, @duration_ms)
  `).run(row);
}

function updateTraceStatus(id, updates) {
  const db = getDb();
  const sets = [];
  const params = { id };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    sets.push(`${key} = @${key}`);
    params[key] = value;
  }
  if (!sets.length) return;
  db.prepare(`UPDATE game_traces SET ${sets.join(', ')} WHERE id = @id`).run(params);
}

function findTraces({ gameType, status, limit = 50, offset = 0 } = {}) {
  const db = getDb();
  const clauses = [];
  const params = {};
  if (gameType) { clauses.push('game_type = @gameType'); params.gameType = gameType; }
  if (status) { clauses.push('status = @status'); params.status = status; }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM game_traces ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`).all({ ...params, limit, offset });
}

function findTraceById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM game_traces WHERE id = @id').get({ id });
}

function deleteTrace(id) {
  const db = getDb();
  db.prepare('DELETE FROM game_traces WHERE id = @id').run({ id });
}

function deleteOldTraces(beforeDate, maxCount) {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM game_traces WHERE created_at < @before').run({ before: beforeDate });
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM game_traces').get().cnt;
    if (count > maxCount) {
      const excess = count - maxCount;
      db.prepare(`DELETE FROM game_traces WHERE id IN (SELECT id FROM game_traces ORDER BY created_at ASC LIMIT @excess)`).run({ excess });
    }
  })();
}

// Spans
function insertSpan(row) {
  const db = getDb();
  db.prepare(`
    INSERT INTO trace_spans (id, trace_id, parent_span_id, span_type, span_name, start_time, end_time, status, attributes_json, error_json, created_at)
    VALUES (@id, @trace_id, @parent_span_id, @span_type, @span_name, @start_time, @end_time, @status, @attributes_json, @error_json, @created_at)
  `).run(row);
}

function updateSpan(id, updates) {
  const db = getDb();
  const sets = [];
  const params = { id };
  for (const [key, value] of Object.entries(updates)) {
    sets.push(`${key} = @${key}`);
    params[key] = value;
  }
  if (!sets.length) return;
  db.prepare(`UPDATE trace_spans SET ${sets.join(', ')} WHERE id = @id`).run(params);
}

function findSpansByTrace(traceId) {
  const db = getDb();
  return db.prepare('SELECT * FROM trace_spans WHERE trace_id = @traceId ORDER BY start_time ASC').all({ traceId });
}

// LLM records
function insertLlmRecord(row) {
  const db = getDb();
  db.prepare(`
    INSERT INTO llm_records (id, trace_id, span_id, game_type, provider, model, api_format, player_id, player_role, player_faction, messages_json, response_text, thinking_text, temperature, max_tokens, prompt_tokens, completion_tokens, latency_ms, status, error_message, created_at)
    VALUES (@id, @trace_id, @span_id, @game_type, @provider, @model, @api_format, @player_id, @player_role, @player_faction, @messages_json, @response_text, @thinking_text, @temperature, @max_tokens, @prompt_tokens, @completion_tokens, @latency_ms, @status, @error_message, @created_at)
  `).run(row);
}

function findLlmRecordsByTrace(traceId) {
  const db = getDb();
  return db.prepare('SELECT * FROM llm_records WHERE trace_id = @traceId ORDER BY created_at ASC').all({ traceId });
}

function findLlmRecordsByPlayer(traceId, playerId) {
  const db = getDb();
  return db.prepare('SELECT * FROM llm_records WHERE trace_id = @traceId AND player_id = @playerId ORDER BY created_at ASC').all({ traceId, playerId });
}

// Agent decisions
function insertDecision(row) {
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_decisions (id, trace_id, span_id, game_type, player_id, player_role, player_faction, decision_type, phase, day, prompt_text, response_text, chosen_target, fallback_used, fallback_reason, skill_id, created_at)
    VALUES (@id, @trace_id, @span_id, @game_type, @player_id, @player_role, @player_faction, @decision_type, @phase, @day, @prompt_text, @response_text, @chosen_target, @fallback_used, @fallback_reason, @skill_id, @created_at)
  `).run(row);
}

function findDecisionsByTrace(traceId) {
  const db = getDb();
  return db.prepare('SELECT * FROM agent_decisions WHERE trace_id = @traceId ORDER BY created_at ASC').all({ traceId });
}

function findDecisionsByPlayer(traceId, playerId) {
  const db = getDb();
  return db.prepare('SELECT * FROM agent_decisions WHERE trace_id = @traceId AND player_id = @playerId ORDER BY created_at ASC').all({ traceId, playerId });
}

// Game events
function insertEvent(row) {
  const db = getDb();
  db.prepare(`
    INSERT INTO game_events (trace_id, span_id, event_type, phase, day, event_json, received_at)
    VALUES (@trace_id, @span_id, @event_type, @phase, @day, @event_json, @received_at)
  `).run(row);
}

function findEventsByTrace(traceId) {
  const db = getDb();
  return db.prepare('SELECT * FROM game_events WHERE trace_id = @traceId ORDER BY id ASC').all({ traceId });
}

// State snapshots
function insertSnapshot(row) {
  const db = getDb();
  db.prepare(`
    INSERT INTO state_snapshots (trace_id, checkpoint, day, phase, player_count, alive_count, snapshot_json, created_at)
    VALUES (@trace_id, @checkpoint, @day, @phase, @player_count, @alive_count, @snapshot_json, @created_at)
  `).run(row);
}

function findSnapshotsByTrace(traceId) {
  const db = getDb();
  return db.prepare('SELECT * FROM state_snapshots WHERE trace_id = @traceId ORDER BY id ASC').all({ traceId });
}

module.exports = {
  insertTrace, updateTraceStatus, findTraces, findTraceById, deleteTrace, deleteOldTraces,
  insertSpan, updateSpan, findSpansByTrace,
  insertLlmRecord, findLlmRecordsByTrace, findLlmRecordsByPlayer,
  insertDecision, findDecisionsByTrace, findDecisionsByPlayer,
  insertEvent, findEventsByTrace,
  insertSnapshot, findSnapshotsByTrace
};
