const repo = require('../workflow-engine/repository');
const { executeSkillWithTrace } = require('../agent-core');
const { createRuntime, ensureRound } = require('./runtime');
const {
  askSpeech,
  askWolfNightSpeech,
  askSheriffSpeech,
} = require('./prompts/speech');
const {
  buildWolfVotePrompt,
  DAY_VOTE_PROMPT,
  SHERIFF_SIGNUP_PROMPT,
  buildSheriffWithdrawPrompt,
  SHERIFF_VOTE_PROMPT,
} = require('./prompts/actions');
const { topTarget } = require('./winCheck');
const { rotateFromSeat } = require('./utils');
const { getAliveActorsByAction } = require('./actionWindows');
const { ensureWolfTeamContext } = require('./wolfTeam');
import { isWerewolfDebugMode, runDebugHunterAction, runDebugWerewolfAction } from './debugActions';
import { resolveActionChannel } from '@ai-presenter/shared/utils/channelResolution';
import { serializeWerewolfState } from './runtime';

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
  askVoteTarget: (prompt: string, validIds: number[], options?: Record<string, unknown>) => Promise<number | null>;
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

// ============================================================
// AI 行动分发
// ============================================================

async function runWerewolfAiAction(runtime: Runtime, round: Round, actor: Agent, actionType: string): Promise<Record<string, unknown>> {
  const alive = runtime.agents.filter((agent) => agent.alive);
  if (actionType === 'wolf_kill') return runWolfKillAction(runtime, round, actor, alive);
  if (actionType === 'wolf_speech') return runWolfSpeechAction(runtime, round, actor);
  if (actionType === 'wolf_vote') return runWolfVoteAction(runtime, round, actor, alive);
  if (actionType === 'seer_check') return runRoleSkillNullSafe(runtime, 'inspectFaction', { actor, alive, agents: runtime.agents, phase: 'night' });
  if (actionType === 'guard_protect') return runRoleSkillNullSafe(runtime, 'guard', { actor, alive, phase: 'night' });
  if (actionType === 'witch_save') {
    const victim = runtime.agents.find((agent) => Number(agent.id) === Number(round.night.wolfTarget));
    return runRoleSkillNullSafe(runtime, 'save', { actor, victim, round, modeConfig: runtime.modeConfig, phase: 'night' });
  }
  if (actionType === 'witch_poison') return runRoleSkillNullSafe(runtime, 'poison', { actor, alive, phase: 'night' });
  if (actionType === 'day_speech') return runDaySpeechAction(runtime, round, actor);
  if (actionType === 'day_vote') return runDayVoteAction(actor, alive, runtime);
  if (actionType === 'sheriff_signup') return runSheriffSignupAction(actor);
  if (actionType === 'sheriff_speech') return runSheriffSpeechAction(round, actor, false);
  if (actionType === 'sheriff_withdraw') return runSheriffWithdrawAction(round, actor);
  if (actionType === 'sheriff_vote') return runSheriffVoteAction(actor, taskTargetIds(runtime, round, 'sheriff_vote'));
  if (actionType === 'sheriff_runoff_speech') return runSheriffSpeechAction(round, actor, true);
  if (actionType === 'sheriff_runoff_vote') return runSheriffVoteAction(actor, taskTargetIds(runtime, round, 'sheriff_runoff_vote'));
  throw Object.assign(new Error(`Unsupported werewolf action: ${actionType}`), { severity: 'high' });
}

// ============================================================
// 主入口
// ============================================================

async function runActionWindowAiTask({ match, step, task }: { match: Match; step: Step; task: Task }): Promise<ActionResult> {
  const runtime: Runtime = createRuntime(repo.getMatch(match.id) || match);
  const round: Round = ensureRound(runtime.state, step.config.day);
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(task.playerId));
  if (!actor) throw Object.assign(new Error(`Actor not found: ${task.playerId}`), { severity: 'high' });
  const payload = isWerewolfDebugMode(runtime)
    ? runDebugWerewolfAction(runtime, round, actor, step.config.actionType!)
    : await runWerewolfAiAction(runtime, round, actor, step.config.actionType!);

  // Phase 3: 通过 EventBus 发布 action-submitted 事件
  publishActionSubmitted(runtime, match, step, actor.id, payload);

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

  try {
    const result = await executeSkillWithTrace(runtime.skillRegistry, 'shootOnDeath', {
      actor,
      agents: runtime.agents,
      phase: step.config.phase || 'death',
      state: runtime.ctx.state,
      gameType: 'werewolf',
    });
    const target = (result as { target?: number | null } | null)?.target ?? null;
    return {
      eventType: 'werewolf_action_submitted',
      rawOutput: result,
      payload: { actionType: 'hunter_shot', actorId: actor.id, target }
    };
  } catch {
    // AI 调用失败 → 猎人不开枪
    return {
      eventType: 'werewolf_action_submitted',
      rawOutput: null,
      payload: { actionType: 'hunter_shot', actorId: actor.id, target: null }
    };
  }
}

