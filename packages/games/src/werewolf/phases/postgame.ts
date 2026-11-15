import { line } from '../announcements';
import { speechOutput } from '@battle/engine';
import { WEREWOLF_SPEECH_MAX_CHARS } from '../../speechLimits';
import { werewolfPrompts as prompts } from '../prompts';
import { postgameSpeakers, resolveMvp } from '../rules/postgame';
import { werewolfResult } from '../rules/victory';
import type { WerewolfPhases } from './types';

export const postgamePhases = {
  postgame_reveal: {
    kind: 'reveal',
    title: '赛后复盘',
    revealRoles: true,
    content: (ctx) => ({ text: line(ctx, 'winner', { 胜负结果: werewolfResult(ctx).summary }) }),
    next: 'mvp_vote',
  },
  mvp_vote: {
    kind: 'vote',
    title: 'MVP 评选',
    voters: (ctx) => ctx.seats.all(),
    candidates: (ctx, voter) => ctx.seats.except(voter),
    prompt: prompts.mvpVote,
    allowAbstain: true,
    tie: { runoff: 0, then: 'none' },
    next: 'mvp_resolve',
  },
  mvp_resolve: { kind: 'compute', run: resolveMvp, next: 'postgame_speech' },
  postgame_speech: {
    kind: 'speak',
    title: '赛后发言',
    actors: postgameSpeakers,
    allowSkip: true,
    prompt: prompts.postgameSpeech,
    output: speechOutput({ max: WEREWOLF_SPEECH_MAX_CHARS }),
    fallback: () => ({ speech: '这局大家都辛苦了。' }),
    next: 'end',
  },
} satisfies WerewolfPhases;
