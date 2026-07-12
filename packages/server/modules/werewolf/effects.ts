import { WEREWOLF_EFFECT_TYPES } from '@ai-presenter/shared/types/workflowTypes';
import {
  eliminate,
  countTargets,
  topExile,
  checkWolfVictory,
  getAliveRosterStats,
  normalizeWinCondition,
} from './winCheck';
import type { AliveRosterStats, WerewolfAgent, WinCondition } from './winCheck';
import { hasRoleAction } from './utils';

interface Night {
  escapeHunterTarget?: number | null;
  thickWolfArmorBreak?: { targetId: number } | null;
  wolfTarget?: number | null;
  guardTarget?: number | null;
  witchSave?: boolean;
  witchSaveTarget?: number | null;
  witchPoisonTarget?: number | null;
  seerCheck?: { target?: number | string | null; result?: string; reason?: string | null } | null;
  stalkerTarget?: number | null;
  stalkerReason?: string | null;
  wolfBeautyTarget?: number | null;
  dreamerTarget?: number | null;
  dreamerRepeatedTarget?: boolean;
  magicianSwap?: { firstTarget?: number | null; secondTarget?: number | null } | null;
  bigBadWolfTarget?: number | null;
  luckyPoisonTarget?: number | null;
  youngerBrotherTarget?: number | null;
  ghostBrideTarget?: number | null;
  demonHunterTarget?: number | null;
  illusionTarget?: number | null;
  crowCurse?: { target?: number | null; reason?: string | null } | null;
  deaths?: Array<{ id: number; reason: string }>;
  [key: string]: unknown;
}

interface Round {
  day: number;
  night: Night;
  nightRevealed?: boolean;
  publicSummary?: string;
  votes?: Record<string, number | null>;
  voteTally?: Record<string, number>;
  sheriffId?: number | null;
  exile?: { id: number; reason: string } | null;
  crowCursedPlayerId?: number | null;
  idiotReveal?: { id: number; reason: string } | null;
  hunterShot?: { from: number; target: number; reason?: string } | null;
  evilKnightTrigger?: { actorId: number; trigger: string; targetId: number } | null;
  oldRogueDeath?: { id: number; reason: string; sourceAction?: string } | null;
  bombmanBlast?: { actorId: number; targetIds: number[] } | null;
  winnerLock?: {
    winner: string | null;
    winReason: string;
    sourceFaction?: string;
    sourceAction?: string;
    winCondition?: WinCondition;
    triggerRoster?: AliveRosterStats;
  };
  [key: string]: unknown;
}

interface ModeConfig {
  sheriff?: { voteWeight?: number };
  idiot?: { surviveExileOnce?: boolean; losesVoteAfterReveal?: boolean };
  id?: string;
  winCondition?: string;
  [key: string]: unknown;
}

interface Effect {
  type: string;
  target?: number;
  reason?: string;
  source?: number;
  sourceFaction?: string;
  sourceAction?: string;
}

interface NightEffectsResult {
  effects: Effect[];
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>;
}

interface ExileEffectsResult {
  effects: Effect[];
  exile: { id: number; reason: string } | null;
}

