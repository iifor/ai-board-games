import { definePrompts, type ActDecision, type Seat } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 企鹅：神职，每晚可以冰冻一名其他存活玩家（可不冰冻），不能连续两晚冰冻同一人（空过一晚后不受限制）。
// 被冰冻者当晚的夜间技能失效（见 rules/block.ts 的夜间技能封锁）：狐狸不能查验、乌鸦不能诅咒、熊次日天亮不咆哮；
// 冰冻到狼人则整个狼队当晚不能击杀。

const penguinPrompts = definePrompts({
  penguin: [
    '你是{{me.label}}，身份是企鹅（神职）。每晚你可以冰冻一名其他玩家，被冰冻者当晚的夜间技能失效（冰冻熊则熊次日不咆哮；冰冻到狼人则整个狼队当晚不能击杀），不能连续两晚冰冻同一人。',
    '{{#if state.penguinLastTarget}}你上一晚冰冻的是 {{state.penguinLastTarget}}号，今晚不能再冰冻他。{{/if}}',
  ].join(''),
  penguinFreeze: '企鹅请睁眼，选择今晚要冰冻的玩家，也可以输出空数组不冰冻。',
});

function freezeTargets(ctx: WerewolfContext, penguin: Seat): number[] {
  return ctx.seats.alive().except(penguin).ids().filter((seat) => seat !== ctx.state.penguinLastTarget);
}

function applyFreeze(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const frozen = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  return { ...ctx.state, night: { ...ctx.state.night, frozen }, penguinLastTarget: frozen };
}

const penguinPhases = {
  penguin_freeze: {
    kind: 'act',
    title: '企鹅',
    action: '冰冻',
    enabled: (ctx) => hasRole(ctx, 'penguin'),
    actors: (ctx) => nightActors(ctx, 'penguin'),
    targets: freezeTargets,
    allowNone: true,
    prompt: penguinPrompts.penguinFreeze,
    describe: (_ctx, _seat, targets) => (targets[0] === undefined ? '今晚不冰冻' : `冰冻 ${targets[0]}号`),
    apply: applyFreeze,
    next: nightAfter('penguin_freeze'),
  },
} satisfies WerewolfPhases;

export const penguinSpecial: SpecialDescriptor = {
  key: 'penguin',
  prompts: penguinPrompts,
  identities: { penguin: penguinPrompts.penguin },
  phases: penguinPhases,
};
