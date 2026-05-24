const { createFallbackAudit } = require('../agent-core');
const { createWerewolfSkillRegistry } = require('./roles');
const { createWerewolfRoleSkillRegistry } = require('./roleSkills');
const { PlayerAgent } = require('./playerAgent');
const { buildSystemPrompt, createRound, publicHost, publicPlayer } = require('./agents');
const { getRoleConfig, shuffle } = require('./utils');

function createInitialWerewolfState(config) {
  const { getWerewolfModeConfig } = require('../werewolf-config/service');
  const modeConfig = getWerewolfModeConfig(config.werewolfMode);
  const skillRegistry = createWerewolfSkillRegistry();
  const roleSkillRegistry = createWerewolfRoleSkillRegistry(modeConfig, skillRegistry);
  const fallbackAudit = createFallbackAudit(`werewolf-${Date.now()}`, 'werewolf', { gameType: 'werewolf' });
  const roleSlots = expandRoleSlots(modeConfig.roles);
  const selected = config.players.slice(0, roleSlots.length);
  const shuffledRoles = shuffle(roleSlots);
  const wolves = selected.filter((_, index) => getRoleConfig(modeConfig, roleIdOf(shuffledRoles[index])).faction === 'wolves').map((player) => player.id);
  const agents = selected.map((player, index) => {
    const roleId = roleIdOf(shuffledRoles[index]);
    const roleConfig = getRoleConfig(modeConfig, roleId);
    return createRuntimeAgent(player, roleId, roleConfig, wolves, modeConfig, skillRegistry, fallbackAudit, `werewolf-${Date.now()}`, roleSkillRegistry);
  });
  return {
    werewolfMode: modeConfig,
    modeConfig,
    clientViewMode: config.clientViewMode || 'god',
    host: publicHost(config.host),
    players: agents.map((agent) => ({ ...publicPlayer(agent), roleConfig: agent.roleConfig })),
    rounds: [],
    winner: null,
    winReason: '',
    completedSteps: {},
    fallbackAudit: [],
    currentActionWindow: null
  };
}

