const { WebSocketServer } = require('ws');
const { getAiConfig } = require('./aiConfig');
const { createAiGame } = require('./aiGameRunner');
const { saveGameLog } = require('./gameLogStore');

function attachGameSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws/game' });

  wss.on('connection', (socket) => {
    const session = createSession(socket);

    socket.on('message', async (raw) => {
      const message = parseMessage(raw);
      if (!message) return;

      if (message.type === 'start') {
        runSession(session, message.mode === 'real' ? 'real' : 'mock').catch((error) => {
          if (error.message === 'game-session-cancelled') return;
          console.error(error);
          session.send({ type: 'error', message: error.message });
        });
      }

      if (message.type === 'ack') {
        session.resolveAck(message.ackId);
      }
    });
  });
}

async function runSession(session, mode) {
  const config = getRequestConfig(mode);

  await session.sendAndWait({
    type: 'host',
    message: mode === 'real'
      ? '游戏开始，AI 对局正在生成。'
      : 'Mock 对局开始，后端将按流程逐条推送。'
  });

  const game = await createAiGame(config, {
    onEvent: (event) => session.sendAndWait(withNarration(event))
  });

  if (mode === 'real') saveGameLog(game);

  await session.sendAndWait({
    type: 'done',
    message: '游戏结束，完整比赛结果已生成。',
    game
  });
  session.close();
}

function createSession(socket) {
  let nextId = 1;
  const pending = new Map();
  let closed = false;

  socket.on('close', () => {
    closed = true;
    for (const { reject } of pending.values()) reject(new Error('game-session-cancelled'));
    pending.clear();
  });

  return {
    send(payload) {
      if (socket.readyState !== socket.OPEN) return;
      socket.send(JSON.stringify(payload));
    },
    sendAndWait(payload) {
      if (closed || socket.readyState !== socket.OPEN) return Promise.reject(new Error('game-session-cancelled'));
      const ackId = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ ...payload, ackId }));
      return new Promise((resolve, reject) => {
        pending.set(ackId, { resolve, reject });
      });
    },
    resolveAck(ackId) {
      const item = pending.get(ackId);
      if (!item) return;
      pending.delete(ackId);
      item.resolve();
    },
    close() {
      if (socket.readyState === socket.OPEN) socket.close();
    }
  };
}

function getRequestConfig(mode) {
  const config = getAiConfig();
  if (mode === 'mock') return { ...config, mode: 'mock' };

  if (config.missingProviders.length) {
    const missing = config.missingProviders.map((item) => `${item.provider}(${item.apiKeyEnv})`).join('、');
    throw new Error(`真实模式缺少 API Key：${missing}。请在 .env 中配置，或切换到 Mock。`);
  }
  return { ...config, mode: 'real' };
}

function parseMessage(raw) {
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function withNarration(event) {
  return {
    ...event,
    narration: getNarration(event)
  };
}

function getNarration(event) {
  if (event.type === 'players') return '玩家信息已经就绪。';
  if (event.type === 'round-start') {
    return `第 ${event.round.number} 轮开始。本轮议题，A：${event.round.question.a}，B：${event.round.question.b}。现在开始投票。`;
  }
  if (event.type === 'vote-result') {
    return `投票结束。A 获得 ${event.round.tally.A} 票，B 获得 ${event.round.tally.B} 票。本轮共识${event.round.consensus ? '成功' : '失败'}。现在进入自由讨论。`;
  }
  if (event.type === 'speech') {
    return `${event.speech.playerId}号发言。${event.speech.text}`;
  }
  if (event.type === 'exile-result') {
    const eliminated = event.round.eliminated?.id ? `${event.round.eliminated.id}号被放逐。` : '本轮无人被放逐。';
    return `现在公布放逐投票结果。${eliminated}`;
  }
  if (event.type === 'game') return '本局进入胜负结算。';
  return event.message || '';
}

module.exports = {
  attachGameSocket
};