function validateActionWindowAiResult({ result }: { result: { payload?: { actionType?: string; actorId?: unknown } } }): void {
  if (!result?.payload?.actionType || result.payload.actorId == null) {
    throw Object.assign(new Error('Werewolf action result is invalid'), { severity: 'high' });
  }
}

function validateHunterAiResult({ result }: { result: { payload?: { actorId?: unknown } } }): void {
  if (!result?.payload?.actorId) throw Object.assign(new Error('Hunter shot result is invalid'), { severity: 'high' });
}

// ============================================================
// 狼人行动
// ============================================================

async function runWolfKillAction(runtime: Runtime, round: Round, actor: Agent, alive: Agent[]): Promise<Record<string, unknown>> {
  const context = ensureWolfTeamContext(runtime, round);
  const wolves = getAliveActorsByAction(runtime, 'kill');
  const leader = wolves.find((wolf: Agent) => Number(wolf.id) === Number(context.wolfLeaderId)) || wolves[0] || actor;
  const speechOrder = context.wolfSpeechOrder?.length ? context.wolfSpeechOrder : rotateFromSeat(wolves, leader.id, 'clockwise').map((wolf: Agent) => wolf.id);
  round.night.wolfLeaderId = leader.id;
  round.night.wolfSpeechOrder = speechOrder;
  const isLeader = Number(actor.id) === Number(leader.id);
  const sharedSpeeches = buildWolfSpeechContext(round);

  // 狼人夜聊发言
  let speechText = '';
  let thinkingText = '';
  const nightResult = await askWolfNightSpeech(actor, round.day, sharedSpeeches, isLeader, { thinking: actor.thinkingEnabled && actor.playerAgent.thinkingEnabled });
  if (nightResult) {
    if (typeof nightResult === 'string') {
      speechText = nightResult;
    } else {
      speechText = nightResult.content || '';
      thinkingText = nightResult.thinking || '';
    }
  }

  // 狼人选刀目标
  try {
    const result = await executeSkillWithTrace(runtime.skillRegistry, 'kill', {
      actor,
      alive,
      topTarget,
      phase: 'night',
      state: runtime.ctx.state,
      gameType: 'werewolf',
    });
    const target = (result as { target?: number | null } | null)?.target ?? null;
    return { target, speech: speechText, thinking: thinkingText };
  } catch {
    return { target: null, speech: speechText, thinking: thinkingText };
  }
}

async function runWolfSpeechAction(runtime: Runtime, round: Round, actor: Agent): Promise<Record<string, unknown>> {
  const context = ensureWolfTeamContext(runtime, round);
  const isLeader = Number(actor.id) === Number(context.wolfLeaderId);
  const sharedSpeeches = buildWolfSpeechContext(round);

  const result = await askWolfNightSpeech(actor, round.day, sharedSpeeches, isLeader, { thinking: actor.thinkingEnabled && actor.playerAgent.thinkingEnabled });
  if (result) {
    if (typeof result === 'string') return { speech: result, thinking: '' };
    return { speech: result.content || '', thinking: result.thinking || '' };
  }
  return { speech: '', thinking: '' };
}

async function runWolfVoteAction(runtime: Runtime, round: Round, actor: Agent, alive: Agent[]): Promise<Record<string, unknown>> {
  ensureWolfTeamContext(runtime, round);
  const valid = alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
  const speeches = (round.night.wolfSpeeches || [])
    .map((speech: Record<string, unknown>) => `${speech.playerId}号：${speech.text || ''}`)
    .join('\n');
  const target = await actor.playerAgent.askVoteTarget(buildWolfVotePrompt(speeches), valid);
  return { target }; // null = 弃票
}

function buildWolfSpeechContext(round: Round): Array<Record<string, unknown>> {
  const sharedInfo = String(round.night.wolfSharedInfo || '');
  const existing = Array.isArray(round.night.wolfSpeeches) ? round.night.wolfSpeeches as Array<Record<string, unknown>> : [];
  return sharedInfo
    ? [{ playerId: '系统', text: sharedInfo }, ...existing]
    : existing;
}

// ============================================================
// 白天行动
// ============================================================

async function runDaySpeechAction(runtime: Runtime, round: Round, actor: Agent): Promise<Record<string, unknown>> {
  const publicContext = buildDaySpeechContext(round);

  let speechText = '';
  let thinkingText = '';
  const speechResult = await askSpeech(actor, round.day, publicContext, { thinking: actor.thinkingEnabled && actor.playerAgent.thinkingEnabled });
  if (speechResult) {
    if (typeof speechResult === 'string') {
      speechText = speechResult;
    } else {
      speechText = speechResult.content || '';
      thinkingText = speechResult.thinking || '';
    }
  }

  const result: Record<string, unknown> = { text: speechText, thinking: thinkingText };

  // 狼人自爆检查
  if (speechText && actor.faction === 'wolves' && actor.playerAgent.hasSkill?.('selfDestruct')) {
    try {
      const selfDestruct = await executeSkillWithTrace(runtime.skillRegistry, 'selfDestruct', {
        actor,
        phase: 'day',
        publicContext,
        speechText,
        state: runtime.ctx.state,
        gameType: 'werewolf',
      });
      if ((selfDestruct as { use?: boolean } | null)?.use) {
        result.intent = 'selfDestruct';
        result.selfDestruct = true;
        result.selfDestructText = String((selfDestruct as { text?: string }).text || `${actor.id}号狼人自爆。`);
      }
    } catch {
      // 自爆检查失败 → 不自爆
    }
  }

  return result;
}

