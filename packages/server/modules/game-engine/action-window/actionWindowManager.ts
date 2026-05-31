import type { DomainAction, EngineResult } from '@ai-presenter/shared/types/gameEngine';
import type { MatchStateStore } from '../state/matchStateStore';

class ActionWindowManager {
  private store: MatchStateStore;

  constructor(store: MatchStateStore) {
    this.store = store;
  }

  submitAction(action: DomainAction): EngineResult<DomainAction> {
    const window = this.store.getActionWindow(action.matchId, action.windowId);
    if (!window) {
      return failure('ACTION_WINDOW_NOT_FOUND', `ActionWindow not found: ${action.windowId}`);
    }
    if (window.status !== 'open') {
      return failure('ACTION_WINDOW_CLOSED', `ActionWindow is not open: ${action.windowId}`);
    }
    if (window.actionType !== action.actionType) {
      return failure('ACTION_TYPE_MISMATCH', `Action ${action.actionType} does not match window ${window.actionType}.`);
    }
    if (window.actorIds.length && !window.actorIds.some((id) => String(id) === String(action.actorId))) {
      return failure('ACTOR_NOT_ALLOWED', `Actor ${action.actorId} is not allowed in window ${action.windowId}.`);
    }
    return { ok: true, data: action };
  }
}

function failure<T = never>(code: string, message: string): EngineResult<T> {
  return { ok: false, error: { code, message } };
}

export { ActionWindowManager };
