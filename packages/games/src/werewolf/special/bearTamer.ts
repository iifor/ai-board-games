import { definePrompts, type ComputeOutcome } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { checksAsWolf } from '../rules/appearance';
import { hasRole } from '../rules/board';
import { ring, type WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import type { DawnStep } from '../rules/types';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 驯熊师：每晚入夜前判定一次熊的咆哮状态——驯熊师左右相邻的两名存活玩家中有狼人（查验视为好人的隐狼除外）则咆哮；
// 次日天亮与死讯一起公布。驯熊师已出局（包括当晚死亡）时熊不咆哮。

const bearTamerPrompts = definePrompts({
  bearTamer: '你是{{me.label}}，身份是驯熊师。每天天亮公布死讯时，法官会同时公布熊是否咆哮：入夜前你左右相邻的两名存活玩家中有狼人时，次日天亮熊会咆哮（你出局后熊不再咆哮）。',
});

/** 驯熊师左右两侧最近的存活玩家 */
function neighbors(ctx: WerewolfContext, tamer: number): number[] {
  const sides = [ring(ctx, tamer, 1), ring(ctx, tamer, -1)].map((order) => order.find((seat) => seat !== tamer));
  return [...new Set(sides.filter((seat): seat is number => seat !== undefined))];
}

function roars(ctx: WerewolfContext): boolean {
  const tamer = ctx.seats.alive().withRole('bear_tamer').ids()[0];
  if (tamer === undefined) return false;
  return neighbors(ctx, tamer).some((seat) => checksAsWolf(ctx, ctx.seats.get(seat)));
}

function watch(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  return { state: { ...ctx.state, bearRoars: roars(ctx) } };
}

/** 天亮时与死讯一起公布熊的咆哮状态 */
const bearRoarNote: DawnStep = (ctx, draft) => {
  const tamer = ctx.seats.withRole('bear_tamer').list()[0];
  if (!tamer) return draft;
  const tamerAlive = tamer.alive && !draft.deaths.some((death) => death.seat === tamer.seat);
  return { ...draft, notes: [...draft.notes, tamerAlive && ctx.state.bearRoars ? '熊咆哮了。' : '熊没有咆哮。'] };
};

const bearTamerPhases = {
  bear_watch: {
    kind: 'compute',
    enabled: (ctx) => hasRole(ctx, 'bear_tamer'),
    run: watch,
    next: nightAfter('bear_watch'),
  },
} satisfies WerewolfPhases;

export const bearTamerSpecial: SpecialDescriptor = {
  key: 'bearTamer',
  prompts: bearTamerPrompts,
  identities: { bear_tamer: bearTamerPrompts.bearTamer },
  phases: bearTamerPhases,
  dawnStep: bearRoarNote,
};
