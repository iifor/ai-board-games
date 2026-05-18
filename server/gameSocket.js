const { WebSocketServer } = require('ws');
const { getAiConfig } = require('./aiConfig');
const { getDb } = require('./db');
const { createAiGame } = require('./aiGameRunner');
const { runAiDebate } = require('./aiDebateRunner');
const { runAiWerewolf } = require('./aiWerewolfRunner');
const { getWerewolfModeConfig } = require('./werewolfModes');
const { getGame, getVoicePackage, listPlayers, saveGameRecord } = require('./adminStore');
const { prepareVoiceAudio } = require('./services/audio/audioResourceCache');
const { splitPlayableTextSegments } = require('./services/debate/textSegments');

function attachGameSocket(server) {
  const wss = new WebSocketServer({ server, path: '/api/toc/ws/game' });

  wss.on('connection', (socket) => {
    const session = createSession(socket);

    socket.on('message', async (raw) => {
      const message = parseMessage(raw);
      if (!message) return;

      if (message.type === 'start') {
        runSession(session, message.mode || 'real', message.playerIds, message.gameType, {
          topic: message.topic,
          debateTeams: message.debateTeams,
          hostId: message.hostId,
          werewolfMode: message.werewolfMode,
          replayGameId: message.replayGameId
        }).catch((error) => {
          if (isSessionCancelled(error)) return;
          console.error(error);
          session.send({ type: 'error', message: error.message });
        });
      }

      if (message.type === 'ack') {
        session.resolveAck(message.ackId);
      }

      if (message.type === 'control') {
        session.setPaused(message.action === 'pause');
        if (message.action === 'skip-phase') session.skipCurrentPhase();
      }
    });
  });
}

async function runSession(session, mode, playerIds, gameType = 'consensus', options = {}) {
  const safeGameType = normalizeGameType(gameType);
  if (mode !== 'real') throw new Error('全局已禁用 Mock 模式，只支持真实模式。');
  if (options.replayGameId) {
    await replayGameSession(session, safeGameType, options.replayGameId);
    return;
  }
  const config = getRequestConfig(mode, playerIds, safeGameType, options);

  const sender = createPreparedSender(session, safeGameType === 'debate' ? { phaseLookahead: 1 } : { prefetchCount: 2 });

  if (safeGameType !== 'debate') {
    await sender.send({
      type: 'host',
      message: getStartMessage(safeGameType),
      game: { type: safeGameType, host: publicSocketHost(config.host) }
    });
  }

  const runner = getRunner(safeGameType);
  const game = await runner(config, {
    onEvent: (event) => sender.enqueue(event)
  });
  await sender.flush();

  saveGameRecord({ ...game, audioResources: sender.getAudioResources() });

  await sender.send({
    type: 'done',
    message: getDoneMessage(safeGameType),
    game
  });
  session.close();
}

async function replayGameSession(session, gameType, replayGameId) {
  const game = getGame(replayGameId);
  if (!game) throw new Error('历史对局不存在。');
  if (normalizeGameType(game.gameType || game.type) !== gameType) throw new Error('历史对局类型与当前游戏不匹配。');
  const replayGame = enrichReplayPlayers(normalizeReplayGame(game));
  const sender = createPreparedSender(session, gameType === 'debate' ? { phaseLookahead: 1 } : { prefetchCount: 2 });

  const replayPlayers = gameType === 'werewolf' ? createWerewolfReplayPlayers(replayGame.players || []) : replayGame.players || [];
  await sender.send({ type: 'players', players: replayPlayers, game: getPlaybackGameSnapshot(replayGame) });
  for (const event of buildReplayPlaybackEvents(replayGame)) {
    await sender.enqueue(event);
  }
  await sender.flush();
  await sender.send({ type: 'game', game: replayGame });
  session.close();
}

function normalizeReplayGame(game) {
  if (game.gameType === 'debate') {
    return {
      ...game,
      type: 'debate',
      phases: Array.isArray(game.phases) ? game.phases : getDebatePhasesFromRounds(game.rounds || [])
    };
  }
  return {
    ...game,
    type: game.gameType || game.type || 'consensus'
  };
}