function resolveNightEffects(agents: WerewolfAgent[], round: Round, modeConfig: ModeConfig = {}): NightEffectsResult {
  const effects: Effect[] = [];
  const night = round.night || {};
  const dreamerTarget = Number(night.dreamerTarget || 0);
  const wolfTarget = resolveMagicianTarget(night, night.wolfTarget);
  const guardTarget = resolveMagicianTarget(night, night.guardTarget);
  const spiritGuardTarget = resolveMagicianTarget(night, night.spiritWolfGuardTarget);
  const witchSaveTarget = resolveMagicianTarget(night, night.witchSaveTarget);
  const witchPoisonTarget = resolveMagicianTarget(night, night.witchPoisonTarget);
  const spiritAntidoteTarget = resolveMagicianTarget(night, night.spiritWolfAntidoteTarget);
  const luckyPoisonTarget = resolveMagicianTarget(night, night.luckyPoisonTarget);
  const youngerBrotherTarget = resolveMagicianTarget(night, night.youngerBrotherTarget);
  const requesterTarget = resolveMagicianTarget(night, night.requesterTarget);
  const ghostBrideTarget = resolveMagicianTarget(night, night.ghostBrideTarget);
  const demonHunterTarget = resolveMagicianTarget(night, night.demonHunterTarget);
  const escapeHunterTarget = Number(resolveMagicianTarget(night, night.escapeHunterTarget) || 0) || null;
  if (wolfTarget && Number(wolfTarget) !== dreamerTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.KILL, target: wolfTarget, reason: '狼人袭击', sourceFaction: 'wolves', sourceAction: 'wolf_kill' });
  if (guardTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.PROTECT, target: guardTarget });
  if (spiritGuardTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.PROTECT, target: spiritGuardTarget, reason: '灵狼庇护' });
  if (night.witchSave && witchSaveTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.SAVE, target: witchSaveTarget });
  if (spiritAntidoteTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.SAVE, target: spiritAntidoteTarget, reason: '灵狼解药' });
  const poisonTarget = Number(witchPoisonTarget || 0);
  const validPoisonTarget = night.witchSave || poisonTarget === dreamerTarget || poisonTarget === Number(spiritGuardTarget) || poisonTarget === Number(spiritAntidoteTarget) || isRole(agents, poisonTarget, 'demon') || isRole(agents, poisonTarget, 'evil_knight') || isRole(agents, poisonTarget, 'old_rogue') || isRole(agents, poisonTarget, 'demon_hunter')
    ? null
    : witchPoisonTarget;
  if (validPoisonTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.POISON, target: validPoisonTarget, reason: '女巫毒杀' });
  if (luckyPoisonTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.POISON, target: luckyPoisonTarget, reason: '黑商赠毒' });
  if (night.stalkerTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.KILL, target: night.stalkerTarget, reason: '潜行者暗杀', sourceFaction: 'good', sourceAction: 'stalker_assassinate' });
  if (night.bigBadWolfTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.KILL, target: night.bigBadWolfTarget, reason: '大灰狼袭击', sourceFaction: 'wolves', sourceAction: 'big_bad_wolf_kill' });
  if (youngerBrotherTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.KILL, target: youngerBrotherTarget, reason: '狼弟独刀', sourceFaction: 'wolves', sourceAction: 'younger_brother_kill' });
  if (requesterTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.KILL, target: requesterTarget, reason: '祈求者击杀', sourceFaction: 'third_party', sourceAction: 'requester_kill' });
  if (ghostBrideTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.KILL, target: ghostBrideTarget, reason: '鬼魂新娘击杀', sourceFaction: 'third_party', sourceAction: 'ghost_bride_kill' });
  if (demonHunterTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.KILL, target: demonHunterTarget, reason: '猎魔人狩猎', sourceFaction: 'good', sourceAction: 'demon_hunter_hunt' });
  if (escapeHunterTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.KILL, target: escapeHunterTarget, reason: '猎人夜袭', sourceFaction: 'hunters', sourceAction: 'escape_hunter_hunt' });

  const protectedTargets = new Set([Number(guardTarget || 0), Number(spiritGuardTarget || 0)].filter(Boolean));
  const savedTarget = night.witchSave ? witchSaveTarget : null;
  const deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }> = [];
  if (wolfTarget && Number(wolfTarget) !== dreamerTarget && !protectedTargets.has(Number(wolfTarget)) && Number(wolfTarget) !== Number(savedTarget)) {
    deaths.push({ id: wolfTarget, reason: '狼人袭击', sourceFaction: 'wolves', sourceAction: 'wolf_kill' });
  }
  if (!night.witchSave && poisonTarget && isRole(agents, poisonTarget, 'old_rogue')) {
    setOldRoguePendingDeath(agents, round, poisonTarget, '女巫毒杀', 'witch_poison', false);
  }
  if (!night.witchSave && poisonTarget && isRole(agents, poisonTarget, 'evil_knight')) {
    triggerEvilKnight(agents, round, poisonTarget, 'witch_poison', deaths);
  }
  const seerTarget = Number(resolveMagicianTarget(night, night.seerCheck?.target) || 0);
  if (seerTarget && isRole(agents, seerTarget, 'evil_knight')) {
    triggerEvilKnight(agents, round, seerTarget, 'seer_check', deaths);
  }
  if (validPoisonTarget && !deaths.some((death) => Number(death.id) === Number(validPoisonTarget))) {
    deaths.push({ id: validPoisonTarget, reason: '女巫毒杀', sourceFaction: 'good', sourceAction: 'witch_poison' });
  }
  if (luckyPoisonTarget && !deaths.some((death) => Number(death.id) === Number(luckyPoisonTarget))) {
    deaths.push({ id: luckyPoisonTarget, reason: '黑商赠毒', sourceFaction: 'good', sourceAction: 'lucky_witch_poison' });
  }
  if (night.stalkerTarget && !deaths.some((death) => Number(death.id) === Number(night.stalkerTarget))) {
    deaths.push({ id: night.stalkerTarget, reason: '潜行者暗杀', sourceFaction: 'good', sourceAction: 'stalker_assassinate' });
  }
  if (night.bigBadWolfTarget && !deaths.some((death) => Number(death.id) === Number(night.bigBadWolfTarget))) {
    deaths.push({ id: Number(night.bigBadWolfTarget), reason: '大灰狼袭击', sourceFaction: 'wolves', sourceAction: 'big_bad_wolf_kill' });
  }
  if (youngerBrotherTarget && !deaths.some((death) => Number(death.id) === Number(youngerBrotherTarget))) {
    deaths.push({ id: youngerBrotherTarget, reason: '狼弟独刀', sourceFaction: 'wolves', sourceAction: 'younger_brother_kill' });
  }
  if (requesterTarget && !deaths.some((death) => Number(death.id) === Number(requesterTarget))) {
    deaths.push({ id: requesterTarget, reason: '祈求者击杀', sourceFaction: 'third_party', sourceAction: 'requester_kill' });
  }
  if (ghostBrideTarget && !deaths.some((death) => Number(death.id) === Number(ghostBrideTarget))) {
    deaths.push({ id: ghostBrideTarget, reason: '鬼魂新娘击杀', sourceFaction: 'third_party', sourceAction: 'ghost_bride_kill' });
  }
  appendEscapeHunterHuntDeath(agents, night, escapeHunterTarget, Number(savedTarget || 0) || null, effects, deaths);
  applyIllusionistSubstitution(agents, night, deaths);
  appendDemonHunterHuntDeath(agents, demonHunterTarget, deaths);
  appendMagicWolfDelayedDeaths(agents, round, deaths);
  appendBlackMerchantFailedDeaths(agents, deaths);
  applyBigTreeSavedWolfHit(agents, wolfTarget, savedTarget);
  applyBigTreeWolfHitProtection(agents, deaths);
  appendDreamerDeaths(agents, night, deaths);
  appendWolfBeautyLinkedDeath(agents, round, deaths, modeConfig);
  appendLoverLinkedDeaths(agents, deaths);
  appendWeakHiddenWolfDeaths(agents, deaths, modeConfig);
  applyWolfSeedInfection(agents, night, deaths);
  appendBigTreeSaplingDeaths(agents, deaths, modeConfig);
  applyBigTreeSkillLoss(agents, deaths);
  const wolfDeath = deaths.find((death) => death.sourceFaction === 'wolves');
  const wolfVictim = wolfDeath
    ? agents.find((agent) => Number(agent.id) === Number(wolfDeath.id))
    : null;
  if (wolfDeath && wolfVictim?.alive && !round.winnerLock?.winner) {
    const afterWolfKill = agents.map((agent) => ({ ...agent }));
    eliminate(afterWolfKill, wolfDeath.id, round.day, wolfDeath.reason);
    const wolfWin = checkWolfVictory(afterWolfKill, round.day, modeConfig);
    if (wolfWin.winner === 'wolves') {
      round.winnerLock = {
        ...wolfWin,
        sourceFaction: 'wolves',
        sourceAction: wolfDeath.sourceAction || 'wolf_kill',
        winCondition: normalizeWinCondition(modeConfig.winCondition),
        triggerRoster: getAliveRosterStats(afterWolfKill),
      };
    }
  }
  night.deaths = deaths;
  for (const death of deaths) eliminate(agents, death.id, round.day, death.reason);
  markWolfBrotherDeaths(agents, round);
  round.nightRevealed = true;
  round.publicSummary = deaths.length
    ? `Night ${round.day} deaths: ${deaths.map((death) => death.id).join(', ')}`
    : `Night ${round.day} ended with no deaths.`;
  return { effects, deaths };
}

