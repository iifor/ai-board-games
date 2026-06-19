import { countTargets, topTarget, eliminate } from './winCheck';
import {
  hasRoleAction,
  sortBySeat,
  getTopCandidateIds,
  buildWolfStrategySummary,
  getSheriffSpeechOrder,
  getNextAliveId,
  rotateFromSeat,
  getSeatNumber
} from './utils';
import { getAliveActorsByAction } from './actionWindows';
import {
  applySheriffActionResults,
  getSheriffActorsForAction,
  getSheriffTargetIds,
  resolveActiveSheriffId
} from './sheriffWorkflow';
import { ensureWolfTeamContext } from './wolfTeam';
import { resolvePostgameSpeechOrder } from './postgameRules';

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
  wolfIds?: number[];
  wolfChoices?: Record<string, number>;
  wolfSpeeches?: Array<Record<string, unknown>>;
  wolfVoteTally?: Record<string, number>;
  wolfTarget?: number | null;
  wolfStrategy?: string;
  wolfSharedInfo?: string;
  wolfLeaderId?: number | null;
  wolfSpeechOrder?: number[];
  seerCheck?: { target: number; result: string; reason?: string | null } | null;
  guardTarget?: number | null;
  guardReason?: string | null;
  witchSave?: boolean;
  witchSaveTarget?: number | null;
  witchSaveReason?: string | null;
  witchPoisonTarget?: number | null;
  witchPoisonReason?: string | null;
  deaths?: Array<{ id: number; reason: string }>;
  [key: string]: unknown;
}

