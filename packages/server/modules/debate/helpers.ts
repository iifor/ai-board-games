/**
 * 辩论赛共享工具函数
 *
 * 从 workflow.ts 和 service.ts 中提取的重复逻辑。
 * 所有两边都需要的纯函数统一放在这里，避免维护两份。
 */

import { createFallbackAudit, createTraceContext } from '../agent-core';
import { formatRelationshipMemoryForPrompt, loadPlayerSession, savePlayerSession } from '../player-memory';
import { createDebateRoleSkillRegistry } from './roleSkills';
import { createDebateSkillRegistry } from './skillRegistry';
import { DebateAgent } from './playerAgent';
import { buildSystemPrompt } from './prompts';
import type { Topic } from './prompts';
import { PHASES, TOPICS } from './constants';
import { buildShareReport } from './report';
import {
  choose,
  getConfiguredDebateSetup,
  normalizeTopic,
  publicDebateHost,
  buildAgentHash,
  serializeGame,
} from './utils';
import type { DebatePlayer, DebatePhase, DebateHost, DebateConfig, SerializedGame, SpeechEntry } from './utils';
import { createPhase, pushSpeech, summarizeDebatePhase } from './speech';
import { getDebateRoleName } from './prompts';
import { getAiConfig } from '../../config';

// ---- Types ----

interface WorkflowMatch {
  id: string;
  config: Record<string, unknown>;
  state: WorkflowState;
  status: string;
  createdAt?: string;
}