function resolveExileEffects(agents: WerewolfAgent[], round: Round, modeConfig: ModeConfig = {}): ExileEffectsResult {
  const votes = round.votes || {};
  round.voteTally = countTargets(votes, round.sheriffId, modeConfig.sheriff?.voteWeight);
  const cursedId = Number(round.crowCursedPlayerId || round.night?.crowCurse?.target || 0);
  if (cursedId) round.voteTally[String(cursedId)] = (round.voteTally[String(cursedId)] || 0) + getCrowVoteBonus(modeConfig);
  const exileId = topExile(round.voteTally);
  const effects: Effect[] = [];
  if (!exileId) return { effects, exile: null };

  const target = agents.find((agent) => Number(agent.id) === Number(exileId));
  if (target && hasRoleAction(target.roleConfig, 'surviveExileOnce') && !target.revealedIdiot && modeConfig.idiot?.surviveExileOnce !== false) {
    target.revealedIdiot = true;
    if (modeConfig.idiot?.losesVoteAfterReveal !== false) target.canVote = false;
    round.idiotReveal = { id: exileId, reason: 'idiot_survive' };
    effects.push({ type: WEREWOLF_EFFECT_TYPES.IDIOT_SURVIVE, target: exileId });
    return { effects, exile: null };
  }

  if (target && isRole(agents, exileId, 'magic_wolf') && isLastLivingWolf(agents, exileId)) {
    target.magicWolfDelayedDeathDay = Number(round.day) + 1;
    target.canVote = false;
    round.exile = { id: exileId, reason: '放逐' };
    effects.push({ type: WEREWOLF_EFFECT_TYPES.EXILE, target: exileId, reason: '放逐' });
    return { effects, exile: round.exile };
  }

  const deaths = [{ id: exileId, reason: '放逐', sourceFaction: 'good', sourceAction: 'day_vote' }];
  appendBigTreeSaplingDeaths(agents, deaths, modeConfig);
  for (const death of deaths) eliminate(agents, death.id, round.day, death.reason);
  round.exile = { id: exileId, reason: '放逐' };
  applyBigTreeSkillLoss(agents, deaths);
  applyWolfBeautyLinkedDeath(agents, round, exileId, effects);
  effects.push({ type: WEREWOLF_EFFECT_TYPES.EXILE, target: exileId, reason: '放逐' });
  applyBombmanBlast(agents, round, exileId, effects);
  return { effects, exile: round.exile };
}

