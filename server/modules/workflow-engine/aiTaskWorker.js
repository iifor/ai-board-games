const repo = require('./repository');
const { getWorkflow, getStepHandler } = require('./workflowRegistry');

async function processNextAiTask(matchId) {
  const task = repo.claimNextAiTask({ matchId, workerId: 'inline-worker' });
  if (!task) return null;
  return processClaimedAiTask(task.id);
}

async function processAiTask(taskId) {
  const task = repo.getAiTask(taskId);
  if (!task) return null;
  if (task.status === 'queued' || task.status === 'retrying') {
    const claimed = repo.claimNextAiTask({ matchId: task.matchId, workerId: 'direct-worker' });
    if (!claimed || claimed.id !== task.id) return claimed;
  }
  return processClaimedAiTask(taskId);
}

async function processClaimedAiTask(taskId) {
  const service = require('./service');
  const task = repo.getAiTask(taskId);
  if (!task) return null;
  if (task.status !== 'running') return task;
  const match = repo.getMatch(task.matchId);
  const workflow = getWorkflow(match.workflowId);
  const step = workflow.steps.find((item) => item.id === task.stepId);
  const handler = getStepHandler(match.workflowId, step.type);

  try {
    const result = await handler.runAiTask({ match, workflow, step, task });
    if (handler.validateAiResult) {
      handler.validateAiResult({ match, workflow, step, task, result });
    } else if (!result?.payload || (typeof result.payload === 'object' && !Object.keys(result.payload).length)) {
      throw Object.assign(new Error('AI result payload is empty'), { severity: 'high' });
    }
    service.completeAiTask(task.id, result);
  } catch (error) {
    service.failAiTask(task.id, { message: error.message, severity: error.severity || 'medium' });
  }
  return repo.getAiTask(taskId);
}

module.exports = { processNextAiTask, processAiTask, processClaimedAiTask };
