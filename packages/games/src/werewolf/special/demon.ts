import { definePrompts, type ActDecision, type Seat } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole, roleCategory } from '../rules/board';
import { nightActors } from '../rules/block';
import { isWolf, type WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';

// 恶魔：狼人阵营，狼人行动后单独查验一名好人阵营的存活玩家是神职还是平民（必须查验）。
// 免疫毒药与夜间出局的猎人的枪、不能自爆，这些由角色目录中的特性统一处理。

export const demonPrompts = definePrompts({
  demon: [
    '你是{{me.label}}，身份是恶魔（狼人阵营）。你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。',
    '每晚狼人行动后，你可以单独查验一名好人阵营玩家是神职还是平民。你免疫女巫的毒药和夜间出局的猎人开的枪，不能自爆。',
    '{{#if state.demonChecks}}你的查验记录：{{#each state.demonChecks}}第{{this.night}}夜查验 {{this.target}}号，结果是{{this.result}}；{{/each}}{{/if}}',
  ].join(''),
  demonCheck: '恶魔请睁眼，选择一名好人阵营玩家，查验他是神职还是平民。',
});

/** 神职或平民（按屠边类别：神职以外都算平民），恶魔与学到预言家的灵狼共用 */
export function godOrVillager(ctx: WerewolfContext, seat: number): '神职' | '平民' {
  return roleCategory(ctx, ctx.seats.get(seat)) === 'god' ? '神职' : '平民';
}

function demonTargets(ctx: WerewolfContext, _demon: Seat): number[] {
  return ctx.seats.alive().where((seat) => !isWolf(seat)).ids();
}

function applyDemonCheck(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const target = decisions.flatMap((decision) => decision.targets)[0];
  if (target === undefined) return ctx.state;
  const check = { night: ctx.round, target, result: godOrVillager(ctx, target) };
  return { ...ctx.state, demonChecks: [...ctx.state.demonChecks, check] };
}

export const demonPhases = {
  demon_check: {
    kind: 'act',
    title: '恶魔查验',
    action: '查验',
    enabled: (ctx) => hasRole(ctx, 'demon'),
    actors: (ctx) => nightActors(ctx, 'demon'),
    targets: demonTargets,
    prompt: demonPrompts.demonCheck,
    describe: (ctx, _seat, targets) => (targets[0] === undefined ? '没有查验' : `查验 ${targets[0]}号：${godOrVillager(ctx, targets[0])}`),
    apply: applyDemonCheck,
    next: nightAfter('demon_check'),
  },
} satisfies WerewolfPhases;