function appendEscapeHunterHuntDeath(
  agents: WerewolfAgent[],
  night: Night,
  targetId: number | null,
  savedTarget: number | null,
  effects: Effect[],
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
): void {
  if (!targetId || Number(targetId) === Number(savedTarget)) return;
  const target = agents.find((agent) => agent.alive && Number(agent.id) === Number(targetId));
  if (!target) return;
  const roleId = String(target.role || target.roleConfig?.id || '');
  if (roleId === 'thick_wolf' && Number(target.thickWolfHuntHits || 0) === 0) {
    target.thickWolfHuntHits = 1;
    night.thickWolfArmorBreak = { targetId: Number(target.id) };
    effects.push({ type: 'thick_wolf_armor', target: Number(target.id), sourceFaction: 'hunters', sourceAction: 'escape_hunter_hunt' });
    return;
  }
  deaths.push({ id: Number(target.id), reason: '猎人夜袭', sourceFaction: 'hunters', sourceAction: 'escape_hunter_hunt' });
}

function applyHunterShot(agents: WerewolfAgent[], round: Round, shot: { from?: number; target?: number; reason?: string }, modeConfig: ModeConfig = {}): Effect | null {
  if (!shot?.from || !shot?.target) return null;
  const hunter = agents.find((agent) => Number(agent.id) === Number(shot.from));
  const gift = hunter?.blackMerchantGift as { action?: string; used?: boolean } | null | undefined;
  const giftedShot = gift?.action === 'shootOnDeath' && !gift.used;
  const spiritWolfShot = hunter?.role === 'spirit_wolf' && hunter.spiritWolfLearnedRole === 'hunter';
  if (!hunter || hunter.hunterShotUsed || (!hasRoleAction(hunter.roleConfig, 'shootOnDeath') && !giftedShot && !spiritWolfShot)) return null;
  if (isDeathShotDisabled(hunter, shot.reason)) return null;
  hunter.hunterShotUsed = true;
  if (giftedShot && gift) gift.used = true;
  if (shot.reason !== 'exile' && Number(round.night?.spiritWolfGuardTarget || 0) === Number(shot.target)) {
    round.hunterShot = { from: shot.from, target: shot.target, reason: shot.reason || 'death' };
    return { type: WEREWOLF_EFFECT_TYPES.HUNTER_SHOT, source: shot.from, target: shot.target, reason: '灵狼庇护' };
  }
  const shotReason = isRole(agents, shot.from, 'wolf_king') ? '狼王带走' : '猎人开枪';
  const sourceAction = isRole(agents, shot.from, 'wolf_king') ? 'wolf_king_shot' : 'hunter_shot';
  if (isRole(agents, shot.target, 'old_rogue')) {
    setOldRoguePendingDeath(agents, round, shot.target, shotReason, sourceAction, true);
    round.hunterShot = { from: shot.from, target: shot.target, reason: shot.reason || 'death' };
    return { type: WEREWOLF_EFFECT_TYPES.HUNTER_SHOT, source: shot.from, target: shot.target };
  }
  const deaths = [{
    id: shot.target,
    reason: shotReason,
    sourceFaction: isRole(agents, shot.from, 'escape_hunter') ? 'hunters' : 'good',
    sourceAction,
  }];
  appendBigTreeSaplingDeaths(agents, deaths, modeConfig);
  for (const death of deaths) eliminate(agents, death.id, round.day, death.reason);
  round.hunterShot = { from: shot.from, target: shot.target, reason: shot.reason || 'death' };
  applyBigTreeSkillLoss(agents, deaths);
  applyWolfBeautyLinkedDeath(agents, round, shot.target, []);
  return { type: WEREWOLF_EFFECT_TYPES.HUNTER_SHOT, source: shot.from, target: shot.target };
}

