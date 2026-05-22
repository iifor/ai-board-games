const { getGame } = require('../games');
const { listPlayers } = require('../players');
const { getWerewolfModeConfig } = require('../werewolf-config');
const { createProjectionContext, projectWerewolfEvent, projectWerewolfGame, projectPlayers } = require('../werewolf/views/viewPolicy');
const { buildDayStartMessage, buildNightPublicMessage, buildSheriffStartMessage, buildSheriffResultMessage, getWerewolfNightPrompt } = require('../werewolf/announcements');
const { createPreparedSender } = require('./sender');
const { createSessionCancelledError, isSessionCancelled } = require('./session');

async function replayGameSession(session, gameType, replayGameId, options = {}) {
  const game = getGame(replayGameId);
  if (!game) throw new Error('历史对局不存在。');
  if (normalizeGameType(game.gameType || game.type) !== gameType) throw new Error('历史对局类型与当前游戏不匹配。');
  const replayGame = enrichReplayPlayers(normalizeReplayGame(game));
  const sender = createPreparedSender(session, gameType === 'debate' ? { phaseLookahead: 1 } : { prefetchCount: 2 });

  const replayProjection = gameType === 'werewolf'
    ? createProjectionContext(replayGame, options.replayView || {})
    : null;
  const replayPlayers = gameType === 'werewolf' ? createWerewolfReplayPlayers(replayGame.players || []) : replayGame.players || [];
  await sender.send({
    type: 'players',
    players: replayProjection ? projectPlayers(replayPlayers, replayProjection) : replayPlayers,
    game: replayProjection ? projectWerewolfGame(getPlaybackGameSnapshot(replayGame), replayProjection) : getPlaybackGameSnapshot(replayGame)
  });
  for (const event of buildReplayPlaybackEvents(replayGame)) {
    const projected = replayProjection ? projectWerewolfEvent(event, replayProjection) : event;
    if (projected) await sender.enqueue(projected);
  }
  await sender.flush();
  await sender.send({ type: 'game', game: replayProjection ? projectWerewolfGame(replayGame, replayProjection) : replayGame });
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
  return { ...game, type: game.gameType || game.type || 'werewolf' };
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

function buildReplayPlaybackEvents(game) {
  if (game.type === 'werewolf') return buildWerewolfReplayPlaybackEvents(game);
  if (game.type === 'debate') {
    const events = [];
    const playedPhases = [];
    for (const phase of game.phases || []) {
      const currentPhase = { ...phase, speeches: [] };
      events.push({ type: 'phase-start', phase: currentPhase, game: getPlaybackGameSnapshot(game, [...playedPhases, currentPhase]) });
      for (const speech of getRoundSpeeches(phase)) {
        const normalizedSpeech = normalizeDebateSpeech(speech);
        currentPhase.speeches.push(normalizedSpeech);
        events.push({ type: 'speech', phase: currentPhase, speech: normalizedSpeech, game: getPlaybackGameSnapshot(game, [...playedPhases, currentPhase]) });
      }
      events.push({ type: 'phase-end', phase: currentPhase, game: getPlaybackGameSnapshot(game, [...playedPhases, currentPhase]) });
      playedPhases.push(currentPhase);
    }
    return events;
  }
  return [];
}

function buildWerewolfReplayPlaybackEvents(game) {
  const events = [];
  const replayPlayers = createWerewolfReplayPlayers(game.players || []);
  const visibleRounds = [];
  for (const sourceRound of game.rounds || []) {
    const nightRound = createWerewolfVisibleRound(sourceRound, 'night-start');
    const nightPhaseKey = getWerewolfReplayPhaseKey(sourceRound, visibleRounds.length + 1, 'night');
    const dayPhaseKey = getWerewolfReplayPhaseKey(sourceRound, visibleRounds.length + 1, 'day');
    visibleRounds.push(nightRound);
    events.push({ type: 'phase-start', phase: 'night', phaseKey: nightPhaseKey, round: nightRound, message: '天黑请闭眼', game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds) });

    appendWerewolfNightPlaybackEvents(events, sourceRound, nightRound, nightPhaseKey, game, replayPlayers, visibleRounds);
    Object.assign(nightRound, createWerewolfVisibleRound(sourceRound, 'day-start'));
    events.push({ type: 'day-start', phaseKey: dayPhaseKey, round: nightRound, message: buildDayStartMessage(), game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds) });

    if (shouldReplayFirstDaySheriffBeforeNightResult(sourceRound)) {
      appendWerewolfSheriffPlaybackEvents(events, sourceRound, nightRound, dayPhaseKey, game, replayPlayers, visibleRounds);
    }

    applyWerewolfNightDeaths(replayPlayers, sourceRound);
    Object.assign(nightRound, createWerewolfVisibleRound(sourceRound, 'night-result'));
    events.push({ type: 'night-result', phaseKey: dayPhaseKey, round: nightRound, message: buildNightPublicMessage(nightRound), game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds) });
    appendWerewolfBadgePlaybackEvents(events, sourceRound, nightRound, dayPhaseKey, game, replayPlayers, visibleRounds, 'night');

    if (!shouldReplayFirstDaySheriffBeforeNightResult(sourceRound)) {
      appendWerewolfSheriffPlaybackEvents(events, sourceRound, nightRound, dayPhaseKey, game, replayPlayers, visibleRounds);
    }

    for (const testimony of getWerewolfNightTestimonies(sourceRound)) {
      events.push({ type: 'last-words', phaseKey: dayPhaseKey, round: nightRound, testimony, game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds) });
    }

    if (sourceRound.daySpeech) {
      nightRound.daySpeech = sourceRound.daySpeech;
      events.push({ type: 'speech-order', phaseKey: dayPhaseKey, round: nightRound, game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds) });
    }

    const speeches = getRoundSpeeches(sourceRound);
    for (const speech of speeches) {
      nightRound.speeches = [...(nightRound.speeches || []), speech];
      events.push({ type: 'speech', phaseKey: dayPhaseKey, round: nightRound, speech, game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds) });
    }

    applyWerewolfDayEliminations(replayPlayers, sourceRound);
    Object.assign(nightRound, createWerewolfVisibleRound(sourceRound, 'vote-result'));
    events.push({ type: 'vote-result', phaseKey: dayPhaseKey, round: nightRound, game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds) });
    appendWerewolfBadgePlaybackEvents(events, sourceRound, nightRound, dayPhaseKey, game, replayPlayers, visibleRounds, 'day');

    for (const testimony of getWerewolfExileTestimonies(sourceRound)) {
      events.push({ type: 'exile-words', phaseKey: dayPhaseKey, round: nightRound, testimony, game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds) });
    }
  }
  if (game.winner) {
    events.push({ type: 'game', game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds, true) });
  }
  return events;
}

