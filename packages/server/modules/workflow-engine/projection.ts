import * as repo from './repository';
import type { Match, MatchSnapshot, StepBlocker, WorkflowEvent } from '../../types/workflow';

interface ProjectedPayload {
  projectedState?: Record<string, unknown>;
  statePatch?: Record<string, unknown>;
  currentStepIndex?: number;
  blockers?: StepBlocker[];
  status?: string;
  state?: Record<string, unknown>;
  [key: string]: unknown;
}

function hydrateMatchFromEventStore(match: Match): Match {
  const snapshot = repo.getLatestSnapshot(match.id);
  if (!snapshot) return match;
  const events = eventsAfterSnapshot(match.id, snapshot);
  return events.reduce(applyProjectionEvent, {
    ...match,
    status: snapshot.status || match.status,
    currentStepIndex: Number(snapshot.currentStepIndex ?? match.currentStepIndex),
    state: snapshot.state || {},
    blockers: snapshot.blockers || [],
  });
}

function eventsAfterSnapshot(matchId: string, snapshot: MatchSnapshot): WorkflowEvent[] {
  return repo.listEvents(matchId).filter((event) => {
    if (!snapshot.createdAt) return true;
    return String(event.createdAt || '') > String(snapshot.createdAt);
  });
}

function applyProjectionEvent(match: Match, event: WorkflowEvent): Match {
  const payload = normalizePayload(event.payload);
  let state = match.state || {};
  if (payload.projectedState && typeof payload.projectedState === 'object') {
    state = payload.projectedState;
  } else if (payload.statePatch && typeof payload.statePatch === 'object') {
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

function withProjectedState<T extends { payload?: unknown }>(
  event: T,
  state: Record<string, unknown>,
): T {
  const payload = normalizePayload(event.payload);
  return {
    ...event,
    payload: {
      ...payload,
      projectedState: state,
    },
  };
}

function normalizePayload(payload: unknown): ProjectedPayload {
  return payload && typeof payload === 'object' ? payload as ProjectedPayload : {};
}

export {
  hydrateMatchFromEventStore,
  withProjectedState,
};