function appendDreamerDeaths(
  agents: WerewolfAgent[],
  night: Night,
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
): void {
  const targetId = Number(night.dreamerTarget || 0);
  if (!targetId) return;
  if (night.dreamerRepeatedTarget) {
    pushDreamDeath(agents, deaths, targetId, 'dreamer_repeat');
  }
  const dreamer = agents.find((agent) => isRole(agents, agent.id, 'dreamer'));
  if (!dreamer) return;
  const dreamerDies = deaths.some((death) => Number(death.id) === Number(dreamer.id));
  if (dreamerDies) pushDreamDeath(agents, deaths, targetId, 'dreamer_link');
}

function appendLoverLinkedDeaths(
  agents: WerewolfAgent[],
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
): void {
  for (const death of [...deaths]) {
    const dead = agents.find((agent) => Number(agent.id) === Number(death.id));
    const loverId = Number(dead?.loverId || 0);
    if (!loverId || deaths.some((item) => Number(item.id) === loverId)) continue;
    const lover = agents.find((agent) => Number(agent.id) === loverId && agent.alive);
    if (lover) deaths.push({ id: loverId, reason: 'lover_link', sourceFaction: 'third_party', sourceAction: 'lover_link' });
  }
}

function pushDreamDeath(
  agents: WerewolfAgent[],
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
  targetId: number,
  reason: string,
): void {
  const target = agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!target || deaths.some((death) => Number(death.id) === targetId)) return;
  deaths.push({ id: targetId, reason, sourceFaction: 'good', sourceAction: 'dreamer_dream' });
}

function getCrowVoteBonus(modeConfig: ModeConfig = {}): number {
  return modeConfig.id === 'animal-zoo-12' ? 2 : 1;
}

