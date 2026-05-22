const VIEW_MODE_GOD = 'god';
const VIEW_MODE_PLAYER = 'player';
const { assertAbortableWerewolfBoundary } = require('../failures/failurePolicy');

const WOLF_EVENT_TYPES = new Set(['wolf-wake', 'wolf-leader', 'wolf-speech', 'wolf-vote']);
const SEER_EVENT_TYPES = new Set(['seer-wake', 'seer-check']);
const GUARD_EVENT_TYPES = new Set(['guard-wake', 'guard-action']);
const WITCH_EVENT_TYPES = new Set(['witch-antidote', 'witch-poison', 'witch-action']);

function normalizeWerewolfViewMode(value) {
  return value === VIEW_MODE_PLAYER ? VIEW_MODE_PLAYER : VIEW_MODE_GOD;
}

function createAudienceSession(players = [], requestedMode = VIEW_MODE_GOD, viewerPlayerId = null) {
  const mode = normalizeWerewolfViewMode(requestedMode);
  if (mode === VIEW_MODE_GOD) return { mode };
  assertAbortableWerewolfBoundary(
    Array.isArray(players) && players.length,
    'VISIBILITY_POLICY_FAILED',
    'Player view requires assigned Werewolf players.'
  );

  const requestedViewer = Number(viewerPlayerId);
  const viewer = players.find((player) => Number(player.id) === requestedViewer)
    || players[Math.floor(Math.random() * players.length)];
  assertAbortableWerewolfBoundary(viewer, 'VISIBILITY_POLICY_FAILED', 'Player view could not resolve a Werewolf viewer.');

  return {
    mode,
    viewerPlayerId: Number(viewer.id),
    viewerRoleId: viewer.role,
    viewerFaction: viewer.faction,
    lockMode: 'fixed',
    afterDeath: 'dead-player-view'
  };
}

function getStoredAudienceSession(game = {}) {
  const stored = game.audienceSession || game.event?.audienceSession || {};
  const mode = normalizeWerewolfViewMode(game.clientViewMode || game.event?.clientViewMode || stored.mode);
  if (mode === VIEW_MODE_GOD) return { mode };
  return {
    mode,
    viewerPlayerId: Number(stored.viewerPlayerId) || null,
    viewerRoleId: stored.viewerRoleId || null,
    viewerFaction: stored.viewerFaction || null,
    lockMode: stored.lockMode || 'fixed',
    afterDeath: stored.afterDeath || 'dead-player-view'
  };
}

function createProjectionContext(game = {}, override = {}) {
  const stored = getStoredAudienceSession(game);
  const mode = normalizeWerewolfViewMode(override.mode || stored.mode);
  const viewerPlayerId = Number(override.viewerPlayerId || stored.viewerPlayerId) || null;
  const viewer = findViewer(game.players, viewerPlayerId);

  assertAbortableWerewolfBoundary(
    mode !== VIEW_MODE_PLAYER || viewer,
    'VISIBILITY_POLICY_FAILED',
    'Player view projection requires a valid viewer player.'
  );

  return mode === VIEW_MODE_GOD
    ? { mode }
    : {
        mode,
        viewerPlayerId: Number(viewer.id),
        viewerRoleId: viewer.role || stored.viewerRoleId || null,
        viewerFaction: viewer.faction || stored.viewerFaction || null,
        lockMode: 'fixed',
        afterDeath: 'dead-player-view'
      };
}

function projectWerewolfEvent(event = {}, context = { mode: VIEW_MODE_GOD }) {
  if (!isEventVisible(event, context)) return null;
  const projectedGame = event.game ? projectWerewolfGame(event.game, context) : event.game;
  const projectedRound = event.round ? projectRound(event.round, context) : event.round;
  const projected = {
    ...event,
    round: projectedRound,
    game: projectedGame
  };

  if (context.mode === VIEW_MODE_PLAYER && event.type === 'players') {
    projected.players = projectPlayers(event.players || projectedGame?.players || [], context);
  }
  if (context.mode === VIEW_MODE_PLAYER && event.type === 'seer-check' && context.viewerRoleId !== 'seer') {
    delete projected.seerCheck;
  }
  return projected;
}

function projectWerewolfGame(game = {}, context = { mode: VIEW_MODE_GOD }) {
  const mode = normalizeWerewolfViewMode(context.mode);
  const projected = {
    ...game,
    clientViewMode: mode,
    audienceSession: toPublicAudienceSession(context),
    event: projectEventMeta(game.event, context),
    players: projectPlayers(game.players || [], context),
    rounds: (game.rounds || []).map((round) => projectRound(round, context))
  };
  delete projected.auditEvents;
  return projected;
}

function projectPlayers(players = [], context = { mode: VIEW_MODE_GOD }) {
  return players.map((player) => projectPlayer(player, context));
}

