import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Services } from './container';
import type { Db } from './db/database';
import { requireAdmin } from './middlewares/auth';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { requestId } from './middlewares/requestId';
import { authRoutes } from './modules/auth';
import { adminGameRoutes, gameRoutes } from './modules/games';
import { healthRoutes } from './modules/health/routes';
import { adminMatchRoutes, publicMatchRoutes } from './modules/matches';
import { modelRoutes } from './modules/models';
import { playerRoutes, publicPlayerRoutes } from './modules/players';
import { providerRoutes } from './modules/providers';
import { realtimeRoutes } from './modules/realtime';
import { mediaRoutes } from './modules/tts';
import { voiceRoutes } from './modules/voices';
import type { AppEnv } from './types';

export interface AppOptions {
  /** 部署在可信反向代理之后时为 true：限流来源取 X-Forwarded-For */
  readonly trustProxy: boolean;
}

/** 公开接口的请求体上限：开局请求只有几个 ID 和一个小参数对象 */
const PUBLIC_BODY_LIMIT = 64 * 1024;
/** 后台接口的请求体上限 */
const ADMIN_BODY_LIMIT = 1024 * 1024;

/** 路由装配：/api/toc 为 C 端公开接口，/api/admin 为需要管理员登录的后台接口 */
export function createApp(db: Db, services: Services, options: AppOptions = { trustProxy: false }) {
  const app = new Hono<AppEnv>();
  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
  app.use('*', requestId);
  app.use('/api/toc/*', bodyLimit({ maxSize: PUBLIC_BODY_LIMIT }));
  app.use('/api/admin/*', bodyLimit({ maxSize: ADMIN_BODY_LIMIT }));
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  const guarded = (routes: Hono<AppEnv>) => new Hono<AppEnv>().use('*', requireAdmin(services.auth)).route('/', routes);

  app.route('/api/health', healthRoutes(db));
  app.route('/api/media', mediaRoutes(services.tts));
  app.route('/api/toc/games', gameRoutes(services.games));
  app.route('/api/toc/players', publicPlayerRoutes(services.players));
  app.route('/api/toc/matches', publicMatchRoutes(services.matches, { trustProxy: options.trustProxy }));
  app.route('/api/toc/ws', realtimeRoutes(upgradeWebSocket, {
    matches: services.repositories.matches,
    bus: services.bus,
    audio: services.audio,
  }));
  app.route('/api/admin/auth', authRoutes(services.auth));
  app.route('/api/admin/providers', guarded(providerRoutes(services.providers)));
  app.route('/api/admin/models', guarded(modelRoutes(services.models)));
  app.route('/api/admin/voices', guarded(voiceRoutes(services.voices)));
  app.route('/api/admin/players', guarded(playerRoutes(services.players)));
  app.route('/api/admin/matches', guarded(adminMatchRoutes(services.matches)));
  app.route('/api/admin/games', guarded(adminGameRoutes(services.games)));
  return { app, injectWebSocket };
}
