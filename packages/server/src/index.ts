import { serve } from '@hono/node-server';
import { gameRegistry } from '@battle/games';
import { createApp } from './app';
import { loadConfig } from './config/env';
import { createServices } from './container';
import { createDatabase } from './db/database';
import { migrateToLatest } from './db/migrate';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDatabase(config.database);
  const applied = await migrateToLatest(db, config.database.schema);
  if (applied.length) logger.info('数据库迁移完成', { applied });
  const services = createServices(db, config, gameRegistry);
  await services.auth.bootstrap();

  const { app, injectWebSocket } = createApp(services, { trustProxy: config.http.trustProxy });
  const server = serve({ fetch: app.fetch, port: config.port }, ({ port }) => logger.info('服务已启动', { port }));
  injectWebSocket(server);
  services.worker.start();
  services.reaper.start();

  const shutdown = (signal: string) => {
    logger.info('正在关闭服务', { signal });
    services.reaper.stop();
    // worker.stop 自己有上限；关闭监听与连接池同样不能无限等（被卡住的任务可能还占着连接）
    const deadline = setTimeout(() => {
      logger.warn('关闭超时，直接退出', { timeoutMs: config.shutdown.timeoutMs });
      process.exit(0);
    }, config.shutdown.timeoutMs * 2);
    deadline.unref();
    void services.worker.stop().then(() => {
      server.close(() => {
        void db.destroy().finally(() => process.exit(0));
      });
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.error('服务启动失败', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