function appendWeakHiddenWolfDeaths(
  agents: WerewolfAgent[],
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
  modeConfig: ModeConfig = {},
): void {
  if (modeConfig.id !== 'bear-tamer-hidden-wolf-12' && modeConfig.id !== 'wolf-seed-hidden-wolf-12') return;
  const projectedAlive = new Set(
    agents
      .filter((agent) => agent.alive !== false)
      .map((agent) => Number(agent.id)),
  );
  for (const death of deaths) projectedAlive.delete(Number(death.id));
  const normalWolfAlive = agents.some((agent) =>
    projectedAlive.has(Number(agent.id)) && isRole(agents, agent.id, 'werewolf')
  );
  if (normalWolfAlive) return;
  for (const hiddenWolf of agents.filter((agent) => projectedAlive.has(Number(agent.id)) && isRole(agents, agent.id, 'hidden_wolf'))) {
    if (!deaths.some((death) => Number(death.id) === Number(hiddenWolf.id))) {
      deaths.push({ id: Number(hiddenWolf.id), reason: '隐狼随狼队出局', sourceFaction: 'wolves', sourceAction: 'hidden_wolf_link' });
    }
  }
}

function applyWolfSeedInfection(
  agents: WerewolfAgent[],
  night: Night,
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
): void {
  const infection = night.wolfSeedInfect as { actorId?: number; targetId?: number; used?: boolean; success?: boolean } | null | undefined;
  if (!infection?.used || !infection.targetId || Number(infection.targetId) !== Number(night.wolfTarget)) return;
  const deathIndex = deaths.findIndex((death) => Number(death.id) === Number(infection.targetId) && death.sourceAction === 'wolf_kill');
  if (deathIndex < 0) {
    infection.success = false;
    return;
  }
  const target = agents.find((agent) => Number(agent.id) === Number(infection.targetId) && agent.alive);
  if (!target) {
    infection.success = false;
    return;
  }
  deaths.splice(deathIndex, 1);
  target.faction = 'wolves';
  target.wolfSeedInfected = true;
  target.roleConfig = {
    ...(target.roleConfig || {}),
    roleType: 'wolf',
    rule: { actions: [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }] },
  };
  infection.success = true;
}

function appendBigTreeSaplingDeaths(
  agents: WerewolfAgent[],
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
  modeConfig: ModeConfig = {},
): void {
  if (modeConfig.id !== 'firepower-12') return;
  const saplings = agents.filter((agent) => isRole(agents, agent.id, 'sapling'));
  if (!saplings.length) return;
  const projectedAlive = new Set(
    agents
      .filter((agent) => agent.alive !== false)
      .map((agent) => Number(agent.id)),
  );
  for (const death of deaths) projectedAlive.delete(Number(death.id));
  const hasAliveSapling = agents.some((agent) =>
    projectedAlive.has(Number(agent.id)) && isRole(agents, agent.id, 'sapling')
  );
  if (hasAliveSapling) return;
  for (const tree of agents.filter((agent) => projectedAlive.has(Number(agent.id)) && isRole(agents, agent.id, 'big_tree'))) {
    if (!deaths.some((death) => Number(death.id) === Number(tree.id))) {
      deaths.push({ id: Number(tree.id), reason: '树苗全灭', sourceFaction: 'good', sourceAction: 'sapling_link' });
    }
  }
}

function appendDemonHunterHuntDeath(
  agents: WerewolfAgent[],
  targetId: number | null,
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
): void {
  if (!targetId) return;
  const target = agents.find((agent) => Number(agent.id) === Number(targetId) && agent.alive);
  const hunter = agents.find((agent) => agent.alive && isRole(agents, agent.id, 'demon_hunter'));
  if (!target || !hunter) return;
  const deadId = target.faction === 'wolves' ? Number(target.id) : Number(hunter.id);
  if (!deaths.some((death) => Number(death.id) === deadId)) {
    deaths.push({ id: deadId, reason: '猎魔人狩猎', sourceFaction: 'good', sourceAction: 'demon_hunter_hunt' });
  }
}

function applyIllusionistSubstitution(
  agents: WerewolfAgent[],
  night: Night,
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
): void {
  const targetId = Number(night.illusionTarget || 0);
  if (!targetId) return;
  const substitute = agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (!substitute) return;
  const index = deaths.findIndex((death) =>
    (death.sourceAction === 'wolf_kill' || death.sourceAction === 'witch_poison')
    && isRole(agents, death.id, 'illusionist')
  );
  if (index < 0 || Number(deaths[index].id) === targetId) return;
  deaths[index] = { ...deaths[index], id: targetId, reason: '幻象代死', sourceAction: 'illusion_substitute' };
}

