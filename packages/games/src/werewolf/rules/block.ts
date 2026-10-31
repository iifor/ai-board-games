import type { ComputeOutcome, LogDraft, SeatQuery } from '@battle/engine';
import type { WerewolfState } from '../state';
import { isWolf, type WerewolfContext } from './context';

// 夜间技能封锁：花蝴蝶抱住、梦魇恐惧的人当晚夜间技能失效；被封锁的是狼人时整个狼队当晚不能击杀。

interface BlockSource {
  readonly seat: number | null;
  /** 播报用的动作描述，如"被花蝴蝶抱住" */
  readonly by: string;
  /** 被封锁的猎人当晚被狼刀时也不能开枪 */
  readonly disablesShot: boolean;
}

function blockSources(ctx: WerewolfContext): BlockSource[] {
  const { hugged, feared } = ctx.state.night;
  return [
    { seat: hugged, by: '被花蝴蝶抱住', disablesShot: false },
    { seat: feared, by: '被梦魇恐惧', disablesShot: true },
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
  return blockedSeats(ctx).some((seat) => isWolf(ctx.seats.get(seat)));
}

/** 该座位今晚被狼刀出局时不能开枪（被梦魇恐惧）；天亮出局时仍读取当晚的记录 */
export function shotBlockedTonight(ctx: WerewolfContext, seat: number): boolean {
  return blockSources(ctx).some((source) => source.disablesShot && source.seat === seat);
}

/** 今晚能使用夜间技能的该角色玩家：存活且没有被封锁 */
export function nightActors(ctx: WerewolfContext, role: string): SeatQuery {
  return ctx.seats.alive().withRole(role).where((seat) => !isBlocked(ctx, seat.seat));
}

function notice(ctx: WerewolfContext, { seat, by, disablesShot }: BlockSource): LogDraft[] {
  if (seat === null) return [];
  const target = ctx.seats.get(seat);
  if (isWolf(target)) return [{ kind: 'narration', text: `今晚有狼人${by}，狼队今晚不能击杀。`, channel: 'team:werewolf' }];
  const text = disablesShot && target.role === 'hunter'
    ? `你今晚${by}：今晚若被狼人击杀，你将不能开枪。`
    : `你今晚${by}，今晚的夜间技能失效。`;
  return [{ kind: 'narration', text, channel: `private:${seat}` }];
}

/** 私下告知被封锁的人；封锁到狼人时告知狼队（不说是谁） */
export function announceBlocks(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  return { log: blockSources(ctx).flatMap((source) => notice(ctx, source)) };
}
