import test from 'node:test';
import assert from 'node:assert/strict';
import * as repo from '../../packages/server/modules/workflow-engine/repository';
import { hydrateMatchFromEventStore } from '../../packages/server/modules/workflow-engine/projection';
import { createStatePatch } from '../../packages/server/modules/workflow-engine/statePatch';
import type { Match, WorkflowEvent } from '../../packages/server/types/workflow';

type RepoPatch = Pick<typeof repo, 'getLatestSnapshot' | 'listEvents' | 'listEventsAfter'>;

test('event projection hydrates from snapshot watermark and incremental state patch', () => {
  const original = snapshotRepo(repo);
  let requestedAfterSeq = -1;
  try {
    patchRepo(repo, {
      getLatestSnapshot: () => ({
        id: 1,
        matchId: 'm-projection',
        version: 2,
        status: 'waiting',
        currentStepIndex: 3,
        lastEventSeq: 7,
        state: { source: 'snapshot', score: 1, removed: true },
        blockers: [],
        createdAt: '2026-05-27T10:00:00.000Z',
      }),
      listEventsAfter: (_matchId, afterSeq) => {
        requestedAfterSeq = afterSeq;
        return [eventWithPatch(8, {
          set: [
            { path: ['source'], value: 'event' },
            { path: ['score'], value: 2 },
          ],
          remove: [['removed']],
        })];
      },
    });

    const hydrated = hydrateMatchFromEventStore(matchWithState({
      source: 'event',
      score: 2,
    }));

    assert.equal(requestedAfterSeq, 7);
    assert.deepEqual(hydrated.state, { source: 'event', score: 2 });
    assert.equal(hydrated.currentStepIndex, 4);
  } finally {
    patchRepo(repo, original);
  }
});

test('legacy snapshots without watermark continue using timestamp filtering', () => {
  const original = snapshotRepo(repo);
  try {
    patchRepo(repo, {
      getLatestSnapshot: () => ({
        id: 2,
        matchId: 'm-projection',
        version: 1,
        status: 'waiting',
        currentStepIndex: 1,
        state: { score: 1 },
        blockers: [],
        createdAt: '2026-05-27T10:00:00.000Z',
      }),
      listEvents: () => [
        eventWithPatch(1, createStatePatch({ score: 0 }, { score: 1 })!, '2026-05-27T09:59:59.000Z'),
        eventWithPatch(2, createStatePatch({ score: 1 }, { score: 2 })!, '2026-05-27T10:00:01.000Z'),
      ],
    });

    const hydrated = hydrateMatchFromEventStore(matchWithState({ score: 2 }));
    assert.deepEqual(hydrated.state, { score: 2 });
  } finally {
    patchRepo(repo, original);
  }
});

test('projection mismatch falls back to matches.state_json', () => {
  const original = snapshotRepo(repo);
  try {
    patchRepo(repo, {
      getLatestSnapshot: () => ({
        id: 3,
        matchId: 'm-projection',
        version: 2,
        status: 'waiting',
        currentStepIndex: 3,
        lastEventSeq: 7,
        state: { score: 1 },
        blockers: [],
        createdAt: '2026-05-27T10:00:00.000Z',
      }),
      listEventsAfter: () => [],
    });

    const hydrated = hydrateMatchFromEventStore(matchWithState({ score: 9 }));
    assert.deepEqual(hydrated.state, { score: 9 });
  } finally {
    patchRepo(repo, original);
  }
});

function matchWithState(state: Record<string, unknown>): Match {
  return {
    id: 'm-projection',
    gameType: 'test',
    workflowId: 'wf',
    status: 'running',
    currentStepIndex: 4,
    version: 3,
    config: {},
    state,
    blockers: [],
    error: null,
    createdAt: '',
    updatedAt: '',
    completedAt: undefined,
  };
}

function eventWithPatch(
  seq: number,
  statePatch: NonNullable<ReturnType<typeof createStatePatch>>,
  createdAt = '2026-05-27T10:00:01.000Z',
): WorkflowEvent {
  return {
    id: seq,
    matchId: 'm-projection',
    seq,
    type: 'workflow_state_patched',
    stepId: 's4',
    playerId: undefined,
    payload: {
      statePatch,
      currentStepIndex: 4,
      blockers: [],
      status: 'running',
    },
    visibility: 'system',
    channel: 'system',
    scopeKey: undefined,
    visibleToPlayerIds: [],
    idempotencyKey: undefined,
    createdAt,
  };
}

function snapshotRepo(target: typeof repo): RepoPatch {
  return {
    getLatestSnapshot: target.getLatestSnapshot,
    listEvents: target.listEvents,
    listEventsAfter: target.listEventsAfter,
  };
}

function patchRepo(target: typeof repo, patch: Partial<RepoPatch>): void {
  Object.assign(target, patch);
}