function enrichReplayPlayers(game) {
  const latestPlayers = new Map(listPlayers().map((player) => [Number(player.id), player]));
  const players = (game.players || []).map((player) => {
    const latest = latestPlayers.get(Number(player.id));
    if (!latest) return player;
    return {
      ...player,
      avatar: latest.avatar || player.avatar || '',
      avatarUrl: latest.avatar || player.avatarUrl || player.avatar || '',
      voicePackageId: latest.voicePackageId || player.voicePackageId || null,
      personality: latest.personality || player.personality || '',
      sex: latest.sex || player.sex || ''
    };
  });
  return { ...game, players };
}

function getPlaybackGameSnapshot(game, phases = []) {
  if (!game) return game;
  return {
    ...game,
    phases,
    rounds: phases.map((phase, index) => ({
      number: index + 1,
      phase: phase.id,
      title: phase.name,
      speeches: phase.speeches || []
    })),
    winner: null,
    mvp: null,
    winReason: '',
    shareReport: null
  };
}

function buildReplayEvents(game) {
  if (game.type === 'debate') return buildDebateReplayEvents(game);
  if (game.type === 'werewolf') return buildWerewolfReplayEvents(game);
  return buildConsensusReplayEvents(game);
}

function buildReplayPlaybackEvents(game) {
  if (game.type === 'werewolf') return buildWerewolfReplayPlaybackEvents(game);
  if (game.type !== 'debate') {
    return buildReplayEvents(game).map((event) => ({ ...event, game }));
  }
  const events = [];
  const playedPhases = [];
  for (const phase of game.phases || []) {
    const currentPhase = { ...phase, speeches: [] };
    events.push({
      type: 'phase-start',
      phase: currentPhase,
      game: getPlaybackGameSnapshot(game, [...playedPhases, currentPhase])
    });
    for (const speech of getRoundSpeeches(phase)) {
      const normalizedSpeech = normalizeDebateSpeech(speech);
      currentPhase.speeches.push(normalizedSpeech);
      events.push({
        type: 'speech',
        phase: currentPhase,
        speech: normalizedSpeech,
        game: getPlaybackGameSnapshot(game, [...playedPhases, currentPhase])
      });
    }
    events.push({
      type: 'phase-end',
      phase: currentPhase,
      game: getPlaybackGameSnapshot(game, [...playedPhases, currentPhase])
    });
    playedPhases.push(currentPhase);
  }
  return events;
}

function buildWerewolfReplayPlaybackEvents(game) {
  const events = [];
  const replayPlayers = createWerewolfReplayPlayers(game.players || []);
  const visibleRounds = [];
  for (const sourceRound of game.rounds || []) {
    const nightRound = createWerewolfVisibleRound(sourceRound, 'night-start');
    visibleRounds.push(nightRound);
    events.push({
      type: 'phase-start',
      phase: 'night',
      round: nightRound,
      message: sourceRound.title || `第 ${sourceRound.day || sourceRound.number || visibleRounds.length} 轮`,
      game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds)
    });

    applyWerewolfNightDeaths(replayPlayers, sourceRound);
    Object.assign(nightRound, createWerewolfVisibleRound(sourceRound, 'night-result'));
    events.push({
      type: 'night-result',
      round: nightRound,
      game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds)
    });

    for (const testimony of getWerewolfTestimonies(sourceRound)) {
      events.push({
        type: 'last-words',
        round: nightRound,
        testimony,
        game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds)
      });
    }

    Object.assign(nightRound, createWerewolfVisibleRound(sourceRound, 'day-start'));
    events.push({
      type: 'day-start',
      round: nightRound,
      game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds)
    });

    const speeches = getRoundSpeeches(sourceRound);
    for (const speech of speeches) {
      nightRound.speeches = [...(nightRound.speeches || []), speech];
      events.push({
        type: 'speech',
        round: nightRound,
        speech,
        game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds)
      });
    }

    applyWerewolfDayEliminations(replayPlayers, sourceRound);
    Object.assign(nightRound, createWerewolfVisibleRound(sourceRound, 'vote-result'));
    events.push({
      type: 'vote-result',
      round: nightRound,
      game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds)
    });
  }
  if (game.winner) {
    events.push({
      type: 'game',
      game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds, true)
    });
  }
  return events;
}

function createWerewolfReplaySnapshot(game, players, rounds, includeResult = false) {
  return {
    ...game,
    players: players.map((player) => ({ ...player })),
    rounds: rounds.map((round) => ({ ...round, night: { ...(round.night || {}) }, speeches: [...(round.speeches || [])] })),
    winner: includeResult ? game.winner : null,
    winReason: includeResult ? game.winReason : ''
  };
}

