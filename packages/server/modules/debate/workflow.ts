import { createWorkflowMatch as _createWorkflowMatch, drainAiTasks, getDebugState, listPendingOutbox, markOutboxSent } from '../workflow-engine/service';
import { registerWorkflow } from '../workflow-engine/workflowRegistry';
import { createFallbackAudit, executeSkillWithTrace } from '../agent-core';
import { createDebateSkillRegistry } from './skillRegistry';
import { createDebateRoleSkillRegistry } from './roleSkills';
import { DebateAgent } from './playerAgent';
import { PHASES, TOPICS } from './constants';
import { buildSystemPrompt } from './prompts';
import type { Topic } from './prompts';
import {
  choose,
  debaterAt,
  getConfiguredDebateSetup,
  normalizeTopic,
  publicDebateLog,
  publicPlayer,
  serializeGame,
  syncDebateMemory,
  buildAgentHash,
} from './utils';
import type { DebatePlayer, DebatePhase, DebateHost, DebateConfig, SerializedGame } from './utils';
import { createPhase, pushSpeech, summarizeDebatePhase } from './speech';
import { stableTaskId } from '../workflow-engine/utils';
import { listAiTasks, listEvents } from '../workflow-engine/repository';
import { getAiConfig } from '../../config';

// ---- Types ----

interface WorkflowStep {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
}

interface WorkflowDefinition {
  id: string;
  gameType: string;
  version: string;
  steps: WorkflowStep[];
}

interface WorkflowMatch {
  id: string;
  config: Record<string, unknown>;
  state: WorkflowState;
  status: string;
  createdAt?: string;
}

interface WorkflowState {
  topic: Topic;
  host: Record<string, unknown>;
  players: DebatePlayer[];
  phases: DebatePhase[];
  winner: string | null;
  winReason: string;
  mvp: Record<string, unknown> | null;
  completedSteps: Record<string, boolean>;
  fallbackAudit: unknown[];
  currentStep?: string;
}

interface TaskSpec {
  taskKey: string;
  actorId: number;
  targetId?: number;
  action: string;
  phaseId: string;
  contestantIds?: number[];
}

interface AiTask {
  id: string;
  matchId: string;
  stepId: string;
  taskKey: string;
  playerId?: number;
  action?: string;
  status: string;
  prompt?: Record<string, unknown>;
  promptContextSnapshot?: Record<string, unknown>;
  result?: { payload?: Record<string, unknown> };
  [key: string]: unknown;
}

interface WorkflowEvent {
  id?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

interface HandlerContext {
  match: WorkflowMatch;
  step: WorkflowStep;
  state: WorkflowState;
}

interface HandlerResult {
  status: string;
  state: WorkflowState;
  events?: Array<{
    type: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }>;
  blockers?: Array<{
    id: string;
    type: string;
    required: boolean;
    status: string;
    taskId: string;
    playerId?: number;
  }>;
  tasks?: AiTask[];
}

interface RuntimeResult {
  eventType: string;
  rawOutput: unknown;
  payload: Record<string, unknown>;
}

// ---- Constants ----

const DEBATE_WORKFLOW_ID = 'debate.workflow.v1';

const debateWorkflow: WorkflowDefinition = {
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
    { id: 'result_announce', type: 'debate.result_announce', name: '结果公布', config: {} },
  ],
};

// ---- Handlers ----

