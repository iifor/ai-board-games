import { definePrompts, type ActDecision, type ComputeOutcome, type Seat } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import { isWolf, type WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import { addDeath } from '../rules/tally';
import type { NightStep } from '../rules/types';
import type { WerewolfState } from '../state';
import { isDreamed } from './dreamer';
import { markNotice, withinMark } from './fortuneTeller';
import { swapTarget } from './magician';

// 大灰狼：离群的狼人（lone_wolf 阵营），与狼队互相认识（state.knownWolves），但不在狼队频道里，不夜聊、不参与狼队击杀。
// 每晚狼队之后单独睁眼，全场可以发动一次单独击杀：先决定是否发动，发动后才得知占卜师的标记，并且必须落刀。
// 单独击杀与狼刀同时结算，不经过女巫（女巫只被告知狼队刀口），解药挡不下。不能自爆。

export const bigBadWolfPrompts = definePrompts({
  bigBadWolf: [
    '你是{{me.label}}，身份是大灰狼（离群的狼人，狼人阵营）。',
    '你的狼同伴：{{#each state.knownWolves}}{{this}}号 {{/each}}。你们互相认识，但夜里你不和狼队一起夜聊、击杀，也看不见彼此的刀法。',
    '{{#if state.bigBadWolfUsed}}你已经用过单独击杀。{{else}}全场你可以发动一次单独击杀：每晚狼队行动后你单独睁眼，先决定是否发动，发动后才会得知占卜师的标记，并且必须击杀一名玩家。{{/if}}',
    '你不能自爆。',
  ].join(''),
  bigBadWolfDecide: '大灰狼请睁眼。今晚是否发动单独击杀（全场限一次，发动后必须击杀一名玩家）？选择你自己表示发动，输出空数组表示不发动。',
  bigBadWolfKill: '你已发动单独击杀，请选择要击杀的玩家。',
});

function applyDecision(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  if (!decisions.some((decision) => decision.targets.length > 0)) return ctx.state;
  return { ...ctx.state, night: { ...ctx.state.night, bigBadWolfArmed: true }, bigBadWolfUsed: true };
}

/** 发动后才告知占卜师的标记（本局有占卜师时） */
function notifyMark(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const seat = ctx.seats.alive().withRole('big_bad_wolf').ids()[0];
  if (seat === undefined) return {};
  return { log: [{ kind: 'narration', text: markNotice(ctx), channel: `private:${seat}` }] };
}

/** 只能击杀存活的非狼人（他认识所有狼同伴），并受占卜师标记限制 */
function killTargets(ctx: WerewolfContext, _wolf: Seat): number[] {
  return ctx.seats.alive().where((seat) => !isWolf(seat) && withinMark(ctx, seat.seat)).ids();
}

function applyKill(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const bigBadWolfTarget = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  return { ...ctx.state, night: { ...ctx.state.night, bigBadWolfTarget } };
}

/** 单独击杀：守护、解药都挡不下；与其他狼刀一样受魔术师换号、梦游影响 */
export const bigBadWolfKill: NightStep = (ctx, tally) => {
  const { bigBadWolfTarget } = ctx.state.night;
  if (bigBadWolfTarget === null) return tally;
  const victim = swapTarget(ctx, bigBadWolfTarget);
  return isDreamed(ctx, victim) ? tally : addDeath(tally, victim, 'wolf');
};

export const bigBadWolfPhases = {
  big_bad_wolf_decide: {
    kind: 'act',
    title: '大灰狼',
    action: '发动单独击杀',
    enabled: (ctx) => hasRole(ctx, 'big_bad_wolf'),
    actors: (ctx) => nightActors(ctx, 'big_bad_wolf').where(() => !ctx.state.bigBadWolfUsed),
    targets: (_ctx, seat) => [seat],
    allowNone: true,
    prompt: bigBadWolfPrompts.bigBadWolfDecide,
    describe: (_ctx, _seat, targets) => (targets.length ? '决定发动单独击杀' : '决定今晚不单独击杀'),
    apply: applyDecision,
    next: nightAfter('big_bad_wolf_decide'),
  },
  big_bad_wolf_notice: {
    kind: 'compute',
    enabled: (ctx) => ctx.state.night.bigBadWolfArmed && hasRole(ctx, 'fortune_teller'),
    run: notifyMark,
    next: nightAfter('big_bad_wolf_notice'),
  },
  big_bad_wolf_kill: {
    kind: 'act',
    action: '单独击杀',
    enabled: (ctx) => hasRole(ctx, 'big_bad_wolf'),
    actors: (ctx) => ctx.seats.alive().withRole('big_bad_wolf').where(() => ctx.state.night.bigBadWolfArmed),
    targets: killTargets,
    prompt: bigBadWolfPrompts.bigBadWolfKill,
    describe: (_ctx, _seat, targets) => `单独击杀 ${targets[0]}号`,
    apply: applyKill,
    next: nightAfter('big_bad_wolf_kill'),
  },
} satisfies WerewolfPhases;