function projectPlayer(player = {}, context = { mode: VIEW_MODE_GOD }) {
  const { seerChecks, ...base } = player;
  if (context.mode === VIEW_MODE_GOD) return { ...base, seerChecks: seerChecks || [] };

  const isViewer = Number(player.id) === Number(context.viewerPlayerId);
  const wolfTeammate = context.viewerFaction === 'wolves' && player.faction === 'wolves';
  if (isViewer || wolfTeammate) {
    return {
      ...base,
      seerChecks: isViewer && player.role === 'seer' ? seerChecks || [] : []
    };
  }

  const {
    role,
    roleLabel,
    faction,
    usedAntidote,
    usedPoison,
    hunterShotUsed,
    votes,
    ...visible
  } = base;
  return {
    ...visible,
    role: null,
    roleLabel: '',
    faction: '',
    seerChecks: []
  };
}

function projectRound(round = {}, context = { mode: VIEW_MODE_GOD }) {
  return {
    ...round,
    night: projectNight(round.night || {}, round, context)
  };
}

function projectNight(night = {}, round = {}, context = { mode: VIEW_MODE_GOD }) {
  if (context.mode === VIEW_MODE_GOD) return cloneNight(night, round);

  const viewerRoleId = context.viewerRoleId;
  const wolves = context.viewerFaction === 'wolves';
  return {
    wolfTarget: wolves ? night.wolfTarget || null : null,
    wolfLeaderId: wolves ? night.wolfLeaderId || null : null,
    wolfSpeechOrder: wolves ? night.wolfSpeechOrder || [] : [],
    wolfSpeeches: wolves ? night.wolfSpeeches || [] : [],
    wolfChoices: wolves ? night.wolfChoices || {} : {},
    wolfVoteTally: wolves ? night.wolfVoteTally || {} : {},
    wolfTieBreak: wolves ? night.wolfTieBreak || null : null,
    seerCheck: viewerRoleId === 'seer' ? night.seerCheck || null : null,
    witchSave: viewerRoleId === 'witch' ? Boolean(night.witchSave) : false,
    witchSaveTarget: viewerRoleId === 'witch'
      ? night.witchSaveTarget || (night.witchSave ? night.wolfTarget : null)
      : null,
    witchPoisonTarget: viewerRoleId === 'witch' ? night.witchPoisonTarget || null : null,
    guardTarget: viewerRoleId === 'guard' ? night.guardTarget || null : null,
    deaths: round.nightRevealed ? night.deaths || [] : []
  };
}

function cloneNight(night = {}, round = {}) {
  return {
    wolfTarget: night.wolfTarget || null,
    wolfLeaderId: night.wolfLeaderId || null,
    wolfSpeechOrder: night.wolfSpeechOrder || [],
    wolfSpeeches: night.wolfSpeeches || [],
    wolfChoices: night.wolfChoices || {},
    wolfVoteTally: night.wolfVoteTally || {},
    wolfTieBreak: night.wolfTieBreak || null,
    seerCheck: night.seerCheck || null,
    witchSave: Boolean(night.witchSave),
    witchSaveTarget: night.witchSaveTarget || (night.witchSave ? night.wolfTarget : null),
    witchPoisonTarget: night.witchPoisonTarget || null,
    guardTarget: night.guardTarget || null,
    deaths: round.nightRevealed ? night.deaths || [] : []
  };
}

function isEventVisible(event = {}, context = { mode: VIEW_MODE_GOD }) {
  if (context.mode === VIEW_MODE_GOD) return true;
  if (WOLF_EVENT_TYPES.has(event.type)) return context.viewerFaction === 'wolves';
  if (SEER_EVENT_TYPES.has(event.type)) return context.viewerRoleId === 'seer';
  if (GUARD_EVENT_TYPES.has(event.type)) return context.viewerRoleId === 'guard';
  if (WITCH_EVENT_TYPES.has(event.type)) return context.viewerRoleId === 'witch';
  return true;
}

function projectEventMeta(event = {}, context) {
  const { fallbackAudit, truth, ...visible } = event || {};
  return {
    ...visible,
    ...(context.mode === VIEW_MODE_GOD && truth ? { truth } : {}),
    clientViewMode: normalizeWerewolfViewMode(context.mode),
    audienceSession: toPublicAudienceSession(context)
  };
}

function toPublicAudienceSession(context = {}) {
  if (normalizeWerewolfViewMode(context.mode) === VIEW_MODE_GOD) return { mode: VIEW_MODE_GOD };
  return {
    mode: VIEW_MODE_PLAYER,
    viewerPlayerId: Number(context.viewerPlayerId),
    viewerRoleId: context.viewerRoleId || null,
    viewerFaction: context.viewerFaction || null,
    lockMode: 'fixed',
    afterDeath: 'dead-player-view'
  };
}

function findViewer(players = [], viewerPlayerId) {
  return (players || []).find((player) => Number(player.id) === Number(viewerPlayerId)) || null;
}

module.exports = {
  VIEW_MODE_GOD,
  VIEW_MODE_PLAYER,
  normalizeWerewolfViewMode,
  createAudienceSession,
  createProjectionContext,
  getStoredAudienceSession,
  projectWerewolfEvent,
  projectWerewolfGame,
  projectPlayers
};
