import { definePrompts, type ActDecision } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import { addDeath, deathCause, removeDeath } from '../rules/tally';
import type { NightStep } from '../rules/types';
import type { WerewolfState } from '../state';

// 幻术师：神职，每晚可以选择一名其他存活玩家作为幻象（可以不发动），发动过的下一晚冷却。
// 幻术师当晚被狼刀或毒杀时（任何狼刀、任何毒药，在守护、解药等结算之后仍要死亡），幻象代替他死亡，死因不变；
// 其他死因（如猎魔人狩猎、殉情）不能替代。幻象只记在幻术师私密频道，谁也不会被告知替死。

export const illusionistPrompts = definePrompts({
  illusionist: [
    '你是{{me.label}}，身份是幻术师（神职）。每晚你可以选择一名其他玩家作为幻象：你当晚被狼人击杀或被女巫毒杀时，由幻象代替你死亡；',
    '发动过幻术的下一晚幻术冷却，不能使用。{{#if state.illusionLastNight}}你最近一次发动幻术是在第{{state.illusionLastNight}}夜。{{/if}}',
  ].join(''),
  illusionistIllusion: '幻术师请睁眼，选择一名玩家作为今晚的幻象（你今晚被狼人击杀或被毒杀时由他代替你死亡），也可以输出空数组不发动。',
});

const ILLUSIONIST = 'illusionist';

/** 上一晚发动过则今晚冷却 */
function ready(ctx: WerewolfContext): boolean {
  return ctx.state.illusionLastNight !== ctx.round - 1;
}

function applyIllusion(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const phantom = decisions.flatMap((decision) => decision.targets)[0];
  if (phantom === undefined) return ctx.state;
  return { ...ctx.state, night: { ...ctx.state.night, phantom }, illusionLastNight: ctx.round };
}

/** 幻象替死：排在各种击杀与庇护之后、连带死亡（殉情等）之前，替死者的死亡同样会引发连带死亡 */
export const illusionSubstitution: NightStep = (ctx, tally) => {
  const { phantom } = ctx.state.night;
  const illusionist = ctx.seats.alive().withRole(ILLUSIONIST).ids()[0];
  if (phantom === null || illusionist === undefined || !ctx.seats.get(phantom).alive) return tally;
  const cause = deathCause(tally, illusionist);
  if (cause !== 'wolf' && cause !== 'poison') return tally;
  return addDeath(removeDeath(tally, illusionist), phantom, cause);
};

export const illusionistPhases = {
  illusionist_illusion: {
    kind: 'act',
    title: '幻术师',
    action: '施放幻术',
    enabled: (ctx) => hasRole(ctx, ILLUSIONIST),
    actors: (ctx) => nightActors(ctx, ILLUSIONIST).where(() => ready(ctx)),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: illusionistPrompts.illusionistIllusion,
    describe: (_ctx, _seat, targets) => (targets[0] === undefined ? '今晚不发动幻术' : `以 ${targets[0]}号 为幻象`),
    apply: applyIllusion,
    next: nightAfter('illusionist_illusion'),
  },
} satisfies WerewolfPhases;
