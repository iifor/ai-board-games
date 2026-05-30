import { canAccess, buildViewerContext } from './informationLayer';
import { assertAbortableWerewolfBoundary } from '../failures/failurePolicy';
import type { ViewerContext } from '@ai-presenter/shared/types/channelTypes';

const VIEW_MODE_GOD = 'god';
const VIEW_MODE_PLAYER = 'player';


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
  channel?: string;
  scopeKey?: string;
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

  // 上帝视角不需要找 viewer
  if (mode === VIEW_MODE_GOD) return { mode };

  // 玩家视角：尝试找到 viewer player，找不到则回退到上帝视角
  const viewerPlayerId = Number(override.viewerPlayerId || stored.viewerPlayerId) || null;
  const viewer = findViewer(game.players || [], viewerPlayerId);

  if (!viewer) {
    console.warn('[viewPolicy] Player view projection fallback to god view — no valid viewer player found.');
    return { mode: VIEW_MODE_GOD };
  }

  return {
    mode,
    viewerPlayerId: Number(viewer.id),
    viewerRoleId: viewer.role || stored.viewerRoleId || null,
    viewerFaction: viewer.faction || stored.viewerFaction || null,
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

  // 所有新事件都有 channel 元数据，通过 InformationLayer 做访问控制
  if (event.channel) {
    const viewer = projectionContextToViewerContext(context);
    return canAccess(event as { channel: string; scopeKey?: string }, viewer);
  }

  // 没有 channel 的事件默认可见（安全回退）
  return true;
}

function projectionContextToViewerContext(context: ProjectionContext): ViewerContext {
  const roles: string[] = [];
  if (context.viewerRoleId) roles.push(context.viewerRoleId);
  return buildViewerContext({
    type: 'player',
    playerId: context.viewerPlayerId != null ? Number(context.viewerPlayerId) : undefined,
    faction: context.viewerFaction || undefined,
    roles
  });
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
