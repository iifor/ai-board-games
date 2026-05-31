import type {
  ChannelPolicy,
  DomainEvent,
  EngineResult,
  ViewerContext,
} from '@ai-presenter/shared/types/gameEngine';

class ChannelSystem {
  private policy: ChannelPolicy;

  constructor(policy: ChannelPolicy = {}) {
    this.policy = policy;
  }

  validateEvent(event: Partial<DomainEvent>): EngineResult<DomainEvent> {
    if (!event.channel) {
      return failure('CHANNEL_REQUIRED', 'DomainEvent requires an explicit channel.');
    }
    if (event.channel === 'scope' && !event.scopeKey) {
      return failure('SCOPE_KEY_REQUIRED', 'Scoped DomainEvent requires scopeKey.');
    }
    if (!event.matchId || !event.type || !event.id) {
      return failure('EVENT_SHAPE_INVALID', 'DomainEvent requires id, matchId, and type.');
    }
    return { ok: true, data: event as DomainEvent };
  }

  assertValidEvent(event: Partial<DomainEvent>): DomainEvent {
    const result = this.validateEvent(event);
    if (!result.ok) throw new Error(result.error?.message || 'DomainEvent is invalid');
    return result.data!;
  }

  canAccess(event: DomainEvent, viewer: ViewerContext, override: ChannelPolicy = {}): boolean {
    const validation = this.validateEvent(event);
    if (!validation.ok) return false;
    const policy = { ...this.policy, ...override };
    if (policy.canAccess) return Boolean(policy.canAccess(event, viewer));

    if (event.channel === 'public') return true;
    if (event.channel === 'audience') return viewer.type === 'audience';
    if (event.channel === 'system') return viewer.type === 'system';
    if (event.channel === 'scope') {
      return Boolean(event.scopeKey && policy.matchScope?.(event.scopeKey, viewer, event));
    }
    return false;
  }

  filterForViewer(events: DomainEvent[], viewer: ViewerContext, override: ChannelPolicy = {}): DomainEvent[] {
    return events.filter((event) => this.canAccess(event, viewer, override));
  }
}

function failure<T = never>(code: string, message: string): EngineResult<T> {
  return { ok: false, error: { code, message } };
}

export { ChannelSystem };
