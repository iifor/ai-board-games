const crypto = require('crypto');

function nowIso() {
  return new Date().toISOString();
}

function toJson(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

function stableTaskId(matchId, stepId, taskKey) {
  return crypto.createHash('sha1').update(`${matchId}:${stepId}:${taskKey}`).digest('hex').slice(0, 24);
}

function publicMatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    gameType: row.game_type,
    workflowId: row.workflow_id,
    status: row.status,
    currentStepIndex: row.current_step_index,
    version: row.version,
    config: parseJson(row.config_json, {}),
    state: parseJson(row.state_json, {}),
    blockers: parseJson(row.blockers_json, []),
    error: parseJson(row.error_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

function rowToEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    matchId: row.match_id,
    seq: row.seq,
    type: row.type,
    stepId: row.step_id || undefined,
    playerId: row.player_id || undefined,
    payload: parseJson(row.payload_json, {}),
    visibility: row.visibility,
    visibleToPlayerIds: parseJson(row.visible_to_player_ids_json, []),
    idempotencyKey: row.idempotency_key || undefined,
    createdAt: row.created_at
  };
}

function rowToTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    matchId: row.match_id,
    stepId: row.step_id,
    taskKey: row.task_key,
    epochId: row.epoch_id || undefined,
    playerId: row.player_id || undefined,
    action: row.action,
    status: row.status,
    prompt: parseJson(row.prompt_json, {}),
    promptContextSnapshot: parseJson(row.context_json, {}),
    rawOutput: row.raw_output || '',
    result: parseJson(row.result_json, null),
    error: parseJson(row.error_json, null),
    attempts: row.attempts,
    visibleEventSeqMax: row.visible_event_seq_max,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  nowIso,
  toJson,
  parseJson,
  createId,
  stableTaskId,
  publicMatch,
  rowToEvent,
  rowToTask
};
