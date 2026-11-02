import { definePrompts, type ActDecision, type ComputeOutcome, type Seat, type VoteBonus } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { boardConfig, hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { dayAfter, nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 乌鸦：每晚可以诅咒一名其他存活玩家（可不诅咒），不能连续两晚诅咒同一人。
// 次日放逐投票前公布诅咒，被诅咒者在当天的放逐投票中额外获得 crowVotes 票（引擎的投票额外票 VotePhase.bonus）。

const crowPrompts = definePrompts({
  crow: [
    '你是{{me.label}}，身份是乌鸦。每晚你可以诅咒一名其他玩家，他在次日的放逐投票中会额外被投票（放逐投票前法官会公布诅咒）。',
    '{{#if state.crowLastTarget}}你上一晚诅咒的是 {{state.crowLastTarget}}号，今晚不能再诅咒他。{{/if}}',
  ].join(''),
  crowCurse: '乌鸦请睁眼，选择今晚要诅咒的玩家，也可以输出空数组不诅咒。',
});

function curseTargets(ctx: WerewolfContext, crow: Seat): number[] {
  return ctx.seats.alive().except(crow).ids().filter((seat) => seat !== ctx.state.crowLastTarget);
}

function applyCurse(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const cursed = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  return { ...ctx.state, night: { ...ctx.state.night, cursed }, crowLastTarget: cursed };
}

/** 今天仍然有效的诅咒：昨晚被诅咒且还活着的人 */
function cursedToday(ctx: WerewolfContext): number | null {
  const { cursed } = ctx.state.night;
  return cursed !== null && ctx.seats.get(cursed).alive ? cursed : null;
}

/** 放逐投票的额外票 */
function crowBonus(ctx: WerewolfContext): VoteBonus[] {
  const cursed = cursedToday(ctx);
  return cursed === null ? [] : [{ target: cursed, votes: boardConfig(ctx).crowVotes }];
}

function announceCurse(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const cursed = cursedToday(ctx);
  const text = cursed === null
    ? '今天没有玩家受到乌鸦的诅咒。'
    : `昨晚乌鸦诅咒了 ${cursed}号：今天的放逐投票中他额外获得 ${boardConfig(ctx).crowVotes} 票。`;
  return { log: [{ kind: 'narration', text }] };
}

const crowPhases = {
  crow_curse: {
    kind: 'act',
    title: '乌鸦',
    action: '诅咒',
    enabled: (ctx) => hasRole(ctx, 'crow'),
    actors: (ctx) => nightActors(ctx, 'crow'),
    targets: curseTargets,
    allowNone: true,
    prompt: crowPrompts.crowCurse,
    describe: (_ctx, _seat, targets) => (targets.length ? `诅咒 ${targets[0]}号` : '今晚不诅咒'),
    apply: applyCurse,
    next: nightAfter('crow_curse'),
  },
  crow_announce: {
    kind: 'compute',
    enabled: (ctx) => hasRole(ctx, 'crow'),
    run: announceCurse,
    next: dayAfter('crow_announce'),
  },
} satisfies WerewolfPhases;

export const crowSpecial: SpecialDescriptor = {
  key: 'crow',
  prompts: crowPrompts,
  identities: { crow: crowPrompts.crow },
  phases: crowPhases,
  exile: { bonus: crowBonus },
};
