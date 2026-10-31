import type { ActDecision, ComputeOutcome, Seat, SeatQuery, VoteOutcome } from '@battle/engine';
import { withinMark } from '../special/fortuneTeller';
import { swapTarget } from '../special/magician';
import { shieldedTonight } from '../special/spiritWolfSkills';
import { emptyNight, type WerewolfState } from '../state';
import { SEER_NO_RESULT, type SeerResult } from '../stateFinal';
import { checksAsWolf } from './appearance';
import { boardConfig, roleTraits } from './board';
import { isWolf, seededRotation, type WerewolfContext } from './context';

export function resetNight(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  return {
    state: {
      ...ctx.state,
      night: emptyNight(),
      pendingDeaths: [],
      speechStart: null,
      silencedToday: null,
    },
  };
}

export function aliveWolves(ctx: WerewolfContext): SeatQuery {
  return ctx.seats.alive().inTeam('werewolf');
}

/** 狼人夜聊：种子决定的狼人先发言，之后按座位号顺时针 */
export function wolfChatOrder(ctx: WerewolfContext): number[] {
  return seededRotation(ctx, aliveWolves(ctx).ids(), 'wolf-chat');
}

/** 狼人只能击杀存活的非狼人玩家（不能自刀；狼队不认识的隐狼可以被选中），有占卜师标记时只能在标记范围内 */
export function wolfKillTargets(ctx: WerewolfContext): SeatQuery {
  return ctx.seats.alive().where((seat) => !(isWolf(seat) && !roleTraits(seat).hiddenFromPack) && withinMark(ctx, seat.seat));
}

export function recordWolfKill(ctx: WerewolfContext, outcome: VoteOutcome): WerewolfState {
  const wolfTarget = outcome.kind === 'selected' ? outcome.seat : null;
  return { ...ctx.state, night: { ...ctx.state.night, wolfTarget } };
}

/**
 * 查验结果：魔术师当晚交换了号码时得到换过去的那名玩家的身份；隐狼等被视为好人（见 rules/appearance.ts）；
 * 当晚被灵狼庇护的玩家查验不出结果。
 */
export function seerVerdict(ctx: WerewolfContext, target: number): SeerResult {
  const actual = swapTarget(ctx, target);
  if (shieldedTonight(ctx, actual)) return SEER_NO_RESULT;
  return checksAsWolf(ctx, ctx.seats.get(actual)) ? '狼人' : '好人';
}

export function describeSeerCheck(ctx: WerewolfContext, _seat: Seat, targets: readonly number[]): string {
  const [target] = targets;
  if (target === undefined) return '没有查验';
  return `查验 ${target}号：${seerVerdict(ctx, target)}`;
}

export function recordSeerCheck(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const seerChecks = { ...ctx.state.seerChecks };
  for (const { seat, targets } of decisions) {
    const [target] = targets;
    if (target === undefined) continue;
    const result = seerVerdict(ctx, target);
    seerChecks[String(seat)] = [...(seerChecks[String(seat)] ?? []), { night: ctx.round, target, result }];
  }
  return { ...ctx.state, seerChecks };
}

/** 女巫只有在解药未用、当晚有狼刀目标时才会被告知刀口并可以救人 */
export function witchSaveTargets(ctx: WerewolfContext, witch: Seat): number[] {
  const victim = ctx.state.night.wolfTarget;
  if (!ctx.state.potions.antidote || victim === null) return [];
  if (victim === witch.seat) {
    const rule = boardConfig(ctx).witchSelfSave;
    const allowed = rule === 'always' || (rule === 'first_night_only' && ctx.round === 1);
    if (!allowed) return [];
  }
  return [victim];
}

export function applyWitchSave(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const saved = decisions.some((decision) => decision.targets.length > 0);
  if (!saved) return ctx.state;
  return { ...ctx.state, night: { ...ctx.state.night, saved: true }, potions: { ...ctx.state.potions, antidote: false } };
}

/** 同一晚只能用一瓶药：当晚已救人则不能再毒 */
export function witchPoisonTargets(ctx: WerewolfContext, witch: Seat): number[] {
  if (!ctx.state.potions.poison || ctx.state.night.saved) return [];
  return ctx.seats.alive().except(witch).ids();
}

export function applyWitchPoison(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const poisoned = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  if (poisoned === null) return ctx.state;
  return { ...ctx.state, night: { ...ctx.state.night, poisoned }, potions: { ...ctx.state.potions, poison: false } };
}
