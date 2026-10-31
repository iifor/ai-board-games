import { expectResult, type ComputeOutcome } from '@battle/engine';
import type { WerewolfState } from '../state';
import type { WerewolfContext } from './context';
import { decideWinner, onWinningSide } from './victory';

/**
 * MVP：得票最多者当选；并列时优先胜利阵营，再取座位号最小者；无人投票时取胜利阵营中座位号最小者。
 */
export function resolveMvp(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const { outcome, tied } = expectResult(ctx.results, 'mvp_vote', 'vote');
  let mvp: number;
  if (outcome.kind === 'selected') {
    mvp = outcome.seat;
  } else {
    const winner = decideWinner(ctx) ?? 'good';
    const pool = tied.length ? [...tied] : ctx.seats.ids();
    const preferred = pool.filter((seat) => onWinningSide(ctx, seat, winner));
    mvp = Math.min(...(preferred.length ? preferred : pool));
  }
  return { state: { ...ctx.state, mvp }, log: [{ kind: 'narration', text: `本局 MVP：${mvp}号。` }] };
}

/** 赛后发言：按座位号依次发言，MVP 最后 */
export function postgameSpeakers(ctx: WerewolfContext): number[] {
  const { mvp } = ctx.state;
  const seats = ctx.seats.ids().filter((seat) => seat !== mvp);
  return mvp === null ? seats : [...seats, mvp];
}