const handlers: Record<string, {
  execute: (ctx: HandlerContext) => HandlerResult;
  runAiTask?: (ctx: { match: WorkflowMatch; task: AiTask }) => Promise<RuntimeResult>;
  validateAiResult?: (ctx: { task: AiTask; result: { payload?: Record<string, unknown> } }) => void;
}> = {
  'debate.topic_reveal': {
    execute({ match, step, state }: HandlerContext): HandlerResult {
      if (state.completedSteps?.[step.id]) return { status: 'COMPLETED', state };
      const nextState = markStepComplete({
        ...state,
        currentStep: step.id,
        phases: state.phases || [],
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
            game: serializeDebateState(match, nextState),
          },
          idempotencyKey: `${match.id}:${step.id}:completed`,
        }],
      };
    },
  },
  'debate.ai_phase': {
    execute({ match, step, state }: HandlerContext): HandlerResult {
      if (state.completedSteps?.[step.id]) return { status: 'COMPLETED', state };
      const phase = createPhaseFromStep(step);
      const taskSpecs = createTaskSpecs(step, state);
      const tasks: AiTask[] = [];
      const blockers: HandlerResult['blockers'] = [];
      const existing = (listAiTasks(match.id) as unknown as AiTask[]).filter((task) => task.stepId === step.id);
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
            visibleEventSeqMax: Math.max(0, ...(listEvents(match.id) as Array<{ seq?: number }>).map((event) => event.seq || 0)),
            visibleEventIds: [],
          });
        }
        const task = existingTask || { id: taskId, status: 'queued', playerId: spec.actorId };
        if (task.status !== 'succeeded') {
          blockers!.push({
            id: `${step.id}:${spec.taskKey}`,
            type: 'AI_TASK',
            required: true,
            status: task.status === 'failed' ? 'failed' : 'pending',
            taskId,
            playerId: spec.actorId,
          });
        }
      }

      if (blockers!.length) {
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
            game: serializeDebateState(match, nextState),
          },
          idempotencyKey: `${match.id}:${step.id}:completed`,
        }],
      };
    },
    async runAiTask({ match, task }: { match: WorkflowMatch; task: AiTask }): Promise<RuntimeResult> {
      const runtime = createRuntime(match, match.state);
      const spec = task.promptContextSnapshot as Record<string, unknown>;
      const actor = runtime.agents.find((agent) => Number(agent.id) === Number(spec.actorId));
      if (!actor) throw new Error(`Debate actor not found: ${spec.actorId}`);
      const phase = (spec.phase as DebatePhase) || createPhaseFromStep({ config: { phaseId: spec.phaseId || task.stepId } } as unknown as WorkflowStep);
      syncDebateMemory(actor, runtime.state);
      const result = await executeSkillWithTrace(runtime.skillRegistry as never, spec.action as string, {
        actor,
        phase,
        target: spec.targetId ? runtime.agents.find((agent) => Number(agent.id) === Number(spec.targetId)) : undefined,
        contestants: spec.contestantIds ? (spec.contestantIds as number[]).map((id) => runtime.agents.find((agent) => Number(agent.id) === Number(id))).filter(Boolean) : undefined,
        state: runtime.state,
        config: runtime.config,
        emit: () => undefined,
        serialize: () => serializeDebateState(match, runtime.state as unknown as WorkflowState),
        fallbackAudit: runtime.fallbackAudit,
        gameType: 'debate',
      });
      return normalizeTaskResult(spec, result);
    },
    validateAiResult({ task, result }: { task: AiTask; result: { payload?: Record<string, unknown> } }): void {
      const payload = result?.payload;
      if (!payload || typeof payload !== 'object') {
        throw Object.assign(new Error('Debate AI result payload is required'), { severity: 'high' });
      }
      if (!payload.action || payload.action !== task.action) {
        throw Object.assign(new Error('Debate AI result action does not match task action'), { severity: 'high' });
      }
      if (['judge_review'].includes(task.action as string)) {
        if (!['pro', 'con', 'draw'].includes(payload.winner as string) || !String(payload.text || '').trim()) {
          throw Object.assign(new Error('Judge review result is invalid'), { severity: 'high' });
        }
        return;
      }
      if (task.action === 'vote_mvp') {
        const spec = readTaskSpec(task.promptContextSnapshot);
        if (!spec) {
          throw Object.assign(new Error('MVP vote task context is invalid'), { severity: 'high' });
        }
        const contestantIds = Array.isArray(spec.contestantIds) ? spec.contestantIds.map(Number) : [];
        const voterId = Number(payload.voterId);
        const target = Number(payload.target);
        if (!voterId || !target || voterId !== Number(task.playerId) || !contestantIds.includes(target)) {
          throw Object.assign(new Error('MVP vote result is invalid'), { severity: 'high' });
        }
        return;
      }
      if (!String(payload.text || '').trim()) {
        throw Object.assign(new Error('Debate speech result text is empty'), { severity: 'medium' });
      }
    },
  },
  'debate.result_announce': {
    execute({ match, step, state }: HandlerContext): HandlerResult {
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
            game: serializeDebateState(match, nextState),
          },
          idempotencyKey: `${match.id}:${step.id}:completed`,
        }],
      };
    },
  },
};