interface Round {
  day: number;
  phase?: string;
  night: Night;
  sheriffId?: number | null;
  sheriffElection?: Record<string, unknown> | null;
  sheriffBadge?: { status: string };
  speeches?: Array<Record<string, unknown>>;
  votes?: Record<string, number | null>;
  voteTally?: Record<string, number>;
  exile?: { id: number; reason: string } | null;
  idiotReveal?: { id: number; reason: string } | null;
  lastWords?: Array<Record<string, unknown>>;
  selfDestruct?: { playerId: number; text: string; day: number; targetId?: number | null } | null;
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

type WitchActionType = 'witch_save' | 'witch_poison';
type WitchActionSkipReason =
  | 'witch_unavailable'
  | 'antidote_depleted'
  | 'poison_depleted'
  | 'no_wolf_target'
  | 'one_potion_per_night';

interface WitchActionEligibility {
  actor: Agent | null;
  skipReason: WitchActionSkipReason | null;
}

function applyActionResults(runtime: Runtime, step: Step, results: ActionResult[]): void {
  const round = ensureRound(runtime.state, step.config.day);
  const actionType = step.config.actionType;
  if (actionType === 'wolf_kill') applyWolfKill(runtime, round, results);
  if (actionType === 'wolf_speech') applyWolfSpeech(runtime, round, results);
  if (actionType === 'wolf_vote') applyWolfVote(runtime, round, results);
  if (actionType === 'seer_check') applySeerCheck(runtime, round, results);
  if (actionType === 'guard_protect') applyGuardProtect(runtime, round, results);
  if (actionType === 'witch_save') applyWitchSave(runtime, round, results);
  if (actionType === 'witch_poison') applyWitchPoison(runtime, round, results);
  if (actionType === 'day_speech') applyDaySpeech(round, results, runtime.agents);
  if (actionType === 'day_vote') applyDayVote(runtime, round, results);
  if (actionType === 'mvp_vote') applyMvpVotes(runtime, results);
  if (actionType === 'postgame_speech') applyPostgameSpeeches(runtime, results);
  if (actionType?.startsWith('sheriff_')) applySheriffActionResults(runtime, round, actionType, results);
}

function applyMvpVotes(runtime: Runtime, results: ActionResult[]): void {
  const playerIds = new Set(runtime.agents.map((agent) => Number(agent.id)));
  const votes = { ...((runtime.state.mvpVotes || {}) as Record<string, number>) };
  for (const result of results) {
    const voterId = Number(result.actorId);
    const targetId = Number(result.payload.target);
    if (!playerIds.has(voterId) || !playerIds.has(targetId) || voterId === targetId) continue;
    votes[String(voterId)] = targetId;
  }
  runtime.state.mvpVotes = votes;
}

function applyPostgameSpeeches(runtime: Runtime, results: ActionResult[]): void {
  const speeches = { ...((runtime.state.postgameSpeeches || {}) as Record<string, Record<string, unknown>>) };
  for (const result of results) {
    if (result.payload.speak !== true) continue;
    const text = String(result.payload.text || result.payload.speech || '').trim();
    if (!text) continue;
    speeches[String(result.actorId)] = {
      playerId: result.actorId,
      text,
      thinking: String(result.payload.thinking || ''),
      phase: 'postgame',
    };
  }
  runtime.state.postgameSpeeches = speeches;
}

function applyWolfSpeech(runtime: Runtime, round: Round, results: ActionResult[]): void {
  ensureWolfTeamContext(runtime, round);
  const order = round.night.wolfSpeechOrder || [];
  const byActor = new Map(results.map((result) => [Number(result.actorId), result]));
  round.night.wolfSpeeches = order
    .map((id) => byActor.get(Number(id)))
    .filter(Boolean)
    .map((result) => ({
      playerId: result!.actorId,
      text: result!.payload.speech || result!.payload.text || '',
      phase: 'night-wolf',
      day: round.day,
      thinking: result!.payload.thinking || ''
    }));
}

function applyWolfVote(runtime: Runtime, round: Round, results: ActionResult[]): void {
  round.night.wolfChoices = {};
  for (const result of filterEligibleWolfVotes(runtime, results)) {
    round.night.wolfChoices[result.actorId] = result.payload.target!;
  }
  round.night.wolfVoteTally = countTargets(round.night.wolfChoices);
  const topIds = getTopCandidateIds(round.night.wolfVoteTally);
  round.night.wolfTarget = topIds[0] || topTarget(round.night.wolfChoices);
  round.night.wolfStrategy = buildWolfStrategySummary(round.night.wolfChoices, round.night.wolfTarget, runtime.agents);
}

function applyWolfKill(runtime: Runtime, round: Round, results: ActionResult[]): void {
  round.night.wolfChoices = {};
  round.night.wolfSpeeches = round.night.wolfSpeeches || [];
  for (const result of filterEligibleWolfVotes(runtime, results)) {
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
  const reason = normalizeReason(result.reason);
  round.night.seerCheck = {
    target: result.target as number,
    result: result.result as string,
    ...(reason ? { reason } : {}),
  };
  if (seer) seer.seerChecks!.push(round.night.seerCheck as Record<string, unknown>);
}

function applyGuardProtect(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0]?.payload;
  const guard = runtime.agents.find((agent) => Number(agent.id) === Number(results[0]?.actorId));
  if (!result?.target) return;
  round.night.guardTarget = result.target as number;
  const reason = normalizeReason(result.reason);
  if (reason) round.night.guardReason = reason;
  if (guard) guard.lastGuardTarget = result.target as number;
}

function applyWitchSave(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0]?.payload;
  const witch = runtime.agents.find((agent) => Number(agent.id) === Number(results[0]?.actorId));
  if (round.night?.witchPoisonTarget || !result?.use || !round.night.wolfTarget) return;
  round.night.witchSave = true;
  round.night.witchSaveTarget = round.night.wolfTarget;
  const reason = normalizeReason(result.reason);
  if (reason) round.night.witchSaveReason = reason;
  if (witch) witch.usedAntidote = true;
}

function applyWitchPoison(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0]?.payload;
  const witch = runtime.agents.find((agent) => Number(agent.id) === Number(results[0]?.actorId));
  if (round.night?.witchSave || result?.use !== true || !result.target) return;
  round.night.witchPoisonTarget = result.target as number;
  const reason = normalizeReason(result.reason);
  if (reason) round.night.witchPoisonReason = reason;
  if (witch) witch.usedPoison = true;
}

