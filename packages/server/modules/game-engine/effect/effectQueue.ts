import type { WorkflowEffect } from '@ai-presenter/shared/types/gameEngine';
import type { MatchStateStore } from '../state/matchStateStore';

class EffectQueue {
  private store: MatchStateStore;

  constructor(store: MatchStateStore) {
    this.store = store;
  }

  enqueue(effect: WorkflowEffect): WorkflowEffect {
    if (!effect.id || !effect.matchId || !effect.effectType) {
      throw new Error('WorkflowEffect requires id, matchId, and effectType.');
    }
    return this.store.enqueueEffect({
      ...effect,
      status: effect.status || 'proposed',
      payload: effect.payload || {},
    });
  }

  enqueueMany(effects: WorkflowEffect[]): WorkflowEffect[] {
    return effects.map((effect) => this.enqueue(effect));
  }

  listProposed(matchId: string): WorkflowEffect[] {
    return this.store.listEffects(matchId, 'proposed');
  }
}

export { EffectQueue };
