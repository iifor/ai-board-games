import type { EndResult, Seat } from '@battle/engine';
import { cupidSide, cupidSummary } from '../special/cupid';
import { hiddenWolfDoomed } from '../special/hiddenWolf';
import { hybridSummary } from '../special/hybrid';
import { roleCategory } from './board';
import { canVote, isWolf, type WerewolfContext } from './context';
import { exileWeight } from './sheriff';
import { contenders, inThirdParty, thirdPartyStanding, thirdPartyWinner, type ThirdPartyKind } from './thirdParty';

/**
 * bombman：炸弹人引爆时同时炸死所有狼人和一整边好人，作为第三方单独获胜；
 * lovers / requester：第三方阵营屠城获胜（见 rules/thirdParty.ts）。
 */
export type WerewolfWinner = 'good' | 'werewolf' | 'bombman' | ThirdPartyKind;

const LABELS: Readonly<Record<WerewolfWinner, string>> = {
  good: '好人阵营胜利',
  werewolf: '狼人阵营胜利',
  bombman: '炸弹人胜利',
  lovers: '情侣阵营胜利',
  requester: '祈求者胜利',
};

/** 屠边：只看给定的存活座位，判断神职或村民（按本局角色类别）是否已被全部淘汰 */
export function sideEliminated(ctx: WerewolfContext, alive: readonly Seat[]): boolean {
  const gods = alive.filter((seat) => roleCategory(ctx, seat) === 'god').length;
  const villagers = alive.filter((seat) => roleCategory(ctx, seat) === 'villager').length;
  return gods === 0 || villagers === 0;
}

/** 狼人在给定存活座位中屠边，且没有第三方成员存活（天亮的狼刀锁定也用它判断） */
export function wolvesSweep(ctx: WerewolfContext, alive: readonly Seat[]): boolean {
  const fighting = contenders(ctx, alive);
  return fighting.length === alive.length && sideEliminated(ctx, fighting);
}

function effectiveVotes(ctx: WerewolfContext, seats: readonly Seat[], wolves: boolean): number {
  return seats
    .filter((seat) => isWolf(seat) === wolves && canVote(ctx, seat))
    .reduce((sum, seat) => sum + exileWeight(ctx, seat), 0);
}

/** 好人与狼人之间的胜负：第三方还有人存活时双方都不能获胜 */
function sidesWinner(ctx: WerewolfContext, alive: readonly Seat[]): 'good' | 'werewolf' | null {
  const fighting = contenders(ctx, alive);
  const thirdStanding = fighting.length < alive.length;
  if (fighting.filter(isWolf).length === 0) return thirdStanding ? null : 'good';
  if (thirdStanding) return null;
  if (sideEliminated(ctx, fighting)) return 'werewolf';
  return effectiveVotes(ctx, fighting, true) > effectiveVotes(ctx, fighting, false) ? 'werewolf' : null;
}

/**
 * 胜负判定（依次）：炸弹人炸光 → 炸弹人胜；狼刀锁定 → 狼人胜；存活者全是第三方 → 第三方胜；随狼队出局的隐狼尚未结算 → 暂缓；
 * 之后在第三方以外的座位中判断：狼人阵营全灭（且第三方也已全灭）→ 好人胜；神职或村民全灭 → 狼人胜；
 * 狼人有效票数严格多于好人 → 狼人胜（好人已无法靠投票翻盘）。第三方还有人存活时好人与狼人都不能获胜。
 */
export function decideWinner(ctx: WerewolfContext): WerewolfWinner | null {
  if (ctx.state.bombmanWin) return 'bombman';
  if (ctx.state.winnerLock === 'werewolf') return 'werewolf';
  const third = thirdPartyWinner(ctx);
  if (third !== null) return third;
  if (hiddenWolfDoomed(ctx)) return null;
  return sidesWinner(ctx, ctx.seats.alive().list());
}

/** 该座位是否属于胜利一方（MVP 平票时优先） */
export function onWinningSide(ctx: WerewolfContext, seat: number, winner: WerewolfWinner): boolean {
  const target = ctx.seats.get(seat);
  if (winner === 'bombman') return target.role === 'bombman';
  if (winner === 'lovers' || winner === 'requester') return inThirdParty(ctx, seat);
  if (inThirdParty(ctx, seat)) return false;
  const side = cupidSide(ctx, target);
  if (side !== null) return side === winner;
  return isWolf(target) === (winner === 'werewolf');
}

function winReason(ctx: WerewolfContext, winner: WerewolfWinner): string {
  if (winner === 'bombman') return '引爆同时炸死了所有狼人和一整边好人';
  if (winner === 'lovers' || winner === 'requester') return '其他玩家全部出局';
  if (ctx.state.winnerLock === 'werewolf') return '狼刀达成屠边';
  if (winner === 'good') return ctx.state.thirdParty ? '狼人与第三方全部出局' : '狼人全部出局';
  if (sideEliminated(ctx, contenders(ctx, ctx.seats.alive().list()))) return '屠边成功';
  return '狼人票数已占优势';
}

/** 胜负说明后附加特殊角色的个人结果（混血儿跟随主人、丘比特跟随情侣） */
function withNotes(ctx: WerewolfContext, winner: WerewolfWinner, summary: string): string {
  const notes = [hybridSummary(ctx, winner), cupidSummary(ctx, winner)].filter((note): note is string => note !== null);
  return [summary, ...notes].join('；');
}

/** 达到天数上限：第三方以外还有狼人 → 狼人胜；否则还有第三方 → 第三方胜；都没有 → 好人胜 */
function budgetWinner(ctx: WerewolfContext): WerewolfWinner {
  if (contenders(ctx, ctx.seats.alive().list()).some(isWolf)) return 'werewolf';
  const third = ctx.state.thirdParty;
  return third && thirdPartyStanding(ctx) ? third.kind : 'good';
}

export function werewolfResult(ctx: WerewolfContext): EndResult {
  const mvp = ctx.state.mvp;
  if (ctx.endReason === 'budget') {
    const winner = budgetWinner(ctx);
    return { winner, winnerLabel: LABELS[winner], summary: withNotes(ctx, winner, `达到天数上限，按存活情况判定${LABELS[winner]}`), mvp };
  }
  const winner = decideWinner(ctx) ?? 'good';
  const summary = withNotes(ctx, winner, `${LABELS[winner]}：${winReason(ctx, winner)}（第 ${ctx.round} 天）`);
  return { winner, winnerLabel: LABELS[winner], summary, mvp };
}
