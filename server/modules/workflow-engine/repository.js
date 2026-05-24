const { getDb } = require('../../db');
const { nowIso, toJson, parseJson, publicMatch, rowToEvent, rowToTask } = require('./utils');

function createMatch(row) {
  getDb().prepare(`
    INSERT INTO matches (
      id, game_type, workflow_id, status, current_step_index, version,
      config_json, state_json, blockers_json, error_json, created_at, updated_at, completed_at
    )
    VALUES (
      @id, @game_type, @workflow_id, @status, @current_step_index, @version,
      @config_json, @state_json, @blockers_json, @error_json, @created_at, @updated_at, @completed_at
    )
  `).run(row);
}

function getMatchRow(matchId) {
  return getDb().prepare('SELECT * FROM matches WHERE id = ?').get(matchId) || null;
}

function getMatch(matchId) {
  return publicMatch(getMatchRow(matchId));
}

function updateMatch(matchId, patch) {
  const sets = [];
  const params = { id: matchId, updated_at: nowIso() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    sets.push(`${key} = @${key}`);
    params[key] = value;
  }
  sets.push('updated_at = @updated_at');
  getDb().prepare(`UPDATE matches SET ${sets.join(', ')} WHERE id = @id`).run(params);
}

function nextEventSeq(matchId) {
  const row = getDb().prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM workflow_events WHERE match_id = ?').get(matchId);
  return Number(row?.seq || 1);
}

function appendEvent(event) {
  const seq = event.seq || nextEventSeq(event.matchId);
  getDb().prepare(`
    INSERT OR IGNORE INTO workflow_events (
      match_id, seq, type, step_id, player_id, payload_json, visibility,
      visible_to_player_ids_json, idempotency_key, created_at
    )
    VALUES (
      @match_id, @seq, @type, @step_id, @player_id, @payload_json, @visibility,
      @visible_to_player_ids_json, @idempotency_key, @created_at
    )
  `).run({
    match_id: event.matchId,
    seq,
    type: event.type,
    step_id: event.stepId || null,
    player_id: event.playerId == null ? null : String(event.playerId),
    payload_json: toJson(event.payload || {}),
    visibility: event.visibility || 'public',
    visible_to_player_ids_json: toJson(event.visibleToPlayerIds || []),
    idempotency_key: event.idempotencyKey || null,
    created_at: event.createdAt || nowIso()
  });
  return getDb().prepare('SELECT * FROM workflow_events WHERE match_id = ? AND seq = ?').get(event.matchId, seq);
}

function listEvents(matchId) {
  return getDb().prepare('SELECT * FROM workflow_events WHERE match_id = ? ORDER BY seq ASC').all(matchId).map(rowToEvent);
}

function listEventsAfter(matchId, afterSeq = 0) {
  return getDb().prepare('SELECT * FROM workflow_events WHERE match_id = ? AND seq > ? ORDER BY seq ASC').all(matchId, Number(afterSeq) || 0).map(rowToEvent);
}

function insertOutbox(matchId, eventRow) {
  getDb().prepare(`
    INSERT INTO outbox_messages (match_id, event_seq, status, payload_json, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, ?, ?)
  `).run(matchId, eventRow.seq, toJson(rowToEvent(eventRow)), nowIso(), nowIso());
}

function listPendingOutbox(matchId) {
  return getDb().prepare('SELECT * FROM outbox_messages WHERE match_id = ? AND status = ? ORDER BY id ASC').all(matchId, 'pending')
    .map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) }));
}

function markOutboxSent(id) {
  getDb().prepare('UPDATE outbox_messages SET status = ?, updated_at = ? WHERE id = ?').run('sent', nowIso(), id);
}

function upsertSnapshot(match) {
  getDb().prepare(`
    INSERT INTO match_snapshots (match_id, version, status, current_step_index, state_json, blockers_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(match.id, match.version, match.status, match.currentStepIndex, toJson(match.state), toJson(match.blockers || []), nowIso());
}

function createAiTask(task) {
  getDb().prepare(`
    INSERT OR IGNORE INTO ai_tasks (
      id, match_id, step_id, task_key, epoch_id, player_id, action, status,
      prompt_json, context_json, raw_output, result_json, error_json, attempts,
      visible_event_seq_max, visible_event_ids_json, created_at, updated_at
    )
    VALUES (
      @id, @match_id, @step_id, @task_key, @epoch_id, @player_id, @action, @status,
      @prompt_json, @context_json, '', 'null', 'null', 0,
      @visible_event_seq_max, @visible_event_ids_json, @created_at, @updated_at
    )
  `).run({
    id: task.id,
    match_id: task.matchId,
    step_id: task.stepId,
    task_key: task.taskKey,
    epoch_id: task.epochId || null,
    player_id: task.playerId == null ? null : String(task.playerId),
    action: task.action,
    status: task.status || 'queued',
    prompt_json: toJson(task.prompt || {}),
    context_json: toJson(task.promptContextSnapshot || {}),
    visible_event_seq_max: Number(task.visibleEventSeqMax || 0),
    visible_event_ids_json: toJson(task.visibleEventIds || []),
    created_at: nowIso(),
    updated_at: nowIso()
  });
}

function listAiTasks(matchId, status = null) {
  const rows = status
    ? getDb().prepare('SELECT * FROM ai_tasks WHERE match_id = ? AND status = ? ORDER BY created_at ASC').all(matchId, status)
    : getDb().prepare('SELECT * FROM ai_tasks WHERE match_id = ? ORDER BY created_at ASC').all(matchId);
  return rows.map(rowToTask);
}

function getAiTask(id) {
  return rowToTask(getDb().prepare('SELECT * FROM ai_tasks WHERE id = ?').get(id));
}

function updateAiTask(id, patch) {
  const sets = [];
  const params = { id, updated_at: nowIso() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    sets.push(`${key} = @${key}`);
    params[key] = value;
  }
  sets.push('updated_at = @updated_at');
  getDb().prepare(`UPDATE ai_tasks SET ${sets.join(', ')} WHERE id = @id`).run(params);
}

function createPendingAction(action) {
  getDb().prepare(`
    INSERT OR IGNORE INTO pending_actions (
      id, match_id, step_id, epoch_id, player_id, actor_type, action_type, status,
      payload_json, result_event_seq, idempotency_key, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `).run(
    action.id, action.matchId, action.stepId, action.epochId || null,
    action.playerId == null ? null : String(action.playerId),
    action.actorType, action.actionType, action.status || 'pending',
    toJson(action.payload || {}), action.idempotencyKey || action.id, nowIso(), nowIso()
  );
}

function listPendingActions(matchId) {
  return getDb().prepare('SELECT * FROM pending_actions WHERE match_id = ? ORDER BY created_at ASC').all(matchId)
    .map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) }));
}

function getDebugState(matchId) {
  const match = getMatch(matchId);
  if (!match) return null;
  return {
    match,
    events: listEvents(matchId),
    aiTasks: listAiTasks(matchId),
    pendingActions: listPendingActions(matchId),
    outbox: listPendingOutbox(matchId)
  };
}

module.exports = {
  createMatch,
  getMatchRow,
  getMatch,
  updateMatch,
  appendEvent,
  listEvents,
  listEventsAfter,
  insertOutbox,
  listPendingOutbox,
  markOutboxSent,
  upsertSnapshot,
  createAiTask,
  listAiTasks,
  getAiTask,
  updateAiTask,
  createPendingAction,
  listPendingActions,
  getDebugState
};
