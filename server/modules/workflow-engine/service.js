const repo = require('./repository');
const { tickMatch } = require('./tick');
const { processNextAiTask } = require('./aiTaskWorker');
const { getWorkflow } = require('./workflowRegistry');
const { createId, nowIso, toJson } = require('./utils');
const { MATCH_STATUS } = require('../../../shared/types/workflowTypes');

function createWorkflowMatch({ workflowId, gameType, config, initialState }) {
  const workflow = getWorkflow(workflowId);
  const id = createId(gameType || workflow.gameType || 'match');
  repo.createMatch({
    id,
    game_type: gameType || workflow.gameType,
    workflow_id: workflowId,
    status: MATCH_STATUS.RUNNING,
    current_step_index: 0,
    version: 0,
    config_json: toJson(config || {}),
    state_json: toJson(initialState || {}),
    blockers_json: '[]',
    error_json: 'null',
    created_at: nowIso(),
    updated_at: nowIso(),
    completed_at: null
  });
  const eventRow = repo.appendEvent({
    matchId: id,
    type: 'match_created',
    payload: { workflowId, gameType: gameType || workflow.gameType },
    idempotencyKey: `${id}:created`
  });
  repo.insertOutbox(id, eventRow);
  return tickMatch(id);
}

function wakeTick(matchId) {
  return tickMatch(matchId);
}

async function drainAiTasks(matchId, options = {}) {
  const maxTasks = Number(options.maxTasks || 100);
  let processed = 0;
  while (processed < maxTasks) {
    const result = await processNextAiTask(matchId);
    if (!result) break;
    processed += 1;
    const match = repo.getMatch(matchId);
    if (!match || [MATCH_STATUS.COMPLETED, MATCH_STATUS.FAILED, MATCH_STATUS.PAUSED_DEBUG].includes(match.status)) break;
  }
  return { processed, match: repo.getMatch(matchId) };
}

function getDebugState(matchId) {
  return repo.getDebugState(matchId);
}

function listPendingOutbox(matchId) {
  return repo.listPendingOutbox(matchId);
}

function markOutboxSent(id) {
  return repo.markOutboxSent(id);
}

module.exports = {
  createWorkflowMatch,
  wakeTick,
  drainAiTasks,
  getDebugState,
  listPendingOutbox,
  markOutboxSent
};
