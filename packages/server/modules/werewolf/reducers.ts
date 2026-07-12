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
import { ensureEscapeHunterTeamContext, resolveNightAttackTarget } from './escapeHunterTeam';
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
  hybridMasterId?: number | null;
  lastSilencedTarget?: number | null;
  knightDuelUsed?: boolean;
  butterflyHugUsed?: number;
  stalkerAssassinateUsed?: boolean;
  lastNightmareTarget?: number | null;
  lastPenguinTarget?: number | null;
  foxInspectLost?: boolean;
  foxLastInspect?: { targetIds: number[]; hasWolf: boolean } | null;
  lastDreamTarget?: number | null;
  magicianSwappedIds?: number[];
  fortuneTellerMarkUsed?: boolean;
  bigBadWolfKillUsed?: boolean;
  lastCrowTarget?: number | null;
  blackMerchantGiftUsed?: boolean;
  blackMerchantGift?: BlackMerchantGift | null;
  blackMerchantDeathPending?: boolean;
  bigTreeWolfHits?: number;
  godSkillsDisabled?: boolean;
  youngerBrotherSoloKillUsedDay?: number | null;
  wolfElderBrotherDeathDay?: number | null;
  wolfSeedInfectUsed?: boolean;
  wolfSeedInfected?: boolean;
  requesterPrayUsed?: boolean;
  requesterGift?: 'voteDouble' | 'shootOnDeath' | 'poison' | 'inspectFaction' | 'soloKill';
  requesterVoteDouble?: boolean;
  loverId?: number | null;
  loverSource?: string | null;
  ghostBridePartnerId?: number | null;
  ghostBrideWitnessId?: number | null;
  witnessForGhostBride?: number | null;
  magicWolfSealNightDay?: number | null;
  magicWolfDelayedDeathDay?: number | null;
  spiritWolfLearnedRole?: 'seer' | 'witch' | 'hunter' | 'guard' | 'villager' | null;
  spiritWolfLearnTarget?: number | null;
  spiritWolfAntidoteUsed?: boolean;
  lastSpiritWolfGuardTarget?: number | null;
  wolfWitchLastCurseDay?: number | null;
  skillDisabledUntilDay?: number | null;
  lastIllusionDay?: number | null;
  evilKnightTriggered?: boolean;
  oldRoguePendingDeath?: {
    reason: string;
    sourceAction: string;
    resolveDay: number;
    announced?: boolean;
  } | null;
  roleConfig?: { [key: string]: unknown };
  seerChecks?: Array<Record<string, unknown>>;
  votes?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

type BlackMerchantGiftAction = 'inspectFaction' | 'poison' | 'shootOnDeath';

interface BlackMerchantGift {
  action: BlackMerchantGiftAction;
  from: number;
  used?: boolean;
}

