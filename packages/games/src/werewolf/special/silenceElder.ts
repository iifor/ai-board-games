import { definePrompts, type ActDecision, type Seat } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import type { DawnStep } from '../rules/types';
import type { WerewolfState } from '../state';

// 禁言长老：每晚必须禁言一名存活玩家（可以禁言自己），不能连续两晚禁言同一人；
// 天亮时与死讯一起公布，被禁言者当天的白天发言环节不能发言（仍可投票、发表遗言）。

export const silenceElderPrompts = definePrompts({
  silenceElder: [
    '你是{{me.label}}，身份是禁言长老。每晚你必须禁言一名玩家，被禁言者次日白天发言环节不能发言。',
    '{{#if state.elderLastTarget}}你上一晚禁言的是 {{state.elderLastTarget}}号，今晚不能再禁言他。{{/if}}',
  ].join(''),
  elderSilence: '禁言长老请睁眼，选择一名玩家禁言，他明天白天不能发言。',
});

function silenceTargets(ctx: WerewolfContext, _elder: Seat): number[] {
  return ctx.seats.alive().ids().filter((seat) => seat !== ctx.state.elderLastTarget);
}

function applySilence(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const silenced = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  return { ...ctx.state, night: { ...ctx.state.night, silenced }, elderLastTarget: silenced };
}

/** 天亮时公布禁言；被禁言者当晚已死亡则不公布 */
export const publishSilence: DawnStep = (ctx, draft) => {
  const target = ctx.state.night.silenced;
  if (target === null || !ctx.seats.get(target).alive || draft.deaths.some((death) => death.seat === target)) return draft;
  return {
    ...draft,
    state: { ...draft.state, silencedToday: target },
    notes: [...draft.notes, `今天被禁言的是 ${target}号，他在白天发言环节不能发言。`],
  };
};

export const silenceElderPhases = {
  elder_silence: {
    kind: 'act',
    title: '禁言长老禁言',
    action: '禁言',
    enabled: (ctx) => hasRole(ctx, 'silence_elder'),
    actors: (ctx) => nightActors(ctx, 'silence_elder'),
    targets: silenceTargets,
    prompt: silenceElderPrompts.elderSilence,
    apply: applySilence,
    next: nightAfter('elder_silence'),
  },
} satisfies WerewolfPhases;
