const repo = require('./repository');
const { getWorkflow, getStepHandler } = require('./workflowRegistry');
const { tickMatch } = require('./tick');
const { toJson } = require('./utils');

async function processNextAiTask(matchId) {
  const task = repo.listAiTasks(matchId, 'queued')[0];
  if (!task) return null;
  return processAiTask(task.id);
}

async function processAiTask(taskId) {
  const task = repo.getAiTask(taskId);
  if (!task) return null;
  if (task.status !== 'queued' && task.status !== 'retrying') return task;
  const match = repo.getMatch(task.matchId);
  const workflow = getWorkflow(match.workflowId);
  const step = workflow.steps.find((item) => item.id === task.stepId);
  const handler = getStepHandler(match.workflowId, step.type);

  repo.updateAiTask(task.id, { status: 'running', attempts: Number(task.attempts || 0) + 1 });
  try {
    const result = await handler.runAiTask({ match, workflow, step, task });
    repo.updateAiTask(task.id, {
      status: 'succeeded',
      raw_output: typeof result.rawOutput === 'string' ? result.rawOutput : JSON.stringify(result.rawOutput ?? result.payload ?? {}),
      result_json: toJson(result)
    });
    const eventRow = repo.appendEvent({
      matchId: task.matchId,
      stepId: task.stepId,
      playerId: task.playerId,
      type: result.eventType || 'ai_task_succeeded',
      payload: result.payload || result,
      idempotencyKey: `${task.id}:result`
    });
    repo.insertOutbox(task.matchId, eventRow);
    tickMatch(task.matchId);
  } catch (error) {
    repo.updateAiTask(task.id, {
      status: 'failed',
      error_json: toJson({ message: error.message })
    });
    const eventRow = repo.appendEvent({
      matchId: task.matchId,
      stepId: task.stepId,
      playerId: task.playerId,
      type: 'ai_task_failed',
      payload: { taskId: task.id, message: error.message },
      visibility: 'system',
      idempotencyKey: `${task.id}:failed`
    });
    repo.insertOutbox(task.matchId, eventRow);
    tickMatch(task.matchId);
  }
  return repo.getAiTask(taskId);
}

module.exports = { processNextAiTask, processAiTask };
