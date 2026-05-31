import type {
  DomainEvent,
  EffectResolver,
  MatchSnapshot,
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

  constructor(
    store: MatchStateStore,
    registry = new EffectResolverRegistry(),
    channelSystem = new ChannelSystem(),
  ) {
    this.store = store;
    this.registry = registry;
    this.channelSystem = channelSystem;
  }

  async resolvePending(matchId: string, state?: Record<string, unknown>): Promise<DomainEvent[]> {
    const match = this.store.loadMatch(matchId);
    const effects = this.store.listEffects(matchId, 'proposed');
    const resolved: DomainEvent[] = [];
    for (const effect of effects) {
      const events = await this.resolveEffect(effect, match, state || match?.state || {});
      resolved.push(...events);
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
    const firstSeq = appended[0]?.seq;
    this.store.updateEffect(effect.id, {
      status: 'applied',
      appliedEventSeq: firstSeq,
    });
    return appended;
  }
}

export { EffectResolverRegistry, EffectResolutionService };
