import { WEREWOLF_EFFECT_TYPES } from '@ai-presenter/shared/types/workflowTypes';
import { eliminate, countTargets, topExile } from './winCheck';
import type { WerewolfAgent } from './winCheck';
import { hasRoleAction } from './utils';

interface Night {
  wolfTarget?: number | null;
  guardTarget?: number | null;
  witchSave?: boolean;
  witchSaveTarget?: number | null;
  witchPoisonTarget?: number | null;
  deaths?: Array<{ id: number; reason: string }>;
  [key: string]: unknown;
}

interface Round {
  day: number;
  night: Night;
  nightRevealed?: boolean;
  publicSummary?: string;
  votes?: Record<string, number>;
  voteTally?: Record<string, number>;
  sheriffId?: number | null;
  exile?: { id: number; reason: string } | null;
  idiotReveal?: { id: number; reason: string } | null;
  hunterShot?: { from: number; target: number; reason?: string } | null;
  [key: string]: unknown;
}

interface ModeConfig {
  sheriff?: { voteWeight?: number };
  idiot?: { surviveExileOnce?: boolean; losesVoteAfterReveal?: boolean };
  [key: string]: unknown;
}

interface Effect {
  type: string;
  target?: number;
  reason?: string;
  source?: number;
}

interface NightEffectsResult {
  effects: Effect[];
  deaths: Array<{ id: number; reason: string }>;
}

interface ExileEffectsResult {
  effects: Effect[];
  exile: { id: number; reason: string } | null;
}

function resolveNightEffects(agents: WerewolfAgent[], round: Round): NightEffectsResult {
  const effects: Effect[] = [];
  const night = round.night || {};
  if (night.wolfTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.KILL, target: night.wolfTarget, reason: 'wolf_kill' });
  if (night.guardTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.PROTECT, target: night.guardTarget });
  if (night.witchSave && night.witchSaveTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.SAVE, target: night.witchSaveTarget });
  if (night.witchPoisonTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.POISON, target: night.witchPoisonTarget, reason: 'witch_poison' });

  const protectedTarget = night.guardTarget;
  const savedTarget = night.witchSave ? night.witchSaveTarget : null;
  const deaths: Array<{ id: number; reason: string }> = [];
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

function resolveExileEffects(agents: WerewolfAgent[], round: Round, modeConfig: ModeConfig = {}): ExileEffectsResult {
  const votes = round.votes || {};
  round.voteTally = countTargets(votes, round.sheriffId, modeConfig.sheriff?.voteWeight);
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

  eliminate(agents, exileId, round.day, 'exile');
  round.exile = { id: exileId, reason: 'exile' };
  effects.push({ type: WEREWOLF_EFFECT_TYPES.EXILE, target: exileId, reason: 'exile' });
  return { effects, exile: round.exile };
}

function applyHunterShot(agents: WerewolfAgent[], round: Round, shot: { from?: number; target?: number; reason?: string }): Effect | null {
  if (!shot?.from || !shot?.target) return null;
  const hunter = agents.find((agent) => Number(agent.id) === Number(shot.from));
  if (!hunter || hunter.hunterShotUsed || !hasRoleAction(hunter.roleConfig, 'shootOnDeath')) return null;
  hunter.hunterShotUsed = true;
  eliminate(agents, shot.target, round.day, 'hunter_shot');
  round.hunterShot = { from: shot.from, target: shot.target, reason: shot.reason || 'death' };
  return { type: WEREWOLF_EFFECT_TYPES.HUNTER_SHOT, source: shot.from, target: shot.target };
}

export {
  resolveNightEffects,
  resolveExileEffects,
  applyHunterShot
};
