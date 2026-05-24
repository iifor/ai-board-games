const workflowService = require('../workflow-engine/service');
const { registerWorkflow } = require('../workflow-engine/workflowRegistry');
const { stableTaskId } = require('../workflow-engine/utils');
const repo = require('../workflow-engine/repository');
const { getAiConfig } = require('../../config');
const { getWerewolfModeConfig } = require('../werewolf-config/service');
const { createFallbackAudit } = require('../agent-core');
const { createWerewolfSkillRegistry } = require('./roles');
const { createWerewolfRoleSkillRegistry } = require('./roleSkills');
const { PlayerAgent } = require('./playerAgent');
const { buildSystemPrompt, createRound, publicHost, publicPlayer } = require('./agents');
const { runNight, announceDaybreak, revealNightResult } = require('./night');
const { runDay } = require('./day');
const { checkWin } = require('./winCheck');
const { MAX_DAYS } = require('./constants');
const { getRoleConfig, shuffle } = require('./utils');

const WEREWOLF_WORKFLOW_ID = 'werewolf.workflow.basic.v1';

const werewolfWorkflow = {
  id: WEREWOLF_WORKFLOW_ID,
  gameType: 'werewolf',
  version: 'basic-v1',
  steps: createWerewolfSteps()
};

const handlers = {
  'werewolf.assign_roles': {
    execute({ match, step, state }) {
      if (state.completedSteps?.[step.id]) return { status: 'COMPLETED', state };
      const nextState = markStepComplete({ ...state, currentStep: step.id }, step.id);
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createStepEvent(match, step, nextState, '角色已分配。')]
      };
    }
  },
  'werewolf.phase_task': createPhaseTaskHandler(),
  'werewolf.check_win': {
    execute({ match, step, state }) {
      if (state.completedSteps?.[step.id]) return { status: 'COMPLETED', state };
      if (state.winner) {
        const completed = markStepComplete({ ...state, currentStep: step.id }, step.id);
        return { status: 'COMPLETED', state: completed, events: [createStepEvent(match, step, completed, '胜负已产生。')] };
      }
      const result = checkWin(state.players || [], step.config.day || 1, state.modeConfig || {}, {});
      const nextState = markStepComplete({
        ...state,
        currentStep: step.id,
        winner: result.winner,
        winReason: result.winReason || state.winReason || ''
      }, step.id);
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createStepEvent(match, step, nextState, result.winner ? '胜负已产生。' : '本轮未结束。')]
      };
    }
  },
  'werewolf.finalize': {
    execute({ match, step, state }) {
      if (state.completedSteps?.[step.id]) return { status: 'COMPLETED', state };
      const aliveWolves = (state.players || []).filter((agent) => agent.alive && agent.faction === 'wolves').length;
      const nextState = markStepComplete({
        ...state,
        currentStep: step.id,
        winner: state.winner || (aliveWolves ? 'wolves' : 'good'),
        winReason: state.winReason || (aliveWolves ? '达到最大天数，狼人阵营获胜。' : '达到最大天数，好人阵营获胜。')
      }, step.id);
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createStepEvent(match, step, nextState, '狼人杀结果已生成。')]
      };
    }
  }
};