function createWerewolfReplayPlayers(players) {
  return players.map((player) => ({
    ...player,
    alive: true,
    deathDay: null,
    deathReason: '',
    lastWords: []
  }));
}

function createWerewolfVisibleRound(round = {}, stage) {
  const base = {
    ...round,
    phase: stage === 'night-start' || stage === 'night-result' ? 'night' : 'day',
    night: { ...(round.night || {}) },
    speeches: [],
    votes: {},
    voteTally: {},
    exile: null,
    idiotReveal: null,
    hunterShot: null
  };
  if (stage === 'night-start') {
    base.night = { ...(round.night || {}), deaths: [] };
  }
  if (stage === 'day-start') {
    base.speeches = [];
  }
  if (stage === 'vote-result') {
    base.speeches = getRoundSpeeches(round);
    base.votes = round.votes || {};
    base.voteTally = round.voteTally || {};
    base.exile = round.exile || null;
    base.idiotReveal = round.idiotReveal || null;
    base.hunterShot = round.hunterShot || null;
  }
  return base;
}

function applyWerewolfNightDeaths(players, round = {}) {
  for (const item of round.night?.deaths || []) {
    applyWerewolfReplayDeath(players, item.id ?? item.playerId, round.day, item.reason || item.deathReason || '夜晚死亡');
  }
}

function applyWerewolfDayEliminations(players, round = {}) {
  if (round.exile?.id) applyWerewolfReplayDeath(players, round.exile.id, round.day, round.exile.deathReason || round.exile.reason || '放逐');
  if (round.hunterShot?.target) applyWerewolfReplayDeath(players, round.hunterShot.target, round.day, '猎人带走');
}

function applyWerewolfReplayDeath(players, id, day, reason) {
  const player = players.find((item) => Number(item.id) === Number(id));
  if (!player) return;
  player.alive = false;
  player.deathDay = day || player.deathDay || null;
  player.deathReason = reason || player.deathReason || '出局';
}

function buildConsensusReplayEvents(game) {
  return (game.rounds || []).flatMap((round) => [
    { type: 'round-start', round },
    { type: 'vote-result', round },
    { type: 'clue-result', round },
    ...getRoundSpeeches(round).map((speech) => ({ type: 'speech', round, speech }))
  ]);
}

function buildDebateReplayEvents(game) {
  return (game.phases || []).flatMap((phase) => [
    { type: 'phase-start', phase },
    ...getRoundSpeeches(phase).map((speech) => ({ type: 'speech', phase, speech: normalizeDebateSpeech(speech) })),
    { type: 'phase-end', phase }
  ]);
}

function buildWerewolfReplayEvents(game) {
  return (game.rounds || []).flatMap((round) => [
    { type: 'phase-start', round, message: round.title || `第 ${round.day || round.number || 1} 轮` },
    ...getRoundSpeeches(round).map((speech) => ({ type: 'speech', round, speech })),
    ...getWerewolfTestimonies(round).map((testimony) => ({ type: 'last-words', round, testimony })),
    { type: 'day-start', round },
    { type: 'vote-result', round }
  ]);
}

function getDebatePhasesFromRounds(rounds = []) {
  return rounds.map((round, index) => ({
    id: round.phase || round.id || `phase-${index + 1}`,
    name: round.title || round.name || `第 ${index + 1} 阶段`,
    speeches: getRoundSpeeches(round)
  }));
}

function getRoundSpeeches(round = {}) {
  return []
    .concat(round.speeches || [])
    .concat(round.items || [])
    .concat(round.discussion || [])
    .filter(Boolean)
    .map((speech) => ({
      ...speech,
      playerId: speech.playerId ?? speech.player_id ?? speech.id,
      text: speech.text || speech.content || speech.message || ''
    }))
    .filter((speech) => speech.text);
}

function normalizeDebateSpeech(speech) {
  return {
    ...speech,
    side: speech.side || (speech.playerId ? '' : 'host'),
    text: speech.text || ''
  };
}

