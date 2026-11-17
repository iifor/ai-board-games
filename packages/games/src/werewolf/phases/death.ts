import { speechOutput } from '@battle/engine';
import { WEREWOLF_SPEECH_MAX_CHARS } from '../../speechLimits';
import { werewolfPrompts as prompts } from '../prompts';
import { describeShot, recordShot, resolveSelfDestruct, resolveShot, triggerSeat } from '../rules/death';
import { applyBadgeTransfer, describeBadgeTransfer } from '../rules/sheriff';
import { announceDawn } from '../rules/dawn';
import type { WerewolfPhases } from './types';
import { WEREWOLF_ASIDE } from '../../speechLimits';

/** 由触发器插入的阶段：出局者是 ctx.trigger.seat */
export const deathPhases = {
  last_words: {
    kind: 'speak',
    title: '遗言',
    actors: triggerSeat,
    prompt: prompts.lastWords,
    output: speechOutput({ max: WEREWOLF_SPEECH_MAX_CHARS }),
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
    aside: WEREWOLF_ASIDE,
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
  sheriff_self_destruct: {
    kind: 'compute',
    title: '自爆吞警徽',
    run: ctx => {
      // 首夜已结算，但警选在公布死讯之前。入夜前必须落实死亡及其出局技能。
      const dawn = announceDawn(ctx);
      return {
        ...dawn,
        state: { ...(dawn.state ?? ctx.state), sheriff: null, sheriffCandidates: [] },
        log: [{ kind: 'narration', text: '警长竞选因自爆终止，本局没有警长。' }, ...(dawn.log ?? [])],
        eliminate: [...(resolveSelfDestruct(ctx).eliminate ?? []), ...(dawn.eliminate ?? [])],
      };
    },
    next: [{ goto: 'night_start', round: 'increment' }],
  },
} satisfies WerewolfPhases;
