import { countTargets, topTarget } from './winCheck';
import {
  hasRoleAction,
  sortBySeat,
  getTopCandidateIds,
  buildWolfStrategySummary
} from './utils';
import { getAliveActorsByAction } from './actionWindows';

interface Agent {
  id: number;
  alive: boolean;
  faction?: string;
  canVote?: boolean;
  usedPoison?: boolean;
  usedAntidote?: boolean;
  lastGuardTarget?: number | null;
  hunterShotUsed?: boolean;
  revealedIdiot?: boolean;
  roleConfig?: { [key: string]: unknown };
  seerChecks?: Array<Record<string, unknown>>;
  votes?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface Night {
  wolfChoices?: Record<string, number>;
  wolfSpeeches?: Array<Record<string, unknown>>;
  wolfVoteTally?: Record<string, number>;
  wolfTarget?: number | null;
  wolfStrategy?: string;
  seerCheck?: { target: number; result: string } | null;
  guardTarget?: number | null;
  witchSave?: boolean;
  witchSaveTarget?: number | null;
  witchPoisonTarget?: number | null;
  deaths?: Array<{ id: number; reason: string }>;
  [key: string]: unknown;
}

interface Round {
  day: number;
  phase?: string;
  night: Night;
  sheriffId?: number | null;
  speeches?: Array<Record<string, unknown>>;
  votes?: Record<string, number>;
  voteTally?: Record<string, number>;
  exile?: { id: number; reason: string } | null;
  idiotReveal?: { id: number; reason: string } | null;
  lastWords?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface State {
  rounds?: Round[];
  [key: string]: unknown;
}

interface Runtime {
  state: State;
  agents: Agent[];
  modeConfig?: { [key: string]: unknown };
  [key: string]: unknown;
}

interface StepConfig {
  day: number;
  actionType: string;
  phase?: string;
  [key: string]: unknown;
}

interface Step {
  config: StepConfig;
  [key: string]: unknown;
}

interface ActionResult {
  actorId: number;
  payload: {
    target?: number | null;
    text?: string;
    speech?: string;
    thinking?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function applyActionResults(runtime: Runtime, step: Step, results: ActionResult[]): void {
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

function applyWolfKill(runtime: Runtime, round: Round, results: ActionResult[]): void {
  round.night.wolfChoices = {};
  round.night.wolfSpeeches = round.night.wolfSpeeches || [];
  for (const result of results) {
    round.night.wolfChoices![result.actorId] = result.payload.target!;
    if (result.payload.speech) {
      (round.night.wolfSpeeches as Array<Record<string, unknown>>).push({
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
  round.night.wolfTarget = topIds[0] || topTarget(round.night.wolfChoices!);
  round.night.wolfStrategy = buildWolfStrategySummary(round.night.wolfChoices, round.night.wolfTarget, runtime.agents);
}

function applySeerCheck(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0]?.payload;
  const seer = runtime.agents.find((agent) => Number(agent.id) === Number(results[0]?.actorId));
  if (!result) return;
  round.night.seerCheck = { target: result.target as number, result: result.result as string };
  if (seer) seer.seerChecks!.push(round.night.seerCheck as Record<string, unknown>);
}

function applyGuardProtect(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0]?.payload;
  const guard = runtime.agents.find((agent) => Number(agent.id) === Number(results[0]?.actorId));
  if (!result?.target) return;
  round.night.guardTarget = result.target as number;
  if (guard) guard.lastGuardTarget = result.target as number;
}

function applyWitchSave(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0]?.payload;
  const witch = runtime.agents.find((agent) => Number(agent.id) === Number(results[0]?.actorId));
  if (!result?.use || !round.night.wolfTarget) return;
  round.night.witchSave = true;
  round.night.witchSaveTarget = round.night.wolfTarget;
  if (witch) witch.usedAntidote = true;
}

function applyWitchPoison(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0]?.payload;
  const witch = runtime.agents.find((agent) => Number(agent.id) === Number(results[0]?.actorId));
  if (!result?.use || !result.target) return;
  round.night.witchPoisonTarget = result.target as number;
  if (witch) witch.usedPoison = true;
}

function applyDaySpeech(round: Round, results: ActionResult[]): void {
  round.speeches = results.map((result) => ({
    playerId: result.actorId,
    text: result.payload.text || '',
    phase: 'day',
    day: round.day,
    thinking: result.payload.thinking || ''
  }));
}

function applyDayVote(runtime: Runtime, round: Round, results: ActionResult[]): void {
  round.votes = {};
  for (const result of results) {
    round.votes![result.actorId] = result.payload.target!;
    const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result.actorId));
    if (actor) actor.votes!.push({ day: round.day, target: result.payload.target });
  }
}

function getActorsForStep(runtime: Runtime, step: Step, round: Round): Agent[] {
  const actionType = step.config.actionType;
  const actors = (action: string): Agent[] => getAliveActorsByAction(runtime, action) as unknown as Agent[];
  if (actionType === 'wolf_kill') return actors('kill');
  if (actionType === 'seer_check') return actors('inspectFaction').slice(0, 1);
  if (actionType === 'guard_protect') return actors('guard').slice(0, 1);
  if (actionType === 'witch_save') return round.night?.wolfTarget ? actors('save').slice(0, 1) : [];
  if (actionType === 'witch_poison') {
    const witch = actors('poison').find((agent) => !agent.usedPoison);
    const modeConfig = runtime.modeConfig as Record<string, unknown> | undefined;
    const witchConfig = modeConfig?.witch as Record<string, unknown> | undefined;
    return witch && !(witchConfig?.onePotionPerNight && round.night?.witchSave) ? [witch] : [];
  }
  if (actionType === 'day_speech') return sortBySeat(runtime.agents.filter((agent) => agent.alive));
  if (actionType === 'day_vote') return sortBySeat(runtime.agents.filter((agent) => agent.alive && agent.canVote));
  return [];
}

function getTargetIds(runtime: Runtime, step: Step): number[] {
  const alive = runtime.agents.filter((agent) => agent.alive);
  if (step.config.actionType === 'wolf_kill') return alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
  return alive.map((agent) => agent.id);
}

function findPendingHunter(agents: Agent[], round: Round, deaths: Array<{ id: number; reason: string }> | null | undefined): Agent | null {
  const deathIds = new Set((deaths || []).map((death) => Number(death.id)));
  return agents.find((agent) =>
    deathIds.has(Number(agent.id)) &&
    hasRoleAction(agent.roleConfig, 'shootOnDeath') &&
    !agent.hunterShotUsed &&
    !agent.alive
  ) || null;
}

function ensureRound(state: State, day: number): Round {
  let round = (state.rounds || []).find((item) => Number(item.day) === Number(day));
  if (!round) {
    round = { day, phase: 'night', night: {}, speeches: [], votes: {}, voteTally: {}, lastWords: [] } as Round;
    state.rounds = [...(state.rounds || []), round];
  }
  return round;
}

export {
  applyActionResults,
  getActorsForStep,
  getTargetIds,
  findPendingHunter
};