function readTaskSpec(value: unknown): TaskSpec | null {
  if (!value || typeof value !== 'object') return null;
  const spec = value as Partial<TaskSpec>;
  if (!spec.taskKey || !spec.actorId || !spec.action || !spec.phaseId) return null;
  return {
    taskKey: String(spec.taskKey),
    actorId: Number(spec.actorId),
    targetId: spec.targetId === undefined ? undefined : Number(spec.targetId),
    action: String(spec.action),
    phaseId: String(spec.phaseId),
    contestantIds: Array.isArray(spec.contestantIds) ? spec.contestantIds.map(Number) : undefined,
  };
}

// ---- Public functions ----

function registerDebateWorkflow(): void {
  registerWorkflow(debateWorkflow as never, handlers as never);
}

function createDebateWorkflowMatch(config: DebateConfig): WorkflowMatch {
  registerDebateWorkflow();
  const initialState = createInitialDebateState(config);
  const runtimeConfig = {
    topic: config.topic,
    debateTeams: config.debateTeams,
    hostId: config.host?.id || null,
    selectedPlayerIds: (config as Record<string, unknown>).selectedPlayerIds || (config.players || []).map((player) => player.id),
  };
  return _createWorkflowMatch({
    workflowId: DEBATE_WORKFLOW_ID,
    gameType: 'debate',
    config: runtimeConfig,
    initialState: initialState as unknown as Record<string, unknown>,
  }) as unknown as WorkflowMatch;
}

async function runDebateWorkflow(config: DebateConfig, options: { onEvent?: (event: Record<string, unknown>) => void } = {}): Promise<SerializedGame> {
  const match = createDebateWorkflowMatch(config);
  await flushOutbox(match.id, options.onEvent);
  while (true) {
    const { processed, match: current } = await drainAiTasks(match.id, { maxTasks: 1 }) as unknown as { processed: boolean; match: WorkflowMatch };
    await flushOutbox(match.id, options.onEvent);
    if (!processed || ['completed', 'failed', 'paused_debug'].includes(current?.status)) break;
  }
  const finalMatch = (getDebugState(match.id) as unknown as { match: WorkflowMatch })?.match;
  return serializeDebateState(finalMatch, finalMatch.state) as unknown as SerializedGame;
}

async function flushOutbox(matchId: string, onEvent?: (event: Record<string, unknown>) => void): Promise<void> {
  const messages = listPendingOutbox(matchId) as unknown as WorkflowEvent[];
  for (const message of messages) {
    await onEvent?.({
      type: 'workflow-event',
      matchId,
      event: message.payload,
      workflowEvent: (message.payload as Record<string, unknown>)?.payload ? ((message.payload as Record<string, unknown>).payload as Record<string, unknown>).workflowEvent : undefined,
      message: (message.payload as Record<string, unknown>)?.payload ? ((message.payload as Record<string, unknown>).payload as Record<string, unknown>).message : undefined,
      game: (message.payload as Record<string, unknown>)?.payload ? ((message.payload as Record<string, unknown>).payload as Record<string, unknown>).game : undefined,
      phase: (message.payload as Record<string, unknown>)?.payload ? ((message.payload as Record<string, unknown>).payload as Record<string, unknown>).phase : undefined,
      speech: (message.payload as Record<string, unknown>)?.payload ? ((message.payload as Record<string, unknown>).payload as Record<string, unknown>).speech : undefined,
    });
    markOutboxSent(message.id as unknown as number);
  }
}

// ---- Internal functions ----

function createInitialDebateState(config: DebateConfig): WorkflowState {
  const topic = normalizeTopic(config.topic) || choose(TOPICS);
  const agents = createDebateAgents(config, topic, createFallbackAudit(`debate-${Date.now()}`, 'debate', { gameType: 'debate' }), `debate-${Date.now()}`);
  return {
    topic,
    host: publicHost(config.host),
    players: agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      nickname: agent.nickname,
      avatar: agent.avatar,
      avatarUrl: (agent.avatarUrl as string) || agent.avatar,
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
      excluded: false,
      speeches: [],
      messages: [],
    })),
    phases: [],
    winner: null,
    winReason: '',
    mvp: null,
    completedSteps: {},
    fallbackAudit: [],
  };
}

