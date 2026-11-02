import { definePrompts, type ActDecision, type ComputeOutcome, type PhaseResult } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { isWolf, type WerewolfContext } from '../rules/context';
import { dayAfter } from '../rules/order';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 骑士：白天发言结束、放逐投票前可以决斗一名存活玩家（全场一次，可不发动）。
// 对方是狼人：该狼人出局，当天放逐取消，直接入夜；对方是好人：骑士出局，白天照常进行。决斗出局者没有遗言。

export const knightPrompts = definePrompts({
  knight: [
    '你是{{me.label}}，身份是骑士。',
    '{{#if state.knightDuelUsed}}你已经用过决斗。{{else}}白天发言结束后、放逐投票前，你可以决斗一名玩家：他是狼人则他出局并直接进入黑夜，他是好人则你出局。全场只能决斗一次。{{/if}}',
  ].join(''),
  knightDuel: '白天发言已结束。你是骑士，是否发动决斗？选择一名玩家决斗，输出空数组表示不发动。',
});

export const KNIGHT_DUEL = 'knight_duel';
export const KNIGHT_FAILED = 'knight_failed';

function duel(result: PhaseResult | null | undefined): { knight: number; target: number } | null {
  if (result?.kind !== 'act') return null;
  const decision = result.decisions.find((item) => item.targets.length > 0);
  const target = decision?.targets[0];
  return decision && target !== undefined ? { knight: decision.seat, target } : null;
}

/** 本阶段（knight_duel 的 next 中）决斗的对象是否为狼人；没有决斗时为 null */
function duelHitsWolf(ctx: WerewolfContext): boolean | null {
  const current = duel(ctx.result);
  return current === null ? null : isWolf(ctx.seats.get(current.target));
}

function applyDuel(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  return decisions.some((decision) => decision.targets.length > 0) ? { ...ctx.state, knightDuelUsed: true } : ctx.state;
}

function resolveDuel(ctx: WerewolfContext, hit: boolean): ComputeOutcome<WerewolfState> {
  const current = duel(ctx.results[KNIGHT_DUEL]);
  if (current === null) return {};
  const { knight, target } = current;
  const verdict = hit
    ? `${target}号是狼人，出局；今天的放逐投票取消，直接进入黑夜。`
    : `${target}号是好人，骑士以死谢罪，白天继续进行。`;
  return {
    log: [{ kind: 'revealed', text: `${knight}号翻牌为骑士，决斗 ${target}号：${verdict}`, data: { seat: knight, role: 'knight' } }],
    eliminate: hit
      ? [{ seat: target, reason: '被骑士决斗', cause: KNIGHT_DUEL }]
      : [{ seat: knight, reason: '决斗失败', cause: KNIGHT_FAILED }],
  };
}

const knightPhases = {
  knight_duel: {
    kind: 'act',
    title: '骑士决斗',
    action: '决斗',
    enabled: (ctx) => hasRole(ctx, 'knight') && !ctx.state.knightDuelUsed,
    actors: (ctx) => ctx.seats.alive().withRole('knight'),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: knightPrompts.knightDuel,
    apply: applyDuel,
    next: [
      { when: (ctx) => duelHitsWolf(ctx) === true, goto: 'knight_hit' },
      { when: (ctx) => duelHitsWolf(ctx) === false, goto: 'knight_miss' },
      { goto: dayAfter('knight_duel') },
    ],
  },
  knight_hit: { kind: 'compute', run: (ctx) => resolveDuel(ctx, true), next: [{ goto: 'night_start', round: 'increment' }] },
  knight_miss: { kind: 'compute', run: (ctx) => resolveDuel(ctx, false), next: dayAfter('knight_duel') },
} satisfies WerewolfPhases;

export const knightSpecial: SpecialDescriptor = {
  key: 'knight',
  prompts: knightPrompts,
  identities: { knight: knightPrompts.knight },
  phases: knightPhases,
};
