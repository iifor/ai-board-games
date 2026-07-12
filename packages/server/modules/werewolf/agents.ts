import { hashText } from '../../services/ai/promptComposer';
import { PlayerAgent } from './playerAgent';
import { getRoleConfig, getRoleLabel, shuffle } from './utils';
import { buildSystemPrompt } from './prompts/system';
import {
  askSpeech,
  askWolfNightSpeech,
  askSheriffSpeech,
} from './prompts/speech';
import type { FallbackAudit } from '../agent-core/fallbackAudit';
import type { RoleSkillRegistry } from '../agent-core/roleSkillRegistry';
import { formatRelationshipMemoryForPrompt } from '../player-memory';

interface RoleConfig {
  name?: string;
  faction?: string;
  roleType?: string;
  responsibility?: string;
  ability?: string;
  keyInfo?: string;
  playStyleAdvice?: string;
  rule?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PlayerInput {
  id: number;
  sourcePlayerId?: number;
  seatNumber?: number;
  name?: string;
  nickname?: string;
  avatar?: string;
  provider?: string;
  voicePackageId?: string;
  model?: string;
  sex?: string;
  personality?: string;
  apiKey?: string;
  [key: string]: unknown;
}

interface ModeRoleEntry {
  roleId?: string;
  id?: string;
  count?: number;
  [key: string]: unknown;
}

interface SheriffConfig {
  enabled?: boolean;
  firstDayElection?: boolean;
  voteWeight?: number;
  [key: string]: unknown;
}

interface ModeConfig {
  name?: string;
  id?: string;
  description?: string;
  roles?: Array<string | ModeRoleEntry>;
  resolvedRoles?: Array<RoleConfig & { count?: number }>;
  roleMap?: Record<string, RoleConfig>;
  sheriff?: SheriffConfig;
  winCondition?: string;
  witch?: { canSelfSaveNightOne?: boolean; onePotionPerNight?: boolean };
  [key: string]: unknown;
}

interface WerewolfAgent extends PlayerInput {
  role: string;
  roleConfig: RoleConfig;
  roleLabel: string;
  faction: string;
  alive: boolean;
  deathDay: number | null;
  deathReason: string;
  lastWords: string;
  canVote: boolean;
  revealedIdiot: boolean;
  usedAntidote: boolean;
  usedPoison: boolean;
  lastGuardTarget: number | null;
  lastSilencedTarget?: number | null;
  hunterShotUsed: boolean;
  hybridMasterId?: number | null;
  wildChildModelId?: number | null;
  wildChildTransformed?: boolean;
  nineTailedFoxTails?: number;
  knightDuelUsed?: boolean;
  butterflyHugUsed?: number;
  stalkerAssassinateUsed?: boolean;
  lastNightmareTarget?: number | null;
  lastPenguinTarget?: number | null;
  foxInspectLost?: boolean;
  foxLastInspect?: { targetIds: number[]; hasWolf: boolean } | null;
  magicianSwappedIds?: number[];
  fortuneTellerMarkUsed?: boolean;
  bigBadWolfKillUsed?: boolean;
  lastCrowTarget?: number | null;
  blackMerchantGiftUsed?: boolean;
  blackMerchantGift?: { action: string; from: number; used?: boolean } | null;
  blackMerchantDeathPending?: boolean;
  bigTreeWolfHits?: number;
  godSkillsDisabled?: boolean;
  youngerBrotherSoloKillUsedDay?: number | null;
  wolfElderBrotherDeathDay?: number | null;
  evilKnightTriggered?: boolean;
  oldRoguePendingDeath?: {
    reason: string;
    sourceAction: string;
    resolveDay: number;
    announced?: boolean;
  } | null;
  seerChecks: Array<Record<string, unknown>>;
  votes: Array<Record<string, unknown>>;
  baseSystemPrompt?: string;
  baseSystemPromptHash?: string;
  playerAgent?: PlayerAgent;
  [key: string]: unknown;
}

interface SkillRegistryLike {
  get: (action: string) => { prompt?: string } | null;
}

interface CreateAgentsConfig {
  players: PlayerInput[];
}

interface Night {
  escapeHunterIds?: number[];
  escapeHunterSpeechOrder?: number[];
  escapeHunterSpeeches?: Array<Record<string, unknown>>;
  escapeHunterChoices?: Record<string, number>;
  escapeHunterVoteTally?: Record<string, number>;
  escapeHunterTarget?: number | null;
  thickWolfArmorBreak?: { targetId: number } | null;
  wolfTarget: number | null;
  wolfLeaderId: number | null;
  wolfSpeechOrder: number[];
  wolfSpeeches: Array<Record<string, unknown>>;
  wolfChoices: Record<string, number>;
  wolfVoteTally: Record<string, number>;
  wolfTieBreak: number | null;
  seerCheck: { target: number; result: string; reason?: string | null } | null;
  witchSave: boolean;
  witchSaveTarget: number | null;
  witchSaveReason?: string | null;
  witchPoisonTarget: number | null;
  witchPoisonReason?: string | null;
  guardTarget: number | null;
  guardReason?: string | null;
  butterflyTarget?: number | null;
  butterflyReason?: string | null;
  stalkerTarget?: number | null;
  stalkerReason?: string | null;
  wolfBeautyTarget?: number | null;
  wolfBeautyReason?: string | null;
  demonInspect?: { target: number; result: string; reason?: string | null } | null;
  nightmareTarget?: number | null;
  nightmareReason?: string | null;
  penguinFrozenId?: number | null;
  penguinReason?: string | null;
  foxInspect?: { targetIds: number[]; hasWolf: boolean; reason?: string | null } | null;
  dreamerTarget?: number | null;
  dreamerReason?: string | null;
  dreamerRepeatedTarget?: boolean;
  fortuneTellerMark?: { target?: number | null; reason?: string | null } | null;
  bigBadWolfTarget?: number | null;
  bigBadWolfReason?: string | null;
  crowCurse?: { target?: number | null; reason?: string | null } | null;
  blackMerchantGift?: { actorId: number; targetId: number; gift: string; success: boolean; reason?: string | null } | null;
  luckySeerCheck?: { actorId: number; target: number; result: string; reason?: string | null } | null;
  luckyPoisonTarget?: number | null;
  luckyPoisonReason?: string | null;
  youngerBrotherTarget?: number | null;
  youngerBrotherReason?: string | null;
  wolfStrategy: string;
  deaths: Array<{ id: number; reason: string }>;
}

interface Round {
  day: number;
  phase: string;
  night: Night;
  sheriffElection: Record<string, unknown> | null;
  sheriffId: number | null;
  sheriffBadge: { status: string };
  sheriffTransfers: Array<Record<string, unknown>>;
  daySpeech: Record<string, unknown> | null;
  speeches: Array<Record<string, unknown>>;
  votes: Record<string, number | null>;
  voteTally: Record<string, number>;
  exile: { id: number; reason: string } | null;
  idiotReveal: { id: number; reason: string } | null;
  lastWords: Array<Record<string, unknown>>;
  hunterShot: { from: number; target: number; reason?: string } | null;
  evilKnightTrigger?: { actorId: number; trigger: string; targetId: number } | null;
  oldRogueDeath?: { id: number; reason: string; sourceAction?: string } | null;
  bearRoar?: { roaring: boolean; adjacentWolfIds: number[] } | null;
  crowCursedPlayerId?: number | null;
  bombmanBlast?: { actorId: number; targetIds: number[] } | null;
  publicSummary: string;
  nightRevealed: boolean;
}

interface WolfSpeech {
  playerId: number;
  text: string;
  [key: string]: unknown;
}

interface SheriffBadgeTransfer {
  action: string;
  from: number;
  to?: number;
}

interface PublicPlayer {
  id: number;
  sourcePlayerId?: number;
  seatNumber?: number;
  name?: string;
  nickname?: string;
  avatar?: string;
  provider?: string;
  voicePackageId?: string;
  model?: string;
  sex?: string;
  personality?: string;
  role?: string;
  roleLabel?: string;
  faction?: string;
  alive?: boolean;
  deathDay?: number | null;
  deathReason?: string;
  canVote?: boolean;
  revealedIdiot?: boolean;
  lastWords?: string;
  usedAntidote?: boolean;
  usedPoison?: boolean;
  lastGuardTarget?: number | null;
  lastSilencedTarget?: number | null;
  hunterShotUsed?: boolean;
  hybridMasterId?: number | null;
  wildChildModelId?: number | null;
  wildChildTransformed?: boolean;
  nineTailedFoxTails?: number;
  knightDuelUsed?: boolean;
  butterflyHugUsed?: number;
  stalkerAssassinateUsed?: boolean;
  lastNightmareTarget?: number | null;
  lastPenguinTarget?: number | null;
  foxInspectLost?: boolean;
  foxLastInspect?: { targetIds: number[]; hasWolf: boolean } | null;
  magicianSwappedIds?: number[];
  fortuneTellerMarkUsed?: boolean;
  bigBadWolfKillUsed?: boolean;
  lastCrowTarget?: number | null;
  blackMerchantGiftUsed?: boolean;
  blackMerchantGift?: { action: string; from: number; used?: boolean } | null;
  blackMerchantDeathPending?: boolean;
  bigTreeWolfHits?: number;
  godSkillsDisabled?: boolean;
  youngerBrotherSoloKillUsedDay?: number | null;
  wolfElderBrotherDeathDay?: number | null;
  evilKnightTriggered?: boolean;
  oldRoguePendingDeath?: {
    reason: string;
    sourceAction: string;
    resolveDay: number;
    announced?: boolean;
  } | null;
  seerChecks?: Array<Record<string, unknown>>;
  votes?: Array<Record<string, unknown>>;
}

// ============================================================
// 创建 AI 智能体
// ============================================================

function createWerewolfAgents(
  config: CreateAgentsConfig,
  modeConfig: ModeConfig,
  skillRegistry: SkillRegistryLike,
  fallbackAudit: FallbackAudit,
  gameId: string,
  roleSkillRegistry: RoleSkillRegistry | null = null
): WerewolfAgent[] {
  const roleSlots = expandModeRoleSlots(modeConfig.roles);
  const selected = toSeatPlayers(config.players.slice(0, roleSlots.length));
  const roles = shuffle(roleSlots);
  const resolveRoleId = (entry: string | ModeRoleEntry): string => typeof entry === 'string' ? entry : (entry?.roleId || entry?.id || '');
  const wolves = selected.filter((_, index) => getRoleConfig(modeConfig, resolveRoleId(roles[index])).faction === 'wolves').map((player) => player.id);

  return selected.map((player, index) => {
    const roleId = resolveRoleId(roles[index]);
    const roleConfig = getRoleConfig(modeConfig, roleId);
    const agent: WerewolfAgent = {
      ...player,
      role: roleId,
      roleConfig,
      roleLabel: roleConfig.name || roleId,
      faction: roleConfig.faction || 'good',
      alive: true,
      deathDay: null,
      deathReason: '',
      lastWords: '',
      canVote: true,
      revealedIdiot: false,
      usedAntidote: false,
      usedPoison: false,
      lastGuardTarget: null,
      hunterShotUsed: false,
      hybridMasterId: null,
      wildChildModelId: null,
      wildChildTransformed: false,
      nineTailedFoxTails: roleId === 'nine_tailed_fox' ? 9 : undefined,
      lastSilencedTarget: null,
      knightDuelUsed: false,
      butterflyHugUsed: 0,
      stalkerAssassinateUsed: false,
      lastNightmareTarget: null,
      lastPenguinTarget: null,
      foxInspectLost: false,
      foxLastInspect: null,
      magicianSwappedIds: [],
      blackMerchantGiftUsed: false,
      blackMerchantGift: null,
      blackMerchantDeathPending: false,
      bigTreeWolfHits: 0,
      godSkillsDisabled: false,
      youngerBrotherSoloKillUsedDay: null,
      wolfElderBrotherDeathDay: null,
      evilKnightTriggered: false,
      oldRoguePendingDeath: null,
      seerChecks: [],
      votes: []
    };
    const relationshipMemory = formatRelationshipMemoryForPrompt(
      'werewolf',
      Number(agent.sourcePlayerId || agent.id),
      selected,
    );
    agent.baseSystemPrompt = buildSystemPrompt(agent, wolves, skillRegistry, selected, modeConfig, relationshipMemory);
    agent.baseSystemPromptHash = hashText(agent.baseSystemPrompt!);
    agent.playerAgent = new PlayerAgent(agent, agent.baseSystemPrompt, {
      onError: (entry: unknown) => fallbackAudit.record(entry as Record<string, unknown>),
      gameId
    });
    roleSkillRegistry?.applyToPlayer(agent.playerAgent, roleId);
    return agent;
  });
}

function expandModeRoleSlots(roles: Array<string | ModeRoleEntry> = []): Array<string | ModeRoleEntry> {
  return (Array.isArray(roles) ? roles : []).flatMap((entry) => {
    const configuredCount = Number(typeof entry === 'string' ? 1 : entry?.count);
    const count = Number.isFinite(configuredCount) ? Math.max(0, Math.floor(configuredCount)) : 1;
    return Array.from({ length: count }, () => entry);
  });
}

function toSeatPlayers(players: PlayerInput[]): PlayerInput[] {
  return players.map((player, index) => {
    const seatNumber = index + 1;
    return {
      ...player,
      sourcePlayerId: Number(player.sourcePlayerId || player.id),
      seatNumber,
      id: seatNumber,
    };
  });
}

function createRound(day: number): Round {
  return {
    day,
    phase: 'night',
    night: {
      wolfTarget: null, wolfLeaderId: null, wolfSpeechOrder: [], wolfSpeeches: [],
      wolfChoices: {}, wolfVoteTally: {}, wolfTieBreak: null,
      seerCheck: null, witchSave: false, witchSaveTarget: null,
      witchPoisonTarget: null, guardTarget: null,
      fortuneTellerMark: null, bigBadWolfTarget: null, bigBadWolfReason: null,
      crowCurse: null, blackMerchantGift: null, luckySeerCheck: null,
      luckyPoisonTarget: null, youngerBrotherTarget: null,
      penguinFrozenId: null, foxInspect: null, wolfStrategy: '', deaths: []
    },
    sheriffElection: null, sheriffId: null,
    sheriffBadge: { status: 'none' }, sheriffTransfers: [],
    daySpeech: null, speeches: [], votes: {}, voteTally: {},
    exile: null, idiotReveal: null, lastWords: [], hunterShot: null,
    bearRoar: null, crowCursedPlayerId: null, bombmanBlast: null,
    publicSummary: '', nightRevealed: false
  };
}

function publicPlayer(agent: WerewolfAgent): PublicPlayer {
  return {
    id: agent.id, sourcePlayerId: agent.sourcePlayerId as number | undefined, seatNumber: (agent.seatNumber as number | undefined) || agent.id,
    name: agent.name, nickname: agent.nickname, avatar: agent.avatar,
    provider: agent.provider, voicePackageId: agent.voicePackageId, model: agent.model,
    sex: agent.sex || '未知', personality: agent.personality,
    role: agent.role, roleLabel: getRoleLabel(agent), faction: agent.faction,
    alive: agent.alive, deathDay: agent.deathDay, deathReason: agent.deathReason,
    canVote: agent.canVote, revealedIdiot: agent.revealedIdiot,
    lastWords: agent.lastWords, usedAntidote: agent.usedAntidote,
    usedPoison: agent.usedPoison, lastGuardTarget: agent.lastGuardTarget,
    lastSilencedTarget: agent.lastSilencedTarget,
    hybridMasterId: agent.hybridMasterId,
    wildChildModelId: agent.wildChildModelId,
    wildChildTransformed: agent.wildChildTransformed,
    nineTailedFoxTails: agent.nineTailedFoxTails,
    hunterShotUsed: agent.hunterShotUsed,
    knightDuelUsed: agent.knightDuelUsed,
    butterflyHugUsed: agent.butterflyHugUsed,
    stalkerAssassinateUsed: agent.stalkerAssassinateUsed,
    lastNightmareTarget: agent.lastNightmareTarget,
    lastPenguinTarget: agent.lastPenguinTarget,
    foxInspectLost: agent.foxInspectLost,
    foxLastInspect: agent.foxLastInspect,
    magicianSwappedIds: agent.magicianSwappedIds,
    fortuneTellerMarkUsed: agent.fortuneTellerMarkUsed,
    bigBadWolfKillUsed: agent.bigBadWolfKillUsed,
    lastCrowTarget: agent.lastCrowTarget,
    blackMerchantGiftUsed: agent.blackMerchantGiftUsed,
    blackMerchantGift: agent.blackMerchantGift,
    blackMerchantDeathPending: agent.blackMerchantDeathPending,
    bigTreeWolfHits: agent.bigTreeWolfHits,
    godSkillsDisabled: agent.godSkillsDisabled,
    youngerBrotherSoloKillUsedDay: agent.youngerBrotherSoloKillUsedDay,
    wolfElderBrotherDeathDay: agent.wolfElderBrotherDeathDay,
    evilKnightTriggered: agent.evilKnightTriggered,
    oldRoguePendingDeath: agent.oldRoguePendingDeath,
    seerChecks: agent.seerChecks, votes: agent.votes
  };
}

interface PublicHost {
  id: number;
  name: string;
  nickname: string;
  avatar: string;
  avatarUrl: string;
  voicePackageId: string | null;
}

function publicHost(host: Record<string, unknown> = {}): PublicHost {
  return {
    id: (host.id as number) || 0,
    name: (host.name as string) || (host.nickname as string) || '主持人',
    nickname: (host.nickname as string) || (host.name as string) || '主持人',
    avatar: (host.avatar as string) || '',
    avatarUrl: (host.avatarUrl as string) || (host.avatar as string) || '',
    voicePackageId: (host.voicePackageId as string) || null
  };
}

function publicRound(round: Round): Round {
  const {
    winnerLock: _winnerLock,
    pendingLastWords: _pendingLastWords,
    deathResolution: _deathResolution,
    ...visible
  } = round as Round & { winnerLock?: unknown; pendingLastWords?: unknown; deathResolution?: unknown };
  return { ...visible, night: publicNight(round.night, !round.nightRevealed) } as Round;
}

function publicNight(night: Night, hideDeaths: boolean = false): Night {
  return {
    wolfTarget: night.wolfTarget || null, wolfLeaderId: night.wolfLeaderId || null,
    wolfSpeechOrder: night.wolfSpeechOrder || [], wolfSpeeches: night.wolfSpeeches || [],
    wolfChoices: night.wolfChoices || {}, wolfVoteTally: night.wolfVoteTally || {},
    wolfTieBreak: night.wolfTieBreak || null, seerCheck: night.seerCheck || null,
    witchSave: Boolean(night.witchSave),
    witchSaveTarget: night.witchSaveTarget || (night.witchSave ? night.wolfTarget : null),
    ...(night.witchSaveReason ? { witchSaveReason: night.witchSaveReason } : {}),
    witchPoisonTarget: night.witchPoisonTarget || null,
    ...(night.witchPoisonReason ? { witchPoisonReason: night.witchPoisonReason } : {}),
    guardTarget: night.guardTarget || null,
    ...(night.guardReason ? { guardReason: night.guardReason } : {}),
    butterflyTarget: night.butterflyTarget || null,
    ...(night.butterflyReason ? { butterflyReason: night.butterflyReason } : {}),
    stalkerTarget: night.stalkerTarget || null,
    ...(night.stalkerReason ? { stalkerReason: night.stalkerReason } : {}),
    wolfBeautyTarget: night.wolfBeautyTarget || null,
    ...(night.wolfBeautyReason ? { wolfBeautyReason: night.wolfBeautyReason } : {}),
    demonInspect: night.demonInspect || null,
    nightmareTarget: night.nightmareTarget || null,
    ...(night.nightmareReason ? { nightmareReason: night.nightmareReason } : {}),
    penguinFrozenId: night.penguinFrozenId || null,
    ...(night.penguinReason ? { penguinReason: night.penguinReason } : {}),
    foxInspect: night.foxInspect || null,
    dreamerTarget: night.dreamerTarget || null,
    ...(night.dreamerReason ? { dreamerReason: night.dreamerReason } : {}),
    dreamerRepeatedTarget: Boolean(night.dreamerRepeatedTarget),
    blackMerchantGift: night.blackMerchantGift || null,
    luckySeerCheck: night.luckySeerCheck || null,
    luckyPoisonTarget: night.luckyPoisonTarget || null,
    ...(night.luckyPoisonReason ? { luckyPoisonReason: night.luckyPoisonReason } : {}),
    youngerBrotherTarget: night.youngerBrotherTarget || null,
    ...(night.youngerBrotherReason ? { youngerBrotherReason: night.youngerBrotherReason } : {}),
    wolfStrategy: night.wolfStrategy || '',
    deaths: hideDeaths ? [] : night.deaths || []
  };
}

interface WerewolfEvent {
  round?: Round;
  game?: {
    players?: Array<Record<string, unknown>>;
    rounds?: Round[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function createPublicWerewolfEvent(event: WerewolfEvent = {}): WerewolfEvent {
  return {
    ...event,
    round: event.round ? publicRound(event.round) : event.round,
    game: event.game ? {
      ...event.game,
      players: (event.game.players || []).map(({ seerChecks, ...player }) => player),
      rounds: (event.game.rounds || []).map(publicRound)
    } : event.game
  };
}

export {
  createWerewolfAgents, expandModeRoleSlots, buildSystemPrompt, createRound,
  publicPlayer, publicHost, publicRound, publicNight, createPublicWerewolfEvent,
  askSpeech, askWolfNightSpeech, askSheriffSpeech
};

export type {
  WerewolfAgent,
  ModeConfig,
  Round,
  Night,
  PlayerInput,
  PublicPlayer,
  PublicHost,
  WerewolfEvent,
  WolfSpeech
};