function applyDaySpeech(round: Round, results: ActionResult[], agents?: Agent[]): void {
  round.speeches = results.map((result) => ({
    playerId: result.actorId,
    text: result.payload.text || '',
    phase: 'day',
    day: round.day,
    thinking: result.payload.thinking || ''
  }));
  const selfDestruct = results.find((result) => result.payload.selfDestruct === true);
  if (selfDestruct && !round.selfDestruct) {
    const targetId = resolveSelfDestructTarget(selfDestruct.payload, selfDestruct.actorId, agents);
    round.selfDestruct = {
      playerId: selfDestruct.actorId,
      text: String(selfDestruct.payload.selfDestructText || selfDestruct.payload.text || `${getSeatNumber(selfDestruct.actorId, agents)}号狼人自爆。`),
      day: round.day,
      ...(targetId ? { targetId } : {})
    };
  }
}

function applyDayVote(runtime: Runtime, round: Round, results: ActionResult[]): void {
  round.votes = {};
  for (const result of results) {
    const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result.actorId));
    if (!actor?.alive || actor.canVote === false) continue;
    const target = result.payload.target ?? null;
    round.votes![result.actorId] = target;
    actor.votes!.push({ day: round.day, target });
  }
}

function filterEligibleWolfVotes(runtime: Runtime, results: ActionResult[]): ActionResult[] {
  const eligibleIds = new Set(
    getAliveActorsByAction(runtime, 'kill').map((agent) => Number(agent.id)),
  );
  return results.filter((result) => eligibleIds.has(Number(result.actorId)));
}

// ============================================================
// 白天发言顺序（三档优先级）
// ============================================================

function buildDaySpeechOrder(runtime: Runtime, round: Round): Agent[] {
  const alive = runtime.agents.filter((agent) => agent.alive);
  if (!alive.length) return [];

  // 如果本轮已确定发言顺序，直接复用（避免 Math.random() 每次调用产生不同结果）
  const storedIds = (round.daySpeech as Record<string, unknown> | undefined)?.playerIds as number[] | undefined;
  if (Array.isArray(storedIds) && storedIds.length) {
    return storedIds
      .map((id) => alive.find((a) => Number(a.id) === Number(id)))
      .filter(Boolean) as Agent[];
  }

  const sheriffId = resolveActiveSheriffId(runtime, round);

  // 优先级 A：有警长 → 警长指定顺时针/逆时针发言
  if (sheriffId && alive.some((a) => Number(a.id) === sheriffId)) {
    const daySpeech = round.daySpeech as Record<string, unknown> | undefined;
    const direction = daySpeech?.direction === 'counterclockwise' ? 'counterclockwise' : 'clockwise';
    const ordered = getSheriffSpeechOrder(alive, sheriffId, direction);
    const startPlayerId = ordered[0]?.id;
    // 写入 round.daySpeech 供前端和 AI 记忆使用
    round.daySpeech = {
      source: 'sheriff',
      direction,
      sheriffId,
      startPlayerId,
      playerIds: ordered.map((a) => Number(a.id)),
    };
    return ordered as Agent[];
  }

  // 优先级 B：无警长，有已公开死亡 → 从死亡下一位顺时针
  const deathId = resolveRecentDeathId(round);
  if (deathId) {
    const startId = getNextAliveId(alive, deathId, 'clockwise') ?? alive[0].id;
    const ordered = rotateFromSeat(alive, startId, 'clockwise') as Agent[];
    round.daySpeech = {
      source: 'night-death',
      direction: 'clockwise',
      startPlayerId: startId,
      deathId,
      playerIds: ordered.map((a) => Number(a.id)),
    };
    return ordered;
  }

  // 优先级 C：无警长无死亡 → 随机起始顺时针
  const startId = alive[Math.floor(Math.random() * alive.length)].id;
  const ordered = rotateFromSeat(alive, startId, 'clockwise') as Agent[];
  round.daySpeech = {
    source: 'random',
    direction: 'clockwise',
    startPlayerId: startId,
    playerIds: ordered.map((a) => Number(a.id)),
  };
  return ordered;
}

