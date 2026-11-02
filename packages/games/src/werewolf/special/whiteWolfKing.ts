import { definePrompts, type ActDecision, type ComputeOutcome } from '@battle/engine';
import type { WerewolfContext } from '../rules/context';
import { triggerSeat } from '../rules/death';
import type { WerewolfState } from '../state';
import type { WerewolfPhases, WerewolfTriggers } from '../phases/types';
import type { SpecialDescriptor } from './types';

// 白狼王：狼人阵营，自爆时可以带走一名玩家（被带走者没有遗言）。

const whiteWolfKingPrompts = definePrompts({
  whiteWolfKing: '你是{{me.label}}，身份是白狼王（狼人阵营）。你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。白天发言时你可以在发言后宣布自爆，自爆时还能带走一名玩家。',
  whiteWolfKingBlast: '你已自爆，可以带走一名存活玩家，也可以输出空数组不带人。',
});

export const WHITE_WOLF_KING_BLAST = 'white_wolf_king_blast';

function recordBlast(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  return { ...ctx.state, pendingBlast: decisions.flatMap((decision) => decision.targets)[0] ?? null };
}

function resolveBlast(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const target = ctx.state.pendingBlast;
  const state = { ...ctx.state, pendingBlast: null };
  // 选择与结算之间会先插入排队的触发器，被带走者可能已经出局
  if (target === null || !ctx.seats.get(target).alive) return { state };
  return { state, eliminate: [{ seat: target, reason: '被白狼王带走', cause: WHITE_WOLF_KING_BLAST }] };
}

const whiteWolfKingPhases = {
  white_wolf_king_blast: {
    kind: 'act',
    title: '白狼王带人',
    action: '带走',
    actors: triggerSeat,
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: whiteWolfKingPrompts.whiteWolfKingBlast,
    channel: () => 'public',
    describe: (_ctx, _seat, targets) => (targets.length ? `白狼王带走 ${targets[0]}号` : '白狼王没有带人'),
    apply: recordBlast,
    next: 'white_wolf_king_resolve',
  },
  white_wolf_king_resolve: { kind: 'compute', run: resolveBlast, next: 'return' },
} satisfies WerewolfPhases;

const whiteWolfKingTriggers: WerewolfTriggers = [
  {
    id: 'white-wolf-king-blast',
    on: 'seat_eliminated',
    when: (ctx, event) => event.kind === 'seat_eliminated' && event.cause === 'self_destruct'
      && ctx.seats.get(event.seat).role === 'white_wolf_king',
    push: 'white_wolf_king_blast',
  },
];

export const whiteWolfKingSpecial: SpecialDescriptor = {
  key: 'whiteWolfKing',
  prompts: whiteWolfKingPrompts,
  identities: { white_wolf_king: whiteWolfKingPrompts.whiteWolfKing },
  phases: whiteWolfKingPhases,
  deathTriggers: whiteWolfKingTriggers,
};
