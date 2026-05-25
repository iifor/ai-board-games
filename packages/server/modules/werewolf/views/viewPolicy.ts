const VIEW_MODE_GOD = 'god';
const VIEW_MODE_PLAYER = 'player';
const { assertAbortableWerewolfBoundary } = require('../failures/failurePolicy');

const WOLF_EVENT_TYPES = new Set(['wolf-wake', 'wolf-leader', 'wolf-speech', 'wolf-vote']);
const SEER_EVENT_TYPES = new Set(['seer-wake', 'seer-check']);
const GUARD_EVENT_TYPES = new Set(['guard-wake', 'guard-action']);
const WITCH_EVENT_TYPES = new Set(['witch-antidote', 'witch-poison', 'witch-action']);

interface AudienceSession {
  mode: string;
  viewerPlayerId?: number | null;
  viewerRoleId?: string | null;
  viewerFaction?: string | null;
  lockMode?: string;
  afterDeath?: string;
}

interface ProjectionContext {
  mode: string;
  viewerPlayerId?: number | null;
  viewerRoleId?: string | null;
  viewerFaction?: string | null;
  lockMode?: string;
  afterDeath?: string;
}

interface Player {
  id: number;
  role?: string;
  roleLabel?: string;
  faction?: string;
  alive?: boolean;
  canVote?: boolean;
  revealedIdiot?: boolean;
  usedAntidote?: boolean;
  usedPoison?: boolean;
  hunterShotUsed?: boolean;
  seerChecks?: unknown[];
  votes?: unknown[];
  lastWords?: string;
  deathDay?: number | null;
  deathReason?: string;
  [key: string]: unknown;
}

interface NightData {
  wolfTarget?: number | null;
  wolfLeaderId?: number | null;
  wolfSpeechOrder?: number[];
  wolfSpeeches?: unknown[];
  wolfChoices?: Record<string, unknown>;
  wolfVoteTally?: Record<string, number>;
  wolfTieBreak?: Record<string, unknown> | null;
  seerCheck?: unknown;
  witchSave?: boolean;
  witchSaveTarget?: number | null;
  witchPoisonTarget?: number | null;
  guardTarget?: number | null;
  deaths?: Array<{ id: number; reason: string }>;
}

interface Round {
  day?: number;
  night?: NightData;
  nightRevealed?: boolean;
  [key: string]: unknown;
}

interface GameEvent {
  type: string;
  game?: Record<string, unknown>;
  round?: Round;
  players?: Player[];
  seerCheck?: unknown;
  [key: string]: unknown;
}

interface Game {
  clientViewMode?: string;
  audienceSession?: AudienceSession;
  event?: Record<string, unknown>;
  players?: Player[];
  rounds?: Round[];
  auditEvents?: unknown[];
  [key: string]: unknown;
}

function normalizeWerewolfViewMode(value: unknown): string {
  return value === VIEW_MODE_PLAYER ? VIEW_MODE_PLAYER : VIEW_MODE_GOD;
}

function createAudienceSession(players: Player[] = [], requestedMode: unknown = VIEW_MODE_GOD, viewerPlayerId: unknown = null): AudienceSession {
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
    viewerPlayerId: Number(viewer!.id),
    viewerRoleId: viewer!.role,
    viewerFaction: viewer!.faction,
    lockMode: 'fixed',
    afterDeath: 'dead-player-view'
  };
}

function getStoredAudienceSession(game: Game = {}): AudienceSession {
  const stored: Record<string, unknown> = (game.audienceSession as unknown as Record<string, unknown>) || (game.event?.audienceSession as Record<string, unknown>) || {};
  const mode = normalizeWerewolfViewMode(game.clientViewMode || game.event?.clientViewMode || stored.mode);
  if (mode === VIEW_MODE_GOD) return { mode };
  return {
    mode,
    viewerPlayerId: Number(stored.viewerPlayerId) || null,
    viewerRoleId: (stored.viewerRoleId as string) || null,
    viewerFaction: (stored.viewerFaction as string) || null,
    lockMode: (stored.lockMode as string) || 'fixed',
    afterDeath: (stored.afterDeath as string) || 'dead-player-view'
  };
}

