import { hashText } from '../../services/ai/promptComposer';
import { PlayerAgent } from './playerAgent';
import { getRoleConfig, getRoleLabel, shuffle } from './utils';
import { buildSystemPrompt, appendOpeningPrivateMemory } from './prompts/system';
import {
  askSpeech,
  askWolfNightSpeech,
  askSheriffSpeech,
} from './prompts/speech';
import type { FallbackAudit } from '../agent-core/fallbackAudit';
import type { RoleSkillRegistry } from '../agent-core/roleSkillRegistry';

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
  hunterShotUsed: boolean;
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
  wolfTarget: number | null;
  wolfLeaderId: number | null;
  wolfSpeechOrder: number[];
  wolfSpeeches: Array<Record<string, unknown>>;
  wolfChoices: Record<string, number>;
  wolfVoteTally: Record<string, number>;
  wolfTieBreak: number | null;
  seerCheck: { target: number; result: string } | null;
  witchSave: boolean;
  witchSaveTarget: number | null;
  witchPoisonTarget: number | null;
  guardTarget: number | null;
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
  votes: Record<string, number>;
  voteTally: Record<string, number>;
  exile: { id: number; reason: string } | null;
  idiotReveal: { id: number; reason: string } | null;
  lastWords: Array<Record<string, unknown>>;
  hunterShot: { from: number; target: number; reason?: string } | null;
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
  hunterShotUsed?: boolean;
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
      seerChecks: [],
      votes: []
    };
    agent.baseSystemPrompt = buildSystemPrompt(agent, wolves, skillRegistry, selected, modeConfig);
    agent.baseSystemPromptHash = hashText(agent.baseSystemPrompt!);
    agent.playerAgent = new PlayerAgent(agent, agent.baseSystemPrompt!, {
      onError: (entry: unknown) => fallbackAudit.record(entry as Record<string, unknown>),
      gameId
    });
    roleSkillRegistry?.applyToPlayer(agent.playerAgent, roleId);
    appendOpeningPrivateMemory(agent, modeConfig);
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
      witchPoisonTarget: null, guardTarget: null, wolfStrategy: '', deaths: []
    },
    sheriffElection: null, sheriffId: null,
    sheriffBadge: { status: 'none' }, sheriffTransfers: [],
    daySpeech: null, speeches: [], votes: {}, voteTally: {},
    exile: null, idiotReveal: null, lastWords: [], hunterShot: null,
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
    usedPoison: agent.usedPoison, hunterShotUsed: agent.hunterShotUsed,
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
  return { ...round, night: publicNight(round.night, !round.nightRevealed) };
}

function publicNight(night: Night, hideDeaths: boolean = false): Night {
  return {
    wolfTarget: night.wolfTarget || null, wolfLeaderId: night.wolfLeaderId || null,
    wolfSpeechOrder: night.wolfSpeechOrder || [], wolfSpeeches: night.wolfSpeeches || [],
    wolfChoices: night.wolfChoices || {}, wolfVoteTally: night.wolfVoteTally || {},
    wolfTieBreak: night.wolfTieBreak || null, seerCheck: night.seerCheck || null,
    witchSave: Boolean(night.witchSave),
    witchSaveTarget: night.witchSaveTarget || (night.witchSave ? night.wolfTarget : null),
    witchPoisonTarget: night.witchPoisonTarget || null,
    guardTarget: night.guardTarget || null,
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
