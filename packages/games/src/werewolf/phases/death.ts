import { speechOutput } from '@battle/engine';
import { werewolfPrompts as prompts } from '../prompts';
import { describeShot, recordShot, resolveSelfDestruct, resolveShot, triggerSeat } from '../rules/death';
import { applyBadgeTransfer, describeBadgeTransfer } from '../rules/sheriff';
import type { WerewolfPhases } from './types';

/** 由触发器插入的阶段：出局者是 ctx.trigger.seat */
export const deathPhases = {
  last_words: {
    kind: 'speak',
    title: '遗言',
    actors: triggerSeat,
    prompt: prompts.lastWords,
    output: speechOutput({ max: 120 }),
    fallback: () => ({ speech: '我没有更多要说的了，祝好人胜利。' }),
    next: 'return',
  },
  hunter_shot: {
    kind: 'act',
    title: '猎人开枪',
    action: '开枪',
    actors: triggerSeat,
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: prompts.hunterShot,
    channel: () => 'public',
    describe: describeShot,
    apply: recordShot,
    next: 'hunter_resolve',
  },
  hunter_resolve: { kind: 'compute', run: resolveShot, next: 'return' },
  badge_transfer: {
    kind: 'act',
    title: '移交警徽',
    action: '移交警徽',
    actors: triggerSeat,
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: prompts.badgeTransfer,
    channel: () => 'public',
    describe: describeBadgeTransfer,
    apply: applyBadgeTransfer,
    next: 'return',
  },
  self_destruct: {
    kind: 'compute',
    title: '自爆',
    run: resolveSelfDestruct,
    next: [{ goto: 'night_start', round: 'increment' }],
  },
} satisfies WerewolfPhases;