function getWerewolfReplayPhaseKey(round = {}, roundIndex, phase) {
  return `werewolf-${round.day || round.number || roundIndex}-${phase}`;
}

function appendWerewolfSheriffPlaybackEvents(events, sourceRound, visibleRound, phaseKey, game, replayPlayers, visibleRounds) {
  if (!shouldReplaySheriffElection(sourceRound)) return;
  const election = sourceRound.sheriffElection || {};
  visibleRound.sheriffId = null;
  visibleRound.sheriffBadge = { ...(visibleRound.sheriffBadge || {}), status: 'none' };
  visibleRound.sheriffElection = {
    ...election, speeches: [], withdrawnIds: [],
    candidates: election.signedUpIds || election.candidates || [],
    votes: {}, tally: {}, runoffSpeeches: [], runoffVotes: {}, runoffTally: {},
    sheriffId: null, result: 'pending'
  };
  pushWerewolfPlaybackEvent(events, 'sheriff-start', phaseKey, visibleRound, game, replayPlayers, visibleRounds, {
    sheriffCandidateIds: visibleRound.sheriffElection.candidates,
    message: buildSheriffStartMessage(visibleRound)
  });

  for (const speech of election.speeches || []) {
    visibleRound.sheriffElection.speeches = [...visibleRound.sheriffElection.speeches, speech];
    pushWerewolfPlaybackEvent(events, 'sheriff-speech', phaseKey, visibleRound, game, replayPlayers, visibleRounds, { speech, sheriffCandidateIds: visibleRound.sheriffElection.candidates });
  }

  visibleRound.sheriffElection.withdrawnIds = election.withdrawnIds || [];
  visibleRound.sheriffElection.candidates = election.candidates || [];
  pushWerewolfPlaybackEvent(events, 'sheriff-candidates', phaseKey, visibleRound, game, replayPlayers, visibleRounds, { sheriffCandidateIds: visibleRound.sheriffElection.candidates });

  visibleRound.sheriffElection.voters = election.voters || [];
  visibleRound.sheriffElection.votes = election.votes || {};
  visibleRound.sheriffElection.tally = election.tally || {};
  pushWerewolfPlaybackEvent(events, 'sheriff-vote', phaseKey, visibleRound, game, replayPlayers, visibleRounds, { sheriffCandidateIds: visibleRound.sheriffElection.candidates });

  visibleRound.sheriffElection.runoffCandidateIds = election.runoffCandidateIds || [];
  visibleRound.sheriffElection.runoffSpeechOrder = election.runoffSpeechOrder || [];
  for (const speech of election.runoffSpeeches || []) {
    visibleRound.sheriffElection.runoffSpeeches = [...visibleRound.sheriffElection.runoffSpeeches, speech];
    pushWerewolfPlaybackEvent(events, 'sheriff-runoff-speech', phaseKey, visibleRound, game, replayPlayers, visibleRounds, { speech, sheriffCandidateIds: visibleRound.sheriffElection.runoffCandidateIds });
  }
  if (Object.keys(election.runoffVotes || {}).length || Object.keys(election.runoffTally || {}).length) {
    visibleRound.sheriffElection.runoffVotes = election.runoffVotes || {};
    visibleRound.sheriffElection.runoffTally = election.runoffTally || {};
    pushWerewolfPlaybackEvent(events, 'sheriff-runoff-vote', phaseKey, visibleRound, game, replayPlayers, visibleRounds, { sheriffCandidateIds: visibleRound.sheriffElection.runoffCandidateIds });
  }

  visibleRound.sheriffId = sourceRound.sheriffId || election.sheriffId || null;
  visibleRound.sheriffBadge = sourceRound.sheriffBadge || { status: visibleRound.sheriffId ? 'held' : 'none' };
  visibleRound.sheriffElection.sheriffId = visibleRound.sheriffId;
  visibleRound.sheriffElection.result = election.result;
  pushWerewolfPlaybackEvent(events, 'sheriff-result', phaseKey, visibleRound, game, replayPlayers, visibleRounds, {
    message: buildSheriffResultMessage(visibleRound, game.werewolfMode || {})
  });
}

