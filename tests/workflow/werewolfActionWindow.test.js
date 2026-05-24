const test = require('node:test');
const assert = require('node:assert/strict');
const repo = require('../../server/modules/workflow-engine/repository');
const {
  buildActionWindow,
  createActionBlockers,
  collectActionResults,
  allActionWorkSucceeded
} = require('../../server/modules/werewolf/actionWindows');

test('action window creates AI task and human pending action blockers', () => {
  const original = snapshotRepo(repo);
  const epochs = [];
  try {
    repo.upsertActionWindowEpoch = (epoch) => epochs.push(epoch);
    repo.listEvents = () => [{ seq: 7 }];
    repo.listAiTasks = () => [];
    repo.listPendingActions = () => [];

    const match = { id: 'm1' };
    const step = { id: 'wolf_kill_1', config: { day: 1, phase: 'night' } };
    const actors = [{ id: 1 }, { id: 2, actorType: 'human' }];
    const window = buildActionWindow({ match, step, actionType: 'wolf_kill', actors, targetIds: [3, 4] });
    const work = createActionBlockers({ match, step, window, actors });

    assert.equal(epochs.length, 1);
    assert.equal(work.tasks.length, 1);
    assert.equal(work.pendingActions.length, 1);
    assert.equal(work.blockers[0].type, 'AI_TASK');
    assert.equal(work.blockers[1].type, 'HUMAN_ACTION');
    assert.equal(work.tasks[0].visibleEventSeqMax, 7);
  } finally {
    restoreRepo(repo, original);
  }
});

test('action window result collection merges AI and human submissions', () => {
  const original = snapshotRepo(repo);
  try {
    repo.listAiTasks = () => [{
      stepId: 'day_vote_1',
      action: 'day_vote',
      status: 'succeeded',
      playerId: 1,
      result: { payload: { target: 3 } }
    }];
    repo.listPendingActions = () => [{
      stepId: 'day_vote_1',
      actionType: 'day_vote',
      status: 'submitted',
      playerId: 2,
      payload: { target: 3 }
    }];

    const results = collectActionResults('m1', 'day_vote_1', 'day_vote');
    assert.deepEqual(results.map((item) => item.actorId), [1, 2]);
    assert.equal(allActionWorkSucceeded('m1', 'day_vote_1', 'day_vote', 2), true);
  } finally {
    restoreRepo(repo, original);
  }
});

function snapshotRepo(target) {
  return {
    upsertActionWindowEpoch: target.upsertActionWindowEpoch,
    listEvents: target.listEvents,
    listAiTasks: target.listAiTasks,
    listPendingActions: target.listPendingActions
  };
}

function restoreRepo(target, original) {
  Object.assign(target, original);
}
