const { getConfig } = require('./config');
const { GameLogger } = require('./logger');
const Player = require('./player');
const { runGame } = require('./gameEngine');
const { shuffle } = require('./utils');

const PERSONALITY_ORDER = ['recorder', 'skeptic', 'mediator', 'principled', 'opportunist', 'recorder'];

function createPlayers(config) {
  const roles = shuffle([
    { id: 1, role: 'chaos' },
    { id: 2, role: 'chaos' },
    { id: 3, role: 'order' },
    { id: 4, role: 'order' },
    { id: 5, role: 'order' },
    { id: 6, role: 'order' }
  ]).map((role, index) => ({ ...role, id: index + 1 }));

  return roles.map((entry, index) => {
    const allies = roles
      .filter((candidate) => candidate.role === 'chaos' && candidate.id !== entry.id)
      .map((candidate) => candidate.id);

    return new Player({
      id: entry.id,
      role: entry.role,
      allies,
      personality: PERSONALITY_ORDER[index],
      apiKey: config.apiKey,
      model: config.model,
      mockMode: config.mockMode
    });
  });
}

async function main() {
  const config = getConfig();
  const logger = new GameLogger();
  const players = createPlayers(config);

  if (config.mockMode) {
    logger.line('当前为本地模拟模式：未调用 OpenAI API。配置 OPENAI_API_KEY 后可运行真实 AI 对局。');
    logger.line('');
  } else {
    logger.line(`当前模型：${config.model}`);
    logger.line('');
  }

  const result = await runGame(players, {
    logger,
    revealExiledRole: config.revealExiledRole
  });

  const logPath = logger.save({
    ...result,
    players: players.map((player) => ({
      id: player.id,
      role: player.role,
      personality: player.personality,
      alive: player.alive,
      stanceHistory: player.stanceHistory,
      declaredVotes: player.declaredVotes
    }))
  });

  logger.line(`对局日志已保存：${logPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
