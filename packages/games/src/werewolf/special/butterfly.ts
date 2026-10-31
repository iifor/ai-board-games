import { definePrompts, type ActDecision } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';

// 花蝴蝶：每晚可以抱一名其他存活玩家（全场最多两次，可不抱）。被抱者当晚夜间技能失效，
// 抱到狼人则整个狼队当晚不能击杀；封锁本身由 rules/block.ts 统一处理。

export const BUTTERFLY_MAX_HUGS = 2;

export const butterflyPrompts = definePrompts({
  butterfly: [
    '你是{{me.label}}，身份是花蝴蝶。你已经抱过 {{state.butterflyHugs}} 次，全场最多 2 次。',
    '被你抱住的玩家当晚夜间技能失效（猎人的开枪不受影响）；抱到狼人则整个狼队当晚不能击杀。',
  ].join(''),
  butterflyHug: '花蝴蝶请睁眼，选择今晚要抱的玩家，也可以输出空数组不抱人。',
});

function applyHug(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const hugged = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  if (hugged === null) return ctx.state;
  return { ...ctx.state, night: { ...ctx.state.night, hugged }, butterflyHugs: ctx.state.butterflyHugs + 1 };
}

export const butterflyPhases = {
  butterfly_hug: {
    kind: 'act',
    title: '花蝴蝶',
    action: '抱',
    enabled: (ctx) => hasRole(ctx, 'butterfly'),
    actors: (ctx) => nightActors(ctx, 'butterfly').where(() => ctx.state.butterflyHugs < BUTTERFLY_MAX_HUGS),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: butterflyPrompts.butterflyHug,
    describe: (_ctx, _seat, targets) => (targets.length ? `抱住 ${targets[0]}号` : '今晚不抱人'),
    apply: applyHug,
    next: nightAfter('butterfly_hug'),
  },
} satisfies WerewolfPhases;
