import { definePrompts, type ActDecision, type ComputeOutcome, type Seat } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { addDeath } from '../rules/tally';
import { dayAfter, nightAfter } from '../rules/order';
import type { NightStep } from '../rules/types';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 潜行者：放逐投票中投给的玩家若没有被放逐出局，当晚可以暗杀他（全场一次，可不发动）。
// 暗杀在夜间结算，守护与解药都挡不下；被花蝴蝶等封锁的当晚不能暗杀，机会随之失效。

export const stalkerPrompts = definePrompts({
  stalker: [
    '你是{{me.label}}，身份是潜行者。',
    '{{#if state.stalkerUsed}}你已经用过暗杀。{{else}}如果你在放逐投票中投给的玩家没有被放逐出局，你可以在当晚暗杀他，全场只能暗杀一次。{{/if}}',
  ].join(''),
  stalkerAssassinate: '潜行者请睁眼。你在白天放逐投票中投给的 {{#each legalTargets}}{{this}}号{{/each}} 没有被放逐。是否暗杀他？选择他表示暗杀，输出空数组表示不发动。',
});

/** 当晚可以暗杀的人：潜行者投给的、仍然存活（即没有被放逐出局）的玩家 */
function assassinationTarget(ctx: WerewolfContext): number | null {
  const target = ctx.state.stalkerVote;
  return target !== null && ctx.seats.get(target).alive ? target : null;
}

/** 放逐投票后记下存活潜行者的选票（弃票则为空） */
function markStalkerVote(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const stalker = ctx.seats.alive().withRole('stalker').list()[0];
  const vote = ctx.results.exile_vote;
  if (!stalker || ctx.state.stalkerUsed || vote?.kind !== 'vote') return {};
  const ballot = vote.ballots.find((item) => item.voter === stalker.seat);
  return { state: { ...ctx.state, stalkerVote: ballot?.target ?? null } };
}

function assassinTargets(ctx: WerewolfContext, _stalker: Seat): number[] {
  const target = assassinationTarget(ctx);
  return target === null ? [] : [target];
}

/** 暗杀机会只在当晚有效：不论是否发动都清空 */
function applyAssassination(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const stalked = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  const state = { ...ctx.state, stalkerVote: null };
  return stalked === null ? state : { ...state, night: { ...state.night, stalked }, stalkerUsed: true };
}

const stalkerAssassination: NightStep = (ctx, tally) => {
  const { stalked } = ctx.state.night;
  return stalked === null ? tally : addDeath(tally, stalked, 'stalker');
};

const stalkerPhases = {
  stalker_mark: {
    kind: 'compute',
    enabled: (ctx) => hasRole(ctx, 'stalker'),
    run: markStalkerVote,
    next: dayAfter('stalker_mark'),
  },
  stalker_assassinate: {
    kind: 'act',
    title: '潜行者暗杀',
    action: '暗杀',
    enabled: (ctx) => hasRole(ctx, 'stalker'),
    actors: (ctx) => nightActors(ctx, 'stalker').where(() => !ctx.state.stalkerUsed),
    targets: assassinTargets,
    allowNone: true,
    prompt: stalkerPrompts.stalkerAssassinate,
    apply: applyAssassination,
    next: nightAfter('stalker_assassinate'),
  },
} satisfies WerewolfPhases;

export const stalkerSpecial: SpecialDescriptor = {
  key: 'stalker',
  prompts: stalkerPrompts,
  identities: { stalker: stalkerPrompts.stalker },
  phases: stalkerPhases,
  nightStep: stalkerAssassination,
};
