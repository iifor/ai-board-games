import { definePrompts } from '@battle/engine';
import type { WerewolfContext } from '../rules/context';
import { addDeath, isDying } from '../rules/tally';
import type { NightStep } from '../rules/types';
import type { SpecialDescriptor } from './types';

// 恶灵骑士：狼人阵营，与狼队一起击杀，不能自爆；永远不会在夜晚死亡（免疫毒药与夜间开枪，由角色特性处理）。
// 反伤（全场一次）：女巫毒他则女巫当晚死亡；预言家查验他则预言家当晚死亡，但同验同毒时只有女巫死亡。
// 反伤对象当晚本就会死亡时不消耗反伤。

const evilKnightPrompts = definePrompts({
  evilKnight: [
    '你是{{me.label}}，身份是恶灵骑士（狼人阵营）。你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。',
    '你永远不会在夜晚死亡（免疫女巫的毒药和夜间出局的猎人开的枪）。女巫毒你时女巫当晚死亡，预言家查验你时预言家当晚死亡（同一晚既被查验又被毒时只有女巫死亡），这一反伤全场只会发生一次。你不能自爆。',
  ].join(''),
});

function isEvilKnight(ctx: WerewolfContext, seat: number | null): boolean {
  return seat !== null && ctx.seats.get(seat).role === 'evil_knight';
}

/** 今晚查验了恶灵骑士的预言家 */
function checkingSeer(ctx: WerewolfContext): number | null {
  const entry = Object.entries(ctx.state.seerChecks)
    .find(([, checks]) => checks.some((check) => check.night === ctx.round && isEvilKnight(ctx, check.target)));
  return entry ? Number(entry[0]) : null;
}

/** 反伤的对象：毒了恶灵骑士的女巫优先（同验同毒时预言家不死），否则是查验了他的预言家 */
function reflectTarget(ctx: WerewolfContext): number | null {
  if (isEvilKnight(ctx, ctx.state.night.poisoned)) return ctx.seats.alive().withRole('witch').ids()[0] ?? null;
  return checkingSeer(ctx);
}

const evilKnightReflect: NightStep = (ctx, tally) => {
  if (tally.state.evilKnightReflected) return tally;
  const target = reflectTarget(ctx);
  if (target === null || isDying(tally, target)) return tally;
  return { ...addDeath(tally, target, 'reflect'), state: { ...tally.state, evilKnightReflected: true } };
};

export const evilKnightSpecial: SpecialDescriptor = {
  key: 'evilKnight',
  prompts: evilKnightPrompts,
  identities: { evil_knight: evilKnightPrompts.evilKnight },
  nightStep: evilKnightReflect,
};
