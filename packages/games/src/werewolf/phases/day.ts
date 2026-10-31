import { speechOutput } from '@battle/engine';
import { werewolfPrompts as prompts } from '../prompts';
import {
  applyDirection,
  daySpeakers,
  describeDirection,
  directionTargets,
  exileCandidates,
  exileVoters,
  recordExile,
  resolveExile,
} from '../rules/day';
import { canSelfDestruct } from '../rules/death';
import { announceDawn } from '../rules/dawn';
import { dayAfter } from '../rules/order';
import { sheriffWeight } from '../rules/sheriff';
import type { WerewolfPhases } from './types';

export const dayPhases = {
  dawn: { kind: 'compute', title: '天亮', run: announceDawn, next: dayAfter('dawn') },
  speech_direction: {
    kind: 'act',
    action: '指定发言顺序',
    actors: (ctx) => (ctx.state.sheriff !== null && ctx.seats.get(ctx.state.sheriff).alive ? [ctx.state.sheriff] : []),
    targets: directionTargets,
    prompt: prompts.speechDirection,
    channel: () => 'public',
    describe: describeDirection,
    apply: applyDirection,
    next: dayAfter('speech_direction'),
  },
  day_speech: {
    kind: 'speak',
    title: '白天发言',
    actors: daySpeakers,
    prompt: prompts.daySpeech,
    output: speechOutput({ max: 150 }),
    fallback: () => ({ speech: '我先听听大家的意见，暂时没有更多信息。' }),
    declarations: {
      selfDestruct: { label: '自爆', allowed: (_ctx, seat) => canSelfDestruct(seat) },
    },
    next: dayAfter('day_speech'),
  },
  exile_vote: {
    kind: 'vote',
    title: '放逐投票',
    voters: exileVoters,
    candidates: exileCandidates,
    weight: sheriffWeight,
    prompt: prompts.exileVote,
    allowAbstain: true,
    tie: { runoff: 0, then: 'none' },
    apply: recordExile,
    next: dayAfter('exile_vote'),
  },
  exile_resolve: { kind: 'compute', run: resolveExile, next: [{ goto: 'night_start', round: 'increment' }] },
} satisfies WerewolfPhases;
