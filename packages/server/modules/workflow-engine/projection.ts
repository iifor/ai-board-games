import * as repo from './repository';
import { applyStatePatch, createStatePatch, deepEqual, isStatePatch } from './statePatch';
import type { Match, MatchSnapshot, StepBlocker, WorkflowEvent } from '../../types/workflow';
import type { DbExecutor } from '../../db/types';

interface ProjectedPayload {
  projectedState?: Record<string, unknown>;
  statePatch?: Record<string, unknown>;
  currentStepIndex?: number;
  blockers?: StepBlocker[];
  status?: string;
  state?: Record<string, unknown>;
  [key: string]: unknown;
}

async function hydrateMatchFromEventStore(match: Match, db?: DbExecutor): Promise<Match> {
  const snapshot = await repo.getLatestSnapshot(match.id, db);
  if (!snapshot) return match;
  const events = await eventsAfterSnapshot(match.id, snapshot, db);
  const hydrated = events.reduce(applyProjectionEvent, {
    ...match,
    status: snapshot.status || match.status,
    currentStepIndex: Number(snapshot.currentStepIndex ?? match.currentStepIndex),
    state: snapshot.state || {},
    blockers: snapshot.blockers || [],
  });
  if (!deepEqual(hydrated.state, match.state)) {
    console.warn(JSON.stringify({
      type: 'workflow-projection-mismatch',
      matchId: match.id,
      snapshotId: snapshot.id,
      lastEventSeq: snapshot.lastEventSeq || null,
      replayedEventCount: events.length,
      resolution: 'matches.state_json',
    }));
    return {
      ...hydrated,
      status: match.status,
      currentStepIndex: match.currentStepIndex,
      state: match.state,
      blockers: match.blockers,
    };
  }
  return hydrated;
}

async function eventsAfterSnapshot(matchId: string, snapshot: MatchSnapshot, db?: DbExecutor): Promise<WorkflowEvent[]> {
  if (snapshot.lastEventSeq != null) {
    return repo.listEventsAfter(matchId, snapshot.lastEventSeq, db);
  }
  return (await repo.listEvents(matchId, db)).filter((event) => {
    if (!snapshot.createdAt) return true;
    return String(event.createdAt || '') > String(snapshot.createdAt);
  });
}

function applyProjectionEvent(match: Match, event: WorkflowEvent): Match {
  const payload = normalizePayload(event.payload);
  let state = match.state || {};
  if (payload.projectedState && typeof payload.projectedState === 'object') {
    state = payload.projectedState;
  } else if (isStatePatch(payload.statePatch)) {
    state = applyStatePatch(state, payload.statePatch);
  } else if (payload.statePatch && typeof payload.statePatch === 'object') {
    // Legacy shallow statePatch compatibility.
    state = { ...state, ...payload.statePatch };
  } else if (event.type === 'match_completed' && payload.state && typeof payload.state === 'object') {
    state = payload.state;
  }
  return {
    ...match,
    status: typeof payload.status === 'string' ? payload.status : match.status,
    currentStepIndex: Number.isFinite(Number(payload.currentStepIndex))
      ? Number(payload.currentStepIndex)
      : match.currentStepIndex,
    blockers: Array.isArray(payload.blockers) ? payload.blockers : match.blockers,
    state,
  };
}

function withStatePatch<T extends { payload?: unknown }>(
  event: T,
  previousState: Record<string, unknown>,
  nextState: Record<string, unknown>,
  projection: {
    currentStepIndex?: number;
    blockers?: StepBlocker[];
    status?: string;
  } = {},
): T {
  const payload = normalizePayload(event.payload);
  const statePatch = createStatePatch(previousState, nextState);
  return {
    ...event,
    payload: {
      ...payload,
      ...(statePatch ? { statePatch } : {}),
      ...projection,
    },
  };
}

function normalizePayload(payload: unknown): ProjectedPayload {
  return payload && typeof payload === 'object' ? payload as ProjectedPayload : {};
}

export {
  hydrateMatchFromEventStore,
  withStatePatch,
  applyProjectionEvent,
  eventsAfterSnapshot,
};
