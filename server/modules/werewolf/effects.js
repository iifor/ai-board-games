const { WEREWOLF_EFFECT_TYPES } = require('../../../shared/types/workflowTypes');
const { eliminate, countTargets, topExile } = require('./winCheck');
const { hasRoleAction } = require('./utils');

function resolveNightEffects(agents, round) {
  const effects = [];
  const night = round.night || {};
  if (night.wolfTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.KILL, target: night.wolfTarget, reason: 'wolf_kill' });
  if (night.guardTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.PROTECT, target: night.guardTarget });
  if (night.witchSave && night.witchSaveTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.SAVE, target: night.witchSaveTarget });
  if (night.witchPoisonTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.POISON, target: night.witchPoisonTarget, reason: 'witch_poison' });

  const protectedTarget = night.guardTarget;
  const savedTarget = night.witchSave ? night.witchSaveTarget : null;
  const deaths = [];
  if (night.wolfTarget && Number(night.wolfTarget) !== Number(protectedTarget) && Number(night.wolfTarget) !== Number(savedTarget)) {
    deaths.push({ id: night.wolfTarget, reason: 'wolf_kill' });
  }
  if (night.witchPoisonTarget && !deaths.some((death) => Number(death.id) === Number(night.witchPoisonTarget))) {
    deaths.push({ id: night.witchPoisonTarget, reason: 'witch_poison' });
  }
  night.deaths = deaths;
  for (const death of deaths) eliminate(agents, death.id, round.day, death.reason);
  round.nightRevealed = true;
  round.publicSummary = deaths.length
    ? `Night ${round.day} deaths: ${deaths.map((death) => death.id).join(', ')}`
    : `Night ${round.day} ended with no deaths.`;
  return { effects, deaths };
}

function resolveExileEffects(agents, round, modeConfig = {}) {
  const votes = round.votes || {};
  round.voteTally = countTargets(votes, round.sheriffId, modeConfig.sheriff?.voteWeight);
  const exileId = topExile(round.voteTally);
  const effects = [];
  if (!exileId) return { effects, exile: null };

  const target = agents.find((agent) => Number(agent.id) === Number(exileId));
  if (hasRoleAction(target?.roleConfig, 'surviveExileOnce') && !target.revealedIdiot && modeConfig.idiot?.surviveExileOnce !== false) {
    target.revealedIdiot = true;
    if (modeConfig.idiot?.losesVoteAfterReveal !== false) target.canVote = false;
    round.idiotReveal = { id: exileId, reason: 'idiot_survive' };
    effects.push({ type: WEREWOLF_EFFECT_TYPES.IDIOT_SURVIVE, target: exileId });
    return { effects, exile: null };
  }

  eliminate(agents, exileId, round.day, 'exile');
  round.exile = { id: exileId, reason: 'exile' };
  effects.push({ type: WEREWOLF_EFFECT_TYPES.EXILE, target: exileId, reason: 'exile' });
  return { effects, exile: round.exile };
}

function applyHunterShot(agents, round, shot) {
  if (!shot?.from || !shot?.target) return null;
  const hunter = agents.find((agent) => Number(agent.id) === Number(shot.from));
  if (!hunter || hunter.hunterShotUsed || !hasRoleAction(hunter.roleConfig, 'shootOnDeath')) return null;
  hunter.hunterShotUsed = true;
  eliminate(agents, shot.target, round.day, 'hunter_shot');
  round.hunterShot = { from: shot.from, target: shot.target, reason: shot.reason || 'death' };
  return { type: WEREWOLF_EFFECT_TYPES.HUNTER_SHOT, source: shot.from, target: shot.target };
}

module.exports = {
  resolveNightEffects,
  resolveExileEffects,
  applyHunterShot
};