interface Night {
  escapeHunterIds?: number[];
  escapeHunterSpeechOrder?: number[];
  escapeHunterSpeeches?: Array<Record<string, unknown>>;
  escapeHunterChoices?: Record<string, number>;
  escapeHunterVoteTally?: Record<string, number>;
  escapeHunterTarget?: number | null;
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
  butterflyTarget?: number | null;
  butterflyReason?: string | null;
  stalkerTarget?: number | null;
  stalkerReason?: string | null;
  wolfBeautyTarget?: number | null;
  wolfBeautyReason?: string | null;
  demonInspect?: { target: number; result: string; reason?: string | null } | null;
  nightmareTarget?: number | null;
  nightmareReason?: string | null;
  penguinFrozenId?: number | null;
  penguinReason?: string | null;
  foxInspect?: { targetIds: number[]; hasWolf: boolean; reason?: string | null } | null;
  dreamerTarget?: number | null;
  dreamerReason?: string | null;
  dreamerRepeatedTarget?: boolean;
  magicianSwap?: { firstTarget: number; secondTarget: number; reason?: string | null } | null;
  fortuneTellerMark?: { target: number; reason?: string | null } | null;
  bigBadWolfTarget?: number | null;
  bigBadWolfReason?: string | null;
  crowCurse?: { target: number; reason?: string | null } | null;
  blackMerchantGift?: { actorId: number; targetId: number; gift: BlackMerchantGiftAction; success: boolean; reason?: string | null } | null;
  luckySeerCheck?: { actorId: number; target: number; result: string; reason?: string | null } | null;
  luckyPoisonTarget?: number | null;
  luckyPoisonReason?: string | null;
  youngerBrotherTarget?: number | null;
  youngerBrotherReason?: string | null;
  wolfSeedInfect?: { actorId: number; targetId: number; used: boolean; success: boolean; reason?: string | null } | null;
  heavenlyEyeCheck?: { target: number; roleId: string; roleName: string; reason?: string | null } | null;
  requesterPrayer?: { actorId: number; targetId: number; result: string; reason?: string | null } | null;
  requesterTarget?: number | null;
  requesterReason?: string | null;
  thiefChoice?: { actorId: number; roleId: string; offeredRoleIds: string[]; reason?: string | null } | null;
  loverLink?: { actorId: number; targetIds: number[]; source: string; reason?: string | null } | null;
  succubusLink?: { actorId: number; targetIds: number[]; reason?: string | null } | null;
  ghostBrideLink?: { actorId: number; partnerId: number; witnessId: number; reason?: string | null } | null;
  ghostBrideChat?: Array<{ playerId: number; text: string; phase: string; day: number; thinking?: string }>;
  ghostBrideTarget?: number | null;
  ghostBrideReason?: string | null;
  demonHunterTarget?: number | null;
  demonHunterReason?: string | null;
  spiritWolfLearn?: { actorId: number; targetId: number; learnedRole: string; reason?: string | null } | null;
  spiritWolfInspect?: { target: number; result: string; reason?: string | null } | null;
  spiritWolfGuardTarget?: number | null;
  spiritWolfGuardReason?: string | null;
  spiritWolfAntidoteTarget?: number | null;
  spiritWolfAntidoteReason?: string | null;
  wolfWitchCurse?: { actorId: number; targetId: number; reason?: string | null } | null;
  illusionTarget?: number | null;
  illusionReason?: string | null;
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
  silencedPlayerId?: number | null;
  silenceReason?: string | null;
  knightDuel?: { actorId: number; targetId: number; targetFaction: string; success: boolean; reason?: string | null } | null;
  bearRoar?: { roaring: boolean; adjacentWolfIds: number[] } | null;
  crowCursedPlayerId?: number | null;
  evilKnightTrigger?: { actorId: number; trigger: string; targetId: number } | null;
  oldRogueDeath?: { id: number; reason: string; sourceAction?: string } | null;
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
  const actionType = step.config.actionType;
  if (actionType === 'mvp_vote') {
    applyMvpVotes(runtime, results);
    return;
  }
  if (actionType === 'postgame_speech') {
    applyPostgameSpeeches(runtime, results);
    return;
  }
  const round = ensureRound(runtime.state, step.config.day);
  if (actionType === 'wolf_kill') applyWolfKill(runtime, round, results);
  if (actionType === 'wolf_speech') applyWolfSpeech(runtime, round, results);
  if (actionType === 'wolf_vote') applyWolfVote(runtime, round, results);
  if (actionType === 'escape_hunter_speech') applyEscapeHunterSpeech(runtime, round, results);
  if (actionType === 'escape_hunter_vote') applyEscapeHunterVote(runtime, round, results);
  if (actionType === 'seer_check') applySeerCheck(runtime, round, results);
  if (actionType === 'guard_protect') applyGuardProtect(runtime, round, results);
  if (actionType === 'witch_save') applyWitchSave(runtime, round, results);
  if (actionType === 'witch_poison') applyWitchPoison(runtime, round, results);
  if (actionType === 'hybrid_choose_master') applyHybridChooseMaster(runtime, results);
  if (actionType === 'elder_silence') applyElderSilence(runtime, round, results);
  if (actionType === 'knight_duel') applyKnightDuel(runtime, round, results);
  if (actionType === 'butterfly_hug') applyButterflyHug(runtime, round, results);
  if (actionType === 'stalker_assassinate') applyStalkerAssassinate(runtime, round, results);
  if (actionType === 'wolf_beauty_charm') applyWolfBeautyCharm(runtime, round, results);
  if (actionType === 'demon_inspect') applyDemonInspect(runtime, round, results);
  if (actionType === 'nightmare_fear') applyNightmareFear(runtime, round, results);
  if (actionType === 'penguin_freeze') applyPenguinFreeze(runtime, round, results);
  if (actionType === 'fox_inspect') applyFoxInspect(runtime, round, results);
  if (actionType === 'dreamer_dream') applyDreamerDream(runtime, round, results);
  if (actionType === 'magician_swap') applyMagicianSwap(runtime, round, results);
  if (actionType === 'fortune_teller_mark') applyFortuneTellerMark(runtime, round, results);
  if (actionType === 'big_bad_wolf_kill') applyBigBadWolfKill(runtime, round, results);
  if (actionType === 'crow_curse') applyCrowCurse(runtime, round, results);
  if (actionType === 'black_merchant_gift') applyBlackMerchantGift(runtime, round, results);
  if (actionType === 'lucky_seer_check') applyLuckySeerCheck(runtime, round, results);
  if (actionType === 'lucky_witch_poison') applyLuckyWitchPoison(runtime, round, results);
  if (actionType === 'younger_brother_kill') applyYoungerBrotherKill(runtime, round, results);
  if (actionType === 'bear_tamer_roar') applyBearTamerRoar(runtime, round, results);
  if (actionType === 'wolf_seed_infect') applyWolfSeedInfect(runtime, round, results);
  if (actionType === 'heavenly_eye_check') applyHeavenlyEyeCheck(runtime, round, results);
  if (actionType === 'requester_pray') applyRequesterPray(runtime, round, results);
  if (actionType === 'requester_kill') applyRequesterKill(runtime, round, results);
  if (actionType === 'thief_choose') applyThiefChoose(runtime, round, results);
  if (actionType === 'cupid_link') applyCupidLink(runtime, round, results);
  if (actionType === 'succubus_link') applySuccubusLink(runtime, round, results);
  if (actionType === 'ghost_bride_link') applyGhostBrideLink(runtime, round, results);
  if (actionType === 'ghost_bride_chat') applyGhostBrideChat(round, results);
  if (actionType === 'ghost_bride_kill') applyGhostBrideKill(runtime, round, results);
  if (actionType === 'demon_hunter_hunt') applyDemonHunterHunt(runtime, round, results);
  if (actionType === 'spirit_wolf_learn') applySpiritWolfLearn(runtime, round, results);
  if (actionType === 'spirit_wolf_inspect') applySpiritWolfInspect(runtime, round, results);
  if (actionType === 'spirit_wolf_guard') applySpiritWolfGuard(runtime, round, results);
  if (actionType === 'spirit_wolf_antidote') applySpiritWolfAntidote(runtime, round, results);
  if (actionType === 'wolf_witch_curse') applyWolfWitchCurse(runtime, round, results);
  if (actionType === 'illusionist_illusion') applyIllusionistIllusion(runtime, round, results);
  if (actionType === 'day_speech') applyDaySpeech(round, results, runtime.agents);
  if (actionType === 'day_vote') applyDayVote(runtime, round, results);
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
  for (const result of filterEligibleWolfVotes(runtime, round, results)) {
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
  for (const result of filterEligibleWolfVotes(runtime, round, results)) {
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
  const targetId = Number(result.target);
  const actualTargetId = resolveMagicianTarget(round.night, targetId);
  const actualTarget = actualTargetId !== targetId
    ? runtime.agents.find((agent) => Number(agent.id) === actualTargetId)
    : null;
  const reason = normalizeReason(result.reason);
  round.night.seerCheck = {
    target: targetId,
    result: resolveSeerFactionResult(runtime, actualTarget || runtime.agents.find((agent) => Number(agent.id) === targetId), result.result),
    ...(reason ? { reason } : {}),
  };
  if (seer) seer.seerChecks!.push(round.night.seerCheck as Record<string, unknown>);
}

function applyEscapeHunterSpeech(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const order = ensureEscapeHunterTeamContext(runtime, round).map((hunter) => Number(hunter.id));
  const byActor = new Map(results.map((result) => [Number(result.actorId), result]));
  round.night.escapeHunterSpeeches = order
    .map((id) => byActor.get(id))
    .filter(Boolean)
    .map((result) => ({
      playerId: result!.actorId,
      text: result!.payload.speech || result!.payload.text || '',
      phase: 'night-escape-hunter',
      day: round.day,
      thinking: result!.payload.thinking || '',
    }));
}

function applyEscapeHunterVote(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const hunters = new Set(ensureEscapeHunterTeamContext(runtime, round).map((agent) => Number(agent.id)));
  const aliveById = new Map(runtime.agents.filter((agent) => agent.alive).map((agent) => [Number(agent.id), agent]));
  round.night.escapeHunterChoices = {};
  for (const result of results) {
    const target = aliveById.get(Number(result.payload.target));
    if (!hunters.has(Number(result.actorId)) || !target || hunters.has(Number(target.id))) continue;
    round.night.escapeHunterChoices[String(result.actorId)] = Number(target.id);
  }
  round.night.escapeHunterVoteTally = countTargets(round.night.escapeHunterChoices);
  round.night.escapeHunterTarget = getTopCandidateIds(round.night.escapeHunterVoteTally)[0] || null;
}

function resolveSeerFactionResult(runtime: Runtime, target: Agent | null | undefined, fallback: unknown): string {
  if (isRole(target, 'escape_hunter')) return '狼人';
  if (isRole(target, 'spirit_wolf') && target?.spiritWolfLearnedRole === 'villager') return '濂戒汉';
  if (isRole(target, 'hidden_wolf')) return '好人';
  if (isRole(target, 'wolf_younger_brother') && getWolfElderBrotherDeathDay(runtime) == null) return '好人';
  if (fallback) return String(fallback);
  if (target) return target.faction === 'wolves' ? '狼人' : '好人';
  return '';
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
  const attackTarget = resolveNightAttackTarget(round.night);
  if (round.night?.witchPoisonTarget || !result?.use || !attackTarget) return;
  round.night.witchSave = true;
  round.night.witchSaveTarget = attackTarget;
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

function applyHybridChooseMaster(runtime: Runtime, results: ActionResult[]): void {
  for (const result of results) {
    const hybrid = runtime.agents.find((agent) => Number(agent.id) === Number(result.actorId));
    const targetId = Number(result.payload.target ?? result.payload.targetSeat);
    const master = runtime.agents.find((agent) => Number(agent.id) === targetId);
    if (!hybrid || !master || Number(hybrid.id) === Number(master.id)) continue;
    if (hybrid.role === 'wild_child') {
      hybrid.wildChildModelId = Number(master.id);
    } else {
      hybrid.hybridMasterId = Number(master.id);
    }
    const winner = String(runtime.state.winner || '');
    if (!winner) continue;
    const masterFaction = master.faction === 'wolves' ? 'wolves' : 'good';
    runtime.state.hybridResults = {
      ...((runtime.state.hybridResults || {}) as Record<string, unknown>),
      [String(hybrid.id)]: {
        masterId: Number(master.id),
        masterFaction,
        winner,
        won: masterFaction === winner,
      },
    };
  }
}

function applyElderSilence(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const elder = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!elder || !target || Number(elder.lastSilencedTarget) === Number(target.id)) return;
  round.silencedPlayerId = Number(target.id);
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.silenceReason = reason;
  elder.lastSilencedTarget = Number(target.id);
}

function applyKnightDuel(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const knight = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!knight || knight.knightDuelUsed || !target || Number(knight.id) === Number(target.id)) return;
  knight.knightDuelUsed = true;
  const success = target.faction === 'wolves';
  const reason = normalizeReason(result.payload.reason);
  round.knightDuel = {
    actorId: Number(knight.id),
    targetId: Number(target.id),
    targetFaction: target.faction || 'unknown',
    success,
    ...(reason ? { reason } : {}),
  };
  eliminate(runtime.agents as never, success ? Number(target.id) : Number(knight.id), round.day, success ? 'knight_duel' : 'knight_duel_failed');
  if (success) applyWolfBeautyLinkedDeath(runtime, round, Number(target.id));
}

function applyButterflyHug(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const butterfly = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!butterfly || !target || Number(butterfly.id) === Number(target.id) || Number(butterfly.butterflyHugUsed || 0) >= 2) return;
  round.night.butterflyTarget = Number(target.id);
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.night.butterflyReason = reason;
  butterfly.butterflyHugUsed = Number(butterfly.butterflyHugUsed || 0) + 1;
}

function applyStalkerAssassinate(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const stalker = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const eligibleTarget = stalker ? getStalkerEligibleTarget(runtime, stalker, round.day) : null;
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  if (!stalker || stalker.stalkerAssassinateUsed || !eligibleTarget || Number(eligibleTarget.id) !== targetId) return;
  round.night.stalkerTarget = Number(eligibleTarget.id);
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.night.stalkerReason = reason;
  stalker.stalkerAssassinateUsed = true;
}

