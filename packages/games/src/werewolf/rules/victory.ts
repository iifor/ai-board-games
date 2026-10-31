import type { EndResult, Seat } from '@battle/engine';
import { hiddenWolfDoomed } from '../special/hiddenWolf';
import { hybridSummary } from '../special/hybrid';
import { roleCategory } from './board';
import { canVote, isWolf, type WerewolfContext } from './context';
import { SHERIFF_VOTE_WEIGHT } from './sheriff';

/** bombman：炸弹人引爆时同时炸死所有狼人和一整边好人，作为第三方单独获胜 */
export type WerewolfWinner = 'good' | 'werewolf' | 'bombman';

const LABELS: Readonly<Record<WerewolfWinner, string>> = { good: '好人阵营胜利', werewolf: '狼人阵营胜利', bombman: '炸弹人胜利' };

/** 屠边：只看给定的存活座位，判断神职或村民（按本局角色类别）是否已被全部淘汰 */
export function sideEliminated(ctx: WerewolfContext, alive: readonly Seat[]): boolean {
  const gods = alive.filter((seat) => roleCategory(ctx, seat) === 'god').length;
  const villagers = alive.filter((seat) => roleCategory(ctx, seat) === 'villager').length;
  return gods === 0 || villagers === 0;
}

function effectiveVotes(ctx: WerewolfContext, wolves: boolean): number {
  return ctx.seats.alive().list()
    .filter((seat) => isWolf(seat) === wolves && canVote(ctx, seat))
    .reduce((sum, seat) => sum + (seat.seat === ctx.state.sheriff ? SHERIFF_VOTE_WEIGHT : 1), 0);
}

/**
 * 胜负判定（依次）：炸弹人炸光 → 炸弹人胜；狼刀锁定 → 狼人胜；随狼队出局的隐狼尚未结算 → 暂缓；
 * 狼人阵营全灭 → 好人胜；神职或村民全灭 → 狼人胜；狼人有效票数严格多于好人 → 狼人胜（好人已无法靠投票翻盘）。
 */
export function decideWinner(ctx: WerewolfContext): WerewolfWinner | null {
  const alive = ctx.seats.alive();
  if (ctx.state.bombmanWin) return 'bombman';
  if (ctx.state.winnerLock === 'werewolf') return 'werewolf';
  if (hiddenWolfDoomed(ctx)) return null;
  if (alive.where(isWolf).count() === 0) return 'good';
  if (sideEliminated(ctx, alive.list())) return 'werewolf';
  if (effectiveVotes(ctx, true) > effectiveVotes(ctx, false)) return 'werewolf';
  return null;
}

/** 该座位是否属于胜利一方（MVP 平票时优先） */
export function onWinningSide(ctx: WerewolfContext, seat: number, winner: WerewolfWinner): boolean {
  const target = ctx.seats.get(seat);
  if (winner === 'bombman') return target.role === 'bombman';
  return isWolf(target) === (winner === 'werewolf');
}

function winReason(ctx: WerewolfContext, winner: WerewolfWinner): string {
  if (winner === 'bombman') return '引爆同时炸死了所有狼人和一整边好人';
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
    const winner: WerewolfWinner = ctx.seats.alive().where(isWolf).count() > 0 ? 'werewolf' : 'good';
    return { winner, winnerLabel: LABELS[winner], summary: withNotes(ctx, winner, `达到天数上限，按存活情况判定${LABELS[winner]}`), mvp };
  }
  const winner = decideWinner(ctx) ?? 'good';
  const summary = withNotes(ctx, winner, `${LABELS[winner]}：${winReason(ctx, winner)}（第 ${ctx.round} 天）`);
  return { winner, winnerLabel: LABELS[winner], summary, mvp };
}
