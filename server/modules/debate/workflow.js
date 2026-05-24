const workflowService = require('../workflow-engine/service');
const { registerWorkflow } = require('../workflow-engine/workflowRegistry');
const { createFallbackAudit, executeSkillWithTrace } = require('../agent-core');
const { createDebateSkillRegistry } = require('./skillRegistry');
const { createDebateRoleSkillRegistry } = require('./roleSkills');
const { DebateAgent } = require('./playerAgent');
const { PHASES } = require('./constants');
const { buildSystemPrompt } = require('./prompts');
const {
  choose,
  debaterAt,
  getConfiguredDebateSetup,
  normalizeTopic,
  publicDebateLog,
  publicPlayer,
  serializeGame,
  syncDebateMemory
} = require('./utils');
const { createPhase, pushSpeech, summarizeDebatePhase } = require('./speech');
const { stableTaskId } = require('../workflow-engine/utils');
const repo = require('../workflow-engine/repository');
const { getAiConfig } = require('../../config');

const DEBATE_WORKFLOW_ID = 'debate.workflow.v1';

const debateWorkflow = {
  id: DEBATE_WORKFLOW_ID,
  gameType: 'debate',
  version: 'v1',
  steps: [
    { id: 'topic_reveal', type: 'debate.topic_reveal', name: '辩题公布', config: {} },
    { id: 'opening_speech', type: 'debate.ai_phase', name: '立论陈词', config: { phaseId: 'opening', tasks: 'opening' } },
    { id: 'crossfire', type: 'debate.ai_phase', name: '正反攻辩', config: { phaseId: 'crossfire', tasks: 'crossfire' } },
    { id: 'summary_speech', type: 'debate.ai_phase', name: '总结陈词', config: { phaseId: 'closing', tasks: 'closing' } },
    { id: 'judge_comment', type: 'debate.ai_phase', name: '评委点评', config: { phaseId: 'judges', tasks: 'judges' } },
    { id: 'best_speaker_vote', type: 'debate.ai_phase', name: '最佳辩手投票', config: { phaseId: 'mvp', tasks: 'mvp' } },
    { id: 'result_announce', type: 'debate.result_announce', name: '结果公布', config: {} }
  ]
};