function createDebateAgents(
  config: DebateConfig,
  topic: Topic,
  fallbackAudit: ReturnType<typeof createFallbackAudit>,
  gameId: string,
  roleSkillRegistry: ReturnType<typeof createDebateRoleSkillRegistry> | null = null,
): DebatePlayer[] {
  const setup = getConfiguredDebateSetup(config);
  return setup.players.map((player, index) => {
    const side = index < 4 ? 'pro' : index < 8 ? 'con' : 'judge';
    const debateRole = side === 'judge'
      ? 'judge'
      : Number(player.id) === Number(side === 'pro' ? setup.proCaptainId : setup.conCaptainId)
        ? 'captain'
        : 'debater';
    const agent: DebatePlayer = {
      ...player,
      side: side as 'pro' | 'con' | 'judge',
      sideIndex: side === 'judge' ? null : index % 4,
      debateRole: debateRole as 'captain' | 'debater' | 'judge',
      sideLabel: side === 'pro' ? '正方' : side === 'con' ? '反方' : '评委席',
      debateRoleLabel: debateRole === 'captain' ? '队长' : debateRole === 'judge' ? '评委' : '选手',
      speeches: [],
      messages: [],
    };
    agent.baseSystemPrompt = buildSystemPrompt(agent, topic, PHASES[0]);
    agent.baseSystemPromptHash = buildAgentHash(agent.baseSystemPrompt as string);
    agent.playerAgent = new DebateAgent(agent, agent.baseSystemPrompt as string, {
      onFallback: (entry: Record<string, unknown>) => fallbackAudit.record(entry),
      gameId,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration: playerAgent typed as unknown via index signature
    const playerAgentInstance = agent.playerAgent as any;
    roleSkillRegistry?.applyToPlayer(playerAgentInstance, debateRole);
    agent.messages = playerAgentInstance.messages;
    return agent;
  });
}

interface Runtime {
  config: DebateConfig;
  skillRegistry: ReturnType<typeof createDebateSkillRegistry>;
  roleSkillRegistry: ReturnType<typeof createDebateRoleSkillRegistry>;
  fallbackAudit: ReturnType<typeof createFallbackAudit>;
  agents: DebatePlayer[];
  state: {
    gameId: string;
    mode: string;
    topic: Topic;
    host: DebateHost | null;
    agents: DebatePlayer[];
    phases: DebatePhase[];
    winner: string | null;
    winReason: string;
    mvp: Record<string, unknown> | null;
  };
}

function createRuntime(match: WorkflowMatch, state: WorkflowState): Runtime {
  const config = resolveRuntimeConfig(match.config as Record<string, unknown>);
  config._gameId = match.id;
  const topic = state.topic || normalizeTopic(config.topic) || choose(TOPICS);
  const skillRegistry = createDebateSkillRegistry();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration: AgentSkillRegistry -> SkillRegistry
  const roleSkillRegistry = createDebateRoleSkillRegistry(skillRegistry as any);
  const fallbackAudit = createFallbackAudit(match.id, 'debate', { gameType: 'debate' });
  const agents = createDebateAgents(config, topic, fallbackAudit, match.id, roleSkillRegistry);
  const runtimeState = {
    gameId: match.id,
    mode: 'real',
    topic,
    host: config.host || null,
    agents,
    phases: clone(state.phases || []),
    winner: state.winner,
    winReason: state.winReason || '',
    mvp: state.mvp || null,
  };
  return { config, skillRegistry, roleSkillRegistry, fallbackAudit, agents, state: runtimeState };
}

function resolveRuntimeConfig(matchConfig: Record<string, unknown> = {}): DebateConfig {
  const base = getAiConfig() as unknown as DebateConfig;
  const selectedIds = new Set(((matchConfig.selectedPlayerIds as number[]) || []).map(Number));
  const players = selectedIds.size
    ? base.players.filter((player) => selectedIds.has(Number(player.id)))
    : base.players;
  return {
    ...base,
    mode: 'real',
    topic: matchConfig.topic as Topic,
    debateTeams: matchConfig.debateTeams as DebateConfig['debateTeams'],
    selectedPlayerIds: [...selectedIds],
    host: resolveHost(base, matchConfig.hostId as number),
    players,
  };
}

function resolveHost(config: DebateConfig, hostId: number | null): DebateHost {
  const id = Number(hostId);
  if (!id) return config.host || {};
  const player = config.players.find((item) => Number(item.id) === id) as unknown as DebateHost | undefined;
  if (!player) return config.host || {};
  return { ...config.host, ...player, name: player.name || player.nickname, nickname: player.nickname || player.name };
}

function createPhaseFromStep(step: WorkflowStep): DebatePhase {
  const phaseId = (step.config?.phaseId as string) || step.id;
  const source = PHASES.find((item) => item.id === phaseId) || { id: phaseId, name: step.name, limit: 200 };
  return createPhase(source);
}

function createTaskSpecs(step: WorkflowStep, state: WorkflowState): TaskSpec[] {
  const players = state.players || [];
  const phaseId = step.config.phaseId as string;
  if (step.config.tasks === 'opening') {
    return [
      { taskKey: 'pro-opening', actorId: debaterAt(players, 'pro', 0)?.id as number, action: 'opening_argue', phaseId },
      { taskKey: 'con-opening', actorId: debaterAt(players, 'con', 0)?.id as number, action: 'opening_argue', phaseId },
    ].filter((item) => item.actorId);
  }
  if (step.config.tasks === 'crossfire') {
    const pro = players.filter((agent) => agent.side === 'pro').slice(1, 3);
    const con = players.filter((agent) => agent.side === 'con').slice(1, 3);
    return [
      [pro[0], con[0], 'question'],
      [con[0], pro[1], 'question'],
      [pro[1], con[1], 'question'],
      [con[1], pro[0], 'question'],
    ].filter(([actor, target]) => actor && target).flatMap(([actor, target], index) => ([
      { taskKey: `crossfire-${index + 1}-question`, actorId: (actor as DebatePlayer).id, targetId: (target as DebatePlayer).id, action: 'crossfire_question', phaseId },
      { taskKey: `crossfire-${index + 1}-answer`, actorId: (target as DebatePlayer).id, targetId: (actor as DebatePlayer).id, action: 'crossfire_answer', phaseId },
    ]));
  }
  if (step.config.tasks === 'closing') {
    return [
      { taskKey: 'con-closing', actorId: debaterAt(players, 'con', 3)?.id as number, action: 'closing_summary', phaseId },
      { taskKey: 'pro-closing', actorId: debaterAt(players, 'pro', 3)?.id as number, action: 'closing_summary', phaseId },
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
      contestantIds: contestants.map((item) => item.id),
    }));
  }
  return [];
}

