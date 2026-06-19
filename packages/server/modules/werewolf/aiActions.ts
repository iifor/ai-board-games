import * as repo from '../workflow-engine/repository';
import { executeSkillWithTrace } from '../agent-core';
import { createRuntime, ensureRound, trackMatchEventPublish } from './runtime';
import {
  askSpeech,
  askWolfNightSpeech,
  askSheriffSpeech,
} from './prompts/speech';
import {
  buildWolfVotePrompt,
  buildTargetJsonContract,
  DAY_VOTE_PROMPT,
  SHERIFF_SIGNUP_PROMPT,
  buildSheriffWithdrawPrompt,
  SHERIFF_VOTE_PROMPT,
} from './prompts/actions';
import { buildWerewolfActionPrompt } from './prompts/context';
import { topTarget } from './winCheck';
import { rotateFromSeat, getSeatNumber } from './utils';
import { getAliveActorsByAction } from './actionWindows';
import { ensureWolfTeamContext } from './wolfTeam';
import { isWerewolfDebugMode, runDebugHunterAction, runDebugSheriffBadgeAction, runDebugWerewolfAction } from './debugActions';
import { resolveActionChannel } from '@ai-presenter/shared/utils/channelResolution';
import { serializeWerewolfState } from './runtime';
import { normalizePostgameSpeechDecision } from './postgameRules';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Agent = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Match = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Runtime = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Round = any;

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
  if (actionType === 'seer_check') return runRoleSkillNullSafe(runtime, round, actor, 'seer_check', 'inspectFaction', { actor, alive, agents: runtime.agents, phase: 'night' });
  if (actionType === 'guard_protect') return runRoleSkillNullSafe(runtime, round, actor, 'guard_protect', 'guard', { actor, alive, phase: 'night' });
  if (actionType === 'witch_save') {
    const victim = runtime.agents.find((agent) => Number(agent.id) === Number(round.night.wolfTarget));
    return runRoleSkillNullSafe(runtime, round, actor, 'witch_save', 'save', { actor, victim, round, modeConfig: runtime.modeConfig, phase: 'night' });
  }
  if (actionType === 'witch_poison') return runRoleSkillNullSafe(runtime, round, actor, 'witch_poison', 'poison', { actor, alive, phase: 'night' });
  if (actionType === 'day_speech') return runDaySpeechAction(runtime, round, actor);
  if (actionType === 'day_vote') return runDayVoteAction(actor, alive, runtime);
  if (actionType === 'mvp_vote') return runMvpVoteAction(runtime, round, actor);
  if (actionType === 'postgame_speech') return runPostgameSpeechAction(runtime, round, actor);
  if (actionType === 'sheriff_signup') return runSheriffSignupAction(runtime, round, actor);
  if (actionType === 'sheriff_speech') return runSheriffSpeechAction(runtime, round, actor, false);
  if (actionType === 'sheriff_withdraw') return runSheriffWithdrawAction(runtime, round, actor);
  if (actionType === 'sheriff_vote') return runSheriffVoteAction(runtime, round, actor, taskTargetIds(runtime, round, 'sheriff_vote'));
  if (actionType === 'sheriff_runoff_speech') return runSheriffSpeechAction(runtime, round, actor, true);
  if (actionType === 'sheriff_runoff_vote') return runSheriffVoteAction(runtime, round, actor, taskTargetIds(runtime, round, 'sheriff_runoff_vote'));
  if (actionType === 'sheriff_speech_direction') return runSheriffSpeechDirectionAction(runtime, round, actor);
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
    const round = ensureRound(runtime.state, step.config.day || 1);
    const aliveTargets = runtime.agents
      .filter((agent) => agent.alive && Number(agent.id) !== Number(actor.id))
      .map((agent) => Number(agent.id));
    if (!aliveTargets.length) {
      return {
        eventType: 'werewolf_action_submitted',
        rawOutput: null,
        payload: { actionType: 'hunter_shot', actorId: actor.id, target: null }
      };
    }
    const result = await executeSkillWithTrace(runtime.skillRegistry, 'shootOnDeath', {
      actor,
      agents: runtime.agents,
      promptContext: buildActionPrompt(
        runtime,
        round,
        actor,
        'hunter_shot',
        '你已经出局并触发猎人技能。请选择是否开枪带走一名存活玩家。',
        buildTargetJsonContract(aliveTargets, { reason: 'none', nullable: true }),
        aliveTargets,
        ''
      ),
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

async function runSheriffBadgeAiTask({ match, step, task }: { match: Match; step: Step; task: Task }): Promise<ActionResult> {
  const runtime: Runtime = createRuntime(repo.getMatch(match.id) || match);
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(task.playerId));
  if (!actor) throw Object.assign(new Error(`Sheriff not found: ${task.playerId}`), { severity: 'high' });
  const aliveTargets = runtime.agents
    .filter((agent) => agent.alive && Number(agent.id) !== Number(actor.id))
    .map((agent) => Number(agent.id));
  if (!aliveTargets.length) {
    return sheriffBadgeResult(actor.id, { action: 'tear', target: null, reason: 'no-valid-target' });
  }
  if (isWerewolfDebugMode(runtime)) {
    return sheriffBadgeResult(actor.id, runDebugSheriffBadgeAction(runtime, actor));
  }
  try {
    const round = ensureRound(runtime.state, step.config.day || 1);
    const result = await askJson(actor, buildActionPrompt(
      runtime,
      round,
      actor,
      'sheriff_badge_disposition',
      '你已经死亡。请决定将警徽移交给一名存活玩家，或撕毁警徽。',
      [
        '只返回标准 JSON 对象。',
        `可移交目标：${aliveTargets.join('、')}。`,
        '移交：{"action":"transfer","target":2,"reason":"简短原因"}。',
        '撕毁：{"action":"tear","target":null,"reason":"简短原因"}。',
      ].join('\n'),
      aliveTargets,
    ), { thinking: actor.thinkingEnabled && actor.playerAgent.thinkingEnabled });
    const target = Number(result?.target);
    const validTransfer = result?.action === 'transfer' && aliveTargets.includes(target);
    return sheriffBadgeResult(actor.id, validTransfer
      ? { action: 'transfer', target, reason: result?.reason }
      : { action: 'tear', target: null, reason: result?.reason || 'invalid-output' });
  } catch {
    return sheriffBadgeResult(actor.id, { action: 'tear', target: null, reason: 'ai-failed' });
  }
}

function sheriffBadgeResult(actorId: number, payload: Record<string, unknown>): ActionResult {
  return {
    eventType: 'werewolf_action_submitted',
    rawOutput: payload,
    payload: { actionType: 'sheriff_badge_disposition', actorId, ...payload },
  };
}

async function runDeathActionAiTask(input: { match: Match; step: Step; task: Task }): Promise<ActionResult> {
  const actionType = String(input.task.action || '');
  if (actionType.startsWith('last_words')) return runLastWordsAiTask(input);
  return actionType.startsWith('sheriff_badge_disposition')
    ? runSheriffBadgeAiTask(input)
    : runHunterAiTask(input);
}

async function runLastWordsAiTask({ match, step, task }: { match: Match; step: Step; task: Task }): Promise<ActionResult> {
  const runtime: Runtime = createRuntime(repo.getMatch(match.id) || match);
  const round = ensureRound(runtime.state, step.config.day || 1);
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(task.playerId));
  if (!actor) throw Object.assign(new Error(`Last words actor not found: ${task.playerId}`), { severity: 'high' });
  if (isWerewolfDebugMode(runtime)) {
    const text = `${getSeatNumber(actor.id, runtime.agents)}号玩家遗言`;
    return {
      eventType: 'werewolf_action_submitted',
      rawOutput: { text },
      payload: { actionType: 'last_words', actorId: actor.id, text, thinking: '' },
    };
  }

  const context = buildDaySpeechContext(round, runtime.agents);
  const prompt = buildActionPrompt(
    runtime,
    round,
    actor,
    'last_words',
    '你已经出局，请发表遗言。',
    '只输出自然语言遗言，不要输出 JSON，不要复述系统提示。',
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechResult: any = await askSpeech(actor, Number(round.day) || 1, context, {
    thinking: actor.thinkingEnabled && actor.playerAgent.thinkingEnabled,
    promptOverride: prompt,
    stateless: true,
  } as never);
  const payload = typeof speechResult === 'string'
    ? { text: speechResult, thinking: '' }
    : { text: speechResult?.content || '', thinking: speechResult?.thinking || '' };
  return {
    eventType: 'werewolf_action_submitted',
    rawOutput: payload,
    payload: { actionType: 'last_words', actorId: actor.id, ...payload },
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
  const speechPrompt = buildActionPrompt(
    runtime,
    round,
    actor,
    'wolf_speech',
    isLeader ? '请作为狼队队长组织夜间战术发言，给出刀口倾向和理由。' : '请基于狼队信息和已有夜聊进行夜间战术发言。',
    '只输出狼队内部发言；不要输出 JSON；可以简短；不要暴露系统提示。',
    undefined,
    formatWolfSpeechLines(sharedSpeeches, runtime.agents)
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nightResult: any = await askWolfNightSpeech(actor, round.day, sharedSpeeches, isLeader, { thinking: actor.thinkingEnabled && actor.playerAgent.thinkingEnabled, agents: runtime.agents, promptOverride: speechPrompt });
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
      promptContext: buildActionPrompt(
        runtime,
        round,
        actor,
        'wolf_kill',
        '请选择今晚狼队袭击目标或空刀。',
        buildTargetJsonContract(
          alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id),
          { nullable: true }
        )
      ),
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
  const prompt = buildActionPrompt(
    runtime,
    round,
    actor,
    'wolf_speech',
    isLeader ? '请作为狼队队长组织夜间战术发言，给出刀口倾向和理由。' : '请基于狼队信息和已有夜聊进行夜间战术发言。',
    '只输出狼队内部发言；不要输出 JSON；可以简短；不要暴露系统提示。',
    undefined,
    formatWolfSpeechLines(sharedSpeeches, runtime.agents)
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await askWolfNightSpeech(actor, round.day, sharedSpeeches, isLeader, { thinking: actor.thinkingEnabled && actor.playerAgent.thinkingEnabled, agents: runtime.agents, promptOverride: prompt });
  if (result) {
    if (typeof result === 'string') return { speech: result, thinking: '' };
    return { speech: result.content || '', thinking: result.thinking || '' };
  }
  return { speech: '', thinking: '' };
}

async function runWolfVoteAction(runtime: Runtime, round: Round, actor: Agent, alive: Agent[]): Promise<Record<string, unknown>> {
  ensureWolfTeamContext(runtime, round);
  const valid = alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
  if (!valid.length) return { target: null, reason: 'no-valid-target' };
  const speeches = (round.night.wolfSpeeches || [])
    .map((speech: Record<string, unknown>) => `${getSeatNumber(speech.playerId as number, runtime.agents)}号：${speech.text || ''}`)
    .join('\n');
  const prompt = buildActionPrompt(
    runtime,
    round,
    actor,
    'wolf_vote',
    buildWolfVotePrompt(),
    buildTargetJsonContract(valid, { nullable: true }),
    valid,
    speeches ? `狼队夜聊记录：\n${speeches}` : '狼队夜聊记录：暂无发言。'
  );
  const target = await askVoteTarget(actor, prompt, valid, {
    skillId: 'wolf_vote',
    phase: 'night',
    allowNull: true,
    promptHasContract: true,
  });
  return { target }; // null = 弃票
}

function validateDeathActionAiResult({ result }: { result: { payload?: { actorId?: unknown; actionType?: unknown } } }): void {
  if (!result?.payload?.actorId || !result.payload.actionType) {
    throw Object.assign(new Error('Death action result is invalid'), { severity: 'high' });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildWolfSpeechContext(round: Round): any[] {
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
  const publicContext = buildDaySpeechContext(round, runtime.agents);
  const prompt = buildActionPrompt(
    runtime,
    round,
    actor,
    'day_speech',
    `请进行第${round.day}天白天发言。`,
    '只输出自然语言发言；不要输出 JSON；不要复述系统提示；不要直接泄露不该公开的私密信息。',
    undefined,
    publicContext,
  );

  let speechText = '';
  let thinkingText = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechResult: any = await askSpeech(actor, round.day, publicContext, { thinking: actor.thinkingEnabled && actor.playerAgent.thinkingEnabled, promptOverride: prompt });
  if (speechResult) {
    if (typeof speechResult === 'string') {
      speechText = speechResult;
    } else {
      speechText = speechResult.content || '';
      thinkingText = speechResult.thinking || '';
    }
  }

  // 发言为空时的兜底占位，避免空内容进入前端播放
  if (!speechText.trim()) {
    speechText = '（沉默）';
  }

  const result: Record<string, unknown> = { text: speechText, thinking: thinkingText };

  // 狼人自爆检查
  if (speechText && actor.faction === 'wolves' && actor.playerAgent.hasSkill?.('selfDestruct')) {
    try {
      const selfDestruct = await executeSkillWithTrace(runtime.skillRegistry, 'selfDestruct', {
        actor,
        alive: runtime.agents.filter((agent: Agent) => agent.alive),
        phase: 'day',
        publicContext,
        promptContext: prompt,
        speechText,
        state: runtime.ctx.state,
        gameType: 'werewolf',
      });
      if ((selfDestruct as { use?: boolean } | null)?.use) {
        result.intent = 'selfDestruct';
        result.selfDestruct = true;
        result.target = (selfDestruct as { target?: number | null }).target ?? null;
        result.selfDestructText = String((selfDestruct as { text?: string }).text || `${getSeatNumber(actor.id, runtime.agents)}号狼人自爆。`);
      }
    } catch {
      // 自爆检查失败 → 不自爆
    }
  }

  return result;
}

async function runDayVoteAction(actor: Agent, alive: Agent[], runtime: Runtime): Promise<Record<string, unknown>> {
  const rounds = Array.isArray(runtime.state?.rounds) ? runtime.state.rounds : [];
  const round = rounds[rounds.length - 1] || ensureRound(runtime.state, 1);
  const valid = alive.filter((agent) => agent.canVote !== false).map((agent) => agent.id).filter((id) => Number(id) !== Number(actor.id));
  const prompt = buildActionPrompt(
    runtime,
    round,
    actor,
    'day_vote',
    DAY_VOTE_PROMPT,
    buildTargetJsonContract(valid, { nullable: true }),
    valid
  );
  const target = await askVoteTarget(actor, prompt, valid, {
    skillId: 'day_vote',
    phase: 'day',
    allowNull: true,
    promptHasContract: true,
  });
  return { target }; // null = 弃票
}

async function runMvpVoteAction(runtime: Runtime, round: Round, actor: Agent): Promise<Record<string, unknown>> {
  const valid = runtime.agents
    .map((agent: Agent) => Number(agent.id))
    .filter((id: number) => id > 0 && id !== Number(actor.id));
  if (!valid.length) return { target: null };
  try {
    const prompt = buildActionPrompt(
      runtime,
      round,
      actor,
      'mvp_vote',
      '游戏已经结束，身份已公开。请根据整局推理、发言、投票和技能表现评选本场MVP，不要投给自己。',
      buildTargetJsonContract(valid, { nullable: true }),
      valid,
      buildPostgameContext(runtime),
    );
    const target = await askVoteTarget(actor, prompt, valid, {
      skillId: 'mvp_vote',
      phase: 'postgame',
      allowNull: true,
      promptHasContract: true,
    });
    return { target: valid.includes(Number(target)) ? Number(target) : null };
  } catch {
    return { target: null };
  }
}

async function runPostgameSpeechAction(runtime: Runtime, round: Round, actor: Agent): Promise<Record<string, unknown>> {
  try {
    const prompt = buildActionPrompt(
      runtime,
      round,
      actor,
      'postgame_speech',
      '游戏已经结束，身份已公开。你可以发表简短赛后感言，也可以选择不发言直接跳过。发言时可以复盘关键判断、回应其他玩家或祝贺获胜方。',
      '只返回标准 JSON 对象。发言返回 {"speak":true,"text":"赛后感言"}；跳过返回 {"speak":false,"text":null}。不要输出 Markdown 或额外文本；感言控制在 180 字以内。',
      undefined,
      buildPostgameContext(runtime),
    );
    const result = await askJson(actor, prompt, {
      maxTokens: 420,
      skillId: 'postgame_speech',
      phase: 'postgame',
      promptHasContract: true,
    });
    return normalizePostgameSpeechDecision(result);
  } catch {
    return normalizePostgameSpeechDecision(null);
  }
}

function buildPostgameContext(runtime: Runtime): string {
  const winnerLabel = runtime.state.winner === 'wolves' ? '狼人阵营' : '好人阵营';
  const players = runtime.agents
    .slice()
    .sort((left: Agent, right: Agent) => Number(left.id) - Number(right.id))
    .map((player: Agent) => `${getSeatNumber(player.id, runtime.agents)}号${player.nickname || player.name || '玩家'}：${player.roleLabel || player.role || '未知身份'}，${player.alive ? '存活' : '出局'}`)
    .join('\n');
  return [
    `本局胜方：${winnerLabel}`,
    `胜负原因：${runtime.state.winReason || ''}`,
    `公开身份：\n${players}`,
  ].join('\n');
}

// ============================================================
// 警长行动
// ============================================================

async function runSheriffSignupAction(runtime: Runtime, round: Round, actor: Agent): Promise<Record<string, unknown>> {
  const prompt = buildActionPrompt(
    runtime,
    round,
    actor,
    'sheriff_signup',
    SHERIFF_SIGNUP_PROMPT,
    '只返回 JSON：{"run":true} 或 {"run":false}。'
  );
  const parsed = await askJson(actor, prompt, {
    maxTokens: 40,
    skillId: 'sheriff_signup',
    phase: 'day',
    promptHasContract: true,
  });
  return { run: parsed?.run === true };
}

async function runSheriffSpeechAction(runtime: Runtime, round: Round, actor: Agent, runoff: boolean): Promise<Record<string, unknown>> {
  const prompt = buildActionPrompt(
    runtime,
    round,
    actor,
    runoff ? 'sheriff_runoff_speech' : 'sheriff_speech',
    runoff ? '请进行警长复投发言。' : '请进行警上竞选发言。',
    '只输出自然语言竞选发言；不要输出 JSON。'
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await askSheriffSpeech(actor, round.day, '公开信息已通过上下文同步。', runoff, { thinking: actor.thinkingEnabled && actor.playerAgent.thinkingEnabled, promptOverride: prompt });
  if (result) {
    if (typeof result === 'string') return { text: result || '（沉默）', thinking: '' };
    const text = result.content || '';
    return { text: text || '（沉默）', thinking: result.thinking || '' };
  }
  return { text: '（沉默）', thinking: '' };
}

async function runSheriffWithdrawAction(runtime: Runtime, round: Round, actor: Agent): Promise<Record<string, unknown>> {
  const context = buildDaySpeechContext(round, runtime.agents);
  const prompt = buildActionPrompt(
    runtime,
    round,
    actor,
    'sheriff_withdraw',
    buildSheriffWithdrawPrompt(),
    '只返回标准 JSON 对象：{"withdraw":true} 或 {"withdraw":false}。',
    undefined,
    context
  );
  const parsed = await askJson(actor, prompt, {
    maxTokens: 40,
    skillId: 'sheriff_withdraw',
    phase: 'day',
    promptHasContract: true,
  });
  return { withdraw: parsed?.withdraw === true };
}

async function runSheriffVoteAction(runtime: Runtime, round: Round, actor: Agent, candidateIds: number[]): Promise<Record<string, unknown>> {
  if (!candidateIds.length) return { target: null, reason: 'no-candidates' };
  const prompt = buildActionPrompt(
    runtime,
    round,
    actor,
    'sheriff_vote',
    SHERIFF_VOTE_PROMPT,
    buildTargetJsonContract(candidateIds, { nullable: true }),
    candidateIds,
    ''
  );
  const target = await askVoteTarget(actor, prompt, candidateIds, {
    skillId: 'sheriff_vote',
    phase: 'day',
    allowNull: true,
    promptHasContract: true,
  });
  return { target }; // null = 弃票
}

async function runSheriffSpeechDirectionAction(runtime: Runtime, round: Round, actor: Agent): Promise<Record<string, unknown>> {
  try {
    const prompt = buildActionPrompt(
      runtime,
      round,
      actor,
      'sheriff_speech_direction',
      '你是当前警长。请选择本轮白天发言按顺时针或逆时针进行；你将在最后发言。',
      '只返回标准 JSON：{"direction":"clockwise","reason":"简短原因"} 或 {"direction":"counterclockwise","reason":"简短原因"}。'
    );
    const parsed = await askJson(actor, prompt, {
      maxTokens: 80,
      skillId: 'sheriff_speech_direction',
      phase: 'day',
      promptHasContract: true,
    });
    const direction = parsed?.direction === 'clockwise' || parsed?.direction === 'counterclockwise'
      ? parsed.direction
      : Math.random() < 0.5 ? 'clockwise' : 'counterclockwise';
    return { direction, reason: typeof parsed?.reason === 'string' ? parsed.reason : '' };
  } catch {
    return { direction: Math.random() < 0.5 ? 'clockwise' : 'counterclockwise', reason: 'ai-failed' };
  }
}

// ============================================================
// 辅助函数
// ============================================================

function taskTargetIds(runtime: Runtime, round: Round, actionType: string): number[] {
  const election = round.sheriffElection;
  const key = actionType === 'sheriff_runoff_vote' ? 'runoffCandidateIds' : 'candidates';
  const ids = Array.isArray(election?.[key]) ? election[key] as number[] : [];
  void runtime;
  return ids.map(Number);
}

function buildDaySpeechContext(round: Round, agents?: Agent[]): string {
  const lines: string[] = [];
  const election = round.sheriffElection as Record<string, unknown> | null | undefined;
  const sheriffSpeeches = Array.isArray(election?.speeches) ? election.speeches as Array<Record<string, unknown>> : [];
  const daySpeeches = Array.isArray(round.speeches) ? round.speeches as Array<Record<string, unknown>> : [];
  if (sheriffSpeeches.length) {
    lines.push(`警上发言：\n${sheriffSpeeches.map((speech) => `${getSeatNumber(speech.playerId as number, agents)}号：${speech.text || ''}`).join('\n')}`);
  }
  if (daySpeeches.length) {
    lines.push(`本轮已公开发言：\n${daySpeeches.map((speech) => `${getSeatNumber(speech.playerId as number, agents)}号：${speech.text || ''}`).join('\n')}`);
  }
  return lines.filter(Boolean).join('\n\n') || '暂无公开信息。';
}

/**
 * 执行角色技能，AI 失败时返回 null target（技能不生效）
 */
async function runRoleSkillNullSafe(runtime: Runtime, round: Round, actor: Agent, actionType: string, action: string, context: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const result = await executeSkillWithTrace(runtime.skillRegistry, action, {
      ...context,
      promptContext: buildRoleActionPrompt(runtime, round, actor, actionType, context),
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

function buildRoleActionPrompt(
  runtime: Runtime,
  round: Round,
  actor: Agent,
  actionType: string,
  context: Record<string, unknown>,
): string {
  const alive = Array.isArray(context.alive) ? context.alive as Agent[] : runtime.agents.filter((agent: Agent) => agent.alive);
  if (actionType === 'seer_check') {
    const valid = alive.filter((agent) => Number(agent.id) !== Number(actor.id)).map((agent) => Number(agent.id));
    return buildActionPrompt(
      runtime,
      round,
      actor,
      actionType,
      '请选择一名存活玩家查验阵营，可以简要说明查验原因。',
      buildTargetJsonContract(valid, { reason: 'optional' }),
      valid
    );
  }
  if (actionType === 'guard_protect') {
    const valid = alive
      .map((agent) => Number(agent.id))
      .filter((id) => Number(id) !== Number(actor.lastGuardTarget));
    return buildActionPrompt(
      runtime,
      round,
      actor,
      actionType,
      '请选择今晚守护目标或空守；不能连续两晚守护同一名玩家，可以简要说明原因。',
      buildTargetJsonContract(valid, { reason: 'optional', nullable: true }),
      valid
    );
  }
  if (actionType === 'witch_save') {
    const victim = context.victim as Agent | null | undefined;
    const canSelfSave = Number(round.day) === 1 && runtime.modeConfig?.witch?.canSelfSaveNightOne !== false;
    const selfSaveRule = victim && Number(victim.id) === Number(actor.id)
      ? (canSelfSave ? '本局规则允许首夜自救。' : '本局规则不允许自救。')
      : '';
    return buildActionPrompt(
      runtime,
      round,
      actor,
      actionType,
      ['决定是否使用解药救今晚的狼刀目标。', selfSaveRule].filter(Boolean).join('\n'),
      victim && Number(victim.id) !== Number(actor.id)
        ? '只返回标准 JSON 对象：使用解药返回 {"use":true,"reason":"简短原因"}；不使用返回 {"use":false,"reason":null}。reason 可选。'
        : '只返回标准 JSON 对象：{"use":true,"reason":"简短原因"} 或 {"use":false,"reason":null}。reason 可选。'
    );
  }
  if (actionType === 'witch_poison') {
    const valid = alive.filter((agent) => Number(agent.id) !== Number(actor.id)).map((agent) => Number(agent.id));
    return buildActionPrompt(
      runtime,
      round,
      actor,
      actionType,
      '决定是否使用毒药；使用时可以说明原因。',
      [
        '只返回标准 JSON 对象，不要输出 Markdown、解释或多余文本。',
        `可选目标座位号：${valid.join('、') || '无'}。`,
        '使用毒药：{"use":true,"targetSeat":2,"reason":"简短原因"}。',
        '不使用毒药：{"use":false,"targetSeat":null,"reason":null}。',
      ].join('\n'),
      valid
    );
  }
  return buildActionPrompt(runtime, round, actor, actionType);
}

function buildActionPrompt(
  runtime: Runtime,
  round: Round,
  actor: Agent,
  actionType: string,
  taskInstruction = '',
  outputContract = '',
  validTargetIds?: number[],
  recentContext?: string,
): string {
  return buildWerewolfActionPrompt({
    runtime,
    round,
    actor,
    actionType,
    taskInstruction,
    outputContract,
    validTargetIds,
    recentContext,
  });
}

function askVoteTarget(actor: Agent, prompt: string, valid: number[], options: Record<string, unknown>): Promise<number | null> {
  return actor.playerAgent.askVoteTarget(prompt, valid, options);
}

function askJson(actor: Agent, prompt: string, options: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  return actor.playerAgent.askJson(prompt, options);
}

function formatWolfSpeechLines(speeches: Array<Record<string, unknown>>, agents: Agent[]): string {
  return speeches
    .filter((speech) => Number.isFinite(Number(speech.playerId)))
    .map((speech) => `${getSeatNumber(Number(speech.playerId), agents)}号：${speech.text || ''}`)
    .join('\n');
}

function normalizeActionReason(value: unknown): string | null {
  const reason = String(value || '').trim().slice(0, 80);
  return reason || null;
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
  const eventBus = (runtime as Record<string, unknown>).eventBus as { publish: (e: unknown) => Promise<void> | void } | undefined;
  const gameEventBuilder = (runtime as Record<string, unknown>).gameEventBuilder as {
    setStep: (s: string) => unknown;
    setPhase: (p: string) => unknown;
    setDay: (d: number) => unknown;
    buildActionSubmitted: (actionType: string, actorId: number, opts: Record<string, unknown>) => unknown;
  } | undefined;

  if (!eventBus || !gameEventBuilder) return;
  if (step.config.actionType === 'mvp_vote') return;
  if (step.config.actionType === 'postgame_speech' && payload.speak !== true) return;

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

    const event = step.config.actionType === 'postgame_speech'
      ? (gameEventBuilder as unknown as { buildSpeech: (speech: Record<string, unknown>) => unknown }).buildSpeech({
          playerId: actorId,
          actionType: 'postgame_speech',
          text: String(payload.text || payload.speech || ''),
          thinking: String(payload.thinking || ''),
          phase: 'postgame',
        })
      : gameEventBuilder.buildActionSubmitted(
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

    trackMatchEventPublish(match.id, Promise.resolve(eventBus.publish(event)));
  } catch (error) {
    console.error(`[aiActions] 发布 action-submitted 事件失败:`, (error as Error).message);
  }
}

export {
  runWerewolfAiAction,
  runActionWindowAiTask,
  runHunterAiTask,
  runSheriffBadgeAiTask,
  runDeathActionAiTask,
  validateActionWindowAiResult,
  validateHunterAiResult,
  validateDeathActionAiResult,
};
