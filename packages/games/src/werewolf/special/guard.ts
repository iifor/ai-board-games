import { definePrompts, type ActDecision, type Seat } from '@battle/engine';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';
import type { WerewolfPhases } from '../phases/types';

// 守卫：每晚守护一人（可自守、可空守），不能连续两晚守同一人；同守同救则被守护者死亡。

export const guardPrompts = definePrompts({
  guard: '你是{{me.label}}，身份是守卫。{{#if state.guardLastTarget}}你上一晚守护的是 {{state.guardLastTarget}}号，今晚不能再守他。{{/if}}',
  guardProtect: '守卫请睁眼，选择今晚要守护的玩家，也可以输出空数组空守。',
});

export function guardTargets(ctx: WerewolfContext, _guard: Seat): number[] {
  return ctx.seats.alive().ids().filter((seat) => seat !== ctx.state.guardLastTarget);
}

export function applyGuard(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const guarded = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  return { ...ctx.state, night: { ...ctx.state.night, guarded }, guardLastTarget: guarded };
}

export const guardPhases = {
  guard_protect: {
    kind: 'act',
    title: '守卫守护',
    action: '守护',
    enabled: (ctx) => hasRole(ctx, 'guard'),
    actors: (ctx) => nightActors(ctx, 'guard'),
    targets: guardTargets,
    allowNone: true,
    prompt: guardPrompts.guardProtect,
    apply: applyGuard,
    next: nightAfter('guard_protect'),
  },
} satisfies WerewolfPhases;