function getWerewolfTestimonies(round = {}) {
  return []
    .concat(round.lastWords || [])
    .concat(round.testimonies || [])
    .filter(Boolean)
    .map((item) => ({
      playerId: item.playerId ?? item.id,
      text: item.text || item.testimony || item.content || ''
    }))
    .filter((item) => item.text);
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
  let paused = false;
  let skipPhaseKey = '';
  const SPEECH_ACK_TIMEOUT_MS = 120000;

  socket.on('close', () => {
    closed = true;
    for (const { reject, timer } of pending.values()) {
      if (timer) clearTimeout(timer);
      reject(createSessionCancelledError());
    }
    pending.clear();
  });

  return {
    send(payload) {
      if (socket.readyState !== socket.OPEN) return;
      socket.send(JSON.stringify(payload));
    },
    sendAndWait(payload) {
      if (closed || socket.readyState !== socket.OPEN) return Promise.reject(createSessionCancelledError());
      const payloadPhaseKey = getEventPhaseKey(payload);
      if (skipPhaseKey && payloadPhaseKey === skipPhaseKey) return Promise.resolve();
      if (skipPhaseKey && payloadPhaseKey && payloadPhaseKey !== skipPhaseKey) skipPhaseKey = '';
      const ackId = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ ...payload, ackId }));
      return new Promise((resolve, reject) => {
        const item = { resolve, reject, promptCount: 0, timer: null, payload };
        if (isSpeechWaitPayload(payload)) {
          item.timer = setTimeout(() => handleSpeechAckTimeout(ackId), SPEECH_ACK_TIMEOUT_MS);
        }
        pending.set(ackId, item);
      });
    },
    resolveAck(ackId) {
      const item = pending.get(ackId);
      if (!item) return;
      if (item.timer) clearTimeout(item.timer);
      pending.delete(ackId);
      item.resolve();
    },
    close() {
      if (socket.readyState === socket.OPEN) socket.close();
    },
    setPaused(value) {
      paused = Boolean(value);
      for (const [ackId, item] of pending.entries()) {
        if (!isSpeechWaitPayload(item.payload)) continue;
        if (item.timer) {
          clearTimeout(item.timer);
          item.timer = null;
        }
        if (!paused) {
          item.timer = setTimeout(() => handleSpeechAckTimeout(ackId), SPEECH_ACK_TIMEOUT_MS);
        }
      }
    },
    skipCurrentPhase() {
      let targetPhaseKey = '';
      for (const [ackId, item] of pending.entries()) {
        const key = getEventPhaseKey(item.payload);
        if (!targetPhaseKey && key) targetPhaseKey = key;
        if (item.timer) clearTimeout(item.timer);
        pending.delete(ackId);
        item.resolve();
      }
      if (targetPhaseKey) skipPhaseKey = targetPhaseKey;
    }
  };

  function handleSpeechAckTimeout(ackId) {
    const item = pending.get(ackId);
    if (!item || closed || socket.readyState !== socket.OPEN) return;
    if (paused) {
      item.timer = null;
      return;
    }

    item.promptCount += 1;
    if (item.promptCount <= 2) {
      socket.send(JSON.stringify({
        type: 'host',
        message: `主持人提醒：当前玩家超过30秒未完成发言，请继续发言。（第${item.promptCount}次提醒）`
      }));
      item.timer = setTimeout(() => handleSpeechAckTimeout(ackId), SPEECH_ACK_TIMEOUT_MS);
      return;
    }

    socket.send(JSON.stringify({
      type: 'host',
      message: '主持人提示：本次发言超时超过两次，跳过本次发言，进入下一位。'
    }));
    pending.delete(ackId);
    item.resolve();
  }
}

function isSpeechWaitPayload(payload) {
  return payload?.type === 'speech' || payload?.type === 'last-words' || payload?.type === 'exile-words';
}

function getRequestConfig(mode, playerIds, gameType = 'consensus', options = {}) {
  const config = withSelectedPlayers(getAiConfig(), playerIds);
  const selected = gameType === 'debate' && hasDebateTeamConfig(options.debateTeams)
    ? selectDebateTeamPlayers(config, options.debateTeams)
    : selectPlayersForGame(config, playerIds, gameType, options);
  const host = resolveRequestHost(config, options.hostId);
  const selectedProviders = new Set([host.provider, ...selected.map((player) => player.provider)]);
  const missingProviders = config.missingProviders.filter((item) => selectedProviders.has(item.provider));
  const scopedConfig = {
    ...config,
    host,
    players: selected,
    selectedPlayerIds: selected.map((player) => player.id),
    gameType,
    topic: options.topic || null,
    debateTeams: options.debateTeams || null,
    werewolfMode: options.werewolfMode || null,
    missingProviders,
    realReady: missingProviders.length === 0
  };
  if (mode !== 'real') throw new Error('全局已禁用 Mock 模式，只支持真实模式。');

  if (scopedConfig.missingProviders.length) {
    const missing = scopedConfig.missingProviders.map((item) => `${item.provider}(${item.apiKeyEnv})`).join('、');
    throw new Error(`真实模式缺少 API Key：${missing}。请在 .env 或 B 端模型管理中配置。`);
  }
  return { ...scopedConfig, mode: 'real' };
}