function appendWerewolfNightPlaybackEvents(events, sourceRound, visibleRound, phaseKey, game, replayPlayers, visibleRounds) {
  const night = sourceRound.night || {};
  const configuredActions = getWerewolfReplayNightActions(game);
  pushWerewolfPlaybackEvent(events, 'wolf-wake', phaseKey, visibleRound, game, replayPlayers, visibleRounds, { message: getWerewolfNightPrompt('wolf-wake') });
  if (night.wolfLeaderId) {
    visibleRound.night.wolfLeaderId = night.wolfLeaderId;
    pushWerewolfPlaybackEvent(events, 'wolf-leader', phaseKey, visibleRound, game, replayPlayers, visibleRounds, { message: `主持人指定 ${night.wolfLeaderId} 号狼人担任本夜狼队领袖。` });
  }
  visibleRound.night.wolfSpeechOrder = night.wolfSpeechOrder || [];
  visibleRound.night.wolfSpeeches = [];
  for (const speech of night.wolfSpeeches || []) {
    visibleRound.night.wolfSpeeches = [...visibleRound.night.wolfSpeeches, speech];
    pushWerewolfPlaybackEvent(events, 'wolf-speech', phaseKey, visibleRound, game, replayPlayers, visibleRounds, { speech });
  }
  visibleRound.night.wolfTarget = night.wolfTarget || null;
  visibleRound.night.wolfChoices = night.wolfChoices || {};
  visibleRound.night.wolfVoteTally = night.wolfVoteTally || {};
  visibleRound.night.wolfTieBreak = night.wolfTieBreak || null;
  pushWerewolfPlaybackEvent(events, 'wolf-vote', phaseKey, visibleRound, game, replayPlayers, visibleRounds);
  if (configuredActions.has('inspectFaction')) {
    pushWerewolfPlaybackEvent(events, 'seer-wake', phaseKey, visibleRound, game, replayPlayers, visibleRounds, { message: getWerewolfNightPrompt('seer-wake') });
    if (night.seerCheck?.target) {
      visibleRound.night.seerCheck = night.seerCheck;
      pushWerewolfPlaybackEvent(events, 'seer-check', phaseKey, visibleRound, game, replayPlayers, visibleRounds, { seerCheck: night.seerCheck });
    }
  }
  if (configuredActions.has('guard')) {
    pushWerewolfPlaybackEvent(events, 'guard-wake', phaseKey, visibleRound, game, replayPlayers, visibleRounds, { message: getWerewolfNightPrompt('guard-wake') });
    visibleRound.night.guardTarget = night.guardTarget || null;
    pushWerewolfPlaybackEvent(events, 'guard-action', phaseKey, visibleRound, game, replayPlayers, visibleRounds);
  }
  if (configuredActions.has('save')) {
    pushWerewolfPlaybackEvent(events, 'witch-antidote', phaseKey, visibleRound, game, replayPlayers, visibleRounds, { message: getWerewolfNightPrompt('witch-antidote') });
    visibleRound.night.witchSave = Boolean(night.witchSave);
    visibleRound.night.witchSaveTarget = night.witchSaveTarget || (night.witchSave ? night.wolfTarget : null);
    pushWerewolfPlaybackEvent(events, 'witch-action', phaseKey, visibleRound, game, replayPlayers, visibleRounds);
  }
  if (configuredActions.has('poison')) {
    pushWerewolfPlaybackEvent(events, 'witch-poison', phaseKey, visibleRound, game, replayPlayers, visibleRounds, { message: getWerewolfNightPrompt('witch-poison') });
    visibleRound.night.witchPoisonTarget = night.witchPoisonTarget || null;
    pushWerewolfPlaybackEvent(events, 'witch-action', phaseKey, visibleRound, game, replayPlayers, visibleRounds);
  }
}