/** 获取最近公开死亡的玩家 ID：放逐 > 夜晚死亡 */
function resolveRecentDeathId(round: Round): number | null {
  if (round.exile?.id) return Number(round.exile.id);
  const nightDeaths = round.night?.deaths;
  if (Array.isArray(nightDeaths) && nightDeaths.length > 0) {
    return Number(nightDeaths[nightDeaths.length - 1].id);
  }
  return null;
}

function getActorsForStep(runtime: Runtime, step: Step, round: Round): Agent[] {
  const actionType = step.config.actionType;
  if (round.selfDestruct && Number(round.selfDestruct.day) === Number(round.day)
    && (actionType === 'day_speech' || actionType === 'day_vote')) return [];
  const actors = (action: string): Agent[] => getAliveActorsByAction(runtime, action) as unknown as Agent[];
  if (actionType === 'wolf_kill') return actors('kill');
  if (actionType === 'wolf_speech' || actionType === 'wolf_vote') {
    const context = ensureWolfTeamContext(runtime, round);
    const byId = new Map(actors('kill').map((agent) => [Number(agent.id), agent]));
    return context.wolfSpeechOrder.map((id) => byId.get(Number(id))).filter(Boolean) as Agent[];
  }
  if (actionType === 'seer_check') return actors('inspectFaction').slice(0, 1);
  if (actionType === 'guard_protect') return actors('guard').slice(0, 1);
  if (actionType === 'witch_save' || actionType === 'witch_poison') {
    const eligibility = getWitchActionEligibility(runtime, round, actionType);
    return eligibility.actor ? [eligibility.actor] : [];
  }
  if (actionType === 'day_speech') return buildDaySpeechOrder(runtime, round);
  if (actionType === 'day_vote') return sortBySeat(runtime.agents.filter((agent) => agent.alive && agent.canVote));
  if (actionType === 'mvp_vote') return sortBySeat(runtime.agents);
  if (actionType === 'postgame_speech') {
    const mvp = runtime.state.mvp as { id?: unknown } | null | undefined;
    return resolvePostgameSpeechOrder(runtime.agents, mvp?.id) as Agent[];
  }
  if (actionType?.startsWith('sheriff_')) return getSheriffActorsForAction(runtime, round, actionType);
  return [];
}

function getWitchActionEligibility(
  runtime: Runtime,
  round: Round,
  actionType: WitchActionType,
): WitchActionEligibility {
  const action = actionType === 'witch_save' ? 'save' : 'poison';
  const candidates = getAliveActorsByAction(runtime, action) as unknown as Agent[];
  if (!candidates.length) return { actor: null, skipReason: 'witch_unavailable' };

  if (actionType === 'witch_save') {
    const actor = candidates.find((candidate) => !candidate.usedAntidote) || null;
    if (!actor) return { actor: null, skipReason: 'antidote_depleted' };
    if (round.night?.witchPoisonTarget) {
      return { actor: null, skipReason: 'one_potion_per_night' };
    }
    if (!round.night?.wolfTarget) return { actor: null, skipReason: 'no_wolf_target' };
    return { actor, skipReason: null };
  }

  const actor = candidates.find((candidate) => !candidate.usedPoison) || null;
  if (!actor) return { actor: null, skipReason: 'poison_depleted' };
  if (round.night?.witchSave) {
    return { actor: null, skipReason: 'one_potion_per_night' };
  }
  return { actor, skipReason: null };
}