const handlers = {
  'debate.topic_reveal': {
    execute({ match, step, state }) {
      if (state.completedSteps?.[step.id]) return { status: 'COMPLETED', state };
      const nextState = markStepComplete({
        ...state,
        currentStep: step.id,
        phases: state.phases || []
      }, step.id);
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [{
          type: 'workflow_step_completed',
          payload: {
            stepId: step.id,
            workflowEvent: 'topic_reveal',
            message: `辩题公布：${state.topic?.title || '未命名辩题'}`,
            game: serializeDebateState(match, nextState)
          },
          idempotencyKey: `${match.id}:${step.id}:completed`
        }]
      };
    }
  },
  'debate.ai_phase': {
    execute({ match, step, state }) {
      if (state.completedSteps?.[step.id]) return { status: 'COMPLETED', state };
      const phase = createPhaseFromStep(step);
      const taskSpecs = createTaskSpecs(step, state);
      const tasks = [];
      const blockers = [];
      const existing = repo.listAiTasks(match.id).filter((task) => task.stepId === step.id);
      const byKey = new Map(existing.map((task) => [task.taskKey, task]));

      for (const spec of taskSpecs) {
        const taskId = stableTaskId(match.id, step.id, spec.taskKey);
        const existingTask = byKey.get(spec.taskKey);
        if (!existingTask) {
          tasks.push({
            id: taskId,
            matchId: match.id,
            stepId: step.id,
            taskKey: spec.taskKey,
            playerId: spec.actorId,
            action: spec.action,
            status: 'queued',
            prompt: { phase: phase.id, action: spec.action },
            promptContextSnapshot: { ...spec, phase, topic: state.topic },
            visibleEventSeqMax: Math.max(0, ...repo.listEvents(match.id).map((event) => event.seq || 0)),
            visibleEventIds: []
          });
        }
        const task = existingTask || { id: taskId, status: 'queued', playerId: spec.actorId };
        if (task.status !== 'succeeded') {
          blockers.push({
            id: `${step.id}:${spec.taskKey}`,
            type: 'AI_TASK',
            required: true,
            status: task.status === 'failed' ? 'failed' : 'pending',
            taskId,
            playerId: spec.actorId
          });
        }
      }

      if (blockers.length) {
        return { status: 'WAITING', state: { ...state, currentStep: step.id }, blockers, tasks };
      }

      const nextState = applyAiPhaseResults(match, step, state, phase, taskSpecs, existing);
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [{
          type: 'workflow_step_completed',
          payload: {
            stepId: step.id,
            workflowEvent: 'phase_completed',
            phase,
            message: `${phase.name}完成。`,
            game: serializeDebateState(match, nextState)
          },
          idempotencyKey: `${match.id}:${step.id}:completed`
        }]
      };
    },
    async runAiTask({ match, task }) {
      const runtime = createRuntime(match, match.state);
      const spec = task.promptContextSnapshot;
      const actor = runtime.agents.find((agent) => Number(agent.id) === Number(spec.actorId));
      if (!actor) throw new Error(`Debate actor not found: ${spec.actorId}`);
      const phase = spec.phase || createPhaseFromStep({ config: { phaseId: spec.phaseId || task.stepId } });
      syncDebateMemory(actor, runtime.state);
      const result = await executeSkillWithTrace(runtime.skillRegistry, spec.action, {
        actor,
        phase,
        target: spec.targetId ? runtime.agents.find((agent) => Number(agent.id) === Number(spec.targetId)) : undefined,
        contestants: spec.contestantIds ? spec.contestantIds.map((id) => runtime.agents.find((agent) => Number(agent.id) === Number(id))).filter(Boolean) : undefined,
        state: runtime.state,
        config: runtime.config,
        emit: () => undefined,
        serialize: () => serializeDebateState(match, runtime.state),
        fallbackAudit: runtime.fallbackAudit,
        gameType: 'debate'
      });
      return normalizeTaskResult(spec, result);
    },
    validateAiResult({ task, result }) {
      const payload = result?.payload;
      if (!payload || typeof payload !== 'object') {
        throw Object.assign(new Error('Debate AI result payload is required'), { severity: 'high' });
      }
      if (!payload.action || payload.action !== task.action) {
        throw Object.assign(new Error('Debate AI result action does not match task action'), { severity: 'high' });
      }
      if (['judge_review'].includes(task.action)) {
        if (!['pro', 'con', 'draw'].includes(payload.winner) || !String(payload.text || '').trim()) {
          throw Object.assign(new Error('Judge review result is invalid'), { severity: 'high' });
        }
        return;
      }
      if (task.action === 'vote_mvp') {
        if (!payload.voterId || !payload.target) {
          throw Object.assign(new Error('MVP vote result is invalid'), { severity: 'high' });
        }
        return;
      }
      if (!String(payload.text || '').trim()) {
        throw Object.assign(new Error('Debate speech result text is empty'), { severity: 'medium' });
      }
    }
  },
  'debate.result_announce': {
    execute({ match, step, state }) {
      if (state.completedSteps?.[step.id]) return { status: 'COMPLETED', state };
      const nextState = markStepComplete({ ...state, currentStep: step.id }, step.id);
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [{
          type: 'workflow_step_completed',
          payload: {
            stepId: step.id,
            workflowEvent: 'result_announce',
            message: '辩论赛结果已生成。',
            game: serializeDebateState(match, nextState)
          },
          idempotencyKey: `${match.id}:${step.id}:completed`
        }]
      };
    }
  }
};

function registerDebateWorkflow() {
  registerWorkflow(debateWorkflow, handlers);
}

function createDebateWorkflowMatch(config) {
  registerDebateWorkflow();
  const initialState = createInitialDebateState(config);
  const runtimeConfig = {
    topic: config.topic,
    debateTeams: config.debateTeams,
    hostId: config.host?.id || null,
    selectedPlayerIds: config.selectedPlayerIds || (config.players || []).map((player) => player.id)
  };
  return workflowService.createWorkflowMatch({
    workflowId: DEBATE_WORKFLOW_ID,
    gameType: 'debate',
    config: runtimeConfig,
    initialState
  });
}

