import * as repo from './repository';
import { getWorkflow, getStepHandler } from './workflowRegistry';
import type { AiTask, Match } from '../../types/workflow';
import type { Workflow, WorkflowStep } from './workflowRegistry';

async function processNextAiTask(matchId: string): Promise<AiTask | null> {
  const task = repo.claimNextAiTask({ matchId, workerId: 'inline-worker' });
  if (!task) return null;
  return processClaimedAiTask(task.id);
}

async function processAiTask(taskId: string): Promise<AiTask | null> {
  const task = repo.getAiTask(taskId);
  if (!task) return null;
  if (task.status === 'queued' || task.status === 'retrying') {
    const claimed = repo.claimNextAiTask({ matchId: task.matchId, workerId: 'direct-worker' });
    if (!claimed || claimed.id !== task.id) return claimed;
  }
  return processClaimedAiTask(taskId);
}

async function processClaimedAiTask(taskId: string): Promise<AiTask | null> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const service = require('./service') as typeof import('./service');
  const task = repo.getAiTask(taskId);
  if (!task) return null;
  if (task.status !== 'running') return task;
  const match = repo.getMatch(task.matchId);
  if (!match) return null;
  const workflow: Workflow = getWorkflow(match.workflowId);
  const step: WorkflowStep | undefined = workflow.steps.find((item: WorkflowStep) => item.id === task.stepId);
  if (!step) return null;
  const handler = getStepHandler(match.workflowId, step.type);

  try {
    const result = await handler.runAiTask!({
      match: match as unknown as Record<string, unknown>,
      workflow,
      step,
      task: task as unknown as Record<string, unknown>,
    });
    if (handler.validateAiResult) {
      handler.validateAiResult({
        match: match as unknown as Record<string, unknown>,
        workflow,
        step,
        task: task as unknown as Record<string, unknown>,
        result,
      });
    } else if (!result?.payload || (typeof result.payload === 'object' && !Object.keys(result.payload as object).length)) {
      throw Object.assign(new Error('AI result payload is empty'), { severity: 'high' });
    }
    service.completeAiTask(task.id, result);
  } catch (error: unknown) {
    const err = error as Error & { severity?: string };
    service.failAiTask(task.id, { message: err.message, severity: err.severity || 'medium' });
  }
  return repo.getAiTask(taskId);
}

export { processNextAiTask, processAiTask, processClaimedAiTask };
