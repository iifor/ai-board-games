import { definePrompts, type ActDecision, type Seat } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import type { WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';

// 混血儿：好人阵营、算作村民；首夜第一个睁眼选择一名主人（双方都不知道对方身份），胜负跟随主人的阵营。

export const hybridPrompts = definePrompts({
  hybrid: [
    '你是{{me.label}}，身份是混血儿（算作村民）。',
    '{{#if state.hybridMaster}}你的主人是 {{state.hybridMaster}}号，你不知道他的身份。{{else}}首夜你要选择一名主人。{{/if}}',
    '你的胜负跟随主人：主人是好人则你与好人一起胜利，主人是狼人则你与狼人一起胜利，请据此推理并行动。',
  ].join(''),
  hybridChoose: '混血儿请睁眼，选择一名玩家作为你的主人。你不会得知他的身份，之后你的胜负跟随他所在的阵营。',
});

function applyMaster(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const master = decisions.flatMap((decision) => decision.targets)[0];
  return master === undefined ? ctx.state : { ...ctx.state, hybridMaster: master };
}

export const hybridPhases = {
  hybrid_choose: {
    kind: 'act',
    title: '混血儿选主人',
    action: '选择主人',
    enabled: (ctx) => ctx.round === 1 && hasRole(ctx, 'hybrid'),
    actors: (ctx) => ctx.seats.alive().withRole('hybrid'),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    prompt: hybridPrompts.hybridChoose,
    describe: (_ctx, _seat, targets) => `选择 ${targets[0]}号 作为主人`,
    apply: applyMaster,
    next: nightAfter('hybrid_choose'),
  },
} satisfies WerewolfPhases;

/** 混血儿最终所属的阵营：跟随主人；没有主人时算好人 */
export function hybridSide(ctx: WerewolfContext, seat: Seat): string {
  const master = ctx.state.hybridMaster;
  return master === null ? seat.team : ctx.seats.get(master).team;
}

/** 终局说明中的混血儿结果；本局没有混血儿时为 null */
export function hybridSummary(ctx: WerewolfContext, winner: string): string | null {
  const hybrid = ctx.seats.withRole('hybrid').list()[0];
  if (!hybrid) return null;
  const master = ctx.state.hybridMaster;
  const side = hybridSide(ctx, hybrid);
  const result = side === winner ? '随之胜利' : '随之落败';
  const owner = master === null ? '没有主人' : `主人是 ${master}号（${side === 'werewolf' ? '狼人阵营' : '好人阵营'}）`;
  return `混血儿 ${hybrid.seat}号${owner}，${result}`;
}
