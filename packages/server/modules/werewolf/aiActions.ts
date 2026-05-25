const repo = require('../workflow-engine/repository');
const { executeSkillWithTrace } = require('../agent-core');
const { createRuntime, ensureRound } = require('./runtime');
const {
  askSpeech,
  askSpeechWithThinking,
  askWolfNightSpeech,
  askWolfNightSpeechWithThinking
} = require('./agents');
const { topTarget } = require('./winCheck');
const {
  rotateFromSeat,
  fallbackSpeech,
  fallbackVote
} = require('./utils');
const { getAliveActorsByAction } = require('./actionWindows');

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
  if (actionType === 'seer_check') return runRoleSkill(runtime, 'inspectFaction', { actor, alive, agents: runtime.agents, phase: 'night' });
  if (actionType === 'guard_protect') return runRoleSkill(runtime, 'guard', { actor, alive, phase: 'night' });
  if (actionType === 'witch_save') {
    const victim = runtime.agents.find((agent) => Number(agent.id) === Number(round.night.wolfTarget));
    return runRoleSkill(runtime, 'save', { actor, victim, round, modeConfig: runtime.modeConfig, phase: 'night' });
  }
  if (actionType === 'witch_poison') return runRoleSkill(runtime, 'poison', { actor, alive, phase: 'night' });
  if (actionType === 'day_speech') return runDaySpeechAction(runtime, round, actor);
  if (actionType === 'day_vote') return runDayVoteAction(runtime, actor, alive);
  throw Object.assign(new Error(`Unsupported werewolf action: ${actionType}`), { severity: 'high' });
}

async function runActionWindowAiTask({ match, step, task }: { match: Match; step: Step; task: Task }): Promise<ActionResult> {
  const runtime: Runtime = createRuntime(repo.getMatch(match.id) || match);
  const round: Round = ensureRound(runtime.state, step.config.day);
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(task.playerId));
  if (!actor) throw Object.assign(new Error(`Actor not found: ${task.playerId}`), { severity: 'high' });
  const payload = await runWerewolfAiAction(runtime, round, actor, step.config.actionType!);
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
  const wolves = getAliveActorsByAction(runtime, 'kill');
  const leader = wolves[0] || actor;
  const speechOrder = rotateFromSeat(wolves, leader.id, 'clockwise');
  round.night.wolfLeaderId = leader.id;
  round.night.wolfSpeechOrder = speechOrder.map((wolf: Agent) => wolf.id);
  const isLeader = Number(actor.id) === Number(leader.id);
  const text = actor.thinkingEnabled && actor.playerAgent.thinkingEnabled
    ? await askWolfNightSpeechWithThinking(actor, round.day, round.night.wolfSpeeches || [], isLeader)
    : { content: await askWolfNightSpeech(actor, round.day, round.night.wolfSpeeches || [], isLeader) };
  const result = await runRoleSkill(runtime, 'kill', {
    actor,
    alive,
    fallback: alive.find((agent) => agent.faction !== 'wolves')?.id || alive[0]?.id,
    topTarget,
    phase: 'night'
  });
  return { target: result.target, speech: text.content || text, thinking: text.thinking || '' };
}

async function runDaySpeechAction(runtime: Runtime, round: Round, actor: Agent): Promise<Record<string, unknown>> {
  const text = actor.thinkingEnabled && actor.playerAgent.thinkingEnabled
    ? await askSpeechWithThinking(actor, round.day, round.publicSummary || '', fallbackSpeech(actor, round.day))
    : { content: await askSpeech(actor, round.day, round.publicSummary || '', fallbackSpeech(actor, round.day)) };
  return { text: text.content || text, thinking: text.thinking || '' };
}

async function runDayVoteAction(runtime: Runtime, actor: Agent, alive: Agent[]): Promise<Record<string, unknown>> {
  const valid = alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(actor.id));
  const target = await actor.playerAgent.askVoteTarget('Day vote: choose one player to exile.', valid, fallbackVote(actor, runtime.agents));
  return { target };
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
