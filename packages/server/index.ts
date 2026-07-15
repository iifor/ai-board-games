import http from 'http';
import { createApp } from './app';
import { getAiConfig } from './config';
import { attachGameSocket } from './modules/game-socket';
import { createGracefulShutdownHandler } from './lifecycle';

const port = Number(process.env.API_PORT || (process.env.NODE_ENV === 'production' ? process.env.PORT : undefined) || 3001);
const app = createApp();
const server = http.createServer(app);

attachGameSocket(server);
const shutdown = createGracefulShutdownHandler(server);
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

server.listen(port, () => {
  const config = getAiConfig();
  console.log(`Express API 已启动：http://localhost:${port}`);
  console.log(`WebSocket 已启动：ws://localhost:${port}/api/toc/ws/game`);
  console.log('主持人：流程化控制（不接入模型）');
  console.log(`玩家模型：${config.players.map((player) => `${player.id}:${player.provider}/${player.model}`).join('；')}`);
  console.log(`实际使用供应商：${config.usedProviderNames.join('；')}`);
  if (config.missingProviders.length) {
    console.log(`缺少 API Key：${config.missingProviders.map((item: Record<string, unknown>) => `${item.provider}(${item.apiKeyEnv})`).join('；')}`);
  }
});
