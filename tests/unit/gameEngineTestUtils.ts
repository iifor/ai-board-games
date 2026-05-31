import type {
  ActionWindowSnapshot,
  DomainEvent,
  MatchSnapshot,
  WorkflowEffect,
} from '../../packages/shared/types/gameEngine';
import type { MatchStateStore } from '../../packages/server/modules/game-engine';

class MemoryMatchStateStore implements MatchStateStore {
  private matches = new Map<string, MatchSnapshot>();
  private windows = new Map<string, ActionWindowSnapshot>();
  private events = new Map<string, DomainEvent[]>();
  private effects = new Map<string, WorkflowEffect>();
  private nextSeq = new Map<string, number>();

  addMatch(match: MatchSnapshot): void {
    this.matches.set(match.id, match);
  }

  addActionWindow(window: ActionWindowSnapshot): void {
    this.windows.set(`${window.matchId}:${window.id}`, window);
  }

  loadMatch(matchId: string): MatchSnapshot | null {
    return this.matches.get(matchId) || null;
  }

  appendEvents(events: DomainEvent[]): DomainEvent[] {
    return events.map((event) => {
      const existing = this.findExistingEvent(event);
      if (existing) return existing;
      const seq = (this.nextSeq.get(event.matchId) || 0) + 1;
      this.nextSeq.set(event.matchId, seq);
      const stored: DomainEvent = {
        ...event,
        id: event.id,
        seq,
        createdAt: event.createdAt || new Date().toISOString(),
      };
      const list = this.events.get(event.matchId) || [];
      list.push(stored);
      this.events.set(event.matchId, list);
      return stored;
    });
  }

  listEvents(matchId: string): DomainEvent[] {
    return [...(this.events.get(matchId) || [])];
  }

  listActionWindows(matchId: string): ActionWindowSnapshot[] {
    return [...this.windows.values()].filter((window) => window.matchId === matchId);
  }

  getActionWindow(matchId: string, windowId: string): ActionWindowSnapshot | null {
    return this.windows.get(`${matchId}:${windowId}`) || null;
  }

  enqueueEffect(effect: WorkflowEffect): WorkflowEffect {
    const existing = this.effects.get(effect.id);
    if (existing) return existing;
    this.effects.set(effect.id, effect);
    return effect;
  }

  listEffects(matchId: string, status?: string): WorkflowEffect[] {
    return [...this.effects.values()]
      .filter((effect) => effect.matchId === matchId)
      .filter((effect) => !status || effect.status === status);
  }

  updateEffect(effectId: string, patch: Partial<WorkflowEffect>): WorkflowEffect | null {
    const existing = this.effects.get(effectId);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    this.effects.set(effectId, next);
    return next;
  }

  private findExistingEvent(event: DomainEvent): DomainEvent | null {
    if (!event.idempotencyKey) return null;
    return (this.events.get(event.matchId) || [])
      .find((stored) => stored.idempotencyKey === event.idempotencyKey) || null;
  }
}

function createMatch(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    id: 'match-test',
    gameType: 'werewolf',
    workflowId: 'werewolf.workflow.basic.v1',
    status: 'running',
    currentStepIndex: 0,
    version: 1,
    config: { gameDefinitionVersion: '1.0.0' },
    state: {},
    ...overrides,
  };
}

function createWindow(overrides: Partial<ActionWindowSnapshot> = {}): ActionWindowSnapshot {
  return {
    id: 'window-test',
    matchId: 'match-test',
    stepId: 'step-test',
    actionType: 'seer_check',
    status: 'open',
    actorIds: [3],
    targetIds: [8],
    ...overrides,
  };
}

export { MemoryMatchStateStore, createMatch, createWindow };