function getWerewolfReplayNightActions(game = {}) {
  const actions = new Set();
  for (const role of game.werewolfMode?.resolvedRoles || []) {
    for (const item of role?.rule?.actions || []) {
      if (item?.action) actions.add(item.action);
    }
  }
  if (actions.size) return actions;
  const replayRoles = new Set((game.players || []).map((player) => player.role).filter(Boolean));
  if (replayRoles.has('seer')) actions.add('inspectFaction');
  if (replayRoles.has('guard')) actions.add('guard');
  if (replayRoles.has('witch')) { actions.add('save'); actions.add('poison'); }
  return actions;
}

function appendWerewolfBadgePlaybackEvents(events, sourceRound, visibleRound, phaseKey, game, replayPlayers, visibleRounds, phase) {
  for (const sheriffTransfer of (sourceRound.sheriffTransfers || []).filter((item) => item.phase === phase)) {
    visibleRound.sheriffTransfers = [...(visibleRound.sheriffTransfers || []), sheriffTransfer];
    visibleRound.sheriffId = sheriffTransfer.action === 'transfer' ? sheriffTransfer.to : null;
    visibleRound.sheriffBadge = { status: sheriffTransfer.action === 'transfer' ? 'held' : 'torn' };
    pushWerewolfPlaybackEvent(events, sheriffTransfer.action === 'transfer' ? 'sheriff-badge-transfer' : 'sheriff-badge-tear', phaseKey, visibleRound, game, replayPlayers, visibleRounds, { sheriffTransfer });
  }
}

function pushWerewolfPlaybackEvent(events, type, phaseKey, round, game, replayPlayers, visibleRounds, extra = {}) {
  events.push({ type, phaseKey, round, ...extra, game: createWerewolfReplaySnapshot(game, replayPlayers, visibleRounds) });
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
  return players.map((player) => ({ ...publicWerewolfReplayPlayer(player), alive: true, deathDay: null, deathReason: '', lastWords: [] }));
}

function publicWerewolfReplayPlayer({ seerChecks, ...player } = {}) {
  return player;
}

