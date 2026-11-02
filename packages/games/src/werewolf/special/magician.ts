import { definePrompts, type ActDecision, type Seat } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';

// 魔术师：每晚第一个行动，可以交换两名存活玩家的号码（可不交换），每个号码全场只能被交换一次。
// 当晚作用在这两个号码上的技能结果互换（狼刀、守护、毒药、预言家查验等都经 rules/nightEffects.ts 的 swapTarget 换算），
// 天亮后恢复；各角色看到的仍是自己选择的号码（女巫看到的刀口不变）。

export const magicianPrompts = definePrompts({
  magician: [
    '你是{{me.label}}，身份是魔术师。每晚你第一个行动，可以交换两名玩家的号码：当晚作用在这两个号码上的技能结果互换',
    '（如狼人击杀 1 号而你交换了 1、2 号，则实际死亡的是 2 号；预言家查验 1 号得到的是 2 号的身份），天亮后恢复。每个号码全场只能被交换一次。',
    '{{#if state.magicianSwapped}}已经交换过的号码：{{#each state.magicianSwapped}}{{this}}号 {{/each}}（不能再交换）。{{/if}}',
  ].join(''),
  magicianSwap: '魔术师请睁眼，选择两名玩家交换号码，也可以输出空数组不交换。',
});

function swapTargets(ctx: WerewolfContext, _magician?: Seat): number[] {
  return ctx.seats.alive().ids().filter((seat) => !ctx.state.magicianSwapped.includes(seat));
}

function applySwap(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const [first, second] = decisions.flatMap((decision) => decision.targets);
  if (first === undefined || second === undefined) return ctx.state;
  return {
    ...ctx.state,
    night: { ...ctx.state.night, swapped: [first, second] },
    magicianSwapped: [...ctx.state.magicianSwapped, first, second],
  };
}

export const magicianPhases = {
  magician_swap: {
    kind: 'act',
    title: '魔术师',
    action: '交换号码',
    count: 2,
    enabled: (ctx) => hasRole(ctx, 'magician'),
    actors: (ctx) => nightActors(ctx, 'magician').where(() => swapTargets(ctx).length >= 2),
    targets: swapTargets,
    allowNone: true,
    prompt: magicianPrompts.magicianSwap,
    describe: (_ctx, _seat, targets) => (targets.length ? `交换 ${targets[0]}号 与 ${targets[1]}号` : '今晚不交换'),
    apply: applySwap,
    next: nightAfter('magician_swap'),
  },
} satisfies WerewolfPhases;