function applyWolfBeautyCharm(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || !target || Number(actor.id) === Number(target.id)) return;
  round.night.wolfBeautyTarget = Number(target.id);
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.night.wolfBeautyReason = reason;
}

function applyDemonInspect(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive && agent.faction !== 'wolves');
  if (!actor || !target) return;
  const roleType = getGoodRoleType(target);
  const reason = normalizeReason(result.payload.reason);
  round.night.demonInspect = {
    target: Number(target.id),
    result: roleType === 'god' ? '神职' : '平民',
    ...(reason ? { reason } : {}),
  };
}

function applySpiritWolfLearn(runtime: Runtime, round: Round, results: ActionResult[]): void {
  if (Number(round.day) !== 1) return;
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId) && isRole(agent, 'spirit_wolf'));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive && agent.faction !== 'wolves');
  if (!actor || actor.spiritWolfLearnedRole || !target) return;
  const learnedRole = normalizeSpiritWolfLearnedRole(target);
  actor.spiritWolfLearnedRole = learnedRole;
  actor.spiritWolfLearnTarget = Number(target.id);
  const reason = normalizeReason(result.payload.reason);
  round.night.spiritWolfLearn = {
    actorId: Number(actor.id),
    targetId: Number(target.id),
    learnedRole,
    ...(reason ? { reason } : {}),
  };
}

function applySpiritWolfInspect(runtime: Runtime, round: Round, results: ActionResult[]): void {
  if (Number(round.day) < 2) return;
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId) && canSpiritWolfUse(agent, 'seer'));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive && agent.faction !== 'wolves');
  if (!actor || !target) return;
  const roleType = getGoodRoleType(target);
  const reason = normalizeReason(result.payload.reason);
  round.night.spiritWolfInspect = {
    target: Number(target.id),
    result: roleType === 'god' ? '神职' : '平民',
    ...(reason ? { reason } : {}),
  };
}

function applySpiritWolfGuard(runtime: Runtime, round: Round, results: ActionResult[]): void {
  if (Number(round.day) < 2) return;
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId) && canSpiritWolfUse(agent, 'guard'));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || !target || Number(actor.lastSpiritWolfGuardTarget) === Number(target.id)) return;
  round.night.spiritWolfGuardTarget = Number(target.id);
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.night.spiritWolfGuardReason = reason;
  actor.lastSpiritWolfGuardTarget = Number(target.id);
  if (Number(round.night.seerCheck?.target) === Number(target.id)) {
    round.night.seerCheck = { ...round.night.seerCheck, result: '无法验出结果' };
  }
}

function applySpiritWolfAntidote(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId) && canSpiritWolfUse(agent, 'witch'));
  const poisonTarget = Number(round.night?.witchPoisonTarget || 0);
  if (!actor || actor.spiritWolfAntidoteUsed || result?.payload?.use !== true || !poisonTarget || poisonTarget === Number(actor.id)) return;
  round.night.spiritWolfAntidoteTarget = poisonTarget;
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.night.spiritWolfAntidoteReason = reason;
  actor.spiritWolfAntidoteUsed = true;
}

function applyWolfWitchCurse(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId) && isRole(agent, 'wolf_witch'));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive && agent.faction === 'good');
  if (!actor || !target || (actor.wolfWitchLastCurseDay != null && Number(actor.wolfWitchLastCurseDay) === Number(round.day) - 1)) return;
  const reason = normalizeReason(result.payload.reason);
  round.night.wolfWitchCurse = { actorId: Number(actor.id), targetId: Number(target.id), ...(reason ? { reason } : {}) };
  actor.wolfWitchLastCurseDay = Number(round.day);
  target.skillDisabledUntilDay = Number(round.day) + 1;
}

function applyIllusionistIllusion(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId) && isRole(agent, 'illusionist'));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive && Number(agent.id) !== Number(actor?.id));
  if (!actor || !target || (actor.lastIllusionDay != null && Number(actor.lastIllusionDay) === Number(round.day) - 1)) return;
  const reason = normalizeReason(result.payload.reason);
  round.night.illusionTarget = Number(target.id);
  if (reason) round.night.illusionReason = reason;
  actor.lastIllusionDay = Number(round.day);
}

function applyNightmareFear(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || !target || Number(actor.id) === Number(target.id) || Number(actor.lastNightmareTarget) === Number(target.id)) return;
  round.night.nightmareTarget = Number(target.id);
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.night.nightmareReason = reason;
  actor.lastNightmareTarget = Number(target.id);
}

function applyPenguinFreeze(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || !target || Number(actor.id) === Number(target.id) || Number(actor.lastPenguinTarget) === Number(target.id)) return;
  round.night.penguinFrozenId = Number(target.id);
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.night.penguinReason = reason;
  actor.lastPenguinTarget = Number(target.id);
}

function applyFoxInspect(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  if (!actor || actor.foxInspectLost) return;
  const centerId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  if (!runtime.agents.some((agent) => Number(agent.id) === centerId && agent.alive)) return;
  const targetIds = Array.from(getSeatNeighborScope(runtime.agents, centerId))
    .filter((id) => runtime.agents.some((agent) => Number(agent.id) === id && agent.alive));
  if (!targetIds.length) return;
  const hasWolf = targetIds.some((id) => runtime.agents.find((agent) => Number(agent.id) === id)?.faction === 'wolves');
  const reason = normalizeReason(result.payload.reason);
  round.night.foxInspect = {
    targetIds,
    hasWolf,
    ...(reason ? { reason } : {}),
  };
  actor.foxLastInspect = { targetIds, hasWolf };
  if (!hasWolf) actor.foxInspectLost = true;
}

function applyDreamerDream(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || !target || Number(actor.id) === Number(target.id)) return;
  round.night.dreamerTarget = Number(target.id);
  round.night.dreamerRepeatedTarget = Number(actor.lastDreamTarget) === Number(target.id);
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.night.dreamerReason = reason;
  actor.lastDreamTarget = Number(target.id);
}

function applyMagicianSwap(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const firstTargetId = Number(result?.payload?.target ?? result?.payload?.firstTarget ?? result?.payload?.targetA);
  const secondTargetId = Number(result?.payload?.secondTarget ?? result?.payload?.targetB);
  const firstTarget = runtime.agents.find((agent) => Number(agent.id) === firstTargetId && agent.alive);
  const secondTarget = runtime.agents.find((agent) => Number(agent.id) === secondTargetId && agent.alive);
  const used = new Set((actor?.magicianSwappedIds || []).map((id) => Number(id)));
  if (!actor || !firstTarget || !secondTarget || firstTargetId === secondTargetId) return;
  if (used.has(firstTargetId) || used.has(secondTargetId)) return;
  const reason = normalizeReason(result.payload.reason);
  round.night.magicianSwap = {
    firstTarget: firstTargetId,
    secondTarget: secondTargetId,
    ...(reason ? { reason } : {}),
  };
  actor.magicianSwappedIds = [...(actor.magicianSwappedIds || []), firstTargetId, secondTargetId];
}

function applyFortuneTellerMark(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || actor.fortuneTellerMarkUsed || !target || Number(actor.id) === Number(target.id)) return;
  const reason = normalizeReason(result.payload.reason);
  round.night.fortuneTellerMark = {
    target: Number(target.id),
    ...(reason ? { reason } : {}),
  };
  actor.fortuneTellerMarkUsed = true;
}

function applyBigBadWolfKill(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || !isRole(actor, 'big_bad_wolf') || actor.bigBadWolfKillUsed || !target || Number(actor.id) === Number(target.id) || target.faction === 'wolves') return;
  round.night.bigBadWolfTarget = Number(target.id);
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.night.bigBadWolfReason = reason;
  actor.bigBadWolfKillUsed = true;
}

function applyCrowCurse(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || !target || Number(actor.id) === Number(target.id) || Number(actor.lastCrowTarget) === Number(target.id)) return;
  const reason = normalizeReason(result.payload.reason);
  round.night.crowCurse = {
    target: Number(target.id),
    ...(reason ? { reason } : {}),
  };
  round.crowCursedPlayerId = Number(target.id);
  actor.lastCrowTarget = Number(target.id);
}

