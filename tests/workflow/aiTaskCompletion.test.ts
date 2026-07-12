import test from 'node:test';
import assert from 'node:assert/strict';
import * as repo from '../../packages/server/modules/workflow-engine/repository';
import * as tick from '../../packages/server/modules/workflow-engine/tick';
import * as workflowService from '../../packages/server/modules/workflow-engine/service';
import { completeAiTask, drainAiTasks } from '../../packages/server/modules/workflow-engine/service';
import { WorkflowRuntime } from '../../packages/server/modules/game-engine/workflow/workflowRuntime';

test('successful AI result is not retried when the following workflow advance fails', () => {
  const task = {
    id: 'task-hunter-10',
    matchId: 'match-hunter-epoch',
    stepId: 'night_resolve_1',
    playerId: 10,
    status: 'running',
    attempts: 1,
  };
  const original = {
    getAiTask: repo.getAiTask,
    getMatch: repo.getMatch,
    updateAiTask: repo.updateAiTask,
    commitWorkflowChange: repo.commitWorkflowChange,
    tickMatch: tick.tickMatch,
  };
  const updates: Array<Record<string, unknown>> = [];
  const commits: Array<Record<string, unknown>> = [];
  let currentTask = { ...task };

  try {
    replace(repo, 'getAiTask', () => currentTask);
    replace(repo, 'getMatch', () => ({
      id: task.matchId,
      status: 'waiting',
      config: { debugMode: false },
    }));
    replace(repo, 'updateAiTask', (_id: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      currentTask = { ...currentTask, ...patch };
      return currentTask;
    });
    replace(repo, 'commitWorkflowChange', (change: Record<string, unknown>) => {
      commits.push(change);
      const patch = change.matchPatch as Record<string, unknown> | undefined;
      return {
        match: {
          id: task.matchId,
          status: patch?.status || 'waiting',
          config: { debugMode: false },
          error: patch?.error_json ? JSON.parse(String(patch.error_json)) : null,
        },
        events: change.events || [],
      };
    });
    replace(tick, 'tickMatch', () => {
      throw new Error('epoch conflict');
    });

    const match = completeAiTask(task.id, { payload: { target: 1 } });

    assert.equal(currentTask.status, 'succeeded');
    assert.equal(updates.some((patch) => patch.status === 'retrying' || patch.status === 'failed'), false);
    assert.equal(match.status, 'paused_debug');
    assert.equal(commits.length, 2);
    assert.equal((commits[1].events as Array<Record<string, unknown>>)[0].type, 'workflow_advance_failed');
  } finally {
    replace(repo, 'getAiTask', original.getAiTask);
    replace(repo, 'getMatch', original.getMatch);
    replace(repo, 'updateAiTask', original.updateAiTask);
    replace(repo, 'commitWorkflowChange', original.commitWorkflowChange);
    replace(tick, 'tickMatch', original.tickMatch);
  }
});

test('drain continues ticking a running unblocked match after tick budget exhaustion', async () => {
  const original = {
    claimNextAiTask: repo.claimNextAiTask,
    getMatch: repo.getMatch,
    tickMatch: tick.tickMatch,
  };
  let current = {
    id: 'match-budget-exhausted',
    status: 'running',
    version: 1,
    blockers: [] as Array<Record<string, unknown>>,
  };
  let ticks = 0;

  try {
    replace(repo, 'claimNextAiTask', () => null);
    replace(repo, 'getMatch', () => current);
    replace(tick, 'tickMatch', () => {
      ticks += 1;
      current = { ...current, status: 'waiting', version: 2, blockers: [{ type: 'AI_TASK' }] };
      return current;
    });

    const result = await drainAiTasks(current.id, { maxTasks: 1 });

    assert.equal(ticks, 1);
    assert.equal(result.processed, 1);
    assert.equal(result.match?.status, 'waiting');
  } finally {
    replace(repo, 'claimNextAiTask', original.claimNextAiTask);
    replace(repo, 'getMatch', original.getMatch);
    replace(tick, 'tickMatch', original.tickMatch);
  }
});

test('workflow runtime owns the run-until-blocked driver contract', async () => {
  const originalDrain = workflowService.drainAiTasks;
  const results = [
    { processed: 3, match: { id: 'runtime-match', status: 'running' } },
    { processed: 1, match: { id: 'runtime-match', status: 'completed' } },
  ];
  const received: unknown[] = [];

  try {
    replace(workflowService, 'drainAiTasks', async (matchId: string, options: Record<string, unknown>) => {
      received.push({ matchId, options });
      return results.shift();
    });

    const runtime = new WorkflowRuntime();
    const result = await runtime.runUntilBlocked('runtime-match', { batchSize: 3 });

    assert.deepEqual(received, [
      { matchId: 'runtime-match', options: { maxTasks: 3, workerId: undefined } },
      { matchId: 'runtime-match', options: { maxTasks: 3, workerId: undefined } },
    ]);
    assert.equal(result.processed, 4);
    assert.equal(result.match?.status, 'completed');
  } finally {
    replace(workflowService, 'drainAiTasks', originalDrain);
  }
});

function replace(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}
