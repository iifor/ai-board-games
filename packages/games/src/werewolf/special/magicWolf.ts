import { definePrompts, type ComputeOutcome, type Seat, type TriggerSpec } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { isWolf, type WerewolfContext } from '../rules/context';
import { dayAfter } from '../rules/order';
import type { WerewolfParams, WerewolfState } from '../state';

// 魔狼：狼队成员。
// - 自爆后（照常直接入夜）当晚所有神职的夜间技能被封印（state.godsSealedNight，见 rules/block.ts 的 canUseNightSkill），公开播报；
// - 作为最后一名狼人被放逐时自动翻牌，不出局，存活到下一个天亮之后才出局（state.magicWolfDoom，公开）：
//   这一晚他照常击杀；在此期间不能投票、达到天数上限时视为已出局（rules/context.ts 的 bloodlineDoomed）。

export const magicWolfPrompts = definePrompts({
  magicWolf: [
    '你是{{me.label}}，身份是魔狼（狼人阵营）。你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。',
    '白天发言时你可以在发言后宣布自爆：自爆后直接进入黑夜，当晚所有神职的技能都会被你封印。',
    '你是最后一名狼人时若被放逐，你会翻牌并凭借血脉之力存活到下一个天亮之后才出局（这一晚你仍可以击杀）。',
  ].join(''),
});

const MAGIC_WOLF = 'magic_wolf';
/** 翻牌存活的魔狼在天亮后出局 */
export const BLOODLINE = 'bloodline';

/** 魔狼作为最后一名狼人被放逐：翻牌，不出局，存活到下一个天亮之后（返回 null 表示照常出局） */
export function bloodlineHold(ctx: WerewolfContext, target: Seat, state: WerewolfState): ComputeOutcome<WerewolfState> | null {
  if (target.role !== MAGIC_WOLF || state.magicWolfDoom !== null) return null;
  if (ctx.seats.alive().except(target).where(isWolf).count() > 0) return null;
  return {
    state: { ...state, magicWolfDoom: ctx.round + 1 },
    log: [{
      kind: 'revealed',
      text: `${target.seat}号翻牌，身份是魔狼：他是最后一名狼人，凭借血脉之力存活到明天天亮之后才出局，在此之前不能投票。`,
      data: { seat: target.seat, role: MAGIC_WOLF },
    }],
  };
}

/** 自爆的魔狼：今晚（自爆当天的下一晚）神职的夜间技能被封印 */
function seal(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const seat = ctx.trigger?.seat;
  if (seat === undefined) return {};
  return {
    state: { ...ctx.state, godsSealedNight: ctx.round + 1 },
    log: [{ kind: 'narration', text: `${seat}号是魔狼：今晚所有神职的技能都被封印。` }],
  };
}

function fade(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const seat = ctx.seats.alive().withRole(MAGIC_WOLF).ids()[0];
  if (seat === undefined || ctx.state.magicWolfDoom !== ctx.round) return {};
  return { eliminate: [{ seat, reason: '血脉之力耗尽', cause: BLOODLINE }] };
}

export const magicWolfPhases = {
  magic_wolf_seal: { kind: 'compute', run: seal, next: 'return' },
  magic_wolf_fade: {
    kind: 'compute',
    enabled: (ctx) => ctx.state.magicWolfDoom === ctx.round,
    run: fade,
    next: dayAfter('magic_wolf_fade'),
  },
} satisfies WerewolfPhases;

export const magicWolfTriggers: readonly TriggerSpec<WerewolfState, WerewolfParams>[] = [
  {
    id: 'magic-wolf-seal',
    on: 'seat_eliminated',
    when: (ctx, event) => event.kind === 'seat_eliminated' && event.cause === 'self_destruct' && ctx.seats.get(event.seat).role === MAGIC_WOLF,
    push: 'magic_wolf_seal',
  },
];
