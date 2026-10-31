import { definePrompts, findResult, type ComputeOutcome, type TriggerSpec } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { roleCategory } from '../rules/board';
import { isWolf, type WerewolfContext } from '../rules/context';
import { BOMBED, triggerSeat } from '../rules/death';
import type { WerewolfParams, WerewolfState } from '../state';

// 炸弹人：神职。被放逐出局时可以翻牌引爆，炸死所有投票放逐他的玩家（以放逐投票的最后一轮选票为准），
// 被炸死者不能发动技能（猎人不能开枪，见 NO_SHOT_CAUSES）、没有遗言。
// 若这次引爆同时炸死了场上所有狼人和所有村民（或所有狼人和所有神职），炸弹人单独获胜（state.bombmanWin）。
// 是否引爆只记在炸弹人私密频道；引爆时才公开翻牌。

export const bombmanPrompts = definePrompts({
  bombman: '你是{{me.label}}，身份是炸弹人（神职）。被放逐出局时你可以翻牌引爆，炸死所有投票放逐你的玩家；若同时炸死了场上所有狼人和所有村民（或所有狼人和所有神职），你单独获胜。',
  bombmanBlast: '你被放逐出局。是否翻牌引爆，炸死所有投票放逐你的玩家（见上方放逐投票记录）？选择你自己表示引爆，输出空数组表示不引爆。',
});

/** 投票放逐炸弹人且仍存活的玩家 */
function voters(ctx: WerewolfContext, bombman: number): number[] {
  const vote = findResult(ctx.results, 'exile_vote', 'vote');
  const seats = (vote?.ballots ?? []).filter((ballot) => ballot.target === bombman).map((ballot) => ballot.voter);
  return [...new Set(seats)].filter((seat) => ctx.seats.get(seat).alive).sort((a, b) => a - b);
}

/** 引爆后场上是否不再有狼人，且村民或神职也被炸光 */
function wipesOut(ctx: WerewolfContext, victims: readonly number[]): boolean {
  const survivors = ctx.seats.alive().except(...victims).list();
  if (survivors.some(isWolf)) return false;
  const count = (category: string) => survivors.filter((seat) => !isWolf(seat) && roleCategory(ctx, seat) === category).length;
  return count('villager') === 0 || count('god') === 0;
}

function resolveBlast(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const bombman = ctx.trigger?.seat;
  const decision = findResult(ctx.results, 'bombman_blast', 'act')?.decisions.find((item) => item.targets.length > 0);
  if (bombman === undefined || !decision) return {};
  const victims = voters(ctx, bombman);
  const list = victims.map((seat) => `${seat}号`).join('、');
  return {
    state: { ...ctx.state, bombmanWin: wipesOut(ctx, victims) },
    log: [{ kind: 'revealed', text: `${bombman}号翻牌为炸弹人并引爆，炸死了投票放逐他的 ${list}。`, data: { seat: bombman, role: 'bombman' } }],
    eliminate: victims.map((seat) => ({ seat, reason: '被炸弹人炸死', cause: BOMBED })),
  };
}

export const bombmanPhases = {
  bombman_blast: {
    kind: 'act',
    action: '引爆',
    actors: triggerSeat,
    targets: (_ctx, seat) => [seat],
    allowNone: true,
    prompt: bombmanPrompts.bombmanBlast,
    describe: (_ctx, _seat, targets) => (targets.length ? '决定引爆' : '决定不引爆'),
    next: 'bombman_resolve',
  },
  bombman_resolve: { kind: 'compute', run: resolveBlast, next: 'return' },
} satisfies WerewolfPhases;

export const bombmanTriggers: readonly TriggerSpec<WerewolfState, WerewolfParams>[] = [
  {
    id: 'bombman-blast',
    on: 'seat_eliminated',
    when: (ctx, event) => event.kind === 'seat_eliminated' && event.cause === 'exile'
      && ctx.seats.get(event.seat).role === 'bombman' && voters(ctx, event.seat).length > 0,
    push: 'bombman_blast',
  },
];
