import { definePrompts, type ActDecision, type ComputeOutcome } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import { isWolf, type WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';

// 狼巫：狼队成员，每晚第一个单独睁眼，可以诅咒一名好人阵营的存活玩家（可以不诅咒），诅咒过的下一晚冷却；诅咒写在狼队频道。
// 被诅咒者立即被私下告知，直到下一个夜晚到来之前不能发动任何技能（state.night.hexed，见 rules/block.ts 的 skillsLost：
// 当晚的夜间技能、当晚或次日白天出局时的开枪、白痴翻牌等）；下一晚入夜时随 night 一起清空。

export const wolfWitchPrompts = definePrompts({
  wolfWitch: [
    '你是{{me.label}}，身份是狼巫（狼人阵营）。你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。',
    '每晚你第一个单独睁眼，可以诅咒一名好人阵营玩家，使他直到下一个夜晚到来之前不能发动任何技能；诅咒过的下一晚不能再诅咒。',
    '{{#if state.wolfWitchLastNight}}你最近一次诅咒是在第{{state.wolfWitchLastNight}}夜。{{/if}}',
    '白天发言时你可以在发言后宣布自爆。',
  ].join(''),
  wolfWitchCurse: '狼巫请睁眼，选择一名好人阵营玩家进行诅咒，也可以输出空数组不诅咒。',
});

const WOLF_WITCH = 'wolf_witch';

/** 上一晚诅咒过则今晚冷却 */
function ready(ctx: WerewolfContext): boolean {
  return ctx.state.wolfWitchLastNight !== ctx.round - 1;
}

function applyCurse(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const hexed = decisions.flatMap((decision) => decision.targets)[0];
  if (hexed === undefined) return ctx.state;
  return { ...ctx.state, night: { ...ctx.state.night, hexed }, wolfWitchLastNight: ctx.round };
}

/** 法官私下提示被诅咒者 */
function notifyHexed(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const { hexed } = ctx.state.night;
  if (hexed === null) return {};
  return { log: [{ kind: 'narration', text: '你被狼巫诅咒了：直到下一个夜晚到来之前，你都不能发动任何技能。', channel: `private:${hexed}` }] };
}

export const wolfWitchPhases = {
  wolf_witch_curse: {
    kind: 'act',
    title: '狼巫诅咒',
    action: '诅咒',
    enabled: (ctx) => hasRole(ctx, WOLF_WITCH),
    actors: (ctx) => nightActors(ctx, WOLF_WITCH).where(() => ready(ctx)),
    targets: (ctx) => ctx.seats.alive().where((seat) => !isWolf(seat)),
    allowNone: true,
    prompt: wolfWitchPrompts.wolfWitchCurse,
    channel: () => 'team:werewolf',
    describe: (_ctx, _seat, targets) => (targets[0] === undefined ? '狼巫今晚不诅咒' : `狼巫诅咒 ${targets[0]}号`),
    apply: applyCurse,
    next: nightAfter('wolf_witch_curse'),
  },
  wolf_witch_notice: {
    kind: 'compute',
    enabled: (ctx) => hasRole(ctx, WOLF_WITCH),
    run: notifyHexed,
    next: nightAfter('wolf_witch_notice'),
  },
} satisfies WerewolfPhases;