function createWerewolfVisibleRound(round = {}, stage) {
  const base = {
    ...round,
    phase: stage === 'night-start' ? 'night' : 'day',
    night: createWerewolfVisibleNight(round.night),
    sheriffTransfers: [],
    daySpeech: null, speeches: [], votes: {}, voteTally: {},
    exile: null, idiotReveal: null, hunterShot: null
  };
  if ((stage === 'night-start' || stage === 'day-start') && shouldReplayFirstDaySheriffBeforeNightResult(round)) {
    base.sheriffId = null;
    base.sheriffBadge = { status: 'none' };
    base.sheriffElection = null;
  }
  if (stage === 'night-start') {
    base.night = { ...createWerewolfVisibleNight(round.night), wolfTarget: null, wolfChoices: {}, wolfVoteTally: {}, wolfTieBreak: null, seerCheck: null, witchSave: false, witchSaveTarget: null, witchPoisonTarget: null, guardTarget: null, deaths: [] };
  }
  if (stage === 'day-start') {
    base.night = { ...base.night, deaths: [] };
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

function shouldReplayFirstDaySheriffBeforeNightResult(round = {}) {
  return Number(round.day) === 1 && Boolean(round.sheriffElection);
}

function createWerewolfVisibleNight(night = {}) {
  return {
    wolfTarget: night.wolfTarget || null, wolfLeaderId: night.wolfLeaderId || null,
    wolfSpeechOrder: night.wolfSpeechOrder || [], wolfSpeeches: night.wolfSpeeches || [],
    wolfChoices: night.wolfChoices || {}, wolfVoteTally: night.wolfVoteTally || {},
    wolfTieBreak: night.wolfTieBreak || null, seerCheck: night.seerCheck || null,
    witchSave: Boolean(night.witchSave),
    witchSaveTarget: night.witchSaveTarget || (night.witchSave ? night.wolfTarget : null),
    witchPoisonTarget: night.witchPoisonTarget || null, guardTarget: night.guardTarget || null,
    deaths: night.deaths || []
  };
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

function buildDebateReplayEvents(game) {
  return (game.phases || []).flatMap((phase) => [
    { type: 'phase-start', phase },
    ...getRoundSpeeches(phase).map((speech) => ({ type: 'speech', phase, speech: normalizeDebateSpeech(speech) })),
    { type: 'phase-end', phase }
  ]);
}

function shouldReplaySheriffElection(round = {}) {
  return Boolean(round.sheriffElection);
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
    .map((speech) => ({ ...speech, playerId: speech.playerId ?? speech.player_id ?? speech.id, text: speech.text || speech.content || speech.message || '' }))
    .filter((speech) => speech.text);
}

function normalizeDebateSpeech(speech) {
  return { ...speech, side: speech.side || (speech.playerId ? '' : 'host'), text: speech.text || '' };
}

function getWerewolfNightTestimonies(round = {}) {
  const nightDeathIds = new Set((round.night?.deaths || [])
    .map((death) => Number(death.id ?? death.playerId))
    .filter(Boolean));
  return getWerewolfTestimonies(round).filter((item) => nightDeathIds.has(Number(item.playerId)));
}

function getWerewolfExileTestimonies(round = {}) {
  const exileId = Number(round.exile?.id ?? round.exile?.playerId);
  return exileId ? getWerewolfTestimonies(round).filter((item) => Number(item.playerId) === exileId) : [];
}

function getWerewolfTestimonies(round = {}) {
  return []
    .concat(round.lastWords || [])
    .concat(round.testimonies || [])
    .filter(Boolean)
    .map((item) => ({ playerId: item.playerId ?? item.id, text: item.text || item.testimony || item.content || '' }))
    .filter((item) => item.text);
}

function normalizeGameType(gameType) {
  if (gameType === 'debate') return 'debate';
  if (gameType === 'werewolf') return 'werewolf';
  return 'werewolf';
}

module.exports = {
  replayGameSession,
  normalizeReplayGame,
  enrichReplayPlayers,
  getPlaybackGameSnapshot,
  buildReplayPlaybackEvents,
  buildWerewolfReplayPlaybackEvents,
  buildDebateReplayEvents,
  appendWerewolfSheriffPlaybackEvents,
  appendWerewolfNightPlaybackEvents,
  appendWerewolfBadgePlaybackEvents,
  pushWerewolfPlaybackEvent,
  createWerewolfReplaySnapshot,
  createWerewolfReplayPlayers,
  publicWerewolfReplayPlayer,
  createWerewolfVisibleRound,
  shouldReplayFirstDaySheriffBeforeNightResult,
  createWerewolfVisibleNight,
  applyWerewolfNightDeaths,
  applyWerewolfDayEliminations,
  applyWerewolfReplayDeath,
  shouldReplaySheriffElection,
  getWerewolfReplayPhaseKey,
  getWerewolfReplayNightActions,
  getDebatePhasesFromRounds,
  getRoundSpeeches,
  normalizeDebateSpeech,
  getWerewolfNightTestimonies,
  getWerewolfExileTestimonies,
  getWerewolfTestimonies
};
