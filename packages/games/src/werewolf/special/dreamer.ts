import { definePrompts, type ActDecision } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import { addDeath, isDying } from '../rules/tally';
import type { NightStep } from '../rules/types';
import type { WerewolfState } from '../state';

// 摄梦人：每晚必须摄梦一名其他存活玩家（梦游者，rules/nightEffects.ts 的 isDreamed）。狼刀落在梦游者身上视为空刀，
// 女巫对他用的毒药、解药都浪费；摄梦人当晚死亡或连续两晚摄梦同一人时，梦游者被摄梦而死（夜间死亡原因 dream）。

export const dreamerPrompts = definePrompts({
  dreamer: [
    '你是{{me.label}}，身份是摄梦人。每晚你必须摄梦一名其他玩家，被摄梦者当晚成为梦游者：狼人击杀他视为空刀，女巫对他用的毒药或解药都会浪费。',
    '你当晚死亡，或连续两晚摄梦同一人时，梦游者会被摄梦而死。',
    '{{#if state.dreamerLastTarget}}你上一晚摄梦的是 {{state.dreamerLastTarget}}号，今晚再摄梦他会让他死亡。{{/if}}',
  ].join(''),
  dreamerDream: '摄梦人请睁眼，选择今晚要摄梦的玩家。',
});

/** 今晚没有摄梦（摄梦人已出局）时清空上一晚的记录 */
function applyDream(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const dreamed = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  const dreamRepeat = dreamed !== null && dreamed === ctx.state.dreamerLastTarget;
  return { ...ctx.state, night: { ...ctx.state.night, dreamed, dreamRepeat }, dreamerLastTarget: dreamed };
}

/** 连续两晚摄梦同一人，或摄梦人当晚死亡：梦游者被摄梦而死 */
export const dreamDeaths: NightStep = (ctx, tally) => {
  const { dreamed, dreamRepeat } = ctx.state.night;
  if (dreamed === null || !ctx.seats.get(dreamed).alive) return tally;
  const dreamerDies = ctx.seats.withRole('dreamer').ids().some((seat) => isDying(tally, seat));
  return dreamRepeat || dreamerDies ? addDeath(tally, dreamed, 'dream') : tally;
};

export const dreamerPhases = {
  dreamer_dream: {
    kind: 'act',
    title: '摄梦人',
    action: '摄梦',
    enabled: (ctx) => hasRole(ctx, 'dreamer'),
    actors: (ctx) => nightActors(ctx, 'dreamer'),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    prompt: dreamerPrompts.dreamerDream,
    describe: (_ctx, _seat, targets) => `摄梦 ${targets[0]}号`,
    apply: applyDream,
    next: nightAfter('dreamer_dream'),
  },
} satisfies WerewolfPhases;
