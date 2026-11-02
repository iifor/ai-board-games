import { definePrompts, type ActDecision, type Seat } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 梦魇：狼人阵营，每晚第一个睁眼恐惧一名其他存活玩家（可不恐惧，不能连续两晚恐惧同一人），之后与狼队一起击杀。
// 被恐惧者当晚夜间技能失效、猎人当晚被狼刀不能开枪、恐惧到狼人则狼队当晚不能击杀；封锁由 rules/block.ts 统一处理。

export const nightmarePrompts = definePrompts({
  nightmare: [
    '你是{{me.label}}，身份是梦魇（狼人阵营）。你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。',
    '每晚你第一个睁眼，可以恐惧一名玩家，使他当晚的夜间技能失效（猎人当晚被狼人击杀时不能开枪；恐惧到狼人会让狼队当晚不能击杀）。',
    '{{#if state.nightmareLastTarget}}你上一晚恐惧的是 {{state.nightmareLastTarget}}号，今晚不能再恐惧他。{{/if}}',
    '白天发言时你可以在发言后宣布自爆。',
  ].join(''),
  nightmareFear: '梦魇请睁眼，选择今晚要恐惧的玩家，也可以输出空数组不恐惧。',
});

function fearTargets(ctx: WerewolfContext, nightmare: Seat): number[] {
  return ctx.seats.alive().except(nightmare).ids().filter((seat) => seat !== ctx.state.nightmareLastTarget);
}

function applyFear(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const feared = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  return { ...ctx.state, night: { ...ctx.state.night, feared }, nightmareLastTarget: feared };
}

const nightmarePhases = {
  nightmare_fear: {
    kind: 'act',
    title: '梦魇恐惧',
    action: '恐惧',
    enabled: (ctx) => hasRole(ctx, 'nightmare'),
    actors: (ctx) => nightActors(ctx, 'nightmare'),
    targets: fearTargets,
    allowNone: true,
    prompt: nightmarePrompts.nightmareFear,
    describe: (_ctx, _seat, targets) => (targets.length ? `恐惧 ${targets[0]}号` : '今晚不恐惧'),
    apply: applyFear,
    next: nightAfter('nightmare_fear'),
  },
} satisfies WerewolfPhases;

export const nightmareSpecial: SpecialDescriptor = {
  key: 'nightmare',
  prompts: nightmarePrompts,
  identities: { nightmare: nightmarePrompts.nightmare },
  phases: nightmarePhases,
};
