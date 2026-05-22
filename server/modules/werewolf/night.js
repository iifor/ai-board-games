const { hasRoleAction, getRoleLabel, sortBySeat, rotateFromSeat, getTopCandidateIds, buildWolfStrategySummary } = require('./utils');
const { topTarget, countTargets } = require('./winCheck');
const { askWolfNightSpeech } = require('./agents');
const { getWerewolfNightPrompt, buildNightPublicMessage, buildDayStartMessage } = require('./announcements');
const { applyNightDeaths } = require('./winCheck');

async function runNight(ctx, round) {
  const { skillRegistry, agents, modeConfig, emit, serialize } = ctx;
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

async function emitNightPrompt(ctx, type, round) {
  await ctx.emit({ type, round, message: getWerewolfNightPrompt(type), game: ctx.serialize() });
}

async function emitNightAction(ctx, type, round, patch = {}) {
  await ctx.emit({ type, round, game: ctx.serialize(), ...patch });
}

function hasConfiguredRoleAction(ctx, action) {
  return ctx.agents.some((agent) => hasRoleAction(agent.roleConfig, action));
}

async function resolveWolfKill(ctx, round, alive) {
  const wolves = sortBySeat(alive.filter((agent) => hasRoleAction(agent.roleConfig, 'kill')));
  const wolfTargets = alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
  const wolfFallback = wolfTargets[0] || alive.find((agent) => agent.faction !== 'wolves')?.id || alive[0]?.id;
  const leader = wolves.length ? wolves[Math.floor(Math.random() * wolves.length)] : null;
  const speechOrder = leader ? rotateFromSeat(wolves, leader.id, 'clockwise') : wolves;
  round.night.wolfLeaderId = leader?.id || null;
  round.night.wolfSpeechOrder = speechOrder.map((wolf) => wolf.id);
  round.night.wolfSpeeches = [];
  if (leader) {
    await ctx.emit({
      type: 'wolf-leader', round,
      message: `主持人指定 ${leader.id} 号狼人担任本夜狼队领袖`,
      game: ctx.serialize()
    });
  }

  for (const wolf of speechOrder) {
    const isLeader = Number(wolf.id) === Number(leader?.id);
    const text = await askWolfNightSpeech(wolf, round.day, round.night.wolfSpeeches, isLeader);
    const speech = { playerId: wolf.id, text, phase: 'night-wolf', day: round.day, kind: isLeader ? 'deployment' : 'chat' };
    round.night.wolfSpeeches.push(speech);
    await ctx.emit({ type: 'wolf-speech', round, speech, game: ctx.serialize() });
  }

  const wolfChoices = {};
  for (const wolf of wolves) {
    const result = await ctx.skillRegistry.execute('kill', { actor: wolf, alive, fallback: wolfFallback, topTarget });
    wolfChoices[wolf.id] = result.target;
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

async function resolveInspect(ctx, round, alive) {
  const seer = alive.find((agent) => hasRoleAction(agent.roleConfig, 'inspectFaction'));
  if (!seer) return;
  const check = await ctx.skillRegistry.execute('inspectFaction', { actor: seer, alive, agents: ctx.agents });
  seer.seerChecks.push(check);
  round.night.seerCheck = check;
}

async function resolveGuard(ctx, round, alive) {
  const guard = alive.find((agent) => hasRoleAction(agent.roleConfig, 'guard'));
  if (!guard) return;
  const result = await ctx.skillRegistry.execute('guard', { actor: guard, alive });
  guard.lastGuardTarget = result.target;
  round.night.guardTarget = result.target;
}

async function resolveWitchAntidote(ctx, round) {
  const alive = ctx.agents.filter((agent) => agent.alive);
  const witch = alive.find((agent) => hasRoleAction(agent.roleConfig, 'save') || hasRoleAction(agent.roleConfig, 'poison'));
  if (!witch) return false;
  const victim = ctx.agents.find((agent) => agent.id === round.night.wolfTarget);
  const save = await ctx.skillRegistry.execute('save', { actor: witch, victim, round, modeConfig: ctx.modeConfig });
  if (save.use) {
    witch.usedAntidote = true;
    round.night.witchSave = true;
    round.night.witchSaveTarget = victim.id;
    return true;
  }
  return false;
}

async function resolveWitchPoison(ctx, round, usedAntidote) {
  const alive = ctx.agents.filter((agent) => agent.alive);
  const witch = alive.find((agent) => hasRoleAction(agent.roleConfig, 'save') || hasRoleAction(agent.roleConfig, 'poison'));
  if (!witch) return;
  if (!witch.usedPoison && !(ctx.modeConfig.witch.onePotionPerNight && usedAntidote)) {
    const poison = await ctx.skillRegistry.execute('poison', { actor: witch, alive });
    if (poison.use && poison.target) {
      witch.usedPoison = true;
      round.night.witchPoisonTarget = poison.target;
    }
  }
}

async function resolveNightDeaths(ctx, round) {
  const deaths = [];
  const wolfTarget = ctx.agents.find((agent) => agent.id === round.night.wolfTarget);
  const guarded = round.night.guardTarget === round.night.wolfTarget;
  const saved = round.night.witchSave;
  if (wolfTarget && !guarded && !saved) deaths.push({ id: wolfTarget.id, reason: '狼人袭击' });
  const poisoned = ctx.agents.find((agent) => agent.id === round.night.witchPoisonTarget);
  if (poisoned && !deaths.some((item) => item.id === poisoned.id)) deaths.push({ id: poisoned.id, reason: '女巫毒药' });
  round.night.deaths = deaths;
}

async function announceDaybreak(ctx, round) {
  round.phase = 'day';
  await ctx.emit({ type: 'day-start', round, message: buildDayStartMessage(), game: ctx.serialize() });
}

async function revealNightResult(ctx, round) {
  applyNightDeaths(ctx.agents, round);
  round.nightRevealed = true;
  const nightPublicMessage = buildNightPublicMessage(round);
  round.publicSummary = nightPublicMessage;
  await ctx.emit({ type: 'night-result', round, message: nightPublicMessage, game: ctx.serialize() });
}

module.exports = {
  runNight, resolveWolfKill, resolveInspect, resolveGuard,
  resolveWitchAntidote, resolveWitchPoison, resolveNightDeaths,
  announceDaybreak, revealNightResult, hasConfiguredRoleAction
};