function applyBlackMerchantGift(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  const gift = normalizeBlackMerchantGift(result?.payload?.gift ?? result?.payload?.skill);
  if (!actor || actor.blackMerchantGiftUsed || !target || Number(actor.id) === Number(target.id) || !gift) return;
  actor.blackMerchantGiftUsed = true;
  const reason = normalizeReason(result.payload.reason);
  const success = target.faction !== 'wolves';
  round.night.blackMerchantGift = {
    actorId: Number(actor.id),
    targetId: Number(target.id),
    gift,
    success,
    ...(reason ? { reason } : {}),
  };
  if (!success) {
    actor.blackMerchantDeathPending = true;
    return;
  }
  target.blackMerchantGift = { action: gift, from: Number(actor.id), used: false };
}

function applyLuckySeerCheck(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const gift = actor?.blackMerchantGift;
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || !gift || gift.used || gift.action !== 'inspectFaction' || !target || Number(actor.id) === Number(target.id)) return;
  gift.used = true;
  const reason = normalizeReason(result.payload.reason);
  round.night.luckySeerCheck = {
    actorId: Number(actor.id),
    target: Number(target.id),
    result: resolveSeerFactionResult(runtime, target, result.payload.result),
    ...(reason ? { reason } : {}),
  };
}

function applyLuckyWitchPoison(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const gift = actor?.blackMerchantGift;
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || !gift || gift.used || gift.action !== 'poison' || result?.payload?.use === false || !target || Number(actor.id) === Number(target.id)) return;
  gift.used = true;
  round.night.luckyPoisonTarget = Number(target.id);
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.night.luckyPoisonReason = reason;
}

function applyYoungerBrotherKill(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive && agent.faction !== 'wolves');
  if (!actor || !isRole(actor, 'wolf_younger_brother') || !canYoungerBrotherSoloKill(actor, round) || !target) return;
  actor.youngerBrotherSoloKillUsedDay = Number(round.day);
  round.night.youngerBrotherTarget = Number(target.id);
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.night.youngerBrotherReason = reason;
}

function applyBearTamerRoar(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  if (!actor || actor.alive === false) return;
  const adjacentWolfIds = Array.isArray(result?.payload?.adjacentWolfIds)
    ? (result.payload.adjacentWolfIds as unknown[]).map((id) => Number(id)).filter((id) => id > 0)
    : getAdjacentPlayers(runtime.agents, Number(actor.id)).filter((agent) => isWolfForBearRoar(agent)).map((agent) => Number(agent.id));
  round.bearRoar = {
    roaring: Boolean(result?.payload?.roaring ?? adjacentWolfIds.length > 0),
    adjacentWolfIds,
  };
}

function applyWolfSeedInfect(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(round.night.wolfTarget || result?.payload?.target || result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || actor.wolfSeedInfectUsed || result?.payload?.use !== true || !target || Number(actor.id) === Number(target.id)) return;
  actor.wolfSeedInfectUsed = true;
  const reason = normalizeReason(result.payload.reason);
  round.night.wolfSeedInfect = {
    actorId: Number(actor.id),
    targetId: Number(target.id),
    used: true,
    success: false,
    ...(reason ? { reason } : {}),
  };
}

function applyHeavenlyEyeCheck(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || !target || Number(actor.id) === Number(target.id)) return;
  const roleId = String(target.role || target.roleConfig?.id || '').trim();
  const roleName = String(target.roleLabel || target.roleConfig?.name || roleId).trim();
  const reason = normalizeReason(result.payload.reason);
  round.night.heavenlyEyeCheck = {
    target: Number(target.id),
    roleId,
    roleName,
    ...(reason ? { reason } : {}),
  };
}

function applyRequesterPray(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || actor.requesterPrayUsed || Number(round.day) !== 1 || !target || Number(actor.id) === Number(target.id)) return;
  actor.requesterPrayUsed = true;
  const gift = resolveRequesterGift(target);
  actor.requesterGift = gift;
  if (gift === 'voteDouble') actor.requesterVoteDouble = true;
  if (gift === 'poison' || gift === 'shootOnDeath' || gift === 'inspectFaction') {
    actor.blackMerchantGift = { action: gift, from: Number(actor.id), used: false };
  }
  if (gift === 'soloKill') actor.faction = 'third_party';
  const reason = normalizeReason(result.payload.reason);
  round.night.requesterPrayer = {
    actorId: Number(actor.id),
    targetId: Number(target.id),
    result: gift,
    ...(reason ? { reason } : {}),
  };
}

function applyRequesterKill(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || actor.requesterGift !== 'soloKill' || actor.faction !== 'third_party' || !target || Number(actor.id) === Number(target.id)) return;
  round.night.requesterTarget = Number(target.id);
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.night.requesterReason = reason;
}

function applyThiefChoose(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const offeredRoleIds = normalizeRoleIds(result?.payload?.offeredRoleIds || runtime.modeConfig?.thiefOfferedRoleIds);
  const wolfRole = offeredRoleIds.find((roleId) => isWolfRoleId(roleId));
  const requestedRoleId = String(result?.payload?.roleId || result?.payload?.targetRoleId || '').trim();
  const roleId = wolfRole || (offeredRoleIds.includes(requestedRoleId) ? requestedRoleId : offeredRoleIds[0]);
  if (!actor || !roleId) return;
  applyRoleIdentity(actor, runtime, roleId);
  const reason = normalizeReason(result.payload.reason);
  round.night.thiefChoice = {
    actorId: Number(actor.id),
    roleId,
    offeredRoleIds,
    ...(reason ? { reason } : {}),
  };
}

function applyCupidLink(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const firstId = Number(result?.payload?.target ?? result?.payload?.firstTarget ?? result?.payload?.targetA);
  const secondId = Number(result?.payload?.secondTarget ?? result?.payload?.targetB);
  const first = runtime.agents.find((agent) => Number(agent.id) === firstId && agent.alive);
  const second = runtime.agents.find((agent) => Number(agent.id) === secondId && agent.alive);
  if (!actor || !first || !second || firstId === secondId) return;
  linkLovers(first, second, 'cupid');
  const mixed = first.faction !== second.faction;
  if (mixed) [actor, first, second].forEach((agent) => { agent.faction = 'third_party'; });
  else actor.faction = first.faction;
  const reason = normalizeReason(result.payload.reason);
  round.night.loverLink = {
    actorId: Number(actor.id),
    targetIds: [firstId, secondId],
    source: 'cupid',
    ...(reason ? { reason } : {}),
  };
}

function applySuccubusLink(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive && Number(agent.id) !== Number(actor?.id));
  if (!actor || !target) return;
  linkLovers(actor, target, 'succubus');
  actor.faction = 'third_party';
  target.faction = 'third_party';
  const reason = normalizeReason(result.payload.reason);
  round.night.succubusLink = {
    actorId: Number(actor.id),
    targetIds: [Number(actor.id), Number(target.id)],
    ...(reason ? { reason } : {}),
  };
}

function applyGhostBrideLink(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId) && agent.alive);
  const partnerId = Number(result?.payload?.target ?? result?.payload?.partnerId ?? result?.payload?.groomId);
  const witnessId = Number(result?.payload?.witnessId ?? result?.payload?.secondTarget);
  const partner = runtime.agents.find((agent) => Number(agent.id) === partnerId && agent.alive);
  const witness = runtime.agents.find((agent) => Number(agent.id) === witnessId && agent.alive);
  if (!actor || !partner || !witness) return;
  if (new Set([Number(actor.id), partnerId, witnessId]).size < 3) return;
  linkLovers(actor, partner, 'ghost_bride');
  actor.ghostBridePartnerId = Number(partner.id);
  actor.ghostBrideWitnessId = Number(witness.id);
  partner.ghostBridePartnerId = Number(actor.id);
  partner.ghostBrideWitnessId = Number(witness.id);
  witness.witnessForGhostBride = Number(actor.id);
  [actor, partner, witness].forEach((agent) => { agent.faction = 'third_party'; });
  const reason = normalizeReason(result.payload.reason);
  round.night.ghostBrideLink = {
    actorId: Number(actor.id),
    partnerId: Number(partner.id),
    witnessId: Number(witness.id),
    ...(reason ? { reason } : {}),
  };
}

function applyGhostBrideChat(round: Round, results: ActionResult[]): void {
  round.night.ghostBrideChat = results
    .map((result) => ({
      playerId: Number(result.actorId),
      text: String(result.payload.text || result.payload.speech || '').trim(),
      phase: 'night-ghost-bride',
      day: round.day,
      thinking: String(result.payload.thinking || ''),
    }))
    .filter((speech) => speech.text);
}

