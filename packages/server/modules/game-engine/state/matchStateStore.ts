import type {
  ActionWindowSnapshot,
  DomainEvent,
  EngineStoreDebugState,
  MatchSnapshot,
  WorkflowEffect,
} from '@ai-presenter/shared/types/gameEngine';

interface MatchStateStore {
  loadMatch(matchId: string): Promise<MatchSnapshot | null>;
  appendEvents(events: DomainEvent[]): Promise<DomainEvent[]>;
  listEvents(matchId: string): Promise<DomainEvent[]>;
  listActionWindows(matchId: string): Promise<ActionWindowSnapshot[]>;
  getActionWindow(matchId: string, windowId: string): Promise<ActionWindowSnapshot | null>;
  saveMatchState(matchId: string, state: Record<string, unknown>): Promise<MatchSnapshot | null>;
  enqueueEffect(effect: WorkflowEffect): Promise<WorkflowEffect>;
  listEffects(matchId: string, status?: string): Promise<WorkflowEffect[]>;
  updateEffect(effectId: string, patch: Partial<WorkflowEffect>): Promise<WorkflowEffect | null>;
  getDebugState(matchId: string): Promise<EngineStoreDebugState>;
}

export type { MatchStateStore };
