/**
 * 频道路由器
 * 根据事件的频道类型和 scopeKey 路由到对应的处理器
 */

import type {
  GameEvent,
  EventHandler
} from '@ai-presenter/shared/types/gameEvent';
import type { ChannelType, ViewerContext } from '@ai-presenter/shared/types/channelTypes';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import { canAccess, buildViewerContext } from './views/informationLayer';
import type { WerewolfEventBus } from './eventBus';

// ============================================================
// 类型定义
// ============================================================

export interface ChannelRoute {
  channel: ChannelType | string;
  handler: EventHandler;
  filter?: (event: GameEvent, viewer: ViewerContext) => boolean;
}

export interface ViewerSubscription {
  viewer: ViewerContext;
  handler: EventHandler;
  unsubscribe: () => void;
}

// ============================================================
// ChannelRouter 实现
// ============================================================

export class ChannelRouter {
  private routes: ChannelRoute[] = [];
  private viewerSubscriptions: Map<string, ViewerSubscription[]> = new Map();
  private eventBus: WerewolfEventBus;

  constructor(eventBus: WerewolfEventBus) {
    this.eventBus = eventBus;
    this.setupDefaultRoutes();
  }

  // ----------------------------------------------------------
  // 路由管理
  // ----------------------------------------------------------

  addRoute(route: ChannelRoute): void {
    this.routes.push(route);
  }

  removeRoute(channel: ChannelType | string): void {
    this.routes = this.routes.filter(r => r.channel !== channel);
  }

  // ----------------------------------------------------------
  // 观众订阅
  // ----------------------------------------------------------

  subscribeViewer(
    viewerId: string,
    viewer: ViewerContext,
    handler: EventHandler
  ): () => void {
    const wrappedHandler = (event: GameEvent) => {
      // 检查访问权限
      if (this.canViewerAccess(viewer, event)) {
        handler(event);
      }
    };

    // 订阅所有频道
    const unsubscribe = this.eventBus.subscribeAll(wrappedHandler);

    // 记录订阅
    if (!this.viewerSubscriptions.has(viewerId)) {
      this.viewerSubscriptions.set(viewerId, []);
    }
    this.viewerSubscriptions.get(viewerId)!.push({
      viewer,
      handler,
      unsubscribe
    });

    return () => {
      unsubscribe();
      const subs = this.viewerSubscriptions.get(viewerId);
      if (subs) {
        const index = subs.findIndex(s => s.handler === handler);
        if (index >= 0) {
          subs.splice(index, 1);
        }
        if (subs.length === 0) {
          this.viewerSubscriptions.delete(viewerId);
        }
      }
    };
  }

  unsubscribeViewer(viewerId: string): void {
    const subs = this.viewerSubscriptions.get(viewerId);
    if (subs) {
      subs.forEach(sub => sub.unsubscribe());
      this.viewerSubscriptions.delete(viewerId);
    }
  }

  // ----------------------------------------------------------
  // 访问控制
  // ----------------------------------------------------------

  private canViewerAccess(viewer: ViewerContext, event: GameEvent): boolean {
    // 使用 informationLayer 的访问控制
    return canAccess(
      { channel: event.channel, scopeKey: event.scopeKey },
      viewer
    );
  }

  // ----------------------------------------------------------
  // 默认路由
  // ----------------------------------------------------------

  private setupDefaultRoutes(): void {
    // 公开频道
    this.addRoute({
      channel: CHANNEL_TYPES.PUBLIC,
      handler: () => {} // 默认处理器
    });

    // 系统频道
    this.addRoute({
      channel: CHANNEL_TYPES.SYSTEM,
      handler: () => {}
    });

    // 观众频道
    this.addRoute({
      channel: CHANNEL_TYPES.AUDIENCE,
      handler: () => {}
    });
  }

  // ----------------------------------------------------------
  // 查询方法
  // ----------------------------------------------------------

  getViewerCount(): number {
    return this.viewerSubscriptions.size;
  }

  getViewerSubscriptions(viewerId: string): ViewerSubscription[] {
    return this.viewerSubscriptions.get(viewerId) || [];
  }

  getRouteCount(): number {
    return this.routes.length;
  }
}

// ============================================================
// 视图上下文构建器
// ============================================================

export class ViewerContextBuilder {
  static forPlayer(playerId: number, faction: string, roles: string[] = []): ViewerContext {
    return buildViewerContext({
      type: 'player',
      playerId,
      faction,
      roles
    });
  }

  static forWolf(playerId: number): ViewerContext {
    return buildViewerContext({
      type: 'player',
      playerId,
      faction: 'wolves',
      roles: []
    });
  }

  static forRole(playerId: number, role: string, faction?: string): ViewerContext {
    return buildViewerContext({
      type: 'player',
      playerId,
      faction,
      roles: [role]
    });
  }

  static forAudience(): ViewerContext {
    return buildViewerContext({
      type: 'audience'
    });
  }

  static forSystem(): ViewerContext {
    return buildViewerContext({
      type: 'system'
    });
  }

  static forGodView(): ViewerContext {
    return buildViewerContext({
      type: 'system' // 上帝视角使用系统类型，可以看到所有内容
    });
  }
}

// ============================================================
// 频道工具函数
// ============================================================

// Re-export from shared
export { resolveActionChannel as getChannelForAction } from '@ai-presenter/shared/utils/channelResolution';
export { getChannelForRole } from '@ai-presenter/shared/utils/channelResolution';

export function isPublicEvent(event: GameEvent): boolean {
  return event.channel === CHANNEL_TYPES.PUBLIC;
}

export function isScopedEvent(event: GameEvent): boolean {
  return event.channel === CHANNEL_TYPES.SCOPE;
}

export function isAudienceEvent(event: GameEvent): boolean {
  return event.channel === CHANNEL_TYPES.AUDIENCE;
}

export function isSystemEvent(event: GameEvent): boolean {
  return event.channel === CHANNEL_TYPES.SYSTEM;
}

// ============================================================
// 工厂函数
// ============================================================

export function createChannelRouter(eventBus: WerewolfEventBus): ChannelRouter {
  return new ChannelRouter(eventBus);
}