function createPhaseTaskHandler() {
  return {
    execute({ match, step, state }) {
      if (state.completedSteps?.[step.id] || state.winner) return { status: 'COMPLETED', state: markStepComplete(state, step.id) };
      const taskKey = `${step.id}:phase`;
      const taskId = stableTaskId(match.id, step.id, taskKey);
      const existing = repo.listAiTasks(match.id).find((task) => task.stepId === step.id && task.taskKey === taskKey);
      if (!existing) {
        return {
          status: 'WAITING',
          state: { ...state, currentStep: step.id },
          blockers: [{
            id: `${step.id}:ai`,
            type: 'AI_TASK',
            required: true,
            status: 'pending',
            taskId
          }],
          tasks: [{
            id: taskId,
            matchId: match.id,
            stepId: step.id,
            taskKey,
            action: step.config.phase,
            status: 'queued',
            prompt: { phase: step.config.phase, day: step.config.day },
            promptContextSnapshot: { day: step.config.day, phase: step.config.phase },
            visibleEventSeqMax: Math.max(0, ...repo.listEvents(match.id).map((event) => event.seq || 0)),
            visibleEventIds: []
          }]
        };
      }
      if (existing.status !== 'succeeded') {
        return {
          status: 'WAITING',
          state: { ...state, currentStep: step.id },
          blockers: [{
            id: `${step.id}:ai`,
            type: 'AI_TASK',
            required: true,
            status: existing.status === 'failed' ? 'failed' : 'pending',
            taskId
          }]
        };
      }
      const nextState = markStepComplete(existing.result?.payload?.state || state, step.id);
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createStepEvent(match, step, nextState, step.config.phase === 'night' ? `第 ${step.config.day} 夜结束。` : `第 ${step.config.day} 天结束。`)]
      };
    },
    async runAiTask({ match, step }) {
      const runtime = createRuntime(match);
      const day = Number(step.config.day || 1);
      let round = runtime.state.rounds.find((item) => Number(item.day) === day);
      if (!round) {
        round = createRound(day);
        runtime.state.rounds.push(round);
      }
      if (step.config.phase === 'night') {
        await runNight(runtime.ctx, round);
        await announceDaybreak(runtime.ctx, round);
        await revealNightResult(runtime.ctx, round);
      } else {
        await runDay(runtime.ctx, round);
      }
      const win = checkWin(runtime.agents, day, runtime.modeConfig, step.config.phase === 'night' ? { checkWolfVoteLock: true, sheriffId: round.sheriffId } : {});
      runtime.state.players = runtime.agents.map((agent) => ({ ...publicPlayer(agent), roleConfig: agent.roleConfig }));
      runtime.state.rounds = runtime.state.rounds;
      runtime.state.winner = win.winner || runtime.state.winner || null;
      runtime.state.winReason = win.winReason || runtime.state.winReason || '';
      return {
        eventType: 'werewolf_phase_result',
        rawOutput: { emitted: runtime.emitted },
        payload: {
          phase: step.config.phase,
          day,
          emitted: runtime.emitted,
          state: runtime.state
        }
      };
    },
    validateAiResult({ result }) {
      if (!result?.payload?.state?.players || !Array.isArray(result.payload.state.rounds)) {
        throw Object.assign(new Error('Werewolf phase result state is invalid'), { severity: 'high' });
      }
    }
  };
}

function registerWerewolfWorkflow() {
  registerWorkflow(werewolfWorkflow, handlers);
}

function createWerewolfWorkflowMatch(config) {
  registerWerewolfWorkflow();
  const state = createInitialWerewolfState(config);
  return workflowService.createWorkflowMatch({
    workflowId: WEREWOLF_WORKFLOW_ID,
    gameType: 'werewolf',
    config: {
      werewolfMode: state.werewolfMode?.id || config.werewolfMode?.id || config.werewolfMode || 'standard',
      hostId: config.host?.id || null,
      selectedPlayerIds: (config.players || []).map((player) => player.id),
      clientViewMode: config.clientViewMode || 'god'
    },
    initialState: state
  });
}

async function runWerewolfWorkflow(config, options = {}) {
  const match = createWerewolfWorkflowMatch(config);
  await flushOutbox(match.id, options.onEvent);
  while (true) {
    const { processed, match: current } = await workflowService.drainAiTasks(match.id, { maxTasks: 1 });
    await flushOutbox(match.id, options.onEvent);
    if (!processed || ['completed', 'failed', 'paused_debug'].includes(current?.status)) break;
  }
  const finalMatch = workflowService.getDebugState(match.id)?.match;
  return serializeWerewolfState(finalMatch, finalMatch.state);
}

async function flushOutbox(matchId, onEvent) {
  const messages = workflowService.listPendingOutbox(matchId);
  for (const message of messages) {
    await onEvent?.({
      type: 'workflow-event',
      matchId,
      event: message.payload,
      workflowEvent: message.payload?.payload?.workflowEvent,
      message: message.payload?.payload?.message,
      game: message.payload?.payload?.game
    });
    workflowService.markOutboxSent(message.id);
  }
}

function createInitialWerewolfState(config) {
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
    const agent = createRuntimeAgent(player, roleId, roleConfig, wolves, modeConfig, skillRegistry, fallbackAudit, `werewolf-${Date.now()}`, roleSkillRegistry);
    return agent;
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
    fallbackAudit: []
  };
}

