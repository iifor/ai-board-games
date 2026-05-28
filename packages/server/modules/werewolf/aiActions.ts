const repo = require('../workflow-engine/repository');
const { executeSkillWithTrace } = require('../agent-core');
const { createRuntime, ensureRound } = require('./runtime');
const {
  askSpeech,
  askSpeechWithThinking,
  askWolfNightSpeech,
  askWolfNightSpeechWithThinking,
  askSheriffSpeech,
  askSheriffSpeechWithThinking
} = require('./agents');
const { topTarget } = require('./winCheck');
const { rotateFromSeat, fallbackSpeech, fallbackVote } = require('./utils');
const { getAliveActorsByAction } = require('./actionWindows');
const { ensureWolfTeamContext } = require('./wolfTeam');
import { isWerewolfDebugMode, runDebugHunterAction, runDebugWerewolfAction } from './debugActions';

interface Agent {
  id: number;
  alive?: boolean;
  faction?: string;
  thinkingEnabled?: boolean;
  playerAgent: PlayerAgent;
  roleConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PlayerAgent {
  thinkingEnabled?: boolean;
  hasSkill?: (action: string) => boolean;
  askJson: (prompt: string, options: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  askVoteTarget: (prompt: string, validIds: number[], fallback: number | undefined) => Promise<number>;
}

interface Runtime {
  agents: Agent[];
  modeConfig: Record<string, unknown>;
  skillRegistry: unknown;
  fallbackAudit?: unknown;
  state: Record<string, unknown>;
  ctx: { state: Record<string, unknown> };
  [key: string]: unknown;
}

interface Round {
  day: number;
  night: {
    wolfTarget?: number | null;
    wolfLeaderId?: number | null;
    wolfSpeechOrder?: number[];
    wolfSpeeches?: unknown[];
    [key: string]: unknown;
  };
  sheriffElection?: Record<string, unknown> | null;
  publicSummary?: string;
  [key: string]: unknown;
}

interface Match {
  id: string;
  [key: string]: unknown;
}

interface Step {
  id: string;
  config: {
    day?: number;
    actionType?: string;
    phase?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface Task {
  playerId: string | number;
  [key: string]: unknown;
}

interface ActionResult {
  eventType: string;
  rawOutput: unknown;
  payload: Record<string, unknown>;
}

async function runWerewolfAiAction(runtime: Runtime, round: Round, actor: Agent, actionType: string): Promise<Record<string, unknown>> {
  const alive = runtime.agents.filter((agent) => agent.alive);
  if (actionType === 'wolf_kill') return runWolfKillAction(runtime, round, actor, alive);
  if (actionType === 'wolf_speech') return runWolfSpeechAction(runtime, round, actor);
  if (actionType === 'wolf_vote') return runWolfVoteAction(runtime, round, actor, alive);
  if (actionType === 'seer_check') return runRoleSkill(runtime, 'inspectFaction', { actor, alive, agents: runtime.agents, phase: 'night' });
  if (actionType === 'guard_protect') return runRoleSkill(runtime, 'guard', { actor, alive, phase: 'night' });
  if (actionType === 'witch_save') {
    const victim = runtime.agents.find((agent) => Number(agent.id) === Number(round.night.wolfTarget));
    return runRoleSkill(runtime, 'save', { actor, victim, round, modeConfig: runtime.modeConfig, phase: 'night' });
  }
  if (actionType === 'witch_poison') return runRoleSkill(runtime, 'poison', { actor, alive, phase: 'night' });
  if (actionType === 'day_speech') return runDaySpeechAction(runtime, round, actor);
  if (actionType === 'day_vote') return runDayVoteAction(runtime, actor, alive);
  if (actionType === 'sheriff_signup') return runSheriffSignupAction(actor);
  if (actionType === 'sheriff_speech') return runSheriffSpeechAction(round, actor, false);
  if (actionType === 'sheriff_withdraw') return runSheriffWithdrawAction(actor);
  if (actionType === 'sheriff_vote') return runSheriffVoteAction(actor, taskTargetIds(runtime, round, 'sheriff_vote'));
  if (actionType === 'sheriff_runoff_speech') return runSheriffSpeechAction(round, actor, true);
  if (actionType === 'sheriff_runoff_vote') return runSheriffVoteAction(actor, taskTargetIds(runtime, round, 'sheriff_runoff_vote'));
  throw Object.assign(new Error(`Unsupported werewolf action: ${actionType}`), { severity: 'high' });
}

async function runActionWindowAiTask({ match, step, task }: { match: Match; step: Step; task: Task }): Promise<ActionResult> {
  const runtime: Runtime = createRuntime(repo.getMatch(match.id) || match);
  const round: Round = ensureRound(runtime.state, step.config.day);
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(task.playerId));
  if (!actor) throw Object.assign(new Error(`Actor not found: ${task.playerId}`), { severity: 'high' });
  const payload = isWerewolfDebugMode(runtime)
    ? runDebugWerewolfAction(runtime, round, actor, step.config.actionType!)
    : await runWerewolfAiAction(runtime, round, actor, step.config.actionType!);
  return {
    eventType: 'werewolf_action_submitted',
    rawOutput: payload,
    payload: {
      actionType: step.config.actionType,
      day: step.config.day,
      actorId: actor.id,
      ...payload
    }
  };
}

async function runHunterAiTask({ match, step, task }: { match: Match; step: Step; task: Task }): Promise<ActionResult> {
  const runtime: Runtime = createRuntime(repo.getMatch(match.id) || match);
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(task.playerId));
  if (!actor) throw Object.assign(new Error(`Hunter not found: ${task.playerId}`), { severity: 'high' });
  if (isWerewolfDebugMode(runtime)) {
    const payload = runDebugHunterAction(runtime, actor);
    return {
      eventType: 'werewolf_action_submitted',
      rawOutput: payload,
      payload: { actionType: 'hunter_shot', actorId: actor.id, ...payload }
    };
  }
  const target = await executeSkillWithTrace(runtime.skillRegistry, 'shootOnDeath', {
    actor,
    agents: runtime.agents,
    fallback: fallbackVote(actor, runtime.agents),
    phase: step.config.phase || 'death',
    state: runtime.ctx.state,
    gameType: 'werewolf',
    fallbackAudit: runtime.fallbackAudit
  });
  return {
    eventType: 'werewolf_action_submitted',
    rawOutput: target,
    payload: { actionType: 'hunter_shot', actorId: actor.id, target: target.target }
  };
}

function validateActionWindowAiResult({ result }: { result: { payload?: { actionType?: string; actorId?: unknown } } }): void {
  if (!result?.payload?.actionType || result.payload.actorId == null) {
    throw Object.assign(new Error('Werewolf action result is invalid'), { severity: 'high' });
  }
}

function validateHunterAiResult({ result }: { result: { payload?: { actorId?: unknown } } }): void {
  if (!result?.payload?.actorId) throw Object.assign(new Error('Hunter shot result is invalid'), { severity: 'high' });
}

async function runWolfKillAction(runtime: Runtime, round: Round, actor: Agent, alive: Agent[]): Promise<Record<string, unknown>> {
  const context = ensureWolfTeamContext(runtime, round);
  const wolves = getAliveActorsByAction(runtime, 'kill');
  const leader = wolves.find((wolf: Agent) => Number(wolf.id) === Number(context.wolfLeaderId)) || wolves[0] || actor;
  const speechOrder = context.wolfSpeechOrder?.length ? context.wolfSpeechOrder : rotateFromSeat(wolves, leader.id, 'clockwise').map((wolf: Agent) => wolf.id);
  round.night.wolfLeaderId = leader.id;
  round.night.wolfSpeechOrder = speechOrder;
  const isLeader = Number(actor.id) === Number(leader.id);
  const sharedSpeeches = buildWolfSpeechContext(round);
  const text = actor.thinkingEnabled && actor.playerAgent.thinkingEnabled
    ? await askWolfNightSpeechWithThinking(actor, round.day, sharedSpeeches, isLeader)
    : { content: await askWolfNightSpeech(actor, round.day, sharedSpeeches, isLeader) };
  const result = await runRoleSkill(runtime, 'kill', {
    actor,
    alive,
    fallback: alive.find((agent) => agent.faction !== 'wolves')?.id || alive[0]?.id,
    topTarget,
    phase: 'night'
  });
  return { target: result.target, speech: text.content || text, thinking: text.thinking || '' };
}

async function runWolfSpeechAction(runtime: Runtime, round: Round, actor: Agent): Promise<Record<string, unknown>> {
  const context = ensureWolfTeamContext(runtime, round);
  const isLeader = Number(actor.id) === Number(context.wolfLeaderId);
  const sharedSpeeches = buildWolfSpeechContext(round);
  const text = actor.thinkingEnabled && actor.playerAgent.thinkingEnabled
    ? await askWolfNightSpeechWithThinking(actor, round.day, sharedSpeeches, isLeader)
    : { content: await askWolfNightSpeech(actor, round.day, sharedSpeeches, isLeader) };
  return { speech: text.content || text, thinking: text.thinking || '' };
}

async function runWolfVoteAction(runtime: Runtime, round: Round, actor: Agent, alive: Agent[]): Promise<Record<string, unknown>> {
  ensureWolfTeamContext(runtime, round);
  const valid = alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
  const speeches = (round.night.wolfSpeeches || [])
    .map((speech: Record<string, unknown>) => `${speech.playerId}号：${speech.text || ''}`)
    .join('\n');
  const target = await actor.playerAgent.askVoteTarget([
    '狼人夜晚刀口投票。请在听完所有狼队夜聊后选择今晚击杀目标。',
    `狼队夜聊记录：\n${speeches || '暂无发言。'}`
  ].join('\n\n'), valid, valid[0] || fallbackVote(actor, runtime.agents));
  return { target };
}

function buildWolfSpeechContext(round: Round): Array<Record<string, unknown>> {
  const sharedInfo = String(round.night.wolfSharedInfo || '');
  const existing = Array.isArray(round.night.wolfSpeeches) ? round.night.wolfSpeeches as Array<Record<string, unknown>> : [];
  return sharedInfo
    ? [{ playerId: '系统', text: sharedInfo }, ...existing]
    : existing;
}

async function runDaySpeechAction(runtime: Runtime, round: Round, actor: Agent): Promise<Record<string, unknown>> {
  const publicContext = buildDaySpeechContext(round);
  const text = actor.thinkingEnabled && actor.playerAgent.thinkingEnabled
    ? await askSpeechWithThinking(actor, round.day, publicContext, fallbackSpeech(actor, round.day))
    : { content: await askSpeech(actor, round.day, publicContext, fallbackSpeech(actor, round.day)) };
  const speechText = String(text.content || text || '');
  const result: Record<string, unknown> = { text: speechText, thinking: text.thinking || '' };
  if (actor.faction === 'wolves' && actor.playerAgent.hasSkill?.('selfDestruct')) {
    const selfDestruct = await runRoleSkill(runtime, 'selfDestruct', {
      actor,
      phase: 'day',
      publicContext,
      speechText
    });
    if (selfDestruct?.use) {
      result.intent = 'selfDestruct';
      result.selfDestruct = true;
      result.selfDestructText = String(selfDestruct.text || `${actor.id}号狼人自爆。`);
    }
  }
  return result;
}

async function runDayVoteAction(runtime: Runtime, actor: Agent, alive: Agent[]): Promise<Record<string, unknown>> {
  const valid = alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(actor.id));
  const target = await actor.playerAgent.askVoteTarget('请选择你要放逐的玩家。', valid, fallbackVote(actor, runtime.agents));
  return { target };
}

async function runSheriffSignupAction(actor: Agent): Promise<Record<string, unknown>> {
  const parsed = await actor.playerAgent.askJson([
    '警长竞选开始。请选择竞选警长？',
    '只返回 JSON：{"run":true} 或 {"run":false}。'
  ].join('\n\n'), { maxTokens: 40, fallback: { run: Number(actor.id) <= 3 } });
  return { run: Boolean(parsed?.run) };
}

async function runSheriffSpeechAction(round: Round, actor: Agent, runoff: boolean): Promise<Record<string, unknown>> {
  const text = actor.thinkingEnabled && actor.playerAgent.thinkingEnabled
    ? await askSheriffSpeechWithThinking(actor, round.day, '公开信息已通过上下文同步。', runoff)
    : { content: await askSheriffSpeech(actor, round.day, '公开信息已通过上下文同步。', runoff) };
  return { text: text.content || text, thinking: text.thinking || '' };
}

async function runSheriffWithdrawAction(actor: Agent): Promise<Record<string, unknown>> {
  const parsed = await actor.playerAgent.askJson([
    '你的警上竞选发言已经结束。你是否退水退出警长竞选？',
    '只返回 JSON：{"withdraw":true} 或 {"withdraw":false}。'
  ].join('\n\n'), { maxTokens: 40, fallback: { withdraw: false } });
  return { withdraw: Boolean(parsed?.withdraw) };
}

async function runSheriffVoteAction(actor: Agent, candidateIds: number[]): Promise<Record<string, unknown>> {
  const target = await actor.playerAgent.askVoteTarget('警长竞选投票，请从候选人中选择警长。', candidateIds, candidateIds[0]);
  return { target };
}

function taskTargetIds(runtime: Runtime, round: Round, actionType: string): number[] {
  const election = round.sheriffElection;
  const key = actionType === 'sheriff_runoff_vote' ? 'runoffCandidateIds' : 'candidates';
  const ids = Array.isArray(election?.[key]) ? election[key] as number[] : [];
  return ids.length ? ids.map(Number) : runtime.agents.filter((agent) => agent.alive).map((agent) => agent.id);
}

function buildDaySpeechContext(round: Round): string {
  const lines = [round.publicSummary || ''];
  const election = round.sheriffElection as Record<string, unknown> | null | undefined;
  const sheriffSpeeches = Array.isArray(election?.speeches) ? election.speeches as Array<Record<string, unknown>> : [];
  const daySpeeches = Array.isArray(round.speeches) ? round.speeches as Array<Record<string, unknown>> : [];
  if (sheriffSpeeches.length) {
    lines.push(`警上发言：\n${sheriffSpeeches.map((speech) => `${speech.playerId}号：${speech.text || ''}`).join('\n')}`);
  }
  if (daySpeeches.length) {
    lines.push(`本轮已公开发言：\n${daySpeeches.map((speech) => `${speech.playerId}号：${speech.text || ''}`).join('\n')}`);
  }
  return lines.filter(Boolean).join('\n\n') || '暂无公开信息。';
}

function runRoleSkill(runtime: Runtime, action: string, context: Record<string, unknown>): Promise<Record<string, unknown>> {
  return executeSkillWithTrace(runtime.skillRegistry, action, {
    ...context,
    state: runtime.ctx.state,
    gameType: 'werewolf',
    fallbackAudit: runtime.fallbackAudit
  });
}

export {
  runWerewolfAiAction,
  runActionWindowAiTask,
  runHunterAiTask,
  validateActionWindowAiResult,
  validateHunterAiResult
};