function applyGhostBrideKill(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId) && agent.alive);
  const killActor = getGhostBrideKillActor(runtime);
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive && agent.faction !== 'third_party');
  if (!actor || !killActor || Number(actor.id) !== Number(killActor.id) || !target) return;
  round.night.ghostBrideTarget = Number(target.id);
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.night.ghostBrideReason = reason;
}

function applyDemonHunterHunt(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const result = results[0];
  const actor = runtime.agents.find((agent) => Number(agent.id) === Number(result?.actorId));
  const targetId = Number(result?.payload?.target ?? result?.payload?.targetSeat);
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!actor || !isRole(actor, 'demon_hunter') || Number(round.day) < 2 || !target || Number(actor.id) === Number(target.id)) return;
  round.night.demonHunterTarget = Number(target.id);
  const reason = normalizeReason(result.payload.reason);
  if (reason) round.night.demonHunterReason = reason;
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
  resolveOldRoguePendingDeaths(round, agents);
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
  const sheriffConfig = runtime.modeConfig?.sheriff as { voteWeight?: number } | undefined;
  round.voteTally = countTargets(round.votes, resolveActiveSheriffId(runtime, round), Number(sheriffConfig?.voteWeight || 1));
  for (const actor of runtime.agents) {
    const target = round.votes[String(actor.id)];
    if (actor.alive && actor.requesterVoteDouble && target != null) {
      round.voteTally[String(target)] = (round.voteTally[String(target)] || 0) + 1;
    }
  }
  const cursedId = Number(round.crowCursedPlayerId || round.night?.crowCurse?.target || 0);
  if (cursedId) round.voteTally[String(cursedId)] = (round.voteTally[String(cursedId)] || 0) + getCrowVoteBonus(runtime.modeConfig);
}

function filterEligibleWolfVotes(runtime: Runtime, round: Round, results: ActionResult[]): ActionResult[] {
  const eligibleIds = new Set(
    getWolfTeamKillActors(runtime, round).map((agent) => Number(agent.id)),
  );
  const targetIds = new Set(getWolfKillTargetIds(runtime, round).map((id) => Number(id)));
  return results.filter((result) =>
    eligibleIds.has(Number(result.actorId)) &&
    targetIds.has(Number(result.payload.target)),
  );
}

// ============================================================
// 白天发言顺序（三档优先级）
// ============================================================

