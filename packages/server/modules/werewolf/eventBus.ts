/**
 * 游戏事件总线
 * 实现发布/订阅机制，支持频道路由
 */

import type {
  GameEvent,
  EventHandler,
  EventFilter
} from '@ai-presenter/shared/types/gameEvent';
import type { ChannelType } from '@ai-presenter/shared/types/channelTypes';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';

// ============================================================
// 类型定义
// ============================================================

export interface EventMiddleware {
  name: string;
  process(event: GameEvent, next: () => void): void | Promise<void>;
}

export interface SubscriptionOptions {
  filter?: EventFilter;
  priority?: number;
}

interface Subscription {
  id: string;
  channel: ChannelType | string;
  handler: EventHandler;
  options: SubscriptionOptions;
}

// ============================================================
// EventBus 实现
// ============================================================

export class WerewolfEventBus {
  private subscriptions: Subscription[] = [];
  private middlewares: EventMiddleware[] = [];
  private eventHistory: GameEvent[] = [];
  private maxHistorySize: number = 1000;
  private subscriptionIdCounter: number = 0;

  // ----------------------------------------------------------
  // 发布事件
  // ----------------------------------------------------------

  async publish(event: GameEvent): Promise<void> {
    // 执行中间件
    await this.executeMiddlewares(event);

    // 记录历史
    this.recordHistory(event);

    // 分发到订阅者
    await this.dispatch(event);
  }

  async publishBatch(events: GameEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  // ----------------------------------------------------------
  // 订阅事件
  // ----------------------------------------------------------

  subscribe(
    channel: ChannelType | string,
    handler: EventHandler,
    options: SubscriptionOptions = {}
  ): () => void {
    const id = `sub_${++this.subscriptionIdCounter}`;
    const subscription: Subscription = { id, channel, handler, options };
    this.subscriptions.push(subscription);

    // 返回取消订阅函数
    return () => this.unsubscribe(id);
  }

  subscribeAll(handler: EventHandler, options: SubscriptionOptions = {}): () => void {
    return this.subscribe('*', handler, options);
  }

  subscribePublic(handler: EventHandler, options: SubscriptionOptions = {}): () => void {
    return this.subscribe(CHANNEL_TYPES.PUBLIC, handler, options);
  }

  subscribeScope(scopeKey: string, handler: EventHandler, options: SubscriptionOptions = {}): () => void {
    return this.subscribe(`scope:${scopeKey}`, handler, options);
  }

  subscribeAudience(handler: EventHandler, options: SubscriptionOptions = {}): () => void {
    return this.subscribe(CHANNEL_TYPES.AUDIENCE, handler, options);
  }

  subscribeSystem(handler: EventHandler, options: SubscriptionOptions = {}): () => void {
    return this.subscribe(CHANNEL_TYPES.SYSTEM, handler, options);
  }

  private unsubscribe(id: string): void {
    this.subscriptions = this.subscriptions.filter(sub => sub.id !== id);
  }

  // ----------------------------------------------------------
  // 中间件
  // ----------------------------------------------------------

  use(middleware: EventMiddleware): void {
    this.middlewares.push(middleware);
  }

  private async executeMiddlewares(event: GameEvent): Promise<void> {
    let index = 0;
    const middlewares = this.middlewares;

    const next = async (): Promise<void> => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++];
        await middleware.process(event, next);
      }
    };

    await next();
  }

  // ----------------------------------------------------------
  // 事件分发
  // ----------------------------------------------------------

  private async dispatch(event: GameEvent): Promise<void> {
    const matchingSubscriptions = this.subscriptions.filter(sub =>
      this.matchesSubscription(event, sub)
    );

    // 按优先级排序
    matchingSubscriptions.sort((a, b) =>
      (b.options.priority || 0) - (a.options.priority || 0)
    );

    // 并行执行所有处理器
    const promises = matchingSubscriptions.map(async sub => {
      try {
        if (sub.options.filter && !sub.options.filter(event)) {
          return;
        }
        await sub.handler(event);
      } catch (error) {
        console.error(`EventBus: Handler error for subscription ${sub.id}:`, error);
      }
    });

    await Promise.all(promises);
  }

  private matchesSubscription(event: GameEvent, subscription: Subscription): boolean {
    const { channel } = subscription;

    // 通配符匹配
    if (channel === '*') return true;

    // 精确频道匹配
    if (channel === event.channel) return true;

    // Scope 频道匹配
    if (channel === `scope:${event.scopeKey}`) return true;

    // 系统频道匹配
    if (channel === CHANNEL_TYPES.SYSTEM && event.channel === CHANNEL_TYPES.SYSTEM) {
      return true;
    }

    // 观众频道匹配
    if (channel === CHANNEL_TYPES.AUDIENCE && event.channel === CHANNEL_TYPES.AUDIENCE) {
      return true;
    }

    return false;
  }

  // ----------------------------------------------------------
  // 历史记录
  // ----------------------------------------------------------

  private recordHistory(event: GameEvent): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  getHistory(filter?: EventFilter): GameEvent[] {
    if (!filter) return [...this.eventHistory];
    return this.eventHistory.filter(filter);
  }

  getHistoryByChannel(channel: ChannelType): GameEvent[] {
    return this.eventHistory.filter(e => e.channel === channel);
  }

  getHistoryByType(type: string): GameEvent[] {
    return this.eventHistory.filter(e => e.type === type);
  }

  getHistoryByScope(scopeKey: string): GameEvent[] {
    return this.eventHistory.filter(e => e.scopeKey === scopeKey);
  }

  clearHistory(): void {
    this.eventHistory = [];
  }

  // ----------------------------------------------------------
  // 查询方法
  // ----------------------------------------------------------

  getSubscriptionCount(): number {
    return this.subscriptions.length;
  }

  getMiddlewareCount(): number {
    return this.middlewares.length;
  }

  hasSubscribers(channel: ChannelType | string): boolean {
    return this.subscriptions.some(sub => sub.channel === channel);
  }
}

