const { countTargets, topTarget } = require('./winCheck');
const {
  hasRoleAction,
  sortBySeat,
  getTopCandidateIds,
  buildWolfStrategySummary
} = require('./utils');
const { getAliveActorsByAction } = require('./actionWindows');

function applyActionResults(runtime, step, results) {
  const round = ensureRound(runtime.state, step.config.day);
  const actionType = step.config.actionType;
  if (actionType === 'wolf_kill') applyWolfKill(runtime, round, results);
  if (actionType === 'seer_check') applySeerCheck(runtime, round, results);
  if (actionType === 'guard_protect') applyGuardProtect(runtime, round, results);
  if (actionType === 'witch_save') applyWitchSave(runtime, round, results);
  if (actionType === 'witch_poison') applyWitchPoison(runtime, round, results);
  if (actionType === 'day_speech') applyDaySpeech(round, results);
  if (actionType === 'day_vote') applyDayVote(runtime, round, results);
}

function applyWolfKill(runtime, round, results) {
  round.night.wolfChoices = {};
  round.night.wolfSpeeches = round.night.wolfSpeeches || [];
  for (const result of results) {
    round.night.wolfChoices[result.actorId] = result.payload.target;
    if (result.payload.speech) {
      round.night.wolfSpeeches.push({
        playerId: result.actorId,
        text: result.payload.speech,
        phase: 'night-wolf',
        day: round.day,
        thinking: result.payload.thinking || ''
      });
    }
  }
  round.night.wolfVoteTally = countTargets(round.night.wolfChoices);
  const topIds = getTopCandidateIds(round.night.wolfVoteTally);
  round.night.wolfTarget = topIds[0] || topTarget(round.night.wolfChoices);
  round.night.wolfStrategy = buildWolfStrategySummary(round.night.wolfChoices, round.night.wolfTarget, runtime.agents);
}

function applySeerCheck(runtime, round, results) {
  const result = results[0]?.payload;
  const seer = runtime.agents.find((agent) => Number(agent.id) === Number(results[0]?.actorId));
  if (!result) return;
  round.night.seerCheck = { target: result.target, result: result.result };
  if (seer) seer.seerChecks.push(round.night.seerCheck);
}

function applyGuardProtect(runtime, round, results) {
  const result = results[0]?.payload;
  const guard = runtime.agents.find((agent) => Number(agent.id) === Number(results[0]?.actorId));
  if (!result?.target) return;
  round.night.guardTarget = result.target;
  if (guard) guard.lastGuardTarget = result.target;
}

function applyWitchSave(runtime, round, results) {
  const result = results[0]?.payload;
  const witch = runtime.agents.find((agent) => Number(agent.id) === Number(results[0]?.actorId));
  if (!result?.use || !round.night.wolfTarget) return;
  round.night.witchSave = true;
  round.night.witchSaveTarget = round.night.wolfTarget;
  if (witch) witch.usedAntidote = true;
}

function applyWitchPoison(runtime, round, results) {
  const result = results[0]?.payload;
  const witch = runtime.agents.find((agent) => Number(agent.id) === Number(results[0]?.actorId));
  if (!result?.use || !result.target) return;
  round.night.witchPoisonTarget = result.target;
  if (witch) witch.usedPoison = true;
}

function applyDaySpeech(round, results) {
  round.speeches = results.map((result) => ({
    playerId: result.actorId,
    text: result.payload.text || '',
    phase: 'day',
    day: round.day,
    thinking: result.payload.thinking || ''
  }));
}

function applyDayVote(runtime, round, results) {
  round.votes = {};
  for (const result of results) {
    round.votes[result.actorId] = result.payload.target;
    const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result.actorId));
    if (actor) actor.votes.push({ day: round.day, target: result.payload.target });
  }
}

function getActorsForStep(runtime, step, round) {
  const actionType = step.config.actionType;
  if (actionType === 'wolf_kill') return getAliveActorsByAction(runtime, 'kill');
  if (actionType === 'seer_check') return getAliveActorsByAction(runtime, 'inspectFaction').slice(0, 1);
  if (actionType === 'guard_protect') return getAliveActorsByAction(runtime, 'guard').slice(0, 1);
  if (actionType === 'witch_save') return round.night?.wolfTarget ? getAliveActorsByAction(runtime, 'save').slice(0, 1) : [];
  if (actionType === 'witch_poison') {
    const witch = getAliveActorsByAction(runtime, 'poison').find((agent) => !agent.usedPoison);
    return witch && !(runtime.modeConfig.witch?.onePotionPerNight && round.night?.witchSave) ? [witch] : [];
  }
  if (actionType === 'day_speech') return sortBySeat(runtime.agents.filter((agent) => agent.alive));
  if (actionType === 'day_vote') return sortBySeat(runtime.agents.filter((agent) => agent.alive && agent.canVote));
  return [];
}

function getTargetIds(runtime, step) {
  const alive = runtime.agents.filter((agent) => agent.alive);
  if (step.config.actionType === 'wolf_kill') return alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
  return alive.map((agent) => agent.id);
}

function findPendingHunter(agents, round, deaths) {
  const deathIds = new Set((deaths || []).map((death) => Number(death.id)));
  return agents.find((agent) =>
    deathIds.has(Number(agent.id)) &&
    hasRoleAction(agent.roleConfig, 'shootOnDeath') &&
    !agent.hunterShotUsed &&
    !agent.alive
  ) || null;
}

function ensureRound(state, day) {
  let round = (state.rounds || []).find((item) => Number(item.day) === Number(day));
  if (!round) {
    round = { day, phase: 'night', night: {}, speeches: [], votes: {}, voteTally: {}, lastWords: [] };
    state.rounds = [...(state.rounds || []), round];
  }
  return round;
}

module.exports = {
  applyActionResults,
  getActorsForStep,
  getTargetIds,
  findPendingHunter
};
