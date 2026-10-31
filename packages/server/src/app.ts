import { Hono } from 'hono';
import type { Services } from './container';
import type { Db } from './db/database';
import { requireAdmin } from './middlewares/auth';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { requestId } from './middlewares/requestId';
import { authRoutes } from './modules/auth';
import { gameRoutes } from './modules/games';
import { healthRoutes } from './modules/health/routes';
import { modelRoutes } from './modules/models';
import { playerRoutes, publicPlayerRoutes } from './modules/players';
import { providerRoutes } from './modules/providers';
import { voiceRoutes } from './modules/voices';
import type { AppEnv } from './types';

/** 路由装配：/api/toc 为 C 端公开接口，/api/admin 为需要管理员登录的后台接口 */
export function createApp(db: Db, services: Services): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requestId);
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  const guarded = (routes: Hono<AppEnv>) => new Hono<AppEnv>().use('*', requireAdmin(services.auth)).route('/', routes);

  app.route('/api/health', healthRoutes(db));
  app.route('/api/toc/games', gameRoutes(services.games));
  app.route('/api/toc/players', publicPlayerRoutes(services.players));
  app.route('/api/admin/auth', authRoutes(services.auth));
  app.route('/api/admin/providers', guarded(providerRoutes(services.providers)));
  app.route('/api/admin/models', guarded(modelRoutes(services.models)));
  app.route('/api/admin/voices', guarded(voiceRoutes(services.voices)));
  app.route('/api/admin/players', guarded(playerRoutes(services.players)));
  return app;
}
