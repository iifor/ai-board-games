const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { MATCH_STATUS } = require('../../shared/types/workflowTypes');

test('tick honors step handler matchStatus completed before workflow is exhausted', () => {
  const workspace = path.resolve(__dirname, '../..');
  const dbPath = path.join(workspace, 'server/db/index.js');
  const repoPath = path.join(workspace, 'server/modules/workflow-engine/repository.js');
  const registryPath = path.join(workspace, 'server/modules/workflow-engine/workflowRegistry.js');
  const tickPath = path.join(workspace, 'server/modules/workflow-engine/tick.js');
  const originals = new Map([dbPath, repoPath, registryPath, tickPath].map((file) => [file, require.cache[file]]));

  let match = {
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
  const events = [];

  try {
    delete require.cache[tickPath];
    require.cache[dbPath] = {
      id: dbPath,
      filename: dbPath,
      loaded: true,
      exports: { getDb: () => ({ transaction: (fn) => fn }) }
    };
    require.cache[repoPath] = {
      id: repoPath,
      filename: repoPath,
      loaded: true,
      exports: {
        getMatch: () => match,
        commitWorkflowChange: ({ events: nextEvents = [], matchPatch = null }) => {
          events.push(...nextEvents);
          if (matchPatch) {
            match = {
              ...match,
              status: matchPatch.status,
              currentStepIndex: matchPatch.current_step_index,
              version: matchPatch.version,
              state: JSON.parse(matchPatch.state_json),
              blockers: JSON.parse(matchPatch.blockers_json),
              completedAt: matchPatch.completed_at
            };
          }
          return { match, events: nextEvents };
        },
        updateMatch: () => {},
        listAiTasks: () => [],
        listPendingActions: () => []
      }
    };
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
    };

    const { tickMatch } = require(tickPath);
    const updated = tickMatch('match-1');

    assert.equal(updated.status, MATCH_STATUS.COMPLETED);
    assert.equal(updated.currentStepIndex, workflow.steps.length);
    assert.equal(updated.state.winner, 'good');
    assert.equal(events.some((event) => event.type === 'winner_decided'), true);
  } finally {
    for (const [file, original] of originals.entries()) {
      if (original) require.cache[file] = original;
      else delete require.cache[file];
    }
  }
});