function createRuntime(match) {
  const config = resolveRuntimeConfig(match.config);
  const modeConfig = match.state.modeConfig || getWerewolfModeConfig(match.config.werewolfMode);
  const skillRegistry = createWerewolfSkillRegistry();
  const roleSkillRegistry = createWerewolfRoleSkillRegistry(modeConfig, skillRegistry);
  const fallbackAudit = createFallbackAudit(match.id, 'werewolf', { gameType: 'werewolf' });
  const wolves = (match.state.players || []).filter((player) => player.faction === 'wolves').map((player) => player.id);
  const agents = (match.state.players || []).map((snapshot) => {
    const source = config.players.find((player) => Number(player.id) === Number(snapshot.id)) || snapshot;
    return createRuntimeAgent({ ...source, ...snapshot }, snapshot.role, snapshot.roleConfig || getRoleConfig(modeConfig, snapshot.role), wolves, modeConfig, skillRegistry, fallbackAudit, match.id, roleSkillRegistry);
  });
  const state = {
    ...match.state,
    modeConfig,
    rounds: clone(match.state.rounds || []),
    players: agents.map((agent) => ({ ...publicPlayer(agent), roleConfig: agent.roleConfig }))
  };
  const emitted = [];
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
    emit: async (event) => { emitted.push(event); },
    serialize: () => serializeWerewolfState(match, state)
  };
  return { config, modeConfig, skillRegistry, fallbackAudit, roleSkillRegistry, agents, state, emitted, ctx };
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
    content: `当前模式：${modeConfig.name || modeConfig.id || '狼人杀'}。你的角色：${roleConfig.name || roleId}。`
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
      name: `AI 狼人杀 - ${modeDetail.name || '基础局'}`,
      version: modeDetail.version || 'workflow-basic-v1',
      background: modeDetail.background || '',
      mode: modeDetail.name || modeDetail.id || '',
      terms: { investigators: '好人阵营', mist: '狼人阵营', keyFigure: '狼人', cover: '神职' },
      truth: winner ? (state.players || []).map((player) => `${player.id}号${player.roleLabel || player.role}`).join('，') : ''
    },
    clientViewMode: state.clientViewMode || 'god',
    host: state.host,
    werewolfMode: modeDetail,
    players: (state.players || []).map(({ roleConfig, ...player }) => player).sort((a, b) => Number(a.id) - Number(b.id)),
    rounds: state.rounds || [],
    winner,
    winReason: state.winReason || '',
    fallbackAudit: state.fallbackAudit || [],
    createdAt: match.createdAt || new Date().toISOString()
  };
}

function createWerewolfSteps() {
  const steps = [{ id: 'assign_roles', type: 'werewolf.assign_roles', name: '分配角色', config: {} }];
  for (let day = 1; day <= MAX_DAYS; day += 1) {
    steps.push({ id: `night_${day}`, type: 'werewolf.phase_task', name: `第 ${day} 夜`, config: { day, phase: 'night' } });
    steps.push({ id: `day_${day}`, type: 'werewolf.phase_task', name: `第 ${day} 天`, config: { day, phase: 'day' } });
    steps.push({ id: `check_win_${day}`, type: 'werewolf.check_win', name: `第 ${day} 天胜负判断`, config: { day } });
  }
  steps.push({ id: 'finalize', type: 'werewolf.finalize', name: '结果结算', config: {} });
  return steps;
}

function resolveRuntimeConfig(matchConfig = {}) {
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

function createStepEvent(match, step, state, message) {
  return {
    type: 'workflow_step_completed',
    payload: {
      stepId: step.id,
      workflowEvent: step.type,
      message,
      game: serializeWerewolfState(match, state)
    },
    idempotencyKey: `${match.id}:${step.id}:completed`
  };
}

function markStepComplete(state, stepId) {
  return {
    ...state,
    completedSteps: { ...(state.completedSteps || {}), [stepId]: true }
  };
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
  WEREWOLF_WORKFLOW_ID,
  werewolfWorkflow,
  registerWerewolfWorkflow,
  createWerewolfWorkflowMatch,
  runWerewolfWorkflow,
  serializeWerewolfState
};