async function runDayVoteAction(actor: Agent, alive: Agent[], runtime: Runtime): Promise<Record<string, unknown>> {
  const valid = alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(actor.id));
  const deadList = runtime.agents.filter((a) => !a.alive).map((a) => `${a.id}号(${a.deathReason || '已出局'})`);
  const prompt = deadList.length
    ? [`请选择你要放逐的玩家。`, `已出局玩家：${deadList.join('、')}不可被投票`].join('\n')
    : DAY_VOTE_PROMPT;
  const target = await actor.playerAgent.askVoteTarget(prompt, valid);
  return { target }; // null = 弃票
}

// ============================================================
// 警长行动
// ============================================================

async function runSheriffSignupAction(actor: Agent): Promise<Record<string, unknown>> {
  const parsed = await actor.playerAgent.askJson(SHERIFF_SIGNUP_PROMPT, { maxTokens: 40 });
  return { run: parsed?.run === true };
}

async function runSheriffSpeechAction(round: Round, actor: Agent, runoff: boolean): Promise<Record<string, unknown>> {
  const result = await askSheriffSpeech(actor, round.day, '公开信息已通过上下文同步。', runoff, { thinking: actor.thinkingEnabled && actor.playerAgent.thinkingEnabled });
  if (result) {
    if (typeof result === 'string') return { text: result, thinking: '' };
    return { text: result.content || '', thinking: result.thinking || '' };
  }
  return { text: '', thinking: '' };
}

async function runSheriffWithdrawAction(round: Round, actor: Agent): Promise<Record<string, unknown>> {
  const context = buildDaySpeechContext(round);
  const parsed = await actor.playerAgent.askJson(buildSheriffWithdrawPrompt(context), { maxTokens: 40 });
  return { withdraw: parsed?.withdraw === true };
}

async function runSheriffVoteAction(actor: Agent, candidateIds: number[]): Promise<Record<string, unknown>> {
  const target = await actor.playerAgent.askVoteTarget(SHERIFF_VOTE_PROMPT, candidateIds);
  return { target }; // null = 弃票
}

// ============================================================
// 辅助函数
// ============================================================

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

/**
 * 执行角色技能，AI 失败时返回 null target（技能不生效）
 */
async function runRoleSkillNullSafe(runtime: Runtime, action: string, context: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const result = await executeSkillWithTrace(runtime.skillRegistry, action, {
      ...context,
      state: runtime.ctx.state,
      gameType: 'werewolf',
    });
    return result as Record<string, unknown>;
  } catch {
    // AI 失败 → 不使用技能
    return action === 'save' || action === 'poison'
      ? { use: false }
      : { target: null };
  }
}

/**
 * Phase 3: 发布 action-submitted 事件到 EventBus
 */
function publishActionSubmitted(
  runtime: Runtime,
  match: Match,
  step: Step,
  actorId: number,
  payload: Record<string, unknown>,
): void {
  const eventBus = (runtime as Record<string, unknown>).eventBus as { publish: (e: unknown) => void } | undefined;
  const gameEventBuilder = (runtime as Record<string, unknown>).gameEventBuilder as {
    setStep: (s: string) => unknown;
    setPhase: (p: string) => unknown;
    setDay: (d: number) => unknown;
    buildActionSubmitted: (actionType: string, actorId: number, opts: Record<string, unknown>) => unknown;
  } | undefined;

  if (!eventBus || !gameEventBuilder) return;

  try {
    // 刷新游戏快照（AI 任务执行后状态已变化，如警长报名）
    (gameEventBuilder as unknown as { setGame: (g: unknown) => void }).setGame(
      serializeWerewolfState(match, runtime.state as unknown as Record<string, unknown>)
    );

    const { channel, scopeKey } = resolveActionChannel(step.config.actionType || '');
    gameEventBuilder.setStep(step.id);
    gameEventBuilder.setPhase((step.config.phase as string) || 'night');
    gameEventBuilder.setDay(step.config.day || 1);

    const speechPayload = payload.speech || payload.text
      ? {
          playerId: actorId,
          text: (payload.speech || payload.text || '') as string,
          thinking: (payload.thinking || '') as string,
        }
      : undefined;

    const event = gameEventBuilder.buildActionSubmitted(
      step.config.actionType || '',
      actorId,
      {
        targetId: payload.target as number | undefined,
        speech: speechPayload,
        result: payload,
        channel,
        scopeKey,
      },
    );

    eventBus.publish(event);
  } catch (error) {
    console.error(`[aiActions] 发布 action-submitted 事件失败:`, (error as Error).message);
  }
}

export {
  runWerewolfAiAction,
  runActionWindowAiTask,
  runHunterAiTask,
  validateActionWindowAiResult,
  validateHunterAiResult
};