// ============================================================
// 常用中间件
// ============================================================

export class LoggingMiddleware implements EventMiddleware {
  name = 'logging';

  process(event: GameEvent, next: () => void): void {
    // console.log(`[EventBus] ${event.type} | channel=${event.channel} | scope=${event.scopeKey || '-'}`);
    next();
  }
}

export class FilteringMiddleware implements EventMiddleware {
  name = 'filtering';
  private filters: EventFilter[];

  constructor(filters: EventFilter[]) {
    this.filters = filters;
  }

  process(event: GameEvent, next: () => void): void {
    const shouldPass = this.filters.every(filter => filter(event));
    if (shouldPass) {
      next();
    }
  }
}

export class TransformMiddleware implements EventMiddleware {
  name = 'transform';
  private transformer: (event: GameEvent) => GameEvent;

  constructor(transformer: (event: GameEvent) => GameEvent) {
    this.transformer = transformer;
  }

  process(event: GameEvent, next: () => void): void {
    const transformed = this.transformer(event);
    // 注意：这里简化处理，实际应该替换事件
    next();
  }
}

export class ThrottleMiddleware implements EventMiddleware {
  name = 'throttle';
  private lastEmit: Map<string, number> = new Map();
  private intervalMs: number;

  constructor(intervalMs: number = 100) {
    this.intervalMs = intervalMs;
  }

  process(event: GameEvent, next: () => void): void {
    const key = `${event.type}:${event.scopeKey || ''}`;
    const now = Date.now();
    const last = this.lastEmit.get(key) || 0;

    if (now - last >= this.intervalMs) {
      this.lastEmit.set(key, now);
      next();
    }
  }
}

// ============================================================
// 工厂函数
// ============================================================

export function createEventBus(): WerewolfEventBus {
  return new WerewolfEventBus();
}

export function createEventBusWithDefaults(): WerewolfEventBus {
  const bus = createEventBus();
  bus.use(new LoggingMiddleware());
  return bus;
}