function buildDaySpeechOrder(runtime: Runtime, round: Round): Agent[] {
  const alive = runtime.agents.filter((agent) => agent.alive && Number(agent.id) !== Number(round.silencedPlayerId));
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
  if (round.knightDuel?.success && actionType === 'day_vote') return [];
  const magicWolfSeal = runtime.agents.some((agent) => Number(agent.magicWolfSealNightDay || 0) === Number(round.day));
  const actors = (action: string): Agent[] => (getAliveActorsByAction(runtime, action) as unknown as Agent[])
    .filter((agent) => !isGodSkillDisabled(agent, round.day) && !(magicWolfSeal && agent.faction === 'good' && getGoodRoleType(agent) === 'god'));
  if (actionType !== 'nightmare_fear' && isButterflyBlockingAction(runtime, round, actionType)) return [];
  if (actionType !== 'nightmare_fear' && isNightmareBlockingAction(runtime, round, actionType)) return [];
  if (actionType !== 'penguin_freeze' && isPenguinBlockingAction(runtime, round, actionType)) return [];
  if (actionType === 'fortune_teller_mark') return actors('mark').filter((agent) => !agent.fortuneTellerMarkUsed).slice(0, 1);
  if (actionType === 'magician_swap') return actors('swap').slice(0, 1);
  if (actionType === 'nightmare_fear') return actors('fear').slice(0, 1);
  if (actionType === 'penguin_freeze') return actors('freeze').slice(0, 1);
  if (actionType === 'fox_inspect') return actors('foxInspect').filter((agent) => !agent.foxInspectLost).slice(0, 1);
  if (actionType === 'dreamer_dream') return actors('dream').slice(0, 1);
  if (actionType === 'butterfly_hug') return actors('hug').filter((agent) => Number(agent.butterflyHugUsed || 0) < 2).slice(0, 1);
  if (actionType === 'stalker_assassinate') return actors('stalk').filter((agent) => !agent.stalkerAssassinateUsed && getStalkerEligibleTarget(runtime, agent, round.day)).slice(0, 1);
  if (actionType === 'hybrid_choose_master') return actors('chooseMaster').slice(0, 1);
  if (actionType === 'elder_silence') return actors('silence').slice(0, 1);
  if (actionType === 'knight_duel') return actors('duel').filter((agent) => !agent.knightDuelUsed).slice(0, 1);
  if (actionType === 'wolf_beauty_charm') return actors('charm').slice(0, 1);
  if (actionType === 'demon_inspect') return actors('inspectRoleType').slice(0, 1);
  if (actionType === 'black_merchant_gift') return actors('blackMerchantGift').filter((agent) => canBlackMerchantAct(runtime, round, agent)).slice(0, 1);
  if (actionType === 'lucky_seer_check') return runtime.agents.filter((agent) => agent.alive && hasUnusedBlackMerchantGift(agent, 'inspectFaction')).slice(0, 1);
  if (actionType === 'lucky_witch_poison') return runtime.agents.filter((agent) => agent.alive && hasUnusedBlackMerchantGift(agent, 'poison')).slice(0, 1);
  if (actionType === 'younger_brother_kill') return runtime.agents.filter((agent) => agent.alive && canYoungerBrotherSoloKill(agent, round)).slice(0, 1);
  if (actionType === 'wolf_seed_infect') return actors('infect').filter((agent) => !agent.wolfSeedInfectUsed && round.night.wolfTarget).slice(0, 1);
  if (actionType === 'heavenly_eye_check') return actors('inspectRole').slice(0, 1);
  if (actionType === 'requester_pray') return actors('request').filter((agent) => !agent.requesterPrayUsed && Number(round.day) === 1).slice(0, 1);
  if (actionType === 'requester_kill') return runtime.agents.filter((agent) => agent.alive && agent.faction === 'third_party' && agent.requesterGift === 'soloKill').slice(0, 1);
  if (actionType === 'thief_choose') return actors('stealRole').filter(() => Number(round.day) === 1).slice(0, 1);
  if (actionType === 'cupid_link') return actors('linkLovers').filter(() => Number(round.day) === 1).slice(0, 1);
  if (actionType === 'succubus_link') return actors('succubusLink').filter(() => Number(round.day) === 1).slice(0, 1);
  if (actionType === 'ghost_bride_link') return actors('ghostBrideLink').filter(() => Number(round.day) === 1).slice(0, 1);
  if (actionType === 'ghost_bride_chat') return getGhostBrideChatActors(runtime);
  if (actionType === 'ghost_bride_kill') {
    const actor = getGhostBrideKillActor(runtime);
    return actor ? [actor] : [];
  }
  if (actionType === 'demon_hunter_hunt') return Number(round.day) >= 2 ? actors('demonHunterHunt').slice(0, 1) : [];
  if (actionType === 'spirit_wolf_learn') return Number(round.day) === 1 ? actors('spiritWolfLearn').filter((agent) => !agent.spiritWolfLearnedRole).slice(0, 1) : [];
  if (actionType === 'spirit_wolf_inspect') return Number(round.day) >= 2 ? actors('spiritWolfInspect').filter((agent) => canSpiritWolfUse(agent, 'seer')).slice(0, 1) : [];
  if (actionType === 'spirit_wolf_guard') return Number(round.day) >= 2 ? actors('spiritWolfGuard').filter((agent) => canSpiritWolfUse(agent, 'guard')).slice(0, 1) : [];
  if (actionType === 'spirit_wolf_antidote') {
    const poisonTarget = Number(round.night?.witchPoisonTarget || 0);
    return poisonTarget
      ? actors('spiritWolfAntidote').filter((agent) => canSpiritWolfUse(agent, 'witch') && !agent.spiritWolfAntidoteUsed && poisonTarget !== Number(agent.id)).slice(0, 1)
      : [];
  }
  if (actionType === 'wolf_kill') return getWolfTeamKillActors(runtime, round);
  if (actionType === 'escape_hunter_speech' || actionType === 'escape_hunter_vote') {
    return ensureEscapeHunterTeamContext(runtime, round);
  }
  if (actionType === 'wolf_witch_curse') return actors('wolfWitchCurse').filter((agent) => agent.wolfWitchLastCurseDay == null || Number(agent.wolfWitchLastCurseDay) !== Number(round.day) - 1).slice(0, 1);
  if (actionType === 'illusionist_illusion') return actors('illusion').filter((agent) => agent.lastIllusionDay == null || Number(agent.lastIllusionDay) !== Number(round.day) - 1).slice(0, 1);
  if (actionType === 'big_bad_wolf_kill') return actors('soloKill').filter((agent) => isRole(agent, 'big_bad_wolf') && !agent.bigBadWolfKillUsed).slice(0, 1);
  if (actionType === 'crow_curse') return actors('curse').slice(0, 1);
  if (actionType === 'bear_tamer_roar') return actors('bearRoar').slice(0, 1);
  if (actionType === 'wolf_speech' || actionType === 'wolf_vote') {
    const context = ensureWolfTeamContext(runtime, round);
    const byId = new Map(getWolfTeamKillActors(runtime, round).map((agent) => [Number(agent.id), agent]));
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

function getStalkerEligibleTarget(runtime: Runtime, stalker: Agent, currentDay: number): Agent | null {
  const previousRound = runtime.state.rounds?.find((round) => Number(round.day) === currentDay - 1);
  const votedTargetId = previousRound?.votes?.[String(stalker.id)];
  if (!votedTargetId || Number(previousRound?.exile?.id) === Number(votedTargetId)) return null;
  return runtime.agents.find((agent) => agent.alive && Number(agent.id) === Number(votedTargetId)) || null;
}

function resolveRequesterGift(target: Agent): NonNullable<Agent['requesterGift']> {
  const roleId = String(target.role || target.roleConfig?.id || '').toLowerCase();
  const actions = ((target.roleConfig?.rule as { actions?: Array<{ action?: string }> } | undefined)?.actions || [])
    .map((action) => String(action.action || ''));
  if (target.faction === 'wolves' || roleId === 'demon') return 'soloKill';
  if (roleId === 'witch' || actions.includes('poison')) return 'poison';
  if (roleId === 'hunter' || actions.includes('shootOnDeath')) return 'shootOnDeath';
  if (roleId === 'heavenly_eye' || actions.includes('inspectRole')) return 'inspectFaction';
  return getGoodRoleType(target) === 'villager' ? 'voteDouble' : 'inspectFaction';
}

function normalizeBlackMerchantGift(value: unknown): BlackMerchantGiftAction | null {
  const normalized = String(value || '').trim();
  if (normalized === 'inspectFaction' || normalized === 'check' || normalized === 'seer') return 'inspectFaction';
  if (normalized === 'poison' || normalized === 'witch_poison') return 'poison';
  if (normalized === 'shootOnDeath' || normalized === 'gun' || normalized === 'hunter_shot') return 'shootOnDeath';
  return null;
}

function hasUnusedBlackMerchantGift(agent: Agent, action: BlackMerchantGiftAction): boolean {
  return Boolean(agent.blackMerchantGift?.action === action && !agent.blackMerchantGift.used && !isGodSkillDisabled(agent));
}

function canBlackMerchantAct(runtime: Runtime, round: Round, agent: Agent): boolean {
  if (agent.blackMerchantGiftUsed || isGodSkillDisabled(agent)) return false;
  const modeId = String(runtime.modeConfig?.id || '');
  if (modeId === 'black-merchant-big-tree-12') return Number(round.day) === 1;
  return modeId === 'black-merchant-wolf-brothers-12';
}

function getWolfTeamKillActors(runtime: Runtime, round: Round): Agent[] {
  const elderDeathDay = getWolfElderBrotherDeathDay(runtime);
  const regularKillers = (getAliveActorsByAction(runtime, 'kill') as unknown as Agent[]).filter((agent) => {
    if (!isRole(agent, 'wolf_younger_brother')) return true;
    return elderDeathDay != null && Number(round.day) >= elderDeathDay + 2;
  });
  if (regularKillers.length || runtime.modeConfig?.id !== 'hidden-wolf-crow-12') return regularKillers;
  return (getAliveActorsByAction(runtime, 'soloKill') as unknown as Agent[]).filter((agent) => isRole(agent, 'hidden_wolf'));
}

function canYoungerBrotherSoloKill(agent: Agent, round: Round): boolean {
  const elderDeathDay = Number(agent.wolfElderBrotherDeathDay || 0);
  return Boolean(
    agent.alive &&
    isRole(agent, 'wolf_younger_brother') &&
    elderDeathDay > 0 &&
    Number(round.day) === elderDeathDay + 1 &&
    Number(agent.youngerBrotherSoloKillUsedDay || 0) !== Number(round.day),
  );
}

function getWolfElderBrotherDeathDay(runtime: Runtime): number | null {
  const elder = runtime.agents.find((agent) => isRole(agent, 'wolf_elder_brother'));
  const deathDay = Number(elder?.deathDay || 0);
  if (deathDay > 0) return deathDay;
  const younger = runtime.agents.find((agent) => isRole(agent, 'wolf_younger_brother'));
  const stored = Number(younger?.wolfElderBrotherDeathDay || 0);
  return stored > 0 ? stored : null;
}

function isGodSkillDisabled(agent: Agent, currentDay?: number): boolean {
  return Boolean(agent.godSkillsDisabled && getGoodRoleType(agent) === 'god')
    || (currentDay != null && Number(agent.skillDisabledUntilDay || 0) > Number(currentDay));
}

function isButterflyBlockingAction(runtime: Runtime, round: Round, actionType?: string): boolean {
  const targetId = Number(round.night?.butterflyTarget || 0);
  if (!targetId) return false;
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId);
  if (!target) return false;
  if (['wolf_speech', 'wolf_vote', 'wolf_kill'].includes(String(actionType))) return target.faction === 'wolves';
  const actionByType: Record<string, string> = {
    seer_check: 'inspectFaction',
    guard_protect: 'guard',
    witch_save: 'save',
    witch_poison: 'poison',
    elder_silence: 'silence',
    stalker_assassinate: 'stalk',
    dreamer_dream: 'dream',
    penguin_freeze: 'freeze',
    fox_inspect: 'foxInspect',
  };
  const action = actionByType[String(actionType || '')];
  const actor = action ? (getAliveActorsByAction(runtime, action)[0] as Agent | undefined) : null;
  return Boolean(actor && Number(actor.id) === targetId);
}

function isNightmareBlockingAction(runtime: Runtime, round: Round, actionType?: string): boolean {
  const targetId = Number(round.night?.nightmareTarget || 0);
  if (!targetId) return false;
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId);
  if (!target) return false;
  if (['wolf_speech', 'wolf_vote', 'wolf_kill'].includes(String(actionType))) return target.faction === 'wolves';
  const actionByType: Record<string, string> = {
    seer_check: 'inspectFaction',
    guard_protect: 'guard',
    witch_save: 'save',
    witch_poison: 'poison',
    elder_silence: 'silence',
    stalker_assassinate: 'stalk',
    butterfly_hug: 'hug',
    wolf_beauty_charm: 'charm',
    demon_inspect: 'inspectRoleType',
    dreamer_dream: 'dream',
    penguin_freeze: 'freeze',
    fox_inspect: 'foxInspect',
  };
  const action = actionByType[String(actionType || '')];
  const actor = action ? (getAliveActorsByAction(runtime, action)[0] as Agent | undefined) : null;
  return Boolean(actor && Number(actor.id) === targetId);
}

function isPenguinBlockingAction(runtime: Runtime, round: Round, actionType?: string): boolean {
  const targetId = Number(round.night?.penguinFrozenId || 0);
  if (!targetId) return false;
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId);
  if (!target) return false;
  if (['wolf_speech', 'wolf_vote', 'wolf_kill'].includes(String(actionType))) return target.faction === 'wolves';
  const actionByType: Record<string, string> = {
    crow_curse: 'curse',
    fox_inspect: 'foxInspect',
    bear_tamer_roar: 'bearRoar',
  };
  const action = actionByType[String(actionType || '')];
  const actor = action ? (getAliveActorsByAction(runtime, action)[0] as Agent | undefined) : null;
  return Boolean(actor && Number(actor.id) === targetId);
}

function getGoodRoleType(agent: Agent): 'god' | 'villager' {
  const configured = String(agent.roleConfig?.roleType || '').toLowerCase();
  if (configured === 'god') return 'god';
  if (configured === 'villager') return 'villager';
  const roleId = String(agent.role || agent.roleConfig?.id || '').toLowerCase();
  return ['villager', 'hybrid', 'old_rogue'].includes(roleId) ? 'villager' : 'god';
}