function applyAiPhaseResults(
  match: WorkflowMatch,
  step: WorkflowStep,
  state: WorkflowState,
  phase: DebatePhase,
  taskSpecs: TaskSpec[],
  tasks: AiTask[],
): WorkflowState {
  const playerMap = new Map((state.players || []).map((player) => [Number(player.id), player]));
  const taskMap = new Map(tasks.map((task) => [task.taskKey, task]));
  const nextState: WorkflowState = { ...state, phases: [...(state.phases || [])] };

  if (step.config.tasks === 'judges') {
    const winnerVotes: Record<string, string> = {};
    for (const spec of taskSpecs) {
      const result = taskMap.get(spec.taskKey)?.result?.payload;
      const judge = playerMap.get(Number(spec.actorId));
      if (!judge || !result) continue;
      winnerVotes[judge.id] = result.winner as string;
      pushSpeech(phase, judge, result.text as string, 'judge-review');
    }
    nextState.winner = topWinner(winnerVotes);
    nextState.winReason = nextState.winner === 'draw' ? '评委意见接近，双方平局。' : `${nextState.winner === 'pro' ? '正方' : '反方'}获得更多评委倾向。`;
  } else if (step.config.tasks === 'mvp') {
    const votes: Array<{ voterId: number; target: number }> = [];
    for (const spec of taskSpecs) {
      const vote = taskMap.get(spec.taskKey)?.result?.payload;
      if (vote?.target) votes.push(vote as unknown as { voterId: number; target: number });
    }
    phase.votes = votes;
    const mvpId = topVotedId(Object.fromEntries(votes.map((vote) => [vote.voterId, vote.target])));
    nextState.mvp = publicPlayer(playerMap.get(Number(mvpId)) || playerMap.get(Number(votes[0]?.target)) as DebatePlayer);
  } else {
    for (const spec of taskSpecs) {
      const result = taskMap.get(spec.taskKey)?.result?.payload;
      const actor = playerMap.get(Number(spec.actorId));
      if (!actor || !result) continue;
      const kind = spec.action === 'crossfire_question' ? 'question'
        : spec.action === 'crossfire_answer' ? 'answer'
          : phase.id;
      pushSpeech(phase, actor as DebatePlayer, (result.text || result.content || '') as string, kind, spec.targetId || null);
    }
  }

  phase.stageSummary = summarizeDebatePhase(phase);
  nextState.phases.push(phase);
  return markStepComplete(nextState, step.id);
}