function createProjectionContext(game: Game = {}, override: Record<string, unknown> = {}): ProjectionContext {
  const stored = getStoredAudienceSession(game);
  const mode = normalizeWerewolfViewMode(override.mode || stored.mode);
  const viewerPlayerId = Number(override.viewerPlayerId || stored.viewerPlayerId) || null;
  const viewer = findViewer(game.players || [], viewerPlayerId);

  assertAbortableWerewolfBoundary(
    mode !== VIEW_MODE_PLAYER || viewer,
    'VISIBILITY_POLICY_FAILED',
    'Player view projection requires a valid viewer player.'
  );

  return mode === VIEW_MODE_GOD
    ? { mode }
    : {
        mode,
        viewerPlayerId: Number(viewer!.id),
        viewerRoleId: viewer!.role || stored.viewerRoleId || null,
        viewerFaction: viewer!.faction || stored.viewerFaction || null,
        lockMode: 'fixed',
        afterDeath: 'dead-player-view'
      };
}

function projectWerewolfEvent(event: GameEvent, context: ProjectionContext = { mode: VIEW_MODE_GOD }): GameEvent | null {
  if (!isEventVisible(event, context)) return null;
  const projectedGame = event.game ? projectWerewolfGame(event.game as Game, context) : event.game;
  const projectedRound = event.round ? projectRound(event.round, context) : event.round;
  const projected: GameEvent = {
    ...event,
    round: projectedRound as Round,
    game: projectedGame as Record<string, unknown>
  };

  if (context.mode === VIEW_MODE_PLAYER && event.type === 'players') {
    projected.players = projectPlayers(event.players || (projectedGame as Game)?.players || [], context);
  }
  if (context.mode === VIEW_MODE_PLAYER && event.type === 'seer-check' && context.viewerRoleId !== 'seer') {
    delete projected.seerCheck;
  }
  return projected;
}

function projectWerewolfGame(game: Game = {}, context: ProjectionContext = { mode: VIEW_MODE_GOD }): Record<string, unknown> {
  const mode = normalizeWerewolfViewMode(context.mode);
  const projected: Record<string, unknown> = {
    ...game,
    clientViewMode: mode,
    audienceSession: toPublicAudienceSession(context),
    event: projectEventMeta(game.event || {}, context),
    players: projectPlayers(game.players || [], context),
    rounds: (game.rounds || []).map((round) => projectRound(round, context))
  };
  delete projected.auditEvents;
  return projected;
}

function projectPlayers(players: Player[] = [], context: ProjectionContext = { mode: VIEW_MODE_GOD }): Player[] {
  return players.map((player) => projectPlayer(player, context));
}

function projectPlayer(player: Player, context: ProjectionContext = { mode: VIEW_MODE_GOD }): Player {
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
    role: undefined,
    roleLabel: '',
    faction: '',
    seerChecks: []
  };
}

function projectRound(round: Round, context: ProjectionContext = { mode: VIEW_MODE_GOD }): Round {
  return {
    ...round,
    night: projectNight(round.night || {}, round, context)
  };
}

function projectNight(night: NightData, round: Round = {}, context: ProjectionContext = { mode: VIEW_MODE_GOD }): NightData {
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

function cloneNight(night: NightData, round: Round = {}): NightData {
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

function isEventVisible(event: GameEvent, context: ProjectionContext = { mode: VIEW_MODE_GOD }): boolean {
  if (context.mode === VIEW_MODE_GOD) return true;
  if (WOLF_EVENT_TYPES.has(event.type)) return context.viewerFaction === 'wolves';
  if (SEER_EVENT_TYPES.has(event.type)) return context.viewerRoleId === 'seer';
  if (GUARD_EVENT_TYPES.has(event.type)) return context.viewerRoleId === 'guard';
  if (WITCH_EVENT_TYPES.has(event.type)) return context.viewerRoleId === 'witch';
  return true;
}

function projectEventMeta(event: Record<string, unknown>, context: ProjectionContext): Record<string, unknown> {
  const { fallbackAudit, truth, ...visible } = event || {};
  return {
    ...visible,
    ...(context.mode === VIEW_MODE_GOD && truth ? { truth } : {}),
    clientViewMode: normalizeWerewolfViewMode(context.mode),
    audienceSession: toPublicAudienceSession(context)
  };
}

function toPublicAudienceSession(context: Partial<ProjectionContext> = {}): AudienceSession {
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

function findViewer(players: Player[] = [], viewerPlayerId: number | null): Player | null {
  return (players || []).find((player) => Number(player.id) === Number(viewerPlayerId)) || null;
}

export {
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

export type { AudienceSession, ProjectionContext, Player };