function appendMagicWolfDelayedDeaths(
  agents: WerewolfAgent[],
  round: Round,
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
): void {
  for (const wolf of agents.filter((agent) => agent.alive && isRole(agents, agent.id, 'magic_wolf'))) {
    if (!wolf.magicWolfDelayedDeathDay || Number(wolf.magicWolfDelayedDeathDay) > Number(round.day)) continue;
    if (!deaths.some((death) => Number(death.id) === Number(wolf.id))) {
      deaths.push({ id: Number(wolf.id), reason: '魔狼血脉耗尽', sourceFaction: 'good', sourceAction: 'magic_wolf_delayed_death' });
    }
  }
}

function isLastLivingWolf(agents: WerewolfAgent[], excludedId: number): boolean {
  return !agents.some((agent) => agent.alive && Number(agent.id) !== Number(excludedId) && agent.faction === 'wolves');
}

function isDeathShotDisabled(agent: WerewolfAgent, reason?: string): boolean {
  const rule = agent.roleConfig?.rule as { actions?: Array<{ action?: string; disabledDeathReasons?: string[] }> } | undefined;
  const actions = rule?.actions;
  const shotAction = Array.isArray(actions)
    ? actions.find((action) => action?.action === 'shootOnDeath')
    : null;
  const disabled = Array.isArray(shotAction?.disabledDeathReasons)
    ? shotAction.disabledDeathReasons.map((item) => String(item))
    : [];
  const deathReason = String(reason || agent.deathReason || '');
  return deathReason === 'bombman_blast' || Boolean(deathReason && disabled.includes(deathReason));
}

function applyBombmanBlast(agents: WerewolfAgent[], round: Round, exileId: number, effects: Effect[]): void {
  if (!isRole(agents, exileId, 'bombman')) return;
  const targetIds = Object.entries(round.votes || {})
    .filter(([, target]) => Number(target) === Number(exileId))
    .map(([voterId]) => Number(voterId))
    .filter((id) => id > 0 && id !== Number(exileId) && agents.some((agent) => Number(agent.id) === id && agent.alive));
  for (const targetId of targetIds) {
    eliminate(agents, targetId, round.day, 'bombman_blast');
    effects.push({ type: 'bombman_blast', source: exileId, target: targetId, reason: '炸弹人爆炸' });
  }
  if (targetIds.length) round.bombmanBlast = { actorId: Number(exileId), targetIds };
}

function appendBlackMerchantFailedDeaths(
  agents: WerewolfAgent[],
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
): void {
  for (const agent of agents) {
    if (!agent.alive || !agent.blackMerchantDeathPending) continue;
    if (deaths.some((death) => Number(death.id) === Number(agent.id))) continue;
    deaths.push({ id: Number(agent.id), reason: '黑商赠狼反噬', sourceFaction: 'wolves', sourceAction: 'black_merchant_gift' });
  }
}

function applyBigTreeSavedWolfHit(agents: WerewolfAgent[], wolfTarget: number | null, savedTarget: number | null): void {
  if (!wolfTarget || Number(wolfTarget) !== Number(savedTarget)) return;
  const tree = agents.find((agent) => Number(agent.id) === Number(wolfTarget) && isRole(agents, agent.id, 'big_tree'));
  if (!tree || !tree.alive || Number(tree.bigTreeWolfHits || 0) > 0) return;
  tree.bigTreeWolfHits = 1;
}

function applyBigTreeWolfHitProtection(
  agents: WerewolfAgent[],
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
): void {
  for (let index = deaths.length - 1; index >= 0; index -= 1) {
    const death = deaths[index];
    if (death.sourceFaction !== 'wolves') continue;
    const tree = agents.find((agent) => Number(agent.id) === Number(death.id) && isRole(agents, agent.id, 'big_tree'));
    if (!tree || !tree.alive) continue;
    tree.bigTreeWolfHits = Number(tree.bigTreeWolfHits || 0) + 1;
    if (Number(tree.bigTreeWolfHits) < 2) deaths.splice(index, 1);
  }
}

function applyBigTreeSkillLoss(
  agents: WerewolfAgent[],
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
): void {
  const treeDeath = deaths.find((death) => {
    if (death.sourceFaction === 'wolves' || death.sourceAction === 'white_wolf_king_self_destruct') return false;
    return isRole(agents, death.id, 'big_tree');
  });
  if (!treeDeath) return;
  for (const agent of agents) {
    if (agent.faction === 'good' && String(agent.roleConfig?.roleType || '').toLowerCase() === 'god') {
      agent.godSkillsDisabled = true;
    }
  }
}

