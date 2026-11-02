import { definePrompts, type ActDecision } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { checksAsWolf } from '../rules/appearance';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import { adjacentSeats, type WerewolfContext } from '../rules/context';
import { swapTarget } from '../rules/nightEffects';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 狐狸：神职，每晚选择一名存活玩家，查验他与左右相邻号码（三个相连号码，按座位号环绕）中的存活玩家里有没有狼人
// （查验视为好人的狼除外）。有狼人则下一晚可以继续查验；三人都是好人则永远失去查验能力。查验记录只记在狐狸私密频道。

export const foxPrompts = definePrompts({
  fox: [
    '你是{{me.label}}，身份是狐狸（神职）。每晚你可以选择一名玩家，查验他与左右相邻号码（三个相连号码中的存活玩家）里有没有狼人；',
    '有狼人时你下一晚可以继续查验，都是好人时你永远失去查验能力。',
    '{{#if state.foxChecks}}你的查验记录：{{#each state.foxChecks}}第{{this.night}}夜 {{#each this.seats}}{{this}}号 {{/each}}{{#if this.hasWolf}}中有狼人{{else}}中没有狼人{{/if}}；{{/each}}{{/if}}',
    '{{#if state.foxLost}}你已经失去了查验能力。{{/if}}',
  ].join(''),
  foxInspect: '狐狸请睁眼，选择一名玩家：查验他与左右相邻号码中的存活玩家里有没有狼人。',
});

/** 以 center 为中心的三个相连号码中的存活玩家 */
function inspected(ctx: WerewolfContext, center: number): number[] {
  return adjacentSeats(ctx, center).filter((seat) => ctx.seats.get(seat).alive);
}

/** 魔术师换号后按实际落点判断（与预言家一致） */
function hasWolf(ctx: WerewolfContext, seats: readonly number[]): boolean {
  return seats.some((seat) => checksAsWolf(ctx, ctx.seats.get(swapTarget(ctx, seat))));
}

function describeInspection(ctx: WerewolfContext, center: number): string {
  const seats = inspected(ctx, center);
  return `查验 ${seats.map((seat) => `${seat}号`).join('、')}：${hasWolf(ctx, seats) ? '有狼人' : '没有狼人'}`;
}

function applyInspection(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const center = decisions.flatMap((decision) => decision.targets)[0];
  if (center === undefined) return ctx.state;
  const seats = inspected(ctx, center);
  const found = hasWolf(ctx, seats);
  return {
    ...ctx.state,
    foxChecks: [...ctx.state.foxChecks, { night: ctx.round, seats, hasWolf: found }],
    foxLost: ctx.state.foxLost || !found,
  };
}

const foxPhases = {
  fox_inspect: {
    kind: 'act',
    title: '狐狸',
    action: '查验',
    enabled: (ctx) => hasRole(ctx, 'fox'),
    actors: (ctx) => nightActors(ctx, 'fox').where(() => !ctx.state.foxLost),
    targets: (ctx) => ctx.seats.alive(),
    prompt: foxPrompts.foxInspect,
    describe: (ctx, _seat, targets) => (targets[0] === undefined ? '没有查验' : describeInspection(ctx, targets[0])),
    apply: applyInspection,
    next: nightAfter('fox_inspect'),
  },
} satisfies WerewolfPhases;

export const foxSpecial: SpecialDescriptor = {
  key: 'fox',
  prompts: foxPrompts,
  identities: { fox: foxPrompts.fox },
  phases: foxPhases,
};
