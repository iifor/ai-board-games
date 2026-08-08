import type { WorkflowEffect } from '@ai-presenter/shared/types/gameEngine';
import type { MatchStateStore } from '../state/matchStateStore';

class EffectQueue {
  private store: MatchStateStore;

  constructor(store: MatchStateStore) {
    this.store = store;
  }

  async enqueue(effect: WorkflowEffect): Promise<WorkflowEffect> {
    if (!effect.id || !effect.matchId || !effect.effectType) {
      throw new Error('WorkflowEffect requires id, matchId, and effectType.');
    }
    return this.store.enqueueEffect({
      ...effect,
      status: effect.status || 'proposed',
      payload: effect.payload || {},
    });
  }

  async enqueueMany(effects: WorkflowEffect[]): Promise<WorkflowEffect[]> {
    return Promise.all(effects.map((effect) => this.enqueue(effect)));
  }

  async listProposed(matchId: string): Promise<WorkflowEffect[]> {
    return this.store.listEffects(matchId, 'proposed');
  }
}

export { EffectQueue };