function markWolfBrotherDeaths(agents: WerewolfAgent[], round: Round): void {
  const elder = agents.find((agent) => isRole(agents, agent.id, 'wolf_elder_brother'));
  if (!elder || elder.alive || !elder.deathDay) return;
  for (const younger of agents.filter((agent) => isRole(agents, agent.id, 'wolf_younger_brother'))) {
    if (!younger.wolfElderBrotherDeathDay) younger.wolfElderBrotherDeathDay = Number(elder.deathDay || round.day);
  }
}

function isRole(agents: WerewolfAgent[], id: unknown, roleId: string): boolean {
  const agent = agents.find((item) => Number(item.id) === Number(id));
  return String(agent?.role || agent?.roleConfig?.id || '').toLowerCase() === roleId;
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

function appendWolfBeautyLinkedDeath(
  agents: WerewolfAgent[],
  round: Round,
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
  modeConfig: ModeConfig = {},
): void {
  const wolfBeautyDeath = deaths.find((death) => isRole(agents, death.id, 'wolf_beauty'));
  const targetId = Number(round.night?.wolfBeautyTarget || 0);
  if (!wolfBeautyDeath || !targetId || deaths.some((death) => Number(death.id) === targetId)) return;
  if (modeConfig.id === 'wolf-beauty-rogue-12' && wolfBeautyDeath.sourceAction === 'witch_poison') return;
  const target = agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (target && isRole(agents, targetId, 'old_rogue')) return;
  if (target) deaths.push({ id: targetId, reason: '狼美人殉情', sourceFaction: 'wolves', sourceAction: 'wolf_beauty_charm' });
}

function applyWolfBeautyLinkedDeath(agents: WerewolfAgent[], round: Round, deadId: number, effects: Effect[]): void {
  if (!isRole(agents, deadId, 'wolf_beauty')) return;
  const targetId = Number(round.night?.wolfBeautyTarget || 0);
  const target = agents.find((agent) => Number(agent.id) === targetId && agent.alive);
  if (target && isRole(agents, targetId, 'old_rogue')) return;
  if (!target) return;
  eliminate(agents, targetId, round.day, '狼美人殉情');
  effects.push({ type: WEREWOLF_EFFECT_TYPES.KILL, target: targetId, reason: '狼美人殉情', sourceFaction: 'wolves', sourceAction: 'wolf_beauty_charm' });
}

function triggerEvilKnight(
  agents: WerewolfAgent[],
  round: Round,
  evilKnightId: number,
  trigger: string,
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
): void {
  const evilKnight = agents.find((agent) => Number(agent.id) === Number(evilKnightId));
  if (!evilKnight || evilKnight.evilKnightTriggered || round.evilKnightTrigger) return;
  const targetRole = trigger === 'witch_poison' ? 'witch' : 'seer';
  const target = agents.find((agent) => agent.alive && isRole(agents, agent.id, targetRole));
  if (!target || deaths.some((death) => Number(death.id) === Number(target.id))) return;
  evilKnight.evilKnightTriggered = true;
  round.evilKnightTrigger = {
    actorId: Number(evilKnight.id),
    trigger,
    targetId: Number(target.id),
  };
  deaths.push({ id: Number(target.id), reason: '恶灵骑士反伤', sourceFaction: 'wolves', sourceAction: 'evil_knight_reflect' });
}

function setOldRoguePendingDeath(
  agents: WerewolfAgent[],
  round: Round,
  id: number,
  reason: string,
  sourceAction: string,
  announced: boolean,
): void {
  const oldRogue = agents.find((agent) => Number(agent.id) === Number(id) && agent.alive);
  if (!oldRogue || !isRole(agents, id, 'old_rogue') || oldRogue.oldRoguePendingDeath) return;
  oldRogue.oldRoguePendingDeath = {
    reason,
    sourceAction,
    resolveDay: Number(round.day) + 1,
    announced,
  };
}

export {
  resolveNightEffects,
  resolveExileEffects,
  applyHunterShot
};
