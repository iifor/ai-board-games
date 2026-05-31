import type { DomainEvent, GameEngineChannel } from '@ai-presenter/shared/types/gameEngine';
import { ChannelSystem } from '../channel/channelSystem';

type EventHandler = (event: DomainEvent) => void | Promise<void>;
type EventFilter = (event: DomainEvent) => boolean;

interface EventSubscriptionOptions {
  filter?: EventFilter;
  priority?: number;
  scopeKey?: string;
}

interface EventSubscription {
  id: string;
  channel: GameEngineChannel | '*';
  handler: EventHandler;
  options: EventSubscriptionOptions;
}

class GameEngineEventBus {
  private subscriptions: EventSubscription[] = [];
  private history: DomainEvent[] = [];
  private nextId = 1;
  private channelSystem: ChannelSystem;

  constructor(channelSystem = new ChannelSystem()) {
    this.channelSystem = channelSystem;
  }

  async publish(event: DomainEvent): Promise<void> {
    const validEvent = this.channelSystem.assertValidEvent(event);
    this.history.push(validEvent);
    const subscriptions = this.subscriptions
      .filter((subscription) => matchesSubscription(validEvent, subscription))
      .sort((a, b) => (b.options.priority || 0) - (a.options.priority || 0));

    await Promise.all(subscriptions.map(async (subscription) => {
      if (subscription.options.filter && !subscription.options.filter(validEvent)) return;
      await subscription.handler(validEvent);
    }));
  }

  subscribe(
    channel: GameEngineChannel | '*',
    handler: EventHandler,
    options: EventSubscriptionOptions = {},
  ): () => void {
    const id = `engine-sub-${this.nextId}`;
    this.nextId += 1;
    this.subscriptions.push({ id, channel, handler, options });
    return () => {
      this.subscriptions = this.subscriptions.filter((subscription) => subscription.id !== id);
    };
  }

  subscribeAll(handler: EventHandler, options: EventSubscriptionOptions = {}): () => void {
    return this.subscribe('*', handler, options);
  }

  getHistory(filter?: EventFilter): DomainEvent[] {
    return filter ? this.history.filter(filter) : [...this.history];
  }

  clear(): void {
    this.history = [];
    this.subscriptions = [];
  }
}

function matchesSubscription(event: DomainEvent, subscription: EventSubscription): boolean {
  if (subscription.channel === '*') return true;
  if (subscription.channel !== event.channel) return false;
  if (subscription.options.scopeKey) return subscription.options.scopeKey === event.scopeKey;
  return true;
}

export { GameEngineEventBus };
export type { EventHandler, EventFilter, EventSubscriptionOptions };