function resolveRequestHost(config, hostId) {
  const id = Number(hostId);
  if (!id) return config.host;
  const player = config.players.find((item) => Number(item.id) === id);
  if (!player) return config.host;
  return {
    ...config.host,
    id: player.id,
    name: player.name || player.nickname || config.host.name,
    nickname: player.nickname || player.name || config.host.nickname,
    provider: player.provider,
    providerName: player.providerName || player.provider,
    baseUrl: player.baseUrl,
    apiKeyEnv: player.apiKeyEnv,
    apiKey: player.apiKey,
    apiFormat: player.apiFormat,
    model: player.model,
    modelId: player.modelId,
    temperature: Number(player.temperature ?? config.host.temperature ?? 0.35),
    personality: player.personality || '',
    sex: player.sex || '',
    avatar: player.avatar || '',
    avatarUrl: player.avatarUrl || player.avatar || '',
    voicePackageId: player.voicePackageId || null
  };
}

function publicSocketHost(host = {}) {
  return {
    id: host.id || 0,
    name: host.name || host.nickname || '主持人',
    nickname: host.nickname || host.name || '主持人',
    avatar: host.avatar || '',
    avatarUrl: host.avatarUrl || host.avatar || '',
    voicePackageId: host.voicePackageId || null
  };
}

function hasDebateTeamConfig(value) {
  return value && Array.isArray(value.proIds) && Array.isArray(value.conIds);
}

function selectDebateTeamPlayers(config, debateTeams) {
  const ids = normalizeDebateTeamPlayerIds(debateTeams);
  const selected = ids
    .map((id) => config.players.find((player) => Number(player.id) === Number(id)))
    .filter(Boolean);
  if (selected.length < 8 || selected.length > 12) {
    throw new Error('AI 辩论赛玩家配置无效：正方、反方和评委人数不正确。');
  }
  return selected;
}

function normalizeDebateTeamPlayerIds(debateTeams) {
  const ids = [
    ...normalizeIdList(debateTeams.proIds).slice(0, 4),
    ...normalizeIdList(debateTeams.conIds).slice(0, 4),
    ...normalizeIdList(debateTeams.judgeIds)
  ];
  return [...new Set(ids)];
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter(Boolean);
}