async function runDebateWorkflow(config, options = {}) {
  const match = createDebateWorkflowMatch(config);
  await flushOutbox(match.id, options.onEvent);
  while (true) {
    const { processed, match: current } = await workflowService.drainAiTasks(match.id, { maxTasks: 1 });
    await flushOutbox(match.id, options.onEvent);
    if (!processed || ['completed', 'failed', 'paused_debug'].includes(current?.status)) break;
  }
  const finalMatch = workflowService.getDebugState(match.id)?.match;
  return serializeDebateState(finalMatch, finalMatch.state);
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
      game: message.payload?.payload?.game,
      phase: message.payload?.payload?.phase,
      speech: message.payload?.payload?.speech
    });
    workflowService.markOutboxSent(message.id);
  }
}

function createInitialDebateState(config) {
  const topic = normalizeTopic(config.topic) || choose(require('./constants').TOPICS);
  const agents = createDebateAgents(config, topic, createFallbackAudit(`debate-${Date.now()}`, 'debate', { gameType: 'debate' }), `debate-${Date.now()}`);
  return {
    topic,
    host: publicHost(config.host),
    players: agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      nickname: agent.nickname,
      avatar: agent.avatar,
      avatarUrl: agent.avatarUrl || agent.avatar,
      provider: agent.provider,
      model: agent.model,
      voicePackageId: agent.voicePackageId,
      sex: agent.sex,
      personality: agent.personality,
      side: agent.side,
      sideIndex: agent.sideIndex,
      sideLabel: agent.sideLabel,
      debateRole: agent.debateRole,
      debateRoleLabel: agent.debateRoleLabel,
      role: agent.side,
      roleLabel: agent.debateRoleLabel,
      alive: true,
      excluded: false
    })),
    phases: [],
    winner: null,
    winReason: '',
    mvp: null,
    completedSteps: {},
    fallbackAudit: []
  };
}

function createDebateAgents(config, topic, fallbackAudit, gameId, roleSkillRegistry = null) {
  const setup = getConfiguredDebateSetup(config);
  return setup.players.map((player, index) => {
    const side = index < 4 ? 'pro' : index < 8 ? 'con' : 'judge';
    const debateRole = side === 'judge'
      ? 'judge'
      : Number(player.id) === Number(side === 'pro' ? setup.proCaptainId : setup.conCaptainId)
        ? 'captain'
        : 'debater';
    const agent = {
      ...player,
      side,
      sideIndex: side === 'judge' ? null : index % 4,
      debateRole,
      sideLabel: side === 'pro' ? '正方' : side === 'con' ? '反方' : '评委席',
      debateRoleLabel: debateRole === 'captain' ? '队长' : debateRole === 'judge' ? '评委' : '选手',
      speeches: [],
      messages: []
    };
    agent.baseSystemPrompt = buildSystemPrompt(agent, topic, PHASES[0]);
    agent.baseSystemPromptHash = require('./utils').buildAgentHash(agent.baseSystemPrompt);
    agent.playerAgent = new DebateAgent(agent, agent.baseSystemPrompt, {
      onFallback: (entry) => fallbackAudit.record(entry),
      gameId
    });
    roleSkillRegistry?.applyToPlayer(agent.playerAgent, debateRole);
    agent.messages = agent.playerAgent.messages;
    return agent;
  });
}

function createRuntime(match, state) {
  const config = resolveRuntimeConfig(match.config);
  config._gameId = match.id;
  const topic = state.topic || normalizeTopic(config.topic) || choose(require('./constants').TOPICS);
  const skillRegistry = createDebateSkillRegistry();
  const roleSkillRegistry = createDebateRoleSkillRegistry(skillRegistry);
  const fallbackAudit = createFallbackAudit(match.id, 'debate', { gameType: 'debate' });
  const agents = createDebateAgents(config, topic, fallbackAudit, match.id, roleSkillRegistry);
  const runtimeState = {
    gameId: match.id,
    mode: 'real',
    topic,
    host: config.host,
    agents,
    phases: clone(state.phases || []),
    winner: state.winner,
    winReason: state.winReason || '',
    mvp: state.mvp || null
  };
  return { config, skillRegistry, roleSkillRegistry, fallbackAudit, agents, state: runtimeState };
}

