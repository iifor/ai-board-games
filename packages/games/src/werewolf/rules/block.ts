import type { ComputeOutcome, LogDraft, SeatQuery } from '@battle/engine';
import type { WerewolfState } from '../state';
import { isWolf, type WerewolfContext } from './context';

// 夜间技能封锁：花蝴蝶抱住的人当晚夜间技能失效；被封锁的是狼人时整个狼队当晚不能击杀。

interface BlockSource {
  readonly seat: number | null;
  /** 播报用的动作描述，如"被花蝴蝶抱住" */
  readonly by: string;
}

function blockSources(ctx: WerewolfContext): BlockSource[] {
  return [{ seat: ctx.state.night.hugged, by: '被花蝴蝶抱住' }];
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

/** 今晚能使用夜间技能的该角色玩家：存活且没有被封锁 */
export function nightActors(ctx: WerewolfContext, role: string): SeatQuery {
  return ctx.seats.alive().withRole(role).where((seat) => !isBlocked(ctx, seat.seat));
}

/** 私下告知被封锁的人；封锁到狼人时告知狼队（不说是谁） */
export function announceBlocks(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const log = blockSources(ctx).flatMap(({ seat, by }): LogDraft[] => {
    if (seat === null) return [];
    if (isWolf(ctx.seats.get(seat))) return [{ kind: 'narration', text: `今晚有狼人${by}，狼队今晚不能击杀。`, channel: 'team:werewolf' }];
    return [{ kind: 'narration', text: `你今晚${by}，今晚的夜间技能失效。`, channel: `private:${seat}` }];
  });
  return { log };
}
