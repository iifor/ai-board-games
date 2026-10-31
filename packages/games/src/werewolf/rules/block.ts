import type { ComputeOutcome, LogDraft, Seat, SeatQuery } from '@battle/engine';
import type { WerewolfState } from '../state';
import { roleCategory } from './board';
import { isPackWolf, type WerewolfContext } from './context';

// 夜间技能封锁：花蝴蝶抱住、梦魇恐惧、企鹅冰冻的人当晚夜间技能失效；被封锁的是狼人时整个狼队当晚不能击杀。
// 另有永久失效：大树因狼刀以外的原因出局后，其余神职失去技能（state.godsDisabled）；
// 以及魔狼自爆后的那一晚，所有神职的夜间技能被封印（state.godsSealedNight）；被狼巫诅咒的人直到下一个夜晚到来之前不能发动任何技能。

interface BlockSource {
  readonly seat: number | null;
  /** 播报用的动作描述，如"被花蝴蝶抱住" */
  readonly by: string;
  /** 被封锁的猎人当晚被狼刀时也不能开枪 */
  readonly disablesShot: boolean;
}

function blockSources(ctx: WerewolfContext): BlockSource[] {
  const { hugged, feared, frozen } = ctx.state.night;
  return [
    { seat: hugged, by: '被花蝴蝶抱住', disablesShot: false },
    { seat: feared, by: '被梦魇恐惧', disablesShot: true },
    { seat: frozen, by: '被企鹅冰冻', disablesShot: false },
  ];
}

/** 今晚夜间技能失效的座位 */
export function blockedSeats(ctx: WerewolfContext): number[] {
  return blockSources(ctx).flatMap(({ seat }) => (seat === null ? [] : [seat]));
}

export function isBlocked(ctx: WerewolfContext, seat: number): boolean {
  return blockedSeats(ctx).includes(seat);
}

/** 封锁到狼人时整个狼队当晚不能击杀（也不夜聊） */
export function wolvesBlocked(ctx: WerewolfContext): boolean {
  return blockedSeats(ctx).some((seat) => isPackWolf(ctx.seats.get(seat)));
}

/** 该座位今晚被狼刀出局时不能开枪（被梦魇恐惧）；天亮出局时仍读取当晚的记录 */
export function shotBlockedTonight(ctx: WerewolfContext, seat: number): boolean {
  return blockSources(ctx).some((source) => source.disablesShot && source.seat === seat);
}

/**
 * 该座位现在不能发动任何技能（夜间技能、开枪、白痴翻牌、额外技能等）：大树倒下后的神职；
 * 被狼巫诅咒的人（state.night.hexed 在被诅咒的那一晚与次日白天保留，下一晚入夜时清空）。
 */
export function skillsLost(ctx: WerewolfContext, seat: Seat): boolean {
  return (ctx.state.godsDisabled && roleCategory(ctx, seat) === 'god') || ctx.state.night.hexed === seat.seat;
}

/** 魔狼自爆后的那一晚：神职的夜间技能被封印（只影响夜间技能） */
function sealedTonight(ctx: WerewolfContext, seat: Seat): boolean {
  return ctx.state.godsSealedNight === ctx.round && roleCategory(ctx, seat) === 'god';
}

/** 该座位今晚能否使用夜间技能：存活、没有被封锁或封印、没有失去技能 */
export function canUseNightSkill(ctx: WerewolfContext, seat: Seat): boolean {
  return seat.alive && !isBlocked(ctx, seat.seat) && !sealedTonight(ctx, seat) && !skillsLost(ctx, seat);
}

/** 今晚能使用夜间技能的该角色玩家 */
export function nightActors(ctx: WerewolfContext, role: string): SeatQuery {
  return ctx.seats.alive().withRole(role).where((seat) => canUseNightSkill(ctx, seat));
}

function notice(ctx: WerewolfContext, { seat, by, disablesShot }: BlockSource): LogDraft[] {
  if (seat === null) return [];
  const target = ctx.seats.get(seat);
  if (isPackWolf(target)) return [{ kind: 'narration', text: `今晚有狼人${by}，狼队今晚不能击杀。`, channel: 'team:werewolf' }];
  const text = disablesShot && target.role === 'hunter'
    ? `你今晚${by}：今晚若被狼人击杀，你将不能开枪。`
    : `你今晚${by}，今晚的夜间技能失效。`;
  return [{ kind: 'narration', text, channel: `private:${seat}` }];
}

/** 私下告知被封锁的人；封锁到狼人时告知狼队（不说是谁） */
export function announceBlocks(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  return { log: blockSources(ctx).flatMap((source) => notice(ctx, source)) };
}