function getTargetIds(runtime: Runtime, step: Step): number[] {
  const alive = runtime.agents.filter((agent) => agent.alive);
  if (step.config.actionType === 'wolf_kill' || step.config.actionType === 'wolf_vote') return alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
  if (step.config.actionType === 'wolf_speech') return [];
  if (step.config.actionType === 'mvp_vote') return runtime.agents.map((agent) => agent.id);
  if (step.config.actionType === 'postgame_speech') return [];
  if (step.config.actionType?.startsWith('sheriff_')) {
    const round = ensureRound(runtime.state, step.config.day);
    return getSheriffTargetIds(round, step.config.actionType);
  }
  return alive.map((agent) => agent.id);
}

function findPendingHunter(
  agents: Agent[],
  round: Round,
  deaths: Array<{ id: number; reason: string }> | null | undefined,
  playerId?: number,
): Agent | null {
  const deathIds = new Set((deaths || []).map((death) => Number(death.id)));
  return agents.find((agent) =>
    deathIds.has(Number(agent.id)) &&
    (playerId === undefined || Number(agent.id) === Number(playerId)) &&
    hasRoleAction(agent.roleConfig, 'shootOnDeath') &&
    !agent.hunterShotUsed &&
    !agent.alive
  ) || null;
}

function applySelfDestruct(runtime: Runtime, round: Round): void {
  if (!round.selfDestruct?.playerId) return;
  const actorId = Number(round.selfDestruct.playerId);
  eliminate(runtime.agents as never, actorId, round.day, 'self_destruct');
  const targetId = resolveSelfDestructTarget({ target: round.selfDestruct.targetId }, actorId, runtime.agents);
  if (targetId) {
    round.selfDestruct.targetId = targetId;
    eliminate(runtime.agents as never, targetId, round.day, 'white_wolf_king_self_destruct');
  } else {
    round.selfDestruct.targetId = null;
  }
  round.publicSummary = `第${round.day}天，${getSeatNumber(round.selfDestruct.playerId, runtime.agents)}号狼人自爆，白天流程中止。`;
}

function hasSelfDestruct(round: Round): boolean {
  return Boolean(round.selfDestruct?.playerId);
}

function ensureRound(state: State, day: number): Round {
  let round = (state.rounds || []).find((item) => Number(item.day) === Number(day));
  if (!round) {
    round = { day, phase: 'night', night: {}, speeches: [], votes: {}, voteTally: {}, lastWords: [] } as Round;
    state.rounds = [...(state.rounds || []), round];
  }
  return round;
}

function normalizeReason(value: unknown): string | null {
  const reason = String(value || '').trim().slice(0, 80);
  return reason || null;
}

function resolveSelfDestructTarget(
  payload: Record<string, unknown>,
  actorId: number,
  agents: Agent[] = [],
): number | null {
  const actor = agents.find((agent) => Number(agent.id) === Number(actorId));
  if (!isWhiteWolfKing(actor)) return null;
  const targetId = Number(payload.targetId ?? payload.target);
  if (!Number.isFinite(targetId) || targetId <= 0 || Number(targetId) === Number(actorId)) return null;
  const target = agents.find((agent) => Number(agent.id) === Number(targetId));
  return target?.alive ? Number(target.id) : null;
}

function isWhiteWolfKing(agent: Agent | undefined): boolean {
  if (!agent) return false;
  const roleId = String(agent.role || agent.roleConfig?.id || '').toLowerCase();
  const roleName = String(agent.roleLabel || agent.roleConfig?.name || '').toLowerCase();
  return roleId === 'white_wolf_king' || roleName.includes('白狼王') || roleName.includes('white wolf king');
}

export {
  applyActionResults,
  getActorsForStep,
  getWitchActionEligibility,
  getTargetIds,
  findPendingHunter,
  applySelfDestruct,
  hasSelfDestruct
};

export type {
  ActionResult,
  Agent,
  Round,
  Runtime,
  Step,
  WitchActionEligibility,
  WitchActionSkipReason,
  WitchActionType,
};
