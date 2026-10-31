import { definePrompts, type ActDecision } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import { roleCatalog } from '../roles';
import type { WerewolfState } from '../state';
import { swapTarget } from './magician';

// 天眼：神职，能验出具体身份的预言家——每晚必须查验一名其他存活玩家，私下得知他的角色名，查验记录保留在身份提示中。

export const heavenlyEyePrompts = definePrompts({
  heavenlyEye: [
    '你是{{me.label}}，身份是天眼（能验出具体身份的预言家）。',
    '{{#if state.heavenlyEyeChecks}}你的查验记录：{{#each state.heavenlyEyeChecks}}第{{this.night}}夜查验 {{this.target}}号，身份是{{this.role}}；{{/each}}{{else}}你还没有查验过任何人。{{/if}}',
  ].join(''),
  heavenlyEyeCheck: '天眼请睁眼，选择今晚要查验的玩家，你会得知他的具体身份。',
});

/** 查验得到的角色名：魔术师换号后为换过去那名玩家的身份 */
function roleSeen(ctx: WerewolfContext, target: number): string {
  const seat = ctx.seats.get(swapTarget(ctx, target));
  return roleCatalog()[seat.role]?.spec.name ?? seat.role;
}

function applyCheck(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const target = decisions.flatMap((decision) => decision.targets)[0];
  if (target === undefined) return ctx.state;
  const check = { night: ctx.round, target, role: roleSeen(ctx, target) };
  return { ...ctx.state, heavenlyEyeChecks: [...ctx.state.heavenlyEyeChecks, check] };
}

export const heavenlyEyePhases = {
  heavenly_eye_check: {
    kind: 'act',
    title: '天眼查验',
    action: '查验',
    enabled: (ctx) => hasRole(ctx, 'heavenly_eye'),
    actors: (ctx) => nightActors(ctx, 'heavenly_eye'),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    prompt: heavenlyEyePrompts.heavenlyEyeCheck,
    describe: (ctx, _seat, targets) => (targets[0] === undefined ? '没有查验' : `查验 ${targets[0]}号：身份是${roleSeen(ctx, targets[0])}`),
    apply: applyCheck,
    next: nightAfter('heavenly_eye_check'),
  },
} satisfies WerewolfPhases;