function resolveRuntimeConfig(matchConfig = {}) {
  const base = getAiConfig();
  const selectedIds = new Set((matchConfig.selectedPlayerIds || []).map(Number));
  const players = selectedIds.size
    ? base.players.filter((player) => selectedIds.has(Number(player.id)))
    : base.players;
  return {
    ...base,
    mode: 'real',
    topic: matchConfig.topic,
    debateTeams: matchConfig.debateTeams,
    selectedPlayerIds: [...selectedIds],
    host: resolveHost(base, matchConfig.hostId),
    players
  };
}

function resolveHost(config, hostId) {
  const id = Number(hostId);
  if (!id) return config.host;
  const player = config.players.find((item) => Number(item.id) === id);
  if (!player) return config.host;
  return { ...config.host, ...player, name: player.name || player.nickname, nickname: player.nickname || player.name };
}

function createPhaseFromStep(step) {
  const phaseId = step.config?.phaseId || step.id;
  const source = PHASES.find((item) => item.id === phaseId) || { id: phaseId, name: step.name, limit: 200 };
  return createPhase(source);
}

function createTaskSpecs(step, state) {
  const players = state.players || [];
  const phaseId = step.config.phaseId;
  if (step.config.tasks === 'opening') {
    return [
      { taskKey: 'pro-opening', actorId: debaterAt(players, 'pro', 0)?.id, action: 'opening_argue', phaseId },
      { taskKey: 'con-opening', actorId: debaterAt(players, 'con', 0)?.id, action: 'opening_argue', phaseId }
    ].filter((item) => item.actorId);
  }
  if (step.config.tasks === 'crossfire') {
    const pro = players.filter((agent) => agent.side === 'pro').slice(1, 3);
    const con = players.filter((agent) => agent.side === 'con').slice(1, 3);
    return [
      [pro[0], con[0], 'question'],
      [con[0], pro[1], 'question'],
      [pro[1], con[1], 'question'],
      [con[1], pro[0], 'question']
    ].filter(([actor, target]) => actor && target).flatMap(([actor, target], index) => ([
      { taskKey: `crossfire-${index + 1}-question`, actorId: actor.id, targetId: target.id, action: 'crossfire_question', phaseId },
      { taskKey: `crossfire-${index + 1}-answer`, actorId: target.id, targetId: actor.id, action: 'crossfire_answer', phaseId }
    ]));
  }
  if (step.config.tasks === 'closing') {
    return [
      { taskKey: 'con-closing', actorId: debaterAt(players, 'con', 3)?.id, action: 'closing_summary', phaseId },
      { taskKey: 'pro-closing', actorId: debaterAt(players, 'pro', 3)?.id, action: 'closing_summary', phaseId }
    ].filter((item) => item.actorId);
  }
  if (step.config.tasks === 'judges') {
    return players.filter((agent) => agent.side === 'judge')
      .map((judge) => ({ taskKey: `judge-${judge.id}`, actorId: judge.id, action: 'judge_review', phaseId }));
  }
  if (step.config.tasks === 'mvp') {
    const contestants = players.filter((agent) => agent.side === 'pro' || agent.side === 'con');
    return contestants.map((actor) => ({
      taskKey: `mvp-${actor.id}`,
      actorId: actor.id,
      action: 'vote_mvp',
      phaseId,
      contestantIds: contestants.map((item) => item.id)
    }));
  }
  return [];
}