function normalizeSpiritWolfLearnedRole(agent: Agent): NonNullable<Agent['spiritWolfLearnedRole']> {
  const roleId = String(agent.role || agent.roleConfig?.id || '').toLowerCase();
  if (roleId === 'seer') return 'seer';
  if (roleId === 'witch') return 'witch';
  if (roleId === 'hunter') return 'hunter';
  if (roleId === 'guard') return 'guard';
  return 'villager';
}

function canSpiritWolfUse(agent: Agent | null | undefined, learnedRole: NonNullable<Agent['spiritWolfLearnedRole']>): boolean {
  return Boolean(agent?.alive && isRole(agent, 'spirit_wolf') && agent.spiritWolfLearnedRole === learnedRole);
}

function applyWolfBeautyLinkedDeath(runtime: Runtime, round: Round, deadId: number): void {
  const dead = runtime.agents.find((agent) => Number(agent.id) === Number(deadId));
  const roleId = String(dead?.role || dead?.roleConfig?.id || '').toLowerCase();
  const targetId = Number(round.night?.wolfBeautyTarget || 0);
  if (roleId !== 'wolf_beauty' || !targetId) return;
  const target = runtime.agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (target && String(target.role || target.roleConfig?.id || '').toLowerCase() === 'old_rogue') return;
  if (target) eliminate(runtime.agents as never, targetId, round.day, '狼美人殉情');
}

function resolveOldRoguePendingDeaths(round: Round, agents: Agent[] = []): void {
  for (const agent of agents) {
    const pending = agent.oldRoguePendingDeath;
    if (!agent.alive || !pending || Number(pending.resolveDay) > Number(round.day)) continue;
    const roleId = String(agent.role || agent.roleConfig?.id || '').toLowerCase();
    if (roleId !== 'old_rogue') continue;
    eliminate(agents as never, Number(agent.id), round.day, pending.reason);
    round.oldRogueDeath = {
      id: Number(agent.id),
      reason: pending.reason,
      sourceAction: pending.sourceAction,
    };
    agent.oldRoguePendingDeath = null;
  }
}

function resolveMagicianTarget(night: Night, target: unknown): number | null {
  const targetId = Number(target || 0);
  if (!targetId) return null;
  const first = Number(night.magicianSwap?.firstTarget || 0);
  const second = Number(night.magicianSwap?.secondTarget || 0);
  if (!first || !second) return targetId;
  if (targetId === first) return second;
  if (targetId === second) return first;
  return targetId;
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
    if (!resolveNightAttackTarget(round.night)) return { actor: null, skipReason: 'no_wolf_target' };
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
  if (step.config.actionType === 'escape_hunter_vote') {
    return alive.filter((agent) => String(agent.role || agent.roleConfig?.id || '') !== 'escape_hunter').map((agent) => agent.id);
  }
  if (step.config.actionType === 'hybrid_choose_master') {
    const hybrid = getAliveActorsByAction(runtime, 'chooseMaster')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(hybrid?.id));
  }
  if (step.config.actionType === 'fortune_teller_mark') {
    const fortuneTeller = getAliveActorsByAction(runtime, 'mark')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(fortuneTeller?.id));
  }
  if (step.config.actionType === 'black_merchant_gift') {
    const merchant = getAliveActorsByAction(runtime, 'blackMerchantGift')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(merchant?.id));
  }
  if (step.config.actionType === 'lucky_seer_check' || step.config.actionType === 'lucky_witch_poison') {
    const actor = alive.find((agent) =>
      hasUnusedBlackMerchantGift(agent, step.config.actionType === 'lucky_seer_check' ? 'inspectFaction' : 'poison')
    );
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(actor?.id));
  }
  if (step.config.actionType === 'elder_silence') {
    const elder = getAliveActorsByAction(runtime, 'silence')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(elder?.lastSilencedTarget));
  }
  if (step.config.actionType === 'knight_duel') {
    const knight = getAliveActorsByAction(runtime, 'duel')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(knight?.id));
  }
  if (step.config.actionType === 'butterfly_hug') {
    const butterfly = getAliveActorsByAction(runtime, 'hug')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(butterfly?.id));
  }
  if (step.config.actionType === 'stalker_assassinate') {
    const stalker = getAliveActorsByAction(runtime, 'stalk')[0] as Agent | undefined;
    const target = stalker ? getStalkerEligibleTarget(runtime, stalker, Number(step.config.day || 1)) : null;
    return target ? [target.id] : [];
  }
  if (step.config.actionType === 'wolf_beauty_charm') {
    const wolfBeauty = getAliveActorsByAction(runtime, 'charm')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(wolfBeauty?.id));
  }
  if (step.config.actionType === 'demon_inspect') {
    return alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
  }
  if (step.config.actionType === 'nightmare_fear') {
    const nightmare = getAliveActorsByAction(runtime, 'fear')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(nightmare?.id) && Number(id) !== Number(nightmare?.lastNightmareTarget));
  }
  if (step.config.actionType === 'penguin_freeze') {
    const penguin = getAliveActorsByAction(runtime, 'freeze')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(penguin?.id) && Number(id) !== Number(penguin?.lastPenguinTarget));
  }
  if (step.config.actionType === 'fox_inspect') {
    const fox = getAliveActorsByAction(runtime, 'foxInspect')[0] as Agent | undefined;
    return fox?.foxInspectLost ? [] : alive.map((agent) => agent.id);
  }
  if (step.config.actionType === 'dreamer_dream') {
    const dreamer = getAliveActorsByAction(runtime, 'dream')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(dreamer?.id));
  }
  if (step.config.actionType === 'magician_swap') {
    const magician = getAliveActorsByAction(runtime, 'swap')[0] as Agent | undefined;
    const used = new Set((magician?.magicianSwappedIds || []).map((id) => Number(id)));
    return alive.map((agent) => agent.id).filter((id) => !used.has(Number(id)));
  }
  if (step.config.actionType === 'big_bad_wolf_kill') {
    const bigBadWolf = getAliveActorsByAction(runtime, 'soloKill').find((agent) => isRole(agent as Agent, 'big_bad_wolf')) as Agent | undefined;
    return bigBadWolf ? alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id) : [];
  }
  if (step.config.actionType === 'younger_brother_kill') {
    return alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
  }
  if (step.config.actionType === 'wolf_seed_infect') {
    const round = ensureRound(runtime.state, step.config.day);
    return round.night.wolfTarget ? [Number(round.night.wolfTarget)] : [];
  }
  if (step.config.actionType === 'heavenly_eye_check') {
    const actor = getAliveActorsByAction(runtime, 'inspectRole')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(actor?.id));
  }
  if (step.config.actionType === 'requester_pray') {
    const actor = getAliveActorsByAction(runtime, 'request')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(actor?.id));
  }
  if (step.config.actionType === 'requester_kill') {
    const actor = alive.find((agent) => agent.faction === 'third_party' && agent.requesterGift === 'soloKill');
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(actor?.id));
  }
  if (step.config.actionType === 'thief_choose') return [];
  if (step.config.actionType === 'cupid_link') {
    const cupid = getAliveActorsByAction(runtime, 'linkLovers')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(cupid?.id));
  }
  if (step.config.actionType === 'succubus_link') {
    const succubus = getAliveActorsByAction(runtime, 'succubusLink')[0] as Agent | undefined;
    return alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id).filter((id) => Number(id) !== Number(succubus?.id));
  }
  if (step.config.actionType === 'ghost_bride_link') {
    const bride = getAliveActorsByAction(runtime, 'ghostBrideLink')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(bride?.id));
  }
  if (step.config.actionType === 'ghost_bride_chat') return [];
  if (step.config.actionType === 'ghost_bride_kill') {
    const actor = getGhostBrideKillActor(runtime);
    return actor ? alive.filter((agent) => agent.faction !== 'third_party').map((agent) => agent.id) : [];
  }
  if (step.config.actionType === 'demon_hunter_hunt') {
    const hunter = getAliveActorsByAction(runtime, 'demonHunterHunt')[0] as Agent | undefined;
    return Number(step.config.day || 1) >= 2
      ? alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(hunter?.id))
      : [];
  }
  if (step.config.actionType === 'spirit_wolf_learn' || step.config.actionType === 'spirit_wolf_inspect') {
    return alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
  }
  if (step.config.actionType === 'spirit_wolf_guard') {
    const spiritWolf = getAliveActorsByAction(runtime, 'spiritWolfGuard')[0] as Agent | undefined;
    return Number(step.config.day || 1) >= 2
      ? alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(spiritWolf?.lastSpiritWolfGuardTarget))
      : [];
  }
  if (step.config.actionType === 'spirit_wolf_antidote') {
    const round = ensureRound(runtime.state, step.config.day);
    const poisonTarget = Number(round.night?.witchPoisonTarget || 0);
    return poisonTarget ? [poisonTarget] : [];
  }
  if (step.config.actionType === 'wolf_witch_curse') {
    return alive.filter((agent) => agent.faction === 'good').map((agent) => agent.id);
  }
  if (step.config.actionType === 'illusionist_illusion') {
    const illusionist = getAliveActorsByAction(runtime, 'illusion')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(illusionist?.id));
  }
  if (step.config.actionType === 'crow_curse') {
    const crow = getAliveActorsByAction(runtime, 'curse')[0] as Agent | undefined;
    return alive.map((agent) => agent.id).filter((id) => Number(id) !== Number(crow?.id) && Number(id) !== Number(crow?.lastCrowTarget));
  }
  if (step.config.actionType === 'bear_tamer_roar') return [];
  if (step.config.actionType === 'wolf_kill' || step.config.actionType === 'wolf_vote') {
    return getWolfKillTargetIds(runtime, ensureRound(runtime.state, step.config.day));
  }
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
    (hasRoleAction(agent.roleConfig, 'shootOnDeath') || hasUnusedBlackMerchantGift(agent, 'shootOnDeath') || canSpiritWolfUse(agent, 'hunter')) &&
    !isGodSkillDisabled(agent, round.day) &&
    !isDeathShotDisabled(agent) &&
    !agent.hunterShotUsed &&
    !agent.alive
  ) || null;
}

