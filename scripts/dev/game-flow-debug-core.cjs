const REQUIRED_PLAYER_COUNT = 12;

function parseApiData(payload) {
  if (
    payload
    && typeof payload === 'object'
    && Object.prototype.hasOwnProperty.call(payload, 'data')
  ) {
    return payload.data;
  }
  return payload;
}

function buildDebugScenarios(health) {
  const defaultHostId = Number(health?.defaultHostId || 0);
  const playerIds = [...new Set((health?.players || [])
    .filter((player) => player?.enabled !== false)
    .map((player) => Number(player?.id))
    .filter((id) => Number.isSafeInteger(id) && id > 0 && id !== defaultHostId))]
    .slice(0, REQUIRED_PLAYER_COUNT);

  if (playerIds.length < REQUIRED_PLAYER_COUNT) {
    throw new Error(
      `调试流程需要 ${REQUIRED_PLAYER_COUNT} 名可用 AI 玩家，当前只有 ${playerIds.length} 名。`,
    );
  }

  const proIds = playerIds.slice(0, 4);
  const conIds = playerIds.slice(4, 8);
  const judgeIds = playerIds.slice(8, 12);

  return [
    {
      key: 'werewolf',
      label: '狼人杀',
      startPayload: {
        type: 'start',
        mode: 'real',
        gameType: 'werewolf',
        playerIds,
        werewolfMode: 'standard-12',
        clientViewMode: 'god',
        debugMode: true,
      },
    },
    {
      key: 'debate',
      label: '辩论赛',
      startPayload: {
        type: 'start',
        mode: 'real',
        gameType: 'debate',
        playerIds,
        clientViewMode: 'god',
        debugMode: true,
        topic: {
          title: '调试模式是否应复用正式游戏流程？',
          proPosition: '应该复用，以验证真实规则与事件链路',
          conPosition: '不应复用，应建立完全隔离的调试流程',
        },
        debateTeams: {
          proIds,
          conIds,
          judgeIds,
          captainEnabled: true,
          proCaptainId: proIds[0],
          conCaptainId: conIds[0],
        },
      },
    },
  ];
}

function unwrapSocketPayload(message) {
  return message?.event || message?.payload || message;
}

function validateCompletedGame(scenario, game) {
  if (!game || typeof game !== 'object') throw new Error(`${scenario.label} 未返回完整 game。`);
  const gameType = String(game.type || game.gameType || '');
  if (gameType !== scenario.key) {
    throw new Error(`${scenario.label} 返回了错误的游戏类型：${gameType || '空'}。`);
  }
  if (!String(game.id || '').trim()) throw new Error(`${scenario.label} 缺少 game.id。`);
  if (game.debugMode !== true) throw new Error(`${scenario.label} 未保持 debugMode=true。`);
  if (!Array.isArray(game.players) || game.players.length !== REQUIRED_PLAYER_COUNT) {
    throw new Error(`${scenario.label} 玩家数量不是 ${REQUIRED_PLAYER_COUNT}。`);
  }
  if (!String(game.winner || '').trim()) throw new Error(`${scenario.label} 缺少胜负结果。`);
  if (Array.isArray(game.fallbackAudit) && game.fallbackAudit.length > 0) {
    throw new Error(`${scenario.label} 出现了 fallbackAudit，调试路径并非完全确定性。`);
  }

  if (scenario.key === 'werewolf') {
    if (!Array.isArray(game.rounds) || game.rounds.length === 0) {
      throw new Error('狼人杀没有产生任何回合。');
    }
  }

  if (scenario.key === 'debate') {
    if (!Array.isArray(game.phases) || game.phases.length === 0) {
      throw new Error('辩论赛没有产生任何阶段。');
    }
    const speeches = game.phases.flatMap((phase) => Array.isArray(phase?.speeches) ? phase.speeches : []);
    if (speeches.length === 0 || speeches.some((speech) => !String(speech?.text || '').trim())) {
      throw new Error('辩论赛发言为空或不完整。');
    }
    if (!game.mvp || typeof game.mvp !== 'object') throw new Error('辩论赛缺少 MVP 结果。');
  }
}

function createFlowTracker(scenario) {
  const eventTypeCounts = {};
  let messageCount = 0;
  let ackCount = 0;
  let completedGame = null;

  return {
    accept(message) {
      messageCount += 1;
      if (message?.ackId != null) ackCount += 1;
      const payload = unwrapSocketPayload(message);
      const eventType = String(payload?.type || payload?.workflowEvent || 'unknown');
      eventTypeCounts[eventType] = (eventTypeCounts[eventType] || 0) + 1;
      if (eventType === 'error') {
        throw new Error(`${scenario.label} 服务端错误：${String(payload?.message || payload?.error || '未知错误')}`);
      }
      if (eventType !== 'workflow-completed') return null;
      validateCompletedGame(scenario, payload.game);
      completedGame = payload.game;
      return completedGame;
    },
    assertCompleted() {
      if (!completedGame) throw new Error(`${scenario.label} WebSocket 在 workflow-completed 前关闭。`);
    },
    summary(durationMs) {
      this.assertCompleted();
      const phases = Array.isArray(completedGame.phases) ? completedGame.phases : [];
      return {
        key: scenario.key,
        label: scenario.label,
        ok: true,
        gameId: String(completedGame.id),
        winner: String(completedGame.winner),
        durationMs,
        messageCount,
        ackCount,
        eventTypeCounts,
        playerCount: completedGame.players.length,
        roundCount: Array.isArray(completedGame.rounds) ? completedGame.rounds.length : 0,
        phaseCount: phases.length,
        speechCount: phases.reduce(
          (total, phase) => total + (Array.isArray(phase?.speeches) ? phase.speeches.length : 0),
          0,
        ),
      };
    },
  };
}

module.exports = {
  REQUIRED_PLAYER_COUNT,
  parseApiData,
  buildDebugScenarios,
  unwrapSocketPayload,
  validateCompletedGame,
  createFlowTracker,
};
