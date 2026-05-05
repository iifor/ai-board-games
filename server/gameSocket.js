const { WebSocketServer } = require('ws');
const { getAiConfig } = require('./aiConfig');
const { createAiGame } = require('./aiGameRunner');
const { runAiDebate } = require('./aiDebateRunner');
const { runAiWerewolf } = require('./aiWerewolfRunner');
const { saveGameRecord } = require('./adminStore');
const { saveGameLog } = require('./gameLogStore');

function attachGameSocket(server) {
  const wss = new WebSocketServer({ server, path: '/api/toc/ws/game' });

  wss.on('connection', (socket) => {
    const session = createSession(socket);

    socket.on('message', async (raw) => {
      const message = parseMessage(raw);
      if (!message) return;

      if (message.type === 'start') {
        runSession(session, message.mode === 'real' ? 'real' : 'mock', message.playerIds, message.gameType).catch((error) => {
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

async function runSession(session, mode, playerIds, gameType = 'consensus') {
  const safeGameType = normalizeGameType(gameType);
  const config = getRequestConfig(mode, playerIds, safeGameType);

  await session.sendAndWait({
    type: 'host',
    message: getStartMessage(safeGameType)
  });

  const runner = getRunner(safeGameType);
  const game = await runner(config, {
    onEvent: (event) => session.sendAndWait(withNarration(event))
  });

  saveGameRecord(game);
  if (mode === 'real') saveGameLog(game);

  await session.sendAndWait({
    type: 'done',
    message: getDoneMessage(safeGameType),
    game
  });
  session.close();
}

function normalizeGameType(gameType) {
  if (gameType === 'debate') return 'debate';
  if (gameType === 'werewolf') return 'werewolf';
  return 'consensus';
}

function getRunner(gameType) {
  if (gameType === 'debate') return runAiDebate;
  if (gameType === 'werewolf') return runAiWerewolf;
  return createAiGame;
}

function getStartMessage(gameType) {
  if (gameType === 'debate') return 'AI 辩论赛开始';
  if (gameType === 'werewolf') return 'AI 狼人杀开始';
  return '游戏开始';
}

function getDoneMessage(gameType) {
  if (gameType === 'debate') return '辩论赛结束，完整赛果已生成。';
  if (gameType === 'werewolf') return '狼人杀结束，完整战报已生成。';
  return '游戏结束，完整比赛结果已生成。';
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

function getRequestConfig(mode, playerIds, gameType = 'consensus') {
  const config = withSelectedPlayers(getAiConfig(), playerIds);
  const selected = selectPlayersForGame(config, playerIds, gameType);
  const selectedProviders = new Set([config.host.provider, ...selected.map((player) => player.provider)]);
  const missingProviders = config.missingProviders.filter((item) => selectedProviders.has(item.provider));
  const scopedConfig = {
    ...config,
    players: selected,
    selectedPlayerIds: selected.map((player) => player.id),
    gameType,
    missingProviders,
    realReady: missingProviders.length === 0
  };
  if (mode === 'mock') return { ...scopedConfig, mode: 'mock' };

  if (scopedConfig.missingProviders.length) {
    const missing = scopedConfig.missingProviders.map((item) => `${item.provider}(${item.apiKeyEnv})`).join('、');
    throw new Error(`真实模式缺少 API Key：${missing}。请在 .env 中配置，或切换到 Mock。`);
  }
  return { ...scopedConfig, mode: 'real' };
}

function selectPlayersForGame(config, playerIds, gameType) {
  const ids = Array.isArray(playerIds) ? playerIds.map(Number).filter(Boolean) : [];
  const selected = ids.length
    ? ids.map((id) => config.players.find((player) => Number(player.id) === id)).filter(Boolean)
    : config.players.slice(0, gameType === 'debate' || gameType === 'werewolf' ? 12 : 7);

  if (gameType === 'debate') {
    if (selected.length < 8 || selected.length > 12) {
      throw new Error('AI 辩论赛需要选择 8-12 位 AI 玩家。');
    }
    return selected;
  }

  if (gameType === 'werewolf') {
    if (selected.length !== 12) {
      throw new Error('AI 狼人杀 12 人标准局需要选择恰好 12 位 AI 玩家。');
    }
    return selected;
  }

  if (selected.length !== 7) {
    throw new Error('共识迷雾 v3.2 标准局需要选择恰好 7 位 AI 玩家。');
  }
  return selected;
}

function withSelectedPlayers(config) {
  return config;
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
  if (event.game?.type === 'werewolf') return getWerewolfNarration(event);
  if (event.game?.type === 'debate') return getDebateNarration(event);
  if (event.type === 'players') return '七名玩家已经就绪。身份和个人记忆已经秘密分发。';
  if (event.type === 'round-start') {
    const premise = event.round.question.premise ? `${event.round.question.premise}` : '';
    return `第 ${event.round.number} 轮调查开始。${premise} 本轮调查题，A：${event.round.question.a}，B：${event.round.question.b}。现在进行匿名共识投票。`;
  }
  if (event.type === 'vote-result') {
    return `投票结束。A 获得 ${event.round.tally.A} 票，B 获得 ${event.round.tally.B} 票。本轮结果是${getConsensusTypeName(event.round.consensusType)}。`;
  }
  if (event.type === 'clue-result') {
    const clue = event.round.clue ? `公开${event.round.clue.title}。${event.round.clue.text}` : '本轮共识失败，不公开新线索。';
    const appraisal = event.round.appraisal && event.round.appraisal !== '无' ? `鉴定报告：${event.round.appraisal}` : '';
    const noise = event.round.noise ? `迷雾噪音：${event.round.noise}` : '';
    return `${clue}${appraisal ? ` ${appraisal}` : ''}${noise ? ` ${noise}` : ''} 现在进入自然发言。`;
  }
  if (event.type === 'speech') {
    return `${event.speech.playerId}号发言。${event.speech.text}`;
  }
  if (event.type === 'suspicion-result') {
    const marked = event.round.markedSuspects?.length ? `${event.round.markedSuspects.join('、')}号获得风险标记。` : '本轮无人获得风险标记。';
    return `现在公布风险标记投票结果。${marked}`;
  }
  if (event.type === 'exclusion-result') {
    const excluded = event.round.excluded?.length ? `${event.round.excluded.map((item) => `${item.id}号`).join('、')}被权限冻结。` : '本轮无人被权限冻结。';
    return `现在公布权限冻结结果。${excluded}`;
  }
  if (event.type === 'last-testimony') {
    return `${event.testimony.id}号留下离组记录。${event.testimony.testimony}`;
  }
  if (event.type === 'final-accusation-result') {
    const targets = event.round.finalTargets?.length ? `${event.round.finalTargets.join('、')}号` : '无人';
    return `最终指认结果公布。最高票对象是${targets}。`;
  }
  if (event.type === 'game') return '本局进入胜负结算。';
  return event.message || '';
}

function getWerewolfNarration(event) {
  if (event.type === 'players') return '十二名玩家已经入场，身份牌已秘密分发。';
  if (event.type === 'phase-start') return event.message || `第 ${event.round?.day || 1} 夜，天黑请闭眼。`;
  if (event.type === 'night-result') return event.message || '夜晚行动结算完毕。';
  if (event.type === 'day-start') return event.message || `第 ${event.round?.day || 1} 天，天亮了。`;
  if (event.type === 'speech') return `${event.speech.playerId}号发言。${event.speech.text}`;
  if (event.type === 'vote-result') return event.message || '白天投票结果公布。';
  if (event.type === 'last-words' || event.type === 'exile-words') return `${event.testimony.playerId}号遗言。${event.testimony.text}`;
  if (event.type === 'hunter-shot') return `猎人发动技能，${event.shot.from}号带走${event.shot.target}号。`;
  if (event.type === 'game') {
    const winner = event.game.winner === 'wolves' ? '狼人阵营胜利' : '好人阵营胜利';
    return `狼人杀进入胜负结算。${winner}。${event.game.winReason || ''}`;
  }
  return event.message || '';
}

function getDebateNarration(event) {
  if (event.type === 'players') return '辩论选手已经入场。正方、反方和评委席已随机分配。';
  if (event.type === 'phase-start') return event.message || `现在进入${event.phase?.name || '下一'}环节。`;
  if (event.type === 'phase-end') return event.message || `${event.phase?.name || '本'}环节结束。`;
  if (event.type === 'speech') {
    if (event.speech.side === 'host') return `主持人点评。${event.speech.text}`;
    const player = event.game.players?.find((item) => Number(item.id) === Number(event.speech.playerId));
    const label = player ? `${player.sideLabel}${player.debateRoleLabel}` : `${event.speech.playerId}号`;
    return `${label}${event.speech.playerId}号发言。${event.speech.text}`;
  }
  if (event.type === 'game') {
    const winner = event.game.winner === 'pro' ? '正方' : event.game.winner === 'con' ? '反方' : '双方平局';
    const mvp = event.game.mvp ? `本场 MVP 是 ${event.game.mvp.nickname || `${event.game.mvp.id}号`}。` : '';
    return `辩论赛进入赛果公布。${winner}。${mvp}`;
  }
  return event.message || '';
}

function getConsensusTypeName(type) {
  if (type === 'overConsensus') return '过度共识';
  if (type === 'effective') return '有效共识';
  return '共识失败';
}

module.exports = {
  attachGameSocket
};
