/**
 * 观众流服务
 * 为观众提供独立的、可扩展的事件流通道
 */

import type {
  GameEvent,
  EventHandler
} from '@ai-presenter/shared/types/gameEvent';
import type { ViewerContext } from '@ai-presenter/shared/types/channelTypes';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import type { WerewolfEventBus } from './eventBus';
import { ViewerContextBuilder } from './channelRouter';

// ============================================================
// 类型定义
// ============================================================

export interface AudienceOptions {
  // 视角模式
  viewMode: 'god' | 'player' | 'custom';

  // 延迟设置（毫秒）
  delayMs?: number;

  // 速度控制
  speed?: number; // 0.5, 1, 1.5, 2, 4

  // 是否启用互动
  interactive?: boolean;

  // 自定义过滤器
  filter?: (event: GameEvent) => boolean;

  // 视角配置（player 模式）
  viewerPlayerId?: number;
  viewerFaction?: string;
  viewerRoles?: string[];
}

export interface AudienceSession {
  id: string;
  matchId: string;
  options: AudienceOptions;
  viewer: ViewerContext;
  createdAt: Date;
  lastEventAt: Date | null;
  status: 'active' | 'paused' | 'completed';
  currentSequence: number;
}

export interface AudienceStreamState {
  sessions: Map<string, AudienceSession>;
  eventQueues: Map<string, GameEvent[]>;
  lastSequence: number;
}

// ============================================================
// AudienceStream 实现
// ============================================================

export class AudienceStream {
  private state: AudienceStreamState = {
    sessions: new Map(),
    eventQueues: new Map(),
    lastSequence: 0
  };

  private eventBus: WerewolfEventBus;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(eventBus: WerewolfEventBus) {
    this.eventBus = eventBus;
    this.setupEventListeners();
    this.startCleanupTimer();
  }

  // ----------------------------------------------------------
  // 会话管理
  // ----------------------------------------------------------

  createSession(matchId: string, options: AudienceOptions): AudienceSession {
    const sessionId = this.generateSessionId();
    const viewer = this.buildViewer(options);

    const session: AudienceSession = {
      id: sessionId,
      matchId,
      options,
      viewer,
      createdAt: new Date(),
      lastEventAt: null,
      status: 'active',
      currentSequence: 0
    };

    this.state.sessions.set(sessionId, session);
    this.state.eventQueues.set(sessionId, []);

    // 订阅事件
    this.subscribeToEvents(session);

    return session;
  }

  getSession(sessionId: string): AudienceSession | undefined {
    return this.state.sessions.get(sessionId);
  }

  removeSession(sessionId: string): void {
    this.state.sessions.delete(sessionId);
    this.state.eventQueues.delete(sessionId);
  }

  // ----------------------------------------------------------
  // 事件流
  // ----------------------------------------------------------

  getEventStream(sessionId: string): AsyncIterable<GameEvent> {
    const session = this.state.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return {
      [Symbol.asyncIterator]: () => {
        let lastIndex = 0;
        return {
          next: async (): Promise<IteratorResult<GameEvent>> => {
            const queue = this.state.eventQueues.get(sessionId) || [];

            // 等待新事件
            while (lastIndex >= queue.length) {
              if (session.status === 'completed') {
                return { done: true, value: undefined };
              }
              await this.waitForEvents(sessionId, 100);
            }

            const event = queue[lastIndex++];
            return { done: false, value: event };
          }
        };
      }
    };
  }

  getQueuedEvents(sessionId: string): GameEvent[] {
    return this.state.eventQueues.get(sessionId) || [];
  }

  getQueuedEventsSince(sessionId: string, sequence: number): GameEvent[] {
    const queue = this.state.eventQueues.get(sessionId) || [];
    return queue.filter(e => e.metadata.sequence > sequence);
  }

  // ----------------------------------------------------------
  // 控制方法
  // ----------------------------------------------------------

  pause(sessionId: string): void {
    const session = this.state.sessions.get(sessionId);
    if (session) {
      session.status = 'paused';
    }
  }

  resume(sessionId: string): void {
    const session = this.state.sessions.get(sessionId);
    if (session && session.status === 'paused') {
      session.status = 'active';
    }
  }

  setSpeed(sessionId: string, speed: number): void {
    const session = this.state.sessions.get(sessionId);
    if (session) {
      session.options.speed = Math.max(0.25, Math.min(4, speed));
    }
  }

  seekTo(sessionId: string, sequence: number): void {
    const session = this.state.sessions.get(sessionId);
    if (session) {
      session.currentSequence = sequence;
      // 重新播放从 sequence 开始的事件
      this.replayFromSequence(sessionId, sequence);
    }
  }

  complete(sessionId: string): void {
    const session = this.state.sessions.get(sessionId);
    if (session) {
      session.status = 'completed';
    }
  }

  // ----------------------------------------------------------
  // 内部方法
  // ----------------------------------------------------------

  private setupEventListeners(): void {
    // 监听所有事件，分发到观众会话
    this.eventBus.subscribeAll((event: GameEvent) => {
      this.distributeEvent(event);
    });
  }

  private subscribeToEvents(session: AudienceSession): void {
    // 根据会话选项订阅特定频道
    const { options } = session;

    if (options.viewMode === 'god') {
      // 上帝视角：接收所有事件
      // 已经通过 subscribeAll 处理
    } else if (options.viewMode === 'player') {
      // 玩家视角：只接收该玩家可见的事件
      // 由 distributeEvent 中的过滤逻辑处理
    }
  }