interface WorkflowState {
  topic: Topic;
  host: DebateHost;
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

interface HandlerResult {
  blockers?: unknown[];
  tasks?: unknown[];
  events?: Array<{
    type: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }>;
}

interface RuntimeResult {
  eventType: string;
  rawOutput: unknown;
  payload: Record<string, unknown>;
}

interface WorkflowEvent {
  id?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---- Agent Creation ----

/**
 * 创建辩论赛玩家 agents（单一真相来源）
 *
 * @param config 辩论赛配置
 * @param topic 辩题
 * @param fallbackAudit 兜底审计
 * @param gameId 对局 ID
 * @param roleSkillRegistry 角色技能注册表
 * @param options.sessionPersistence 是否启用会话持久化（workflow 模式需要）
 */
function createDebateAgents(
  config: DebateConfig,
  topic: Topic,
  fallbackAudit: ReturnType<typeof createFallbackAudit>,
  gameId: string,
  roleSkillRegistry: ReturnType<typeof createDebateRoleSkillRegistry> | null = null,
  options: { sessionPersistence?: boolean } = {},
): DebatePlayer[] {
  const setup = getConfiguredDebateSetup(config);
  return setup.players.map((player, index) => {
    const { fallbackModel, ...publicPlayer } = player as DebatePlayer & {
      fallbackModel?: { apiKey?: string; baseUrl?: string; provider?: string; model?: string; apiFormat?: string } | null;
    };
    const side = index < 4 ? 'pro' : index < 8 ? 'con' : 'judge';
    const debateRole = side === 'judge'
      ? 'judge'
      : Number(player.id) === Number(side === 'pro' ? setup.proCaptainId : setup.conCaptainId)
        ? 'captain'
        : 'debater';
    const agent: DebatePlayer = {
      ...publicPlayer,
      side: side as 'pro' | 'con' | 'judge',
      sideIndex: side === 'judge' ? null : index % 4,
      debateRole: debateRole as 'captain' | 'debater' | 'judge',
      sideLabel: side === 'pro' ? '正方' : side === 'con' ? '反方' : '评委席',
      debateRoleLabel: debateRole === 'captain' ? '队长' : debateRole === 'judge' ? '评委' : '选手',
      speeches: [],
      messages: [],
    };
    const stablePlayerId = Number((agent as Record<string, unknown>).sourcePlayerId || agent.id);
    const relationshipMemory = formatRelationshipMemoryForPrompt('debate', stablePlayerId, setup.players);
    agent.baseSystemPrompt = buildSystemPrompt(agent, topic, PHASES[0], relationshipMemory);
    const basePromptHash = buildAgentHash(agent.baseSystemPrompt as string);
    agent.baseSystemPromptHash = basePromptHash;

    const sessionOptions: Record<string, unknown> = {};
    if (options.sessionPersistence) {
      const initialMessages = loadPlayerSession('debate', gameId, stablePlayerId, basePromptHash) || undefined;
      sessionOptions.initialMessages = initialMessages;
      sessionOptions.onMessagesChanged = (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) =>
        savePlayerSession('debate', gameId, stablePlayerId, basePromptHash, messages);
    }

    agent.playerAgent = new DebateAgent(agent, agent.baseSystemPrompt as string, {
      onError: (entry: Record<string, unknown>) => fallbackAudit.record(entry as never),
      gameId,
      fallbackModel,
      ...sessionOptions,
    });
    roleSkillRegistry?.applyToPlayer(agent.playerAgent as never, debateRole);
    agent.messages = (agent.playerAgent as unknown as { messages: DebatePlayer['messages'] }).messages;
    return agent;
  });
}

// ---- State Helpers ----

/**
 * 创建辩论赛初始状态（workflow 模式使用）
 */
function createInitialDebateState(config: DebateConfig): WorkflowState {
  const topic = normalizeTopic(config.topic) || choose(TOPICS);
  const fallbackAudit = createFallbackAudit(`debate-${Date.now()}`, 'debate', { gameType: 'debate' });
  const agents = createDebateAgents(config, topic, fallbackAudit, `debate-${Date.now()}`, null, { sessionPersistence: false });
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

function markStepComplete(state: WorkflowState, stepId: string): WorkflowState {
  return {
    ...state,
    completedSteps: { ...(state.completedSteps || {}), [stepId]: true },
  };
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

// ---- Serialization ----

/**
 * 序列化辩论赛状态（workflow 模式使用，简化版）
 */
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

// ---- Voting Helpers ----

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

// ---- Workflow Helpers ----

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
    host: base.host || {},
    players,
  };
}

function collectWinnerVotes(phase: DebatePhase): Record<string, string> {
  const votes: Record<string, string> = {};
  for (const speech of phase.speeches || []) {
    const winner = (speech as unknown as Record<string, unknown>).winner;
    if (speech.playerId && winner) votes[String(speech.playerId)] = String(winner);
  }
  return votes;
}

function getDebateSpeechKind(action: string, phaseId: string): string {
  if (action === 'crossfire_question') return 'question';
  if (action === 'crossfire_answer') return 'answer';
  if (action === 'judge_review') return 'judge-review';
  return phaseId;
}

function buildDebateSpeechEvents(
  match: WorkflowMatch,
  step: { id: string; [key: string]: unknown },
  state: WorkflowState,
  phaseId: string,
  taskSpecs: TaskSpec[],
): HandlerResult['events'] {
  const specs = taskSpecs.filter((spec) => spec.action !== 'vote_mvp');
  if (!specs.length) return [];
  const currentPhase = (state.phases || []).find((item) => item.id === phaseId);
  if (!currentPhase) return [];
  const speeches = currentPhase.speeches || [];
  const game = serializeDebateState(match, state);
  const events: NonNullable<HandlerResult['events']> = [];
  for (const spec of specs) {
    const expectedKind = getDebateSpeechKind(spec.action, currentPhase.id);
    const speech = [...speeches].reverse().find((item) =>
      Number(item.playerId) === Number(spec.actorId) &&
      String(item.kind || '') === expectedKind
    );
    if (!speech) continue;
    events.push({
      type: 'speech',
      payload: {
        phase: currentPhase,
        speech,
        game,
      },
      idempotencyKey: `${match.id}:${step.id}:speech:${speech.playerId}:${speech.kind || 'speech'}`,
    });
  }
  return events;
}

function projectDebateOutboxEvent(message: WorkflowEvent, matchId: string): Record<string, unknown> {
  const event = (message.payload || {}) as Record<string, unknown>;
  const payload = event.payload && typeof event.payload === 'object'
    ? event.payload as Record<string, unknown>
    : {};
  const eventType = String(event.type || '');
  const base = {
    matchId,
    event,
    workflowEvent: payload.workflowEvent || eventType,
    message: payload.message,
    game: payload.game,
    phase: payload.phase,
    speech: payload.speech,
  };
  if (eventType === 'speech') {
    return {
      type: 'speech',
      ...base,
    };
  }
  return {
    type: 'workflow-event',
    ...base,
  };
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

export {
  // Agent creation
  createDebateAgents,
  // State helpers
  createInitialDebateState,
  markStepComplete,
  publicHost,
  clone,
  // Serialization
  serializeDebateState,
  // Voting helpers
  topVotedId,
  topWinner,
  // Workflow helpers
  resolveRuntimeConfig,
  collectWinnerVotes,
  getDebateSpeechKind,
  buildDebateSpeechEvents,
  projectDebateOutboxEvent,
  normalizeTaskResult,
};

export type {
  WorkflowMatch,
  WorkflowState,
  TaskSpec,
  AiTask,
  HandlerResult,
  RuntimeResult,
  WorkflowEvent,
};
