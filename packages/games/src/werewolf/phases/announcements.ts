import { nightCalls } from '../nightCalls';
import { joinNotices, line, roleCall } from '../announcements';
import { deckRoles } from '../rules/board';
import type { WerewolfContext } from '../rules/context';
import { daySpeakers } from '../rules/day';
import { pkOrder } from '../rules/sheriff';

/** 夜间只读取公开牌堆（含底牌）和天数；所有列入叫号的阶段本身也必须按公开条件进入。 */
function nightCall(phase: string, ctx: Pick<WerewolfContext, 'variant' | 'round' | 'announcementOverrides'>): string | null {
  if (phase === 'wolf_chat') return roleCall(ctx, 'werewolf');
  if (phase === 'ghost_bride_chat' && deckRoles(ctx).has('ghost_bride')) {
    return line(ctx, ctx.round === 1 ? 'brideFirst' : 'brideLater');
  }
  // 灵狼和祈求者首夜已经叫过，后续夜晚在常规技能时段叫号。
  const role = nightCalls.get(phase);
  if (!role || !deckRoles(ctx).has(role)) return null;
  if (phase === 'spirit_wolf_antidote') return ctx.round === 1 ? null : line(ctx, 'spiritLater');
  if (phase === 'requester_kill') return ctx.round === 1 ? null : line(ctx, 'requesterLater');
  return roleCall(ctx, role);
}

export function phaseAnnouncement(ctx: WerewolfContext): string | null {
  switch (ctx.phaseId) {
    case 'sheriff_signup': return joinNotices(line(ctx, 'wake'), line(ctx, 'sheriffSignup'));
    case 'sheriff_vote': return line(ctx, 'sheriffVote');
    case 'sheriff_pk_speech': {
      const seats = pkOrder(ctx).map((seat) => `${seat}号`).join('、');
      return line(ctx, 'sheriffPk', { 座位名单: seats });
    }
    case 'sheriff_pk_vote': return line(ctx, 'sheriffRevote');
    case 'day_speech': {
      const [first] = daySpeakers(ctx);
      if (first === undefined) return null;
      const assigned = ctx.state.sheriff !== null && ctx.seats.get(ctx.state.sheriff).alive && ctx.state.speechStart === first;
      return line(ctx, assigned ? 'sheriffSpeechStart' : 'speechStart', { 座号: first });
    }
    case 'exile_vote': return line(ctx, 'exileVote');
    case 'last_words':
      if (ctx.trigger?.kind !== 'seat_eliminated' || ctx.trigger.cause === 'exile') return null;
      return line(ctx, 'lastWords', { 座号: ctx.trigger.seat });
    default: return ctx.phaseId ? nightCall(ctx.phaseId, ctx) : null;
  }
}
