const { hasRoleAction, sortBySeat, rotateFromSeat, getTopCandidateIds, buildWolfStrategySummary } = require('./utils');
const { topTarget, countTargets } = require('./winCheck');
const { askWolfNightSpeech, askWolfNightSpeechWithThinking } = require('./agents');
const { getWerewolfNightPrompt, buildNightPublicMessage, buildDayStartMessage } = require('./announcements');
const { applyNightDeaths } = require('./winCheck');
const { executeSkillWithTrace } = require('../agent-core');

interface Agent {
  id: number;
  alive?: boolean;
  roleConfig?: Record<string, unknown>;
  faction?: string;
  thinkingEnabled?: boolean;
  playerAgent: PlayerAgent;
  usedAntidote?: boolean;
  usedPoison?: boolean;
  lastGuardTarget?: number | null;
  seerChecks?: unknown[];
  [key: string]: unknown;
}

interface PlayerAgent {
  thinkingEnabled?: boolean;
  askVoteTarget: (prompt: string, validIds: number[], fallback: number | undefined) => Promise<number>;
}

interface SkillRegistry {
  [key: string]: unknown;
}

interface ModeConfig {
  witch?: {
    onePotionPerNight?: boolean;
  };
  [key: string]: unknown;
}

interface NightState {
  wolfLeaderId?: number | null;
  wolfSpeechOrder?: number[];
  wolfSpeeches: unknown[];
  wolfChoices?: Record<string, number>;
  wolfVoteTally?: Record<string, number>;
  wolfTieBreak?: Record<string, unknown> | null;
  wolfTarget?: number | null;
  wolfStrategy?: string;
  seerCheck?: unknown;
  guardTarget?: number | null;
  witchSave?: boolean;
  witchSaveTarget?: number | null;
  witchPoisonTarget?: number | null;
  deaths?: Array<{ id: number; reason: string }>;
}

interface Round {
  day: number;
  phase?: string;
  night: NightState;
  nightRevealed?: boolean;
  publicSummary?: string;
  [key: string]: unknown;
}

interface GameContext {
  agents: Agent[];
  modeConfig: ModeConfig;
  skillRegistry: SkillRegistry;
  state: Record<string, unknown>;
  gameType?: string;
  fallbackAudit?: unknown;
  emit: (event: Record<string, unknown>) => Promise<void>;
  serialize: () => Record<string, unknown>;
}

async function runNight(ctx: GameContext, round: Round): Promise<void> {
  const { agents, emit, serialize } = ctx;
  round.phase = 'night';
  await emit({ type: 'phase-start', phase: 'night', round, message: '天黑请闭眼', game: serialize() });

  const alive = agents.filter((agent) => agent.alive);
  await emitNightPrompt(ctx, 'wolf-wake', round);
  await resolveWolfKill(ctx, round, alive);
  await emitNightAction(ctx, 'wolf-vote', round);
  if (hasConfiguredRoleAction(ctx, 'inspectFaction')) {
    await emitNightPrompt(ctx, 'seer-wake', round);
    await resolveInspect(ctx, round, alive);
    await emitNightAction(ctx, 'seer-check', round, { seerCheck: round.night.seerCheck });
  }
  if (hasConfiguredRoleAction(ctx, 'guard')) {
    await emitNightPrompt(ctx, 'guard-wake', round);
    await resolveGuard(ctx, round, alive);
    await emitNightAction(ctx, 'guard-action', round);
  }
  let witchUsedAntidote = false;
  if (hasConfiguredRoleAction(ctx, 'save')) {
    await emitNightPrompt(ctx, 'witch-antidote', round);
    witchUsedAntidote = await resolveWitchAntidote(ctx, round);
    await emitNightAction(ctx, 'witch-action', round);
  }
  if (hasConfiguredRoleAction(ctx, 'poison')) {
    await emitNightPrompt(ctx, 'witch-poison', round);
    await resolveWitchPoison(ctx, round, witchUsedAntidote);
    await emitNightAction(ctx, 'witch-action', round);
  }
  await resolveNightDeaths(ctx, round);
}