function applyAiPhaseResults(match, step, state, phase, taskSpecs, tasks) {
  const playerMap = new Map((state.players || []).map((player) => [Number(player.id), player]));
  const taskMap = new Map(tasks.map((task) => [task.taskKey, task]));
  const nextState = { ...state, phases: [...(state.phases || [])] };

  if (step.config.tasks === 'judges') {
    const winnerVotes = {};
    for (const spec of taskSpecs) {
      const result = taskMap.get(spec.taskKey)?.result?.payload;
      const judge = playerMap.get(Number(spec.actorId));
      if (!judge || !result) continue;
      winnerVotes[judge.id] = result.winner;
      pushSpeech(phase, judge, result.text, 'judge-review');
    }
    nextState.winner = topWinner(winnerVotes);
    nextState.winReason = nextState.winner === 'draw' ? '评委意见接近，双方平局。' : `${nextState.winner === 'pro' ? '正方' : '反方'}获得更多评委倾向。`;
  } else if (step.config.tasks === 'mvp') {
    const votes = [];
    for (const spec of taskSpecs) {
      const vote = taskMap.get(spec.taskKey)?.result?.payload;
      if (vote?.target) votes.push(vote);
    }
    phase.votes = votes;
    const mvpId = topVotedId(Object.fromEntries(votes.map((vote) => [vote.voterId, vote.target])));
    nextState.mvp = publicPlayer(playerMap.get(Number(mvpId)) || playerMap.get(Number(votes[0]?.target)));
  } else {
    for (const spec of taskSpecs) {
      const result = taskMap.get(spec.taskKey)?.result?.payload;
      const actor = playerMap.get(Number(spec.actorId));
      if (!actor || !result) continue;
      const kind = spec.action === 'crossfire_question' ? 'question'
        : spec.action === 'crossfire_answer' ? 'answer'
          : phase.id;
      pushSpeech(phase, actor, result.text || result.content || '', kind, spec.targetId || null);
    }
  }

  phase.stageSummary = summarizeDebatePhase(phase);
  nextState.phases.push(phase);
  return markStepComplete(nextState, step.id);
}

function normalizeTaskResult(spec, result) {
  if (spec.action === 'judge_review') {
    return {
      eventType: 'debate_ai_result',
      rawOutput: result,
      payload: {
        action: spec.action,
        actorId: spec.actorId,
        winner: ['pro', 'con', 'draw'].includes(result?.winner) ? result.winner : 'draw',
        text: String(result?.text || '').trim()
      }
    };
  }
  if (spec.action === 'vote_mvp') {
    return {
      eventType: 'debate_ai_result',
      rawOutput: result,
      payload: { action: spec.action, actorId: spec.actorId, voterId: result.voterId, target: result.target }
    };
  }
  const text = typeof result === 'string' ? result : result?.content;
  return {
    eventType: 'debate_ai_result',
    rawOutput: result,
    payload: {
      action: spec.action,
      actorId: spec.actorId,
      targetId: spec.targetId || null,
      text: String(text || '').trim(),
      thinking: typeof result === 'string' ? '' : result?.thinking || ''
    }
  };
}

function serializeDebateState(match, state) {
  return {
    id: match.id,
    gameType: 'debate',
    type: 'debate',
    mode: 'real',
    topic: state.topic,
    host: state.host,
    players: state.players || [],
    phases: state.phases || [],
    rounds: (state.phases || []).map((phase, index) => ({
      number: index + 1,
      phase: phase.id,
      title: phase.name,
      speeches: phase.speeches || [],
      votes: phase.votes || []
    })),
    winner: state.winner,
    winReason: state.winReason || '',
    mvp: state.mvp || null,
    fallbackAudit: state.fallbackAudit || [],
    createdAt: match.createdAt || new Date().toISOString()
  };
}

function markStepComplete(state, stepId) {
  return {
    ...state,
    completedSteps: { ...(state.completedSteps || {}), [stepId]: true }
  };
}

function topVotedId(votes) {
  const counts = {};
  Object.values(votes || {}).forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? Number(entries[0][0]) : null;
}

function topWinner(votes) {
  const counts = { pro: 0, con: 0, draw: 0 };
  Object.values(votes || {}).forEach((winner) => { if (counts[winner] !== undefined) counts[winner] += 1; });
  if (counts.pro === counts.con) return 'draw';
  return counts.pro > counts.con ? 'pro' : 'con';
}

function publicHost(host = {}) {
  return {
    id: host.id || 0,
    name: host.name || host.nickname || '主持人',
    nickname: host.nickname || host.name || '主持人',
    avatar: host.avatar || '',
    avatarUrl: host.avatarUrl || host.avatar || '',
    voicePackageId: host.voicePackageId || null
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

module.exports = {
  DEBATE_WORKFLOW_ID,
  debateWorkflow,
  registerDebateWorkflow,
  createDebateWorkflowMatch,
  runDebateWorkflow,
  serializeDebateState
};
