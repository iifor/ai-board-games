import test from 'node:test';
import assert from 'node:assert/strict';
import * as repo from '../../packages/server/modules/workflow-engine/repository';
import { hydrateMatchFromEventStore } from '../../packages/server/modules/workflow-engine/projection';

type RepoPatch = Pick<typeof repo, 'getLatestSnapshot' | 'listEvents'>;

test('event projection hydrates match from latest snapshot and later events', () => {
  const original = snapshotRepo(repo);
  try {
    patchRepo(repo, {
      getLatestSnapshot: () => ({
        id: 1,
        matchId: 'm-projection',
        version: 2,
        status: 'waiting',
        currentStepIndex: 3,
        state: { source: 'snapshot', score: 1 },
        blockers: [],
        createdAt: '2026-05-27T10:00:00.000Z',
      }),
      listEvents: () => [{
        id: 1,
        matchId: 'm-projection',
        seq: 8,
        type: 'workflow_step_completed',
        stepId: 's4',
        playerId: undefined,
        payload: {
          projectedState: { source: 'event', score: 2 },
          currentStepIndex: 4,
          blockers: [{ id: 'b1', type: 'AI_TASK', required: true, status: 'pending' }],
          status: 'waiting',
        },
        visibility: 'public',
        visibleToPlayerIds: [],
        idempotencyKey: undefined,
        createdAt: '2026-05-27T10:00:01.000Z',
      }],
    });

    const hydrated = hydrateMatchFromEventStore({
      id: 'm-projection',
      gameType: 'test',
      workflowId: 'wf',
      status: 'running',
      currentStepIndex: 0,
      version: 3,
      config: {},
      state: { source: 'stale-row' },
      blockers: [],
      error: null,
      createdAt: '',
      updatedAt: '',
      completedAt: undefined,
    });

    assert.deepEqual(hydrated.state, { source: 'event', score: 2 });
    assert.equal(hydrated.currentStepIndex, 4);
    assert.equal(hydrated.blockers.length, 1);
  } finally {
    patchRepo(repo, original);
  }
});

function snapshotRepo(target: typeof repo): RepoPatch {
  return {
    getLatestSnapshot: target.getLatestSnapshot,
    listEvents: target.listEvents,
  };
}

function patchRepo(target: typeof repo, patch: Partial<RepoPatch>): void {
  Object.assign(target, patch);
}