async function emitNightPrompt(ctx: GameContext, type: string, round: Round): Promise<void> {
  await ctx.emit({ type, round, message: getWerewolfNightPrompt(type), game: ctx.serialize() });
}

async function emitNightAction(ctx: GameContext, type: string, round: Round, patch: Record<string, unknown> = {}): Promise<void> {
  await ctx.emit({ type, round, game: ctx.serialize(), ...patch });
}

function hasConfiguredRoleAction(ctx: GameContext, action: string): boolean {
  return ctx.agents.some((agent) => hasRoleAction(agent.roleConfig, action));
}

async function resolveWolfKill(ctx: GameContext, round: Round, alive: Agent[]): Promise<void> {
  const wolves: Agent[] = sortBySeat(alive.filter((agent) => hasRoleAction(agent.roleConfig, 'kill')));
  const wolfTargets = alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
  const wolfFallback = wolfTargets[0] || alive.find((agent) => agent.faction !== 'wolves')?.id || alive[0]?.id;
  const leader = wolves.length ? wolves[Math.floor(Math.random() * wolves.length)] : null;
  const speechOrder = leader ? rotateFromSeat(wolves, leader.id, 'clockwise') : wolves;
  round.night.wolfLeaderId = leader?.id || null;
  round.night.wolfSpeechOrder = speechOrder.map((wolf: Agent) => wolf.id);
  round.night.wolfSpeeches = [];
  if (leader) {
    await ctx.emit({
      type: 'wolf-leader', round,
      game: ctx.serialize()
    });
  }

  for (const wolf of speechOrder) {
    const isLeader = Number(wolf.id) === Number(leader?.id);
    if (wolf.thinkingEnabled && wolf.playerAgent.thinkingEnabled) {
      const { content, thinking } = await askWolfNightSpeechWithThinking(wolf, round.day, round.night.wolfSpeeches, isLeader);
      if (!String(content || '').trim()) continue;
      if (thinking) await ctx.emit({ type: 'thinking', playerId: wolf.id, thinking });
      const speech = { playerId: wolf.id, text: content, phase: 'night-wolf', day: round.day, kind: isLeader ? 'deployment' : 'chat', thinking };
      round.night.wolfSpeeches.push(speech);
      await ctx.emit({ type: 'wolf-speech', round, speech, game: ctx.serialize() });
    } else {
      const text = await askWolfNightSpeech(wolf, round.day, round.night.wolfSpeeches, isLeader);
      if (!String(text || '').trim()) continue;
      const speech = { playerId: wolf.id, text, phase: 'night-wolf', day: round.day, kind: isLeader ? 'deployment' : 'chat' };
      round.night.wolfSpeeches.push(speech);
      await ctx.emit({ type: 'wolf-speech', round, speech, game: ctx.serialize() });
    }
  }

  const wolfChoices: Record<string, number> = {};
  for (const wolf of wolves) {
    const result = await runRoleSkill(ctx, 'kill', { actor: wolf, alive, fallback: wolfFallback, topTarget, phase: 'night' });
    wolfChoices[wolf.id] = result.target as number;
  }
  round.night.wolfChoices = wolfChoices;
  round.night.wolfVoteTally = countTargets(wolfChoices);
  const topIds = getTopCandidateIds(round.night.wolfVoteTally);
  const tieBreak = topIds.length > 1 && leader
    ? await leader.playerAgent.askVoteTarget('狼刀出现平票。你是本夜狼队领袖，请从平票刀口中裁定最终目标。', topIds, topIds[0])
    : null;
  round.night.wolfTieBreak = topIds.length > 1 ? {
    by: tieBreak ? 'leader' : 'fallback', leaderId: leader?.id || null,
    candidateIds: topIds, target: tieBreak || topIds[0] || wolfFallback
  } : null;
  round.night.wolfTarget = tieBreak || topIds[0] || topTarget(wolfChoices) || wolfFallback;
  round.night.wolfStrategy = buildWolfStrategySummary(wolfChoices, round.night.wolfTarget, ctx.agents);
}

