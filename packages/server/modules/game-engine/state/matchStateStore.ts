import type {
  ActionWindowSnapshot,
  DomainEvent,
  MatchSnapshot,
  WorkflowEffect,
} from '@ai-presenter/shared/types/gameEngine';

interface MatchStateStore {
  loadMatch(matchId: string): MatchSnapshot | null;
  appendEvents(events: DomainEvent[]): DomainEvent[];
  listEvents(matchId: string): DomainEvent[];
  listActionWindows(matchId: string): ActionWindowSnapshot[];
  getActionWindow(matchId: string, windowId: string): ActionWindowSnapshot | null;
  enqueueEffect(effect: WorkflowEffect): WorkflowEffect;
  listEffects(matchId: string, status?: string): WorkflowEffect[];
  updateEffect(effectId: string, patch: Partial<WorkflowEffect>): WorkflowEffect | null;
}

export type { MatchStateStore };
