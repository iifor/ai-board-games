import { speechOutput } from '@battle/engine';
import { werewolfPrompts as prompts } from '../prompts';
import {
  applySignup,
  applyWithdraw,
  campaignOrder,
  pkCandidates,
  pkOrder,
  pkVoters,
  recordSheriffVote,
  resolveSheriff,
  sheriffVoters,
} from '../rules/sheriff';
import type { WerewolfPhases } from './types';

const campaignFallback = () => ({ speech: '我会认真带队，请大家支持我。' });

export const sheriffPhases = {
  sheriff_signup: {
    kind: 'act',
    title: '警长竞选',
    action: '上警',
    actors: (ctx) => ctx.seats.alive(),
    targets: (_ctx, seat) => [seat],
    allowNone: true,
    prompt: prompts.sheriffSignup,
    channel: () => 'public',
    describe: (_ctx, _seat, targets) => (targets.length ? '上警参选' : '不上警'),
    apply: applySignup,
    next: [{ when: (ctx) => ctx.state.sheriffCandidates.length === 0, goto: 'sheriff_resolve' }, { goto: 'sheriff_speech' }],
  },
  sheriff_speech: {
    kind: 'speak',
    title: '竞选发言',
    actors: campaignOrder,
    prompt: prompts.sheriffSpeech,
    output: speechOutput({ max: 150 }),
    fallback: campaignFallback,
    next: 'sheriff_withdraw',
  },
  sheriff_withdraw: {
    kind: 'act',
    title: '退水',
    action: '退水',
    actors: (ctx) => ctx.state.sheriffCandidates,
    targets: (_ctx, seat) => [seat],
    allowNone: true,
    prompt: prompts.sheriffWithdraw,
    channel: () => 'public',
    describe: (_ctx, _seat, targets) => (targets.length ? '退水' : '继续竞选'),
    apply: applyWithdraw,
    next: [{ when: (ctx) => ctx.state.sheriffCandidates.length <= 1, goto: 'sheriff_resolve' }, { goto: 'sheriff_vote' }],
  },
  sheriff_vote: {
    kind: 'vote',
    title: '警长投票',
    voters: sheriffVoters,
    candidates: (ctx) => ctx.state.sheriffCandidates,
    prompt: prompts.sheriffVote,
    allowAbstain: true,
    tie: { runoff: 0, then: 'none' },
    apply: recordSheriffVote,
    next: [
      { when: (ctx) => ctx.result?.kind === 'vote' && ctx.result.tied.length > 1, goto: 'sheriff_pk_speech' },
      { goto: 'sheriff_resolve' },
    ],
  },
  sheriff_pk_speech: {
    kind: 'speak',
    title: '警长 PK',
    actors: pkOrder,
    prompt: prompts.sheriffPkSpeech,
    output: speechOutput({ max: 120 }),
    fallback: campaignFallback,
    next: 'sheriff_pk_vote',
  },
  sheriff_pk_vote: {
    kind: 'vote',
    title: '警长 PK 投票',
    voters: pkVoters,
    candidates: pkCandidates,
    prompt: prompts.sheriffVote,
    allowAbstain: true,
    tie: { runoff: 0, then: 'none' },
    apply: recordSheriffVote,
    next: 'sheriff_resolve',
  },
  sheriff_resolve: { kind: 'compute', run: resolveSheriff, next: 'dawn' },
} satisfies WerewolfPhases;