function normalizeTaskResult(spec: Record<string, unknown>, result: unknown): RuntimeResult {
  if (spec.action === 'judge_review') {
    return {
      eventType: 'debate_ai_result',
      rawOutput: result,
      payload: {
        action: spec.action as string,
        actorId: spec.actorId,
        winner: ['pro', 'con', 'draw'].includes((result as Record<string, unknown>)?.winner as string) ? (result as Record<string, unknown>).winner : 'draw',
        text: String((result as Record<string, unknown>)?.text || '').trim(),
      },
    };
  }
  if (spec.action === 'vote_mvp') {
    const contestantIds = Array.isArray(spec.contestantIds) ? (spec.contestantIds as number[]).map(Number) : [];
    const target = Number((result as Record<string, unknown>).target);
    return {
      eventType: 'debate_ai_result',
      rawOutput: result,
      payload: {
        action: spec.action as string,
        actorId: spec.actorId,
        voterId: Number((result as Record<string, unknown>).voterId) || Number(spec.actorId),
        target: contestantIds.includes(target) ? target : null,
      },
    };
  }
  const text = typeof result === 'string' ? result : (result as Record<string, unknown>)?.content;
  return {
    eventType: 'debate_ai_result',
    rawOutput: result,
    payload: {
      action: spec.action as string,
      actorId: spec.actorId,
      targetId: spec.targetId || null,
      text: String(text || '').trim(),
      thinking: typeof result === 'string' ? '' : ((result as Record<string, unknown>)?.thinking as string) || '',
    },
  };
}

function serializeDebateState(match: WorkflowMatch, state: WorkflowState): Record<string, unknown> {
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
      votes: phase.votes || [],
    })),
    winner: state.winner,
    winReason: state.winReason || '',
    mvp: state.mvp || null,
    fallbackAudit: state.fallbackAudit || [],
    createdAt: match.createdAt || new Date().toISOString(),
  };
}

function markStepComplete(state: WorkflowState, stepId: string): WorkflowState {
  return {
    ...state,
    completedSteps: { ...(state.completedSteps || {}), [stepId]: true },
  };
}

function topVotedId(votes: Record<number, number>): number | null {
  const counts: Record<number, number> = {};
  Object.values(votes || {}).forEach((id) => { counts[id as number] = (counts[id as number] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? Number(entries[0][0]) : null;
}

function topWinner(votes: Record<string, string>): string {
  const counts: Record<string, number> = { pro: 0, con: 0, draw: 0 };
  Object.values(votes || {}).forEach((winner) => { if (counts[winner] !== undefined) counts[winner] += 1; });
  if (counts.pro === counts.con) return 'draw';
  return counts.pro > counts.con ? 'pro' : 'con';
}

function publicHost(host: DebateHost = {}): Record<string, unknown> {
  return {
    id: host.id || 0,
    name: host.name || host.nickname || '主持人',
    nickname: host.nickname || host.name || '主持人',
    avatar: host.avatar || '',
    avatarUrl: host.avatarUrl || host.avatar || '',
    voicePackageId: host.voicePackageId || null,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

export {
  DEBATE_WORKFLOW_ID,
  debateWorkflow,
  registerDebateWorkflow,
  createDebateWorkflowMatch,
  runDebateWorkflow,
  serializeDebateState,
};
