import type { EndResult, Seat } from '@battle/engine';
import { hybridSummary } from '../special/hybrid';
import { roleCategory } from './board';
import { canVote, type WerewolfContext } from './context';
import { SHERIFF_VOTE_WEIGHT } from './sheriff';

export type WerewolfWinner = 'good' | 'werewolf';

const LABELS: Readonly<Record<WerewolfWinner, string>> = { good: '好人阵营胜利', werewolf: '狼人阵营胜利' };

/** 屠边：只看给定的存活座位，判断神职或村民（按本局角色类别）是否已被全部淘汰 */
export function sideEliminated(ctx: WerewolfContext, alive: readonly Seat[]): boolean {
  const gods = alive.filter((seat) => roleCategory(ctx, seat) === 'god').length;
  const villagers = alive.filter((seat) => roleCategory(ctx, seat) === 'villager').length;
  return gods === 0 || villagers === 0;
}

function effectiveVotes(ctx: WerewolfContext, wolves: boolean): number {
  return ctx.seats.alive().list()
    .filter((seat) => (seat.team === 'werewolf') === wolves && canVote(ctx, seat))
    .reduce((sum, seat) => sum + (seat.seat === ctx.state.sheriff ? SHERIFF_VOTE_WEIGHT : 1), 0);
}

/**
 * 胜负判定（依次）：狼刀锁定 → 狼人胜；狼人全灭 → 好人胜；神职或村民全灭 → 狼人胜；
 * 狼人有效票数严格多于好人 → 狼人胜（好人已无法靠投票翻盘）。
 */
export function decideWinner(ctx: WerewolfContext): WerewolfWinner | null {
  const alive = ctx.seats.alive();
  if (ctx.state.winnerLock === 'werewolf') return 'werewolf';
  if (alive.inTeam('werewolf').count() === 0) return 'good';
  if (sideEliminated(ctx, alive.list())) return 'werewolf';
  if (effectiveVotes(ctx, true) > effectiveVotes(ctx, false)) return 'werewolf';
  return null;
}

function winReason(ctx: WerewolfContext, winner: WerewolfWinner): string {
  if (ctx.state.winnerLock === 'werewolf') return '狼刀达成屠边';
  if (winner === 'good') return '狼人全部出局';
  if (sideEliminated(ctx, ctx.seats.alive().list())) return '屠边成功';
  return '狼人票数已占优势';
}

/** 胜负说明后附加特殊角色的个人结果（如混血儿跟随主人） */
function withNotes(ctx: WerewolfContext, winner: WerewolfWinner, summary: string): string {
  const note = hybridSummary(ctx, winner);
  return note === null ? summary : `${summary}；${note}`;
}

export function werewolfResult(ctx: WerewolfContext): EndResult {
  const mvp = ctx.state.mvp;
  if (ctx.endReason === 'budget') {
    const winner: WerewolfWinner = ctx.seats.alive().inTeam('werewolf').count() > 0 ? 'werewolf' : 'good';
    return { winner, winnerLabel: LABELS[winner], summary: withNotes(ctx, winner, `达到天数上限，按存活情况判定${LABELS[winner]}`), mvp };
  }
  const winner = decideWinner(ctx) ?? 'good';
  const summary = withNotes(ctx, winner, `${LABELS[winner]}：${winReason(ctx, winner)}（第 ${ctx.round} 天）`);
  return { winner, winnerLabel: LABELS[winner], summary, mvp };
}