function selectPlayersForGame(config, playerIds, gameType, options = {}) {
  const explicitIds = Array.isArray(playerIds) ? playerIds.map(Number).filter(Boolean) : [];
  const ids = explicitIds.length ? explicitIds : getSavedPlayerIds(gameType);
  const expectedWerewolfCount = gameType === 'werewolf' ? getWerewolfModeConfig(options.werewolfMode).roles.length : 12;
  const selected = ids.length
    ? ids.map((id) => config.players.find((player) => Number(player.id) === id)).filter(Boolean)
    : config.players.slice(0, gameType === 'debate' ? 12 : gameType === 'werewolf' ? expectedWerewolfCount : 7);

  if (gameType === 'debate') {
    if (selected.length < 8 || selected.length > 12) {
      throw new Error('AI 辩论赛需要选择 8-12 位 AI 玩家。');
    }
    return selected;
  }

  if (gameType === 'werewolf') {
    if (selected.length !== expectedWerewolfCount) {
      throw new Error(`AI 狼人杀当前模式需要选择恰好 ${expectedWerewolfCount} 位 AI 玩家。`);
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

function getSavedPlayerIds(gameType) {
  try {
    const row = getDb().prepare('SELECT player_ids_json AS playerIdsJson FROM game_player_selections WHERE game_type = ?').get(gameType);
    if (!row) return [];
    const parsed = JSON.parse(row.playerIdsJson);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseMessage(raw) {
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function createPreparedSender(session, options = {}) {
  const queue = [];
  let drainPromise = null;
  const audioResources = new Set();
  const prefetchCount = Number(options.prefetchCount) || 2;
  const phaseLookahead = Number.isInteger(options.phaseLookahead) ? options.phaseLookahead : null;

  async function enqueue(event) {
    if (phaseLookahead != null) {
      while (queue.length && exceedsPhaseLookahead([...queue.map((item) => item.event), event], phaseLookahead)) {
        try {
          await queue[0].done;
        } catch (error) {
          if (isSessionCancelled(error)) return;
          throw error;
        }
      }
    }
    const item = {};
    item.event = event;
    item.prepared = prepareOutgoingEvent(event);
    item.done = new Promise((resolve, reject) => {
      item.resolve = resolve;
      item.reject = reject;
    });
    item.done.catch(() => {});
    queue.push(item);
    if (!drainPromise) {
      drainPromise = drain();
      drainPromise.catch(() => {});
    }
    if (phaseLookahead == null && queue.length > prefetchCount) {
      try {
        await queue[0].done;
      } catch (error) {
        if (isSessionCancelled(error)) return;
        throw error;
      }
    }
  }

  async function drain() {
    try {
      while (queue.length) {
        const item = queue[0];
        try {
          const prepared = await item.prepared;
          collectPreparedAudioResources(prepared, audioResources);
          await session.sendAndWait(prepared);
          item.resolve();
        } catch (error) {
          item.reject(error);
          throw error;
        } finally {
          queue.shift();
        }
      }
    } finally {
      drainPromise = null;
    }
  }

  return {
    enqueue,
    getAudioResources() {
      return [...audioResources];
    },
    async flush() {
      if (!drainPromise) return;
      try {
        await drainPromise;
      } catch (error) {
        if (isSessionCancelled(error)) return;
        throw error;
      }
    },
    async send(event) {
      await enqueue(event);
      if (!drainPromise) return;
      try {
        await drainPromise;
      } catch (error) {
        if (isSessionCancelled(error)) return;
        throw error;
      }
    }
  };
}

function exceedsPhaseLookahead(events, phaseLookahead) {
  const phaseKeys = [];
  for (const event of events) {
    const key = getEventPhaseKey(event);
    if (!key || phaseKeys.includes(key)) continue;
    phaseKeys.push(key);
  }
  return phaseKeys.length > phaseLookahead + 1;
}

function getEventPhaseKey(event) {
  const phase = event?.phase || event?.round;
  if (!phase) return '';
  return String(phase.id || phase.phase || phase.name || phase.title || phase.number || '');
}

function createSessionCancelledError() {
  const error = new Error('game-session-cancelled');
  error.code = 'GAME_SESSION_CANCELLED';
  return error;
}

function isSessionCancelled(error) {
  return error?.code === 'GAME_SESSION_CANCELLED' || error?.message === 'game-session-cancelled';
}

function prepareOutgoingEvent(event) {
  return prepareEventMedia(withNarration(cloneEvent(event)));
}

function collectPreparedAudioResources(event, target) {
  if (event?.audioUrl) target.add(event.audioUrl);
  (event?.audioSegments || []).forEach((segment) => {
    if (segment?.audioUrl) target.add(segment.audioUrl);
  });
}

function cloneEvent(event) {
  return JSON.parse(JSON.stringify(event || {}));
}

function withNarration(event) {
  return {
    ...event,
    narration: getNarration(event)
  };
}

async function prepareEventMedia(event) {
  const text = getPlayableEventText(event);
  const subtitle = text ? {
    text,
    playerId: event.speech?.playerId || event.testimony?.playerId || null,
    speakerRole: getEventSpeakerRole(event, text),
    speakerLabel: getEventSpeakerLabel(event, text)
  } : null;
  const result = subtitle ? { ...withPlayableDetails(event, text), subtitle } : withPlayableDetails(event, text);
  if (!text) return result;

  const voice = resolveEventVoice(event);
  if (!voice || !voice.enabled || String(voice.provider || '').toLowerCase() !== 'azure') return result;

  try {
    if (event.game?.type === 'debate' && event.speech?.playerId) {
      const segments = splitPlayableTextSegments(text);
      const preparedSegments = await Promise.all(segments.map(async (segment, index) => {
        const saved = await prepareVoiceAudio(voice, segment);
        return saved ? {
          index,
          text: segment,
          audioUrl: saved.audioUrl,
          audioMimeType: saved.audioMimeType,
          audioCached: saved.audioCached
        } : null;
      }));
      return {
        ...result,
        audioSegments: preparedSegments.filter(Boolean)
      };
    }
    const saved = await prepareVoiceAudio(voice, text);
    if (!saved) return result;
    return {
      ...result,
      audioUrl: saved.audioUrl,
      audioMimeType: saved.audioMimeType,
      audioCached: saved.audioCached
    };
  } catch (error) {
    return {
      ...result,
      mediaError: error.message
    };
  }
}

function getEventSpeakerRole(event, text = '') {
  if (event.speech?.playerId || event.testimony?.playerId) return 'player';
  if (event.type === 'done') return 'system';
  if (/^游戏开始/.test(String(text || event.message || event.narration || '').trim())) return 'system';
  if (/^游戏结束/.test(String(text || event.message || event.narration || '').trim())) return 'system';
  return 'host';
}

function getEventSpeakerLabel(event, text = '') {
  const role = getEventSpeakerRole(event, text);
  if (role === 'system') return '系统播报';
  if (role === 'host') return '主持人';
  return '';
}

function getPlayableEventText(event) {
  if (event.speech?.text) return String(event.speech.text).trim();
  if (event.testimony?.text) return String(event.testimony.text).trim();
  if (event.testimony?.testimony) return String(event.testimony.testimony).trim();
  return String(event.narration || event.message || '').trim();
}

function withPlayableDetails(event, fullText) {
  if (event.speech) {
    return {
      ...event,
      speech: {
        ...event.speech,
        fullText: event.speech.fullText || fullText || event.speech.text || '',
        thinking: event.speech.thinking || event.speech.reasoning || event.speech.thought || ''
      }
    };
  }
  if (event.testimony) {
    return {
      ...event,
      testimony: {
        ...event.testimony,
        fullText: event.testimony.fullText || fullText || event.testimony.text || event.testimony.testimony || '',
        thinking: event.testimony.thinking || event.testimony.reasoning || event.testimony.thought || ''
      }
    };
  }
  return event;
}

function resolveEventVoice(event) {
  const playerId = event.speech?.playerId || event.testimony?.playerId;
  if (playerId) {
    const player = event.game?.players?.find((item) => Number(item.id) === Number(playerId));
    if (player?.voicePackageId) return getVoicePackage(player.voicePackageId);
  }
  if (event.game?.host?.voicePackageId) return getVoicePackage(event.game.host.voicePackageId);
  return null;
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
  if (event.type === 'players') {
    const topic = event.game?.topic || {};
    return '游戏开始';
  }
  if (event.type === 'phase-start' || event.type === 'phase-end') return event.message || '';
  // if (event.type === 'players') return '辩论选手已经入场。正方、反方和评委席已分配完成。';
  if (event.type === 'phase-start') return event.message || `现在进入${event.phase?.name || '下一'}环节。`;
  if (event.type === 'phase-end') return event.message || `${event.phase?.name || '本'}环节结束。`;
  if (event.type === 'speech') {
    if (event.speech.side === 'host') return `主持人点评。${event.speech.text}`;
    const player = event.game.players?.find((item) => Number(item.id) === Number(event.speech.playerId));
    const label = event.speech.speakerLabel || getDebatePlayerLabel(event.game.players || [], event.speech.playerId) || (player ? `${player.sideLabel}${player.debateRoleLabel}` : '辩手');
    return `${label}发言。${event.speech.text}`;
  }
  if (event.type === 'game') {
    const winner = event.game.winner === 'pro' ? '正方' : event.game.winner === 'con' ? '反方' : '双方平局';
    const mvp = event.game.mvp ? `本场最佳辩手是 ${event.game.mvp.nickname || `${event.game.mvp.id}号`}。` : '';
    return `辩论赛进入赛果公布。${winner}。${mvp}`;
  }
  return event.message || '';
}

function getDebatePlayerLabel(players, playerId) {
  const player = players.find((item) => Number(item.id) === Number(playerId));
  if (!player) return '';
  if (player.side === 'judge') return '评委';
  const sidePlayers = players.filter((item) => item.side === player.side);
  const index = sidePlayers.findIndex((item) => Number(item.id) === Number(playerId));
  const sideLabel = player.side === 'pro' ? '正方' : '反方';
  return `${sideLabel}${['零', '一', '二', '三', '四'][index + 1] || index + 1}辩`;
}

function getConsensusTypeName(type) {
  if (type === 'overConsensus') return '过度共识';
  if (type === 'effective') return '有效共识';
  return '共识失败';
}

module.exports = {
  attachGameSocket
};