function isDeathShotDisabled(agent: Agent): boolean {
  const rule = agent.roleConfig?.rule as { actions?: Array<{ action?: string; disabledDeathReasons?: string[] }> } | undefined;
  const actions = rule?.actions;
  const shotAction = Array.isArray(actions)
    ? actions.find((action) => action?.action === 'shootOnDeath')
    : null;
  const disabled = Array.isArray(shotAction?.disabledDeathReasons)
    ? shotAction.disabledDeathReasons.map((item) => String(item))
    : [];
  const deathReason = String(agent.deathReason || '');
  return deathReason === 'bombman_blast' || Boolean(deathReason && disabled.includes(deathReason));
}

function applySelfDestruct(runtime: Runtime, round: Round): void {
  if (!round.selfDestruct?.playerId) return;
  const actorId = Number(round.selfDestruct.playerId);
  const actor = runtime.agents.find((agent) => Number(agent.id) === actorId);
  eliminate(runtime.agents as never, actorId, round.day, 'self_destruct');
  if (isRole(actor, 'magic_wolf')) actor.magicWolfSealNightDay = Number(round.day) + 1;
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
  if (!Number.isInteger(Number(day)) || Number(day) < 1) throw new Error('Werewolf round action requires a valid day');
  let round = (state.rounds || []).find((item) => Number(item.day) === Number(day));
  if (!round) {
    round = { day, phase: 'night', night: {}, speeches: [], votes: {}, voteTally: {}, lastWords: [] } as Round;
    state.rounds = [...(state.rounds || []), round];
  }
  return round;
}

function normalizeRoleIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function applyRoleIdentity(agent: Agent, runtime: Runtime, roleId: string): void {
  const roleMap = runtime.modeConfig?.roleMap as Record<string, Record<string, unknown>> | undefined;
  const roleConfig = roleMap?.[roleId];
  agent.role = roleId;
  if (roleConfig) agent.roleConfig = { ...roleConfig };
  agent.faction = String(roleConfig?.faction || (isWolfRoleId(roleId) ? 'wolves' : 'good'));
}

function isWolfRoleId(roleId: string): boolean {
  return ['werewolf', 'wolf', 'wolf_king', 'white_wolf_king', 'wolf_beauty', 'demon', 'nightmare', 'evil_knight', 'big_bad_wolf', 'hidden_wolf', 'wolf_seed', 'wolf_elder_brother', 'wolf_younger_brother', 'succubus', 'magic_wolf', 'spirit_wolf', 'wolf_witch'].includes(roleId);
}

function linkLovers(first: Agent, second: Agent, source: string): void {
  first.loverId = Number(second.id);
  second.loverId = Number(first.id);
  first.loverSource = source;
  second.loverSource = source;
}

function getGhostBrideGroup(runtime: Runtime): { bride: Agent | null; partner: Agent | null; witness: Agent | null } {
  const bride = runtime.agents.find((agent) => isRole(agent, 'ghost_bride'))
    || runtime.agents.find((agent) => Number(agent.ghostBridePartnerId || 0) > 0 && agent.loverSource === 'ghost_bride')
    || null;
  if (!bride) return { bride: null, partner: null, witness: null };
  const partnerId = Number(bride.ghostBridePartnerId || bride.loverId || 0);
  const witnessId = Number(bride.ghostBrideWitnessId || 0);
  const partner = runtime.agents.find((agent) => Number(agent.id) === partnerId) || null;
  const witness = runtime.agents.find((agent) => Number(agent.id) === witnessId || Number(agent.witnessForGhostBride || 0) === Number(bride.id)) || null;
  return { bride, partner, witness };
}

function getGhostBrideChatActors(runtime: Runtime): Agent[] {
  const { bride, partner, witness } = getGhostBrideGroup(runtime);
  if (!bride || !partner) return [];
  const mainAlive = [bride, partner].filter((agent) => agent.alive);
  if (mainAlive.length) {
    return sortBySeat([...mainAlive, witness].filter((agent): agent is Agent => Boolean(agent?.alive)));
  }
  return witness?.alive ? [witness] : [];
}

function getGhostBrideKillActor(runtime: Runtime): Agent | null {
  if (runtime.agents.some((agent) => agent.alive && agent.faction === 'wolves')) return null;
  const { bride, partner, witness } = getGhostBrideGroup(runtime);
  if (!bride || !partner) return null;
  if (bride.alive) return bride;
  if (partner.alive) return partner;
  return witness?.alive ? witness : null;
}

function normalizeReason(value: unknown): string | null {
  const reason = String(value || '').trim().slice(0, 80);
  return reason || null;
}

function getCrowVoteBonus(modeConfig?: { [key: string]: unknown }): number {
  return modeConfig?.id === 'animal-zoo-12' ? 2 : 1;
}

function isRole(agent: Agent | null | undefined, roleId: string): boolean {
  return String(agent?.role || (agent?.roleConfig as { id?: unknown } | undefined)?.id || '').toLowerCase() === roleId;
}

function isWolfForBearRoar(agent: Agent | null | undefined): boolean {
  return Boolean(agent?.alive !== false && agent?.faction === 'wolves');
}

function getAdjacentPlayers(agents: Agent[], actorId: number): Agent[] {
  const aliveOrder = sortBySeat(agents);
  const index = aliveOrder.findIndex((agent) => Number(agent.id) === Number(actorId));
  if (index < 0 || aliveOrder.length < 2) return [];
  const left = aliveOrder[(index - 1 + aliveOrder.length) % aliveOrder.length];
  const right = aliveOrder[(index + 1) % aliveOrder.length];
  return [left, right].filter((agent, itemIndex, items) => agent && items.findIndex((item) => Number(item.id) === Number(agent.id)) === itemIndex);
}

function getWolfKillTargetIds(runtime: Runtime, round: Round): number[] {
  const aliveNonWolves = runtime.agents.filter((agent) => agent.alive && agent.faction !== 'wolves');
  const markedTarget = Number(round.night?.fortuneTellerMark?.target || 0);
  if (!markedTarget) return aliveNonWolves.map((agent) => Number(agent.id));
  const markedScope = getSeatNeighborScope(runtime.agents, markedTarget);
  return aliveNonWolves
    .filter((agent) => markedScope.has(Number(agent.id)))
    .map((agent) => Number(agent.id));
}

function getSeatNeighborScope(agents: Agent[], playerId: number): Set<number> {
  const ordered = sortBySeat(agents);
  const index = ordered.findIndex((agent) => Number(agent.id) === Number(playerId));
  if (index < 0) return new Set([playerId]);
  const left = ordered[(index - 1 + ordered.length) % ordered.length];
  const right = ordered[(index + 1) % ordered.length];
  return new Set([left?.id, ordered[index]?.id, right?.id].map((id) => Number(id)).filter(Boolean));
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