  private distributeEvent(event: GameEvent): void {
    this.state.lastSequence++;

    // 添加到所有活跃会话的队列
    for (const [sessionId, session] of this.state.sessions) {
      if (session.status !== 'active') continue;

      // 应用延迟
      if (session.options.delayMs && session.options.delayMs > 0) {
        setTimeout(() => {
          this.enqueueEvent(sessionId, event);
        }, session.options.delayMs);
      } else {
        this.enqueueEvent(sessionId, event);
      }
    }
  }

  private enqueueEvent(sessionId: string, event: GameEvent): void {
    const session = this.state.sessions.get(sessionId);
    if (!session || session.status !== 'active') return;

    // 检查访问权限
    if (!this.canAccess(session, event)) return;

    // 应用自定义过滤器
    if (session.options.filter && !session.options.filter(event)) return;

    // 添加到队列
    const queue = this.state.eventQueues.get(sessionId);
    if (queue) {
      queue.push(event);
      session.lastEventAt = new Date();
      session.currentSequence = event.metadata.sequence;
    }
  }

  private canAccess(session: AudienceSession, event: GameEvent): boolean {
    const { viewer, options } = session;

    // 上帝视角可以看到所有事件
    if (options.viewMode === 'god') return true;

    // 公开事件：所有人都可以访问
    if (event.channel === CHANNEL_TYPES.PUBLIC) return true;

    // 系统事件：只有系统可以访问
    if (event.channel === CHANNEL_TYPES.SYSTEM) return viewer.type === 'system';

    // 观众事件：观众可以访问
    if (event.channel === CHANNEL_TYPES.AUDIENCE) return viewer.type === 'audience';

    // Scope 事件：根据角色和阵营过滤
    if (event.channel === CHANNEL_TYPES.SCOPE) {
      // 根据 scopeKey 判断
      return this.matchScope(event.scopeKey || '', viewer);
    }

    return false;
  }

  private matchScope(scopeKey: string, viewer: ViewerContext): boolean {
    if (!scopeKey) return false;

    // 狼人频道
    if (scopeKey === 'wolves') {
      return viewer.faction === 'wolves';
    }

    // 角色频道
    if (['seer', 'guard', 'witch'].includes(scopeKey)) {
      return (viewer.roles || []).includes(scopeKey);
    }

    // 玩家频道
    if (scopeKey.startsWith('player:')) {
      const playerId = parseInt(scopeKey.split(':')[1]);
      return viewer.playerId === playerId;
    }

    return false;
  }

  private buildViewer(options: AudienceOptions): ViewerContext {
    switch (options.viewMode) {
      case 'god':
        return ViewerContextBuilder.forGodView();

      case 'player':
        return ViewerContextBuilder.forPlayer(
          options.viewerPlayerId || 0,
          options.viewerFaction || '',
          options.viewerRoles || []
        );

      case 'custom':
        return ViewerContextBuilder.forAudience();

      default:
        return ViewerContextBuilder.forAudience();
    }
  }

  private generateSessionId(): string {
    return `audience_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private waitForEvents(sessionId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const queue = this.state.eventQueues.get(sessionId);
      if (queue && queue.length > 0) {
        resolve();
        return;
      }

      const checkInterval = setInterval(() => {
        const q = this.state.eventQueues.get(sessionId);
        if (q && q.length > 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, timeoutMs);
    });
  }

  private replayFromSequence(sessionId: string, sequence: number): void {
    // 获取所有历史事件
    const allEvents = this.eventBus.getHistory();

    // 过滤出指定序列之后的事件
    const eventsToReplay = allEvents.filter(e => e.metadata.sequence >= sequence);

    // 清空当前队列
    this.state.eventQueues.set(sessionId, []);

    // 重新入队
    for (const event of eventsToReplay) {
      this.enqueueEvent(sessionId, event);
    }
  }

  private startCleanupTimer(): void {
    // 每 5 分钟清理一次过期会话
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expireTime = 30 * 60 * 1000; // 30 分钟过期

    for (const [sessionId, session] of this.state.sessions) {
      const lastActivity = session.lastEventAt?.getTime() || session.createdAt.getTime();
      if (now - lastActivity > expireTime) {
        this.removeSession(sessionId);
      }
    }
  }

  // ----------------------------------------------------------
  // 查询方法
  // ----------------------------------------------------------

  getSessionCount(): number {
    return this.state.sessions.size;
  }

  getActiveSessionCount(): number {
    let count = 0;
    for (const session of this.state.sessions.values()) {
      if (session.status === 'active') count++;
    }
    return count;
  }

  getPausedSessionCount(): number {
    let count = 0;
    for (const session of this.state.sessions.values()) {
      if (session.status === 'paused') count++;
    }
    return count;
  }

  getTotalEventsDistributed(): number {
    return this.state.lastSequence;
  }

  // ----------------------------------------------------------
  // 清理
  // ----------------------------------------------------------

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.state.sessions.clear();
    this.state.eventQueues.clear();
  }
}

// ============================================================
// 辅助类型
// ============================================================

export interface AudienceStreamStats {
  totalSessions: number;
  activeSessions: number;
  pausedSessions: number;
  totalEventsDistributed: number;
}

// ============================================================
// 工厂函数
// ============================================================

export function createAudienceStream(eventBus: WerewolfEventBus): AudienceStream {
  return new AudienceStream(eventBus);
}
