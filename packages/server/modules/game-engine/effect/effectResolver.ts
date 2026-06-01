import type {
  DomainEvent,
  EffectResolver,
  MatchSnapshot,
  ProjectStateFromEvent,
  WorkflowEffect,
} from '@ai-presenter/shared/types/gameEngine';
import { ChannelSystem } from '../channel/channelSystem';
import type { MatchStateStore } from '../state/matchStateStore';

class EffectResolverRegistry {
  private resolvers = new Map<string, EffectResolver>();

  register(resolver: EffectResolver): this {
    if (!resolver?.effectType) throw new Error('EffectResolver requires effectType.');
    if (this.resolvers.has(resolver.effectType)) {
      throw new Error(`EffectResolver already registered: ${resolver.effectType}`);
    }
    this.resolvers.set(resolver.effectType, resolver);
    return this;
  }

  get(effectType: string): EffectResolver | null {
    return this.resolvers.get(effectType) || null;
  }

  registerMany(resolvers: EffectResolver[] = []): this {
    resolvers.forEach((resolver) => this.register(resolver));
    return this;
  }
}

class EffectResolutionService {
  private store: MatchStateStore;
  private registry: EffectResolverRegistry;
  private channelSystem: ChannelSystem;
  private projectState?: ProjectStateFromEvent;

  constructor(
    store: MatchStateStore,
    registry = new EffectResolverRegistry(),
    channelSystem = new ChannelSystem(),
    options: { projectState?: ProjectStateFromEvent } = {},
  ) {
    this.store = store;
    this.registry = registry;
    this.channelSystem = channelSystem;
    this.projectState = options.projectState;
  }

  async resolvePending(matchId: string, state?: Record<string, unknown>): Promise<DomainEvent[]> {
    const match = this.store.loadMatch(matchId);
    const effects = this.store.listEffects(matchId, 'proposed');
    const resolved: DomainEvent[] = [];
    let currentState = cloneState(state || match?.state || {});
    for (const effect of effects) {
      const events = await this.resolveEffect(effect, match, currentState);
      resolved.push(...events);
      currentState = cloneState(this.store.loadMatch(matchId)?.state || currentState);
    }
    return resolved;
  }

  async resolveEffect(
    effect: WorkflowEffect,
    match: MatchSnapshot | null = this.store.loadMatch(effect.matchId),
    state: Record<string, unknown> = match?.state || {},
  ): Promise<DomainEvent[]> {
    const resolver = this.registry.get(effect.effectType);
    if (!resolver) throw new Error(`EffectResolver not registered: ${effect.effectType}`);
    const events = await resolver.resolve({ match, state, effect });
    events.forEach((event) => this.channelSystem.assertValidEvent(event));
    const appended = this.store.appendEvents(events);
    const projectedState = this.applyStateProjection(match, state, appended);
    if (projectedState) {
      this.store.saveMatchState(effect.matchId, projectedState);
    }
    const firstSeq = appended[0]?.seq;
    this.store.updateEffect(effect.id, {
      status: 'applied',
      appliedEventSeq: firstSeq,
    });
    return appended;
  }

  private applyStateProjection(
    match: MatchSnapshot | null,
    state: Record<string, unknown>,
    events: DomainEvent[],
  ): Record<string, unknown> | null {
    if (!this.projectState || !events.length) return null;
    let nextState = cloneState(state);
    for (const event of events) {
      nextState = this.projectState(nextState, event, { match, event });
    }
    return nextState;
  }
}

function cloneState(state: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state || {})) as Record<string, unknown>;
}

export { EffectResolverRegistry, EffectResolutionService };
