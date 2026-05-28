import { createFallbackAudit } from '../agent-core';
const { createWerewolfSkillRegistry } = require('./roles');
const { createWerewolfRoleSkillRegistry } = require('./roleSkills');
const { PlayerAgent } = require('./playerAgent');
const { buildSystemPrompt, createRound, publicHost, publicPlayer } = require('./agents');
const { getRoleConfig, shuffle } = require('./utils');

interface Player {
  id: number;
  name?: string;
  nickname?: string;
  alive?: boolean;
  [key: string]: unknown;
}

interface RoleSlot {
  roleId?: string;
  id?: string;
  count?: number;
  [key: string]: unknown;
}

interface ModeConfig {
  id?: string;
  name?: string;
  roles?: RoleSlot[];
  roleMap?: Record<string, Record<string, unknown>>;
  sheriff?: Record<string, unknown>;
  witch?: Record<string, unknown>;
  hunter?: Record<string, unknown>;
  [key: string]: unknown;
}

interface RoleConfig {
  id: string;
  name: string;
  faction: string;
  roleType: string;
  rule: Record<string, unknown>;
  [key: string]: unknown;
}

interface Agent {
  id: number;
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
  seerChecks: unknown[];
  votes: unknown[];
  baseSystemPrompt?: string;
  playerAgent?: InstanceType<typeof PlayerAgent>;
  [key: string]: unknown;
}

interface WerewolfState {
  werewolfMode?: ModeConfig;
  modeConfig?: ModeConfig;
  debugMode?: boolean;
  clientViewMode?: string;
  host?: Record<string, unknown>;
  players?: Record<string, unknown>[];
  rounds?: Record<string, unknown>[];
  winner?: string | null;
  winReason?: string;
  completedSteps?: Record<string, boolean>;
  fallbackAudit?: unknown[];
  currentActionWindow?: Record<string, unknown> | null;
  [key: string]: unknown;
}

interface Match {
  id: string;
  config?: Record<string, unknown>;
  state?: WerewolfState;
  createdAt?: string;
  [key: string]: unknown;
}

interface RuntimeContext {
  agents: Agent[];
  rounds: Record<string, unknown>[];
  modeConfig: ModeConfig;
  skillRegistry: unknown;
  fallbackAudit: unknown;
  state: {
    gameId: string;
    agents: Agent[];
    rounds: Record<string, unknown>[];
    modeConfig: ModeConfig;
    winner?: string | null;
    winReason?: string;
    serialize: () => Record<string, unknown>;
  };
  gameType: string;
  emit: () => Promise<void>;
  serialize: () => Record<string, unknown>;
}

interface Runtime {
  config: Record<string, unknown>;
  modeConfig: ModeConfig;
  skillRegistry: unknown;
  fallbackAudit: unknown;
  roleSkillRegistry: unknown;
  agents: Agent[];
  state: WerewolfState;
  ctx: RuntimeContext;
}

function createInitialWerewolfState(config: Record<string, unknown>): WerewolfState {
  const { getWerewolfModeConfig } = require('../werewolf-config/service');
  const modeConfig: ModeConfig = getWerewolfModeConfig(config.werewolfMode);
  const skillRegistry = createWerewolfSkillRegistry();
  const roleSkillRegistry = createWerewolfRoleSkillRegistry(modeConfig, skillRegistry);
  const fallbackAudit = createFallbackAudit(`werewolf-${Date.now()}`, 'werewolf', { gameType: 'werewolf' });
  const roleSlots = expandRoleSlots(modeConfig.roles);
  const selected = (config.players as Player[]).slice(0, roleSlots.length);
  const shuffledRoles = shuffle(roleSlots);
  const wolves = selected.filter((_: Player, index: number) => getRoleConfig(modeConfig, roleIdOf(shuffledRoles[index])).faction === 'wolves').map((player: Player) => player.id);
  const agents = selected.map((player: Player, index: number) => {
    const roleId = roleIdOf(shuffledRoles[index]);
    const roleConfig = getRoleConfig(modeConfig, roleId);
    return createRuntimeAgent(player, roleId, roleConfig, wolves, modeConfig, skillRegistry, fallbackAudit, `werewolf-${Date.now()}`, roleSkillRegistry);
  });
  return {
    werewolfMode: modeConfig,
    modeConfig,
    debugMode: Boolean(config.debugMode),
    clientViewMode: (config.clientViewMode as string) || 'god',
    host: publicHost(config.host),
    players: agents.map((agent: Agent) => ({ ...publicPlayer(agent), roleConfig: agent.roleConfig })),
    rounds: [],
    winner: null,
    winReason: '',
    completedSteps: {},
    fallbackAudit: [],
    currentActionWindow: null
  };
}