async function resolveInspect(ctx: GameContext, round: Round, alive: Agent[]): Promise<void> {
  const seer = alive.find((agent) => hasRoleAction(agent.roleConfig, 'inspectFaction'));
  if (!seer) return;
  const check = await runRoleSkill(ctx, 'inspectFaction', { actor: seer, alive, agents: ctx.agents, phase: 'night' });
  seer.seerChecks!.push(check);
  round.night.seerCheck = check;
}

async function resolveGuard(ctx: GameContext, round: Round, alive: Agent[]): Promise<void> {
  const guard = alive.find((agent) => hasRoleAction(agent.roleConfig, 'guard'));
  if (!guard) return;
  const result = await runRoleSkill(ctx, 'guard', { actor: guard, alive, phase: 'night' });
  guard.lastGuardTarget = result.target as number;
  round.night.guardTarget = result.target as number;
}

async function resolveWitchAntidote(ctx: GameContext, round: Round): Promise<boolean> {
  const alive = ctx.agents.filter((agent) => agent.alive);
  const witch = alive.find((agent) => hasRoleAction(agent.roleConfig, 'save') || hasRoleAction(agent.roleConfig, 'poison'));
  if (!witch) return false;
  const victim = ctx.agents.find((agent) => agent.id === round.night.wolfTarget);
  const save = await runRoleSkill(ctx, 'save', { actor: witch, victim, round, modeConfig: ctx.modeConfig, phase: 'night' });
  if (save.use) {
    witch.usedAntidote = true;
    round.night.witchSave = true;
    round.night.witchSaveTarget = victim!.id;
    return true;
  }
  return false;
}

async function resolveWitchPoison(ctx: GameContext, round: Round, usedAntidote: boolean): Promise<void> {
  const alive = ctx.agents.filter((agent) => agent.alive);
  const witch = alive.find((agent) => hasRoleAction(agent.roleConfig, 'save') || hasRoleAction(agent.roleConfig, 'poison'));
  if (!witch) return;
  if (!witch.usedPoison && !(ctx.modeConfig.witch?.onePotionPerNight && usedAntidote)) {
    const poison = await runRoleSkill(ctx, 'poison', { actor: witch, alive, phase: 'night' });
    if (poison.use && poison.target) {
      witch.usedPoison = true;
      round.night.witchPoisonTarget = poison.target as number;
    }
  }
}

async function resolveNightDeaths(ctx: GameContext, round: Round): Promise<void> {
  const deaths: Array<{ id: number; reason: string }> = [];
  const wolfTarget = ctx.agents.find((agent) => agent.id === round.night.wolfTarget);
  const guarded = round.night.guardTarget === round.night.wolfTarget;
  const saved = round.night.witchSave;
  if (wolfTarget && !guarded && !saved) deaths.push({ id: wolfTarget.id, reason: '狼人袭击' });
  const poisoned = ctx.agents.find((agent) => agent.id === round.night.witchPoisonTarget);
  if (poisoned && !deaths.some((item) => item.id === poisoned.id)) deaths.push({ id: poisoned.id, reason: '女巫毒药' });
  round.night.deaths = deaths;
}

async function announceDaybreak(ctx: GameContext, round: Round): Promise<void> {
  round.phase = 'day';
  await ctx.emit({ type: 'day-start', round, message: buildDayStartMessage(), game: ctx.serialize() });
}

async function revealNightResult(ctx: GameContext, round: Round): Promise<void> {
  applyNightDeaths(ctx.agents, round);
  round.nightRevealed = true;
  const nightPublicMessage = buildNightPublicMessage(round);
  round.publicSummary = nightPublicMessage;
  await ctx.emit({ type: 'night-result', round, message: nightPublicMessage, game: ctx.serialize() });
}

function runRoleSkill(ctx: GameContext, action: string, context: Record<string, unknown>): Promise<Record<string, unknown>> {
  return executeSkillWithTrace(ctx.skillRegistry, action, {
    ...context,
    state: ctx.state,
    gameType: ctx.gameType || 'werewolf',
    fallbackAudit: ctx.fallbackAudit
  });
}

export {
  runNight, resolveWolfKill, resolveInspect, resolveGuard,
  resolveWitchAntidote, resolveWitchPoison, resolveNightDeaths,
  announceDaybreak, revealNightResult, hasConfiguredRoleAction
};