function createRuntime(match, stateOverride = null) {
  const sourceState = stateOverride || match.state || {};
  const config = resolveRuntimeConfig(match.config);
  const modeConfig = sourceState.modeConfig || require('../werewolf-config/service').getWerewolfModeConfig(match.config.werewolfMode);
  const skillRegistry = createWerewolfSkillRegistry();
  const roleSkillRegistry = createWerewolfRoleSkillRegistry(modeConfig, skillRegistry);
  const fallbackAudit = createFallbackAudit(match.id, 'werewolf', { gameType: 'werewolf' });
  const wolves = (sourceState.players || []).filter((player) => player.faction === 'wolves').map((player) => player.id);
  const agents = (sourceState.players || []).map((snapshot) => {
    const source = config.players.find((player) => Number(player.id) === Number(snapshot.id)) || snapshot;
    return createRuntimeAgent({ ...source, ...snapshot }, snapshot.role, snapshot.roleConfig || getRoleConfig(modeConfig, snapshot.role), wolves, modeConfig, skillRegistry, fallbackAudit, match.id, roleSkillRegistry);
  });
  const state = {
    ...sourceState,
    modeConfig,
    rounds: clone(sourceState.rounds || []),
    players: agents.map((agent) => ({ ...publicPlayer(agent), roleConfig: agent.roleConfig }))
  };
  const ctx = {
    agents,
    rounds: state.rounds,
    modeConfig,
    skillRegistry,
    fallbackAudit,
    state: {
      gameId: match.id,
      agents,
      rounds: state.rounds,
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

function createRuntimeAgent(player, roleId, roleConfig, wolves, modeConfig, skillRegistry, fallbackAudit, gameId, roleSkillRegistry) {
  const agent = {
    ...player,
    role: roleId,
    roleConfig,
    roleLabel: roleConfig.name,
    faction: roleConfig.faction,
    alive: player.alive !== false,
    deathDay: player.deathDay || null,
    deathReason: player.deathReason || '',
    lastWords: player.lastWords || '',
    canVote: player.canVote !== false,
    revealedIdiot: Boolean(player.revealedIdiot),
    usedAntidote: Boolean(player.usedAntidote),
    usedPoison: Boolean(player.usedPoison),
    lastGuardTarget: player.lastGuardTarget || null,
    hunterShotUsed: Boolean(player.hunterShotUsed),
    seerChecks: Array.isArray(player.seerChecks) ? player.seerChecks : [],
    votes: Array.isArray(player.votes) ? player.votes : []
  };
  agent.baseSystemPrompt = buildSystemPrompt(agent, wolves, skillRegistry);
  agent.playerAgent = new PlayerAgent(agent, agent.baseSystemPrompt, {
    onFallback: (entry) => fallbackAudit.record(entry),
    gameId
  });
  roleSkillRegistry?.applyToPlayer(agent.playerAgent, roleId);
  agent.playerAgent.messages.push({
    role: 'system',
    content: `Mode: ${modeConfig.name || modeConfig.id || 'werewolf'}. Role: ${roleConfig.name || roleId}.`
  });
  return agent;
}

function serializeWerewolfState(match, state) {
  const modeDetail = state.werewolfMode || state.modeConfig || {};
  const winner = state.winner || null;
  return {
    id: match.id,
    gameType: 'werewolf',
    type: 'werewolf',
    mode: 'real',
    event: {
      id: 'ai-werewolf',
      name: `AI Werewolf - ${modeDetail.name || 'basic'}`,
      version: modeDetail.version || 'workflow-basic-v1',
      background: modeDetail.background || '',
      mode: modeDetail.name || modeDetail.id || '',
      terms: { good: 'good', wolves: 'wolves', keyFigure: 'werewolf', cover: 'god' },
      truth: winner ? (state.players || []).map((player) => `${player.id}:${player.roleLabel || player.role}`).join(', ') : ''
    },
    clientViewMode: state.clientViewMode || 'god',
    host: state.host,
    werewolfMode: modeDetail,
    players: (state.players || []).map(({ roleConfig, ...player }) => player).sort((a, b) => Number(a.id) - Number(b.id)),
    rounds: state.rounds || [],
    winner,
    winReason: state.winReason || '',
    fallbackAudit: state.fallbackAudit || [],
    currentActionWindow: state.currentActionWindow || null,
    createdAt: match.createdAt || new Date().toISOString()
  };
}

function ensureRound(state, day) {
  let round = (state.rounds || []).find((item) => Number(item.day) === Number(day));
  if (!round) {
    round = createRound(day);
    state.rounds = [...(state.rounds || []), round];
  }
  return round;
}

function syncRuntimeState(runtime) {
  runtime.state.players = runtime.agents.map((agent) => ({ ...publicPlayer(agent), roleConfig: agent.roleConfig }));
  runtime.ctx.state.winner = runtime.state.winner;
  runtime.ctx.state.winReason = runtime.state.winReason;
  return runtime.state;
}

function resolveRuntimeConfig(matchConfig = {}) {
  if (Array.isArray(matchConfig.players)) {
    return {
      mode: 'real',
      host: matchConfig.host || {},
      players: matchConfig.players,
      werewolfMode: matchConfig.werewolfMode,
      clientViewMode: matchConfig.clientViewMode || 'god'
    };
  }
  const { getAiConfig } = require('../../config');
  const base = getAiConfig();
  const selectedIds = new Set((matchConfig.selectedPlayerIds || []).map(Number));
  return {
    ...base,
    mode: 'real',
    host: resolveHost(base, matchConfig.hostId),
    players: selectedIds.size ? base.players.filter((player) => selectedIds.has(Number(player.id))) : base.players,
    werewolfMode: matchConfig.werewolfMode,
    clientViewMode: matchConfig.clientViewMode || 'god'
  };
}

function resolveHost(config, hostId) {
  const id = Number(hostId);
  if (!id) return config.host;
  const player = config.players.find((item) => Number(item.id) === id);
  if (!player) return config.host;
  return { ...config.host, ...player, name: player.name || player.nickname, nickname: player.nickname || player.name };
}

function expandRoleSlots(roles = []) {
  return (Array.isArray(roles) ? roles : []).flatMap((entry) => {
    const count = Number.isFinite(Number(entry?.count)) ? Math.max(0, Math.floor(Number(entry.count))) : 1;
    return Array.from({ length: count }, () => entry);
  });
}

function roleIdOf(entry) {
  return typeof entry === 'string' ? entry : (entry?.roleId || entry?.id || '');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

module.exports = {
  createInitialWerewolfState,
  createRuntime,
  createRuntimeAgent,
  serializeWerewolfState,
  ensureRound,
  syncRuntimeState,
  resolveRuntimeConfig
};