function createRuntime(match: Match, stateOverride: WerewolfState | null = null): Runtime {
  const sourceState: WerewolfState = stateOverride || match.state || {};
  const config = resolveRuntimeConfig(match.config);
  const modeConfig: ModeConfig = sourceState.modeConfig || require('../werewolf-config/service').getWerewolfModeConfig(match.config?.werewolfMode);
  const skillRegistry = createWerewolfSkillRegistry();
  const roleSkillRegistry = createWerewolfRoleSkillRegistry(modeConfig, skillRegistry);
  const fallbackAudit = createFallbackAudit(match.id, 'werewolf', { gameType: 'werewolf' });
  const wolves = ((sourceState.players || []) as Record<string, unknown>[]).filter((player) => player.faction === 'wolves').map((player) => player.id as number);
  const agents: Agent[] = ((sourceState.players || []) as Record<string, unknown>[]).map((snapshot) => {
    const source = ((config.players || []) as Record<string, unknown>[]).find((player) => Number(player.id) === Number(snapshot.id)) || snapshot;
    return createRuntimeAgent({ ...source, ...snapshot } as unknown as Player, snapshot.role as string, (snapshot.roleConfig as RoleConfig) || getRoleConfig(modeConfig, snapshot.role as string), wolves, modeConfig, skillRegistry, fallbackAudit, match.id, roleSkillRegistry);
  });
  const state: WerewolfState = {
    ...sourceState,
    modeConfig,
    debugMode: Boolean(sourceState.debugMode || config.debugMode),
    rounds: clone(sourceState.rounds || []),
    players: agents.map((agent) => ({ ...publicPlayer(agent), roleConfig: agent.roleConfig }))
  };
  const ctx: RuntimeContext = {
    agents,
    rounds: state.rounds!,
    modeConfig,
    skillRegistry,
    fallbackAudit,
    state: {
      gameId: match.id,
      agents,
      rounds: state.rounds!,
      modeConfig,
      winner: state.winner,
      winReason: state.winReason,
      serialize: () => serializeWerewolfState(match, state)
    },
    gameType: 'werewolf',
    emit: async () => {},
    serialize: () => serializeWerewolfState(match, state)
  };
  return { config, modeConfig, skillRegistry, fallbackAudit, roleSkillRegistry, agents, state, ctx };
}

function createRuntimeAgent(
  player: Player,
  roleId: string,
  roleConfig: RoleConfig,
  wolves: number[],
  modeConfig: ModeConfig,
  skillRegistry: unknown,
  fallbackAudit: unknown,
  gameId: string,
  roleSkillRegistry: unknown
): Agent {
  const agent: Agent = {
    ...player,
    role: roleId,
    roleConfig,
    roleLabel: roleConfig.name,
    faction: roleConfig.faction,
    alive: player.alive !== false,
    deathDay: (player.deathDay as number) || null,
    deathReason: (player.deathReason as string) || '',
    lastWords: (player.lastWords as string) || '',
    canVote: player.canVote !== false,
    revealedIdiot: Boolean(player.revealedIdiot),
    usedAntidote: Boolean(player.usedAntidote),
    usedPoison: Boolean(player.usedPoison),
    lastGuardTarget: (player.lastGuardTarget as number) || null,
    hunterShotUsed: Boolean(player.hunterShotUsed),
    seerChecks: Array.isArray(player.seerChecks) ? player.seerChecks : [],
    votes: Array.isArray(player.votes) ? player.votes : []
  };
  agent.baseSystemPrompt = buildSystemPrompt(agent, wolves, skillRegistry);
  agent.playerAgent = new PlayerAgent(agent, agent.baseSystemPrompt, {
    onFallback: (entry: unknown) => (fallbackAudit as { record: (entry: unknown) => void }).record(entry),
    gameId
  });
  (roleSkillRegistry as { applyToPlayer?: (agent: InstanceType<typeof PlayerAgent>, roleId: string) => void })?.applyToPlayer?.(agent.playerAgent, roleId);
  agent.playerAgent.messages.push({
    role: 'system',
    content: `Mode: ${modeConfig.name || modeConfig.id || 'werewolf'}. Role: ${roleConfig.name || roleId}.`
  });
  return agent;
}

