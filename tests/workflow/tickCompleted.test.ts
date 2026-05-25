import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { MATCH_STATUS } from '@ai-presenter/shared/types/workflowTypes';

test('tick honors step handler matchStatus completed before workflow is exhausted', () => {
  const workspace = path.resolve(__dirname, '../..');
  const dbPath = path.join(workspace, 'packages/server/db/index.ts');
  const repoPath = path.join(workspace, 'packages/server/modules/workflow-engine/repository.ts');
  const registryPath = path.join(workspace, 'packages/server/modules/workflow-engine/workflowRegistry.ts');
  const tickPath = path.join(workspace, 'packages/server/modules/workflow-engine/tick.ts');
  const originals = new Map([dbPath, repoPath, registryPath, tickPath].map((file) => [file, require.cache[file]]));

  let match: Record<string, unknown> = {
    id: 'match-1',
    workflowId: 'wf',
    status: MATCH_STATUS.RUNNING,
    currentStepIndex: 0,
    version: 0,
    state: {},
    blockers: []
  };
  const workflow = {
    id: 'wf',
    steps: [
      { id: 'finish_now', type: 'finish' },
      { id: 'should_not_run', type: 'later' }
    ]
  };
  const events: Array<Record<string, unknown>> = [];

  try {
    delete require.cache[tickPath];
    require.cache[dbPath] = {
      id: dbPath,
      filename: dbPath,
      loaded: true,
      exports: { getDb: () => ({ transaction: (fn: () => unknown) => fn }) }
    } as NodeModule;
    require.cache[repoPath] = {
      id: repoPath,
      filename: repoPath,
      loaded: true,
      exports: {
        getMatch: () => match,
        commitWorkflowChange: ({ events: nextEvents = [], matchPatch = null }: { events?: Array<Record<string, unknown>>; matchPatch?: Record<string, unknown> | null }) => {
          events.push(...nextEvents);
          if (matchPatch) {
            match = {
              ...match,
              status: matchPatch.status,
              currentStepIndex: matchPatch.current_step_index,
              version: matchPatch.version,
              state: JSON.parse(String(matchPatch.state_json)),
              blockers: JSON.parse(String(matchPatch.blockers_json)),
              completedAt: matchPatch.completed_at
            };
          }
          return { match, events: nextEvents };
        },
        updateMatch: () => {},
        listAiTasks: () => [],
        listPendingActions: () => []
      }
    } as NodeModule;
    require.cache[registryPath] = {
      id: registryPath,
      filename: registryPath,
      loaded: true,
      exports: {
        getWorkflow: () => workflow,
        getStepHandler: () => ({
          execute: () => ({
            status: 'COMPLETED',
            matchStatus: MATCH_STATUS.COMPLETED,
            state: { winner: 'good' },
            events: [{ type: 'winner_decided', payload: {} }]
          })
        })
      }
    } as NodeModule;

    const { tickMatch } = require(tickPath) as { tickMatch: (matchId: string) => Record<string, unknown> };
    const updated = tickMatch('match-1');

    assert.equal(updated.status, MATCH_STATUS.COMPLETED);
    assert.equal(updated.currentStepIndex, workflow.steps.length);
    assert.equal((updated.state as Record<string, unknown>).winner, 'good');
    assert.equal(events.some((event) => event.type === 'winner_decided'), true);
  } finally {
    for (const [file, original] of originals.entries()) {
      if (original) require.cache[file] = original;
      else delete require.cache[file];
    }
  }
});
