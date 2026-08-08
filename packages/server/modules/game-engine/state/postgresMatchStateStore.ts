import * as repo from '../../workflow-engine/repository';
import type {
  ActionWindowSnapshot,
  DomainEvent,
  EngineStoreDebugState,
  MatchSnapshot,
  WorkflowEffect as EngineWorkflowEffect,
} from '@ai-presenter/shared/types/gameEngine';
import type {
  ActionWindowEpoch,
  Match,
  WorkflowEffect as StoredWorkflowEffect,
  WorkflowEvent,
} from '../../../types/workflow';
import type { MatchStateStore } from './matchStateStore';

class PostgresMatchStateStore implements MatchStateStore {
  async loadMatch(matchId: string): Promise<MatchSnapshot | null> {
    return toMatchSnapshot(await repo.getMatch(matchId));
  }

  async appendEvents(events: DomainEvent[]): Promise<DomainEvent[]> {
    if (!events.length) return [];
    const matchIds = new Set(events.map((event) => event.matchId));
    if (matchIds.size !== 1) throw new Error('appendEvents requires one matchId per batch');

    const { events: rows } = await repo.commitWorkflowChange({
      matchId: events[0].matchId,
      events: events.map((event) => ({
        type: event.type,
        stepId: event.stepId,
        playerId: event.actorId,
        payload: event.payload,
        channel: event.channel,
        scopeKey: event.scopeKey,
        visibility: toVisibility(event.channel),
        idempotencyKey: event.idempotencyKey || event.id,
      })),
    });
    return rows.map(toDomainEvent);
  }

  async listEvents(matchId: string): Promise<DomainEvent[]> {
    return (await repo.listEvents(matchId)).map(toDomainEvent);
  }

  async listActionWindows(matchId: string): Promise<ActionWindowSnapshot[]> {
    return (await repo.listActionWindowEpochs(matchId)).map(toActionWindowSnapshot);
  }

  async getActionWindow(matchId: string, windowId: string): Promise<ActionWindowSnapshot | null> {
    return (await this.listActionWindows(matchId)).find((window) => window.id === windowId) || null;
  }

  async saveMatchState(matchId: string, state: Record<string, unknown>): Promise<MatchSnapshot | null> {
    await repo.updateMatch(matchId, {
      state_json: JSON.stringify(state),
    });
    return this.loadMatch(matchId);
  }

  async enqueueEffect(effect: EngineWorkflowEffect): Promise<EngineWorkflowEffect> {
    const stored = await repo.createWorkflowEffect({
      id: effect.id,
      matchId: effect.matchId,
      stepId: effect.stepId,
      sourceEventSeq: effect.sourceEventSeq,
      effectType: effect.effectType,
      status: effect.status || 'proposed',
      priority: effect.priority || 0,
      payload: effect.payload,
      appliedEventSeq: effect.appliedEventSeq,
    });
    if (!stored) throw new Error(`Workflow effect was not persisted: ${effect.id}`);
    return toEngineEffect(stored);
  }

  async listEffects(matchId: string, status?: string): Promise<EngineWorkflowEffect[]> {
    return (await repo.listWorkflowEffects(matchId))
      .filter((effect) => !status || effect.status === status)
      .map(toEngineEffect);
  }

  async updateEffect(effectId: string, patch: Partial<EngineWorkflowEffect>): Promise<EngineWorkflowEffect | null> {
    const stored = await repo.updateWorkflowEffect(effectId, {
      status: patch.status,
      priority: patch.priority,
      payload_json: patch.payload === undefined ? undefined : JSON.stringify(patch.payload),
      applied_event_seq: patch.appliedEventSeq,
    });
    return stored ? toEngineEffect(stored) : null;
  }

  async getDebugState(matchId: string): Promise<EngineStoreDebugState> {
    return {
      match: await this.loadMatch(matchId),
      actionWindows: await this.listActionWindows(matchId),
      effects: await this.listEffects(matchId),
      events: await this.listEvents(matchId),
      generatedAt: new Date().toISOString(),
    };
  }
}

function toMatchSnapshot(match: Match | null): MatchSnapshot | null {
  if (!match) return null;
  return {
    id: match.id,
    gameType: match.gameType,
    workflowId: match.workflowId,
    status: match.status,
    currentStepIndex: Number(match.currentStepIndex || 0),
    version: Number(match.version || 0),
    config: match.config || {},
    state: match.state || {},
  };
}

function toDomainEvent(event: WorkflowEvent): DomainEvent {
  return {
    id: String(event.id),
    matchId: event.matchId,
    seq: event.seq,
    type: event.type,
    stepId: event.stepId,
    actorId: event.playerId,
    payload: toRecord(event.payload),
    channel: event.channel as DomainEvent['channel'],
    scopeKey: event.scopeKey,
    idempotencyKey: event.idempotencyKey,
    createdAt: event.createdAt,
  };
}

function toActionWindowSnapshot(epoch: ActionWindowEpoch): ActionWindowSnapshot {
  const window = toRecord(epoch.window);
  return {
    id: epoch.id,
    matchId: epoch.matchId,
    stepId: epoch.stepId,
    actionType: epoch.actionType,
    status: epoch.status,
    actorIds: Array.isArray(window.actorIds) ? window.actorIds as ActionWindowSnapshot['actorIds'] : [],
    targetIds: Array.isArray(window.targetIds) ? window.targetIds as ActionWindowSnapshot['targetIds'] : [],
    orderMode: typeof window.orderMode === 'string' ? window.orderMode : undefined,
    completionPolicy: typeof window.completionPolicy === 'string' ? window.completionPolicy : undefined,
    payload: window,
    createdAt: epoch.createdAt,
    updatedAt: epoch.updatedAt,
  };
}

function toEngineEffect(effect: StoredWorkflowEffect): EngineWorkflowEffect {
  const payload = toRecord(effect.payload);
  return {
    id: effect.id,
    matchId: effect.matchId,
    stepId: effect.stepId,
    sourceEventSeq: effect.sourceEventSeq,
    effectType: effect.effectType,
    status: effect.status as EngineWorkflowEffect['status'],
    priority: effect.priority,
    payload,
    appliedEventSeq: effect.appliedEventSeq,
    sourceActionId: typeof payload.sourceActionId === 'string' ? payload.sourceActionId : undefined,
    causationId: typeof payload.causationId === 'string' ? payload.causationId : undefined,
    correlationId: typeof payload.correlationId === 'string' ? payload.correlationId : undefined,
    createdAt: effect.createdAt,
    updatedAt: effect.updatedAt,
  };
}

function toVisibility(channel: string): string {
  if (channel === 'public') return 'public';
  if (channel === 'system') return 'system';
  return 'private';
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export { PostgresMatchStateStore };
