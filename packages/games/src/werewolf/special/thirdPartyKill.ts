import { swapTarget } from '../rules/nightEffects';
import { addDeath } from '../rules/tally';
import type { NightStep } from '../rules/types';
import type { SpecialDescriptor } from './types';

// 第三方的夜间击杀（祈求者、鬼魂新娘一方共用，state.night.thirdKill）：守护、解药都挡不下，女巫不会被告知；
// 魔术师换号后按实际落点。击杀的阶段在 requester.ts 与 ghostBride.ts；第三方阵营的判定在 rules/thirdParty.ts。

const thirdPartyKill: NightStep = (ctx, tally) => {
  const { thirdKill } = ctx.state.night;
  return thirdKill === null ? tally : addDeath(tally, swapTarget(ctx, thirdKill), 'third_kill');
};

export const thirdPartyKillSpecial: SpecialDescriptor = { key: 'thirdPartyKill', nightStep: thirdPartyKill };
