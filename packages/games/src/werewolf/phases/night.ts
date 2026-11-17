import { speechOutput, type ActPhase } from '@battle/engine';
import { WEREWOLF_SPEECH_MAX_CHARS } from '../../speechLimits';
import { werewolfPrompts as prompts } from '../prompts';
import { line } from '../announcements';
import { announceBlocks, blockedSeats, nightActors, wolvesBlocked } from '../rules/block';
import { boardConfig, hasRole } from '../rules/board';
import {
  aliveWolves,
  applyWitchPoison,
  applyWitchSave,
  describeSeerCheck,
  recordSeerCheck,
  recordWolfKill,
  resetNight,
  witchPoisonTargets,
  witchSaveTargets,
  wolfChatOrder,
  wolfChatFallback,
  wolfKillTargets,
} from '../rules/night';
import { resolveNight } from '../rules/nightResolution';
import { nightAfter } from '../rules/order';
import { seerWakesLate } from '../rules/spiritWolfSkills';
import type { WerewolfParams, WerewolfState } from '../state';
import type { WerewolfPhases } from './types';
import { WEREWOLF_ASIDE } from '../../speechLimits';

/** 预言家查验；有灵狼的板子里预言家在灵狼之后睁眼（seer_check_late），两个位置只会启用一个 */
const seerCheck = {
  kind: 'act',
  title: '预言家查验',
  action: '查验',
  actors: (ctx) => nightActors(ctx, 'seer'),
  targets: (ctx, seat) => ctx.seats.alive().except(seat),
  prompt: prompts.seerCheck,
  aside: WEREWOLF_ASIDE,
  describe: describeSeerCheck,
  apply: recordSeerCheck,
} as const satisfies Omit<ActPhase<WerewolfState, WerewolfParams>, 'next'>;

export const nightPhases = {
  night_start: { kind: 'announce', title: '黑夜', text: prompts.nightFalls, next: nightAfter('night_start') },
  night_reset: { kind: 'compute', run: resetNight, next: nightAfter('night_reset') },
  night_blocks: {
    kind: 'compute',
    enabled: (ctx) => blockedSeats(ctx).length > 0,
    run: announceBlocks,
    next: nightAfter('night_blocks'),
  },
  wolf_chat: {
    kind: 'speak',
    title: '狼人夜聊',
    actors: (ctx) => wolvesBlocked(ctx) ? [] : wolfChatOrder(ctx).map((seat, index) => ({
      seat, vars: { isProposer: index === 0 ? 1 : 0, replyTopics: '' },
    })),
    prompt: prompts.wolfChat,
    followUp: { prompt: prompts.wolfChatReply, fallbackText: '这项配合我还没有确认。' },
    output: speechOutput({ max: WEREWOLF_SPEECH_MAX_CHARS }),
    fallback: wolfChatFallback,
    channel: () => 'team:werewolf',
    next: nightAfter('wolf_chat'),
  },
  wolf_kill: {
    kind: 'vote',
    title: '狼人击杀',
    voters: (ctx) => wolvesBlocked(ctx) ? [] : aliveWolves(ctx),
    candidates: wolfKillTargets,
    prompt: prompts.wolfKill,
    aside: WEREWOLF_ASIDE,
    allowAbstain: true,
    tie: { runoff: 0, then: 'seeded_random' },
    channel: 'team:werewolf',
    apply: recordWolfKill,
    next: nightAfter('wolf_kill'),
  },
  seer_check: { ...seerCheck, enabled: (ctx) => hasRole(ctx, 'seer') && !seerWakesLate(ctx), next: nightAfter('seer_check') },
  seer_check_late: { ...seerCheck, enabled: (ctx) => hasRole(ctx, 'seer') && seerWakesLate(ctx), next: nightAfter('seer_check_late') },
  witch_save: {
    kind: 'act',
    action: '使用解药',
    enabled: (ctx) => hasRole(ctx, 'witch'),
    actors: (ctx) => nightActors(ctx, 'witch'),
    targets: witchSaveTargets,
    allowNone: true,
    prompt: prompts.witchSave,
    aside: WEREWOLF_ASIDE,
    decisionNotice: (targets, ctx) => line(ctx, 'witchSave', { 座号: targets[0]! }),
    apply: applyWitchSave,
    next: nightAfter('witch_save'),
  },
  witch_poison: {
    kind: 'act',
    action: '使用毒药',
    enabled: (ctx) => hasRole(ctx, 'witch'),
    actors: (ctx) => nightActors(ctx, 'witch'),
    targets: witchPoisonTargets,
    allowNone: true,
    prompt: prompts.witchPoison,
    aside: WEREWOLF_ASIDE,
    decisionNotice: (_targets, ctx) => line(ctx, 'witchPoison'),
    apply: applyWitchPoison,
    next: nightAfter('witch_poison'),
  },
  night_resolve: {
    kind: 'compute',
    run: resolveNight,
    next: [{ when: (ctx) => ctx.round === 1 && boardConfig(ctx).sheriff, goto: 'sheriff_signup' }, { goto: 'dawn' }],
  },
} satisfies WerewolfPhases;