function serializeWerewolfState(match: Match, state: WerewolfState): Record<string, unknown> {
  const modeDetail = state.werewolfMode || state.modeConfig || {};
  const winner = state.winner || null;
  return {
    id: match.id,
    gameType: 'werewolf',
    type: 'werewolf',
    mode: 'real',
    event: {
      id: 'ai-werewolf',
      name: `AI Werewolf - ${(modeDetail as ModeConfig).name || 'basic'}`,
      version: (modeDetail as ModeConfig).version || 'workflow-basic-v1',
      background: (modeDetail as ModeConfig).background || '',
      mode: (modeDetail as ModeConfig).name || (modeDetail as ModeConfig).id || '',
      terms: { good: 'good', wolves: 'wolves', keyFigure: 'werewolf', cover: 'god' },
      truth: winner ? ((state.players || []) as Record<string, unknown>[]).map((player) => `${player.id}:${player.roleLabel || player.role}`).join(', ') : ''
    },
    debugMode: Boolean(state.debugMode),
    clientViewMode: state.clientViewMode || 'god',
    host: state.host,
    werewolfMode: modeDetail,
    players: ((state.players || []) as Array<Record<string, unknown> & { roleConfig?: unknown }>).map(({ roleConfig, ...player }) => player).sort((a, b) => Number(a.id) - Number(b.id)),
    rounds: state.rounds || [],
    winner,
    winReason: state.winReason || '',
    fallbackAudit: state.fallbackAudit || [],
    currentActionWindow: state.currentActionWindow || null,
    createdAt: match.createdAt || new Date().toISOString()
  };
}

function ensureRound(state: WerewolfState, day: number): Record<string, unknown> {
  let round = (state.rounds || []).find((item) => Number((item as Record<string, unknown>).day) === Number(day)) as Record<string, unknown> | undefined;
  if (!round) {
    round = createRound(day);
    state.rounds = [...(state.rounds || []), round];
  }
  return round;
}

function syncRuntimeState(runtime: Runtime): WerewolfState {
  runtime.state.players = runtime.agents.map((agent) => ({ ...publicPlayer(agent), roleConfig: agent.roleConfig }));
  runtime.ctx.state.winner = runtime.state.winner;
  runtime.ctx.state.winReason = runtime.state.winReason;
  return runtime.state;
}

function resolveRuntimeConfig(matchConfig: Record<string, unknown> = {}): Record<string, unknown> {
  if (Array.isArray(matchConfig.players)) {
    return {
      mode: 'real',
      host: matchConfig.host || {},
      players: matchConfig.players,
      werewolfMode: matchConfig.werewolfMode,
      debugMode: Boolean(matchConfig.debugMode),
      clientViewMode: matchConfig.clientViewMode || 'god'
    };
  }
  const { getAiConfig } = require('../../config');
  const base = getAiConfig();
  const selectedIds = new Set(((matchConfig.selectedPlayerIds || []) as number[]).map(Number));
  return {
    ...base,
    mode: 'real',
    host: resolveHost(base, matchConfig.hostId),
    players: selectedIds.size ? (base.players as Player[]).filter((player) => selectedIds.has(Number(player.id))) : base.players,
    werewolfMode: matchConfig.werewolfMode,
    debugMode: Boolean(matchConfig.debugMode),
    clientViewMode: matchConfig.clientViewMode || 'god'
  };
}

function resolveHost(config: Record<string, unknown>, hostId: unknown): Record<string, unknown> {
  const id = Number(hostId);
  if (!id) return (config.host || {}) as Record<string, unknown>;
  const player = (config.players as Player[])?.find((item) => Number(item.id) === id);
  if (!player) return (config.host || {}) as Record<string, unknown>;
  return { ...(config.host as Record<string, unknown>), ...player, name: player.name || player.nickname, nickname: player.nickname || player.name };
}

function expandRoleSlots(roles: unknown[] = []): unknown[] {
  return (Array.isArray(roles) ? roles : []).flatMap((entry) => {
    const count = Number.isFinite(Number((entry as RoleSlot)?.count)) ? Math.max(0, Math.floor(Number((entry as RoleSlot).count))) : 1;
    return Array.from({ length: count }, () => entry);
  });
}

function roleIdOf(entry: unknown): string {
  return typeof entry === 'string' ? entry : ((entry as RoleSlot)?.roleId || (entry as RoleSlot)?.id || '');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null));
}

export {
  createInitialWerewolfState,
  createRuntime,
  createRuntimeAgent,
  serializeWerewolfState,
  ensureRound,
  syncRuntimeState,
  resolveRuntimeConfig
};

export type { Agent, Runtime, WerewolfState, ModeConfig, RoleConfig };
