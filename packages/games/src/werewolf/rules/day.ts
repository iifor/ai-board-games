import { findResult, type ActDecision, type ComputeOutcome, type Seat, type VoteBonus, type VoteOutcome } from '@battle/engine';
import { specialExileHooks } from '../special';
import type { WerewolfState } from '../state';
import { skillsLost } from './block';
import { canVote, ring, type WerewolfContext } from './context';

// 白天流程：放逐环节消费 special/index.ts 登记表中的放逐钩子（额外票、免于出局）；特殊角色模块不得引用本文件。

/** 警长左右两侧最近的存活玩家，警长从中选择发言起点 */
export function directionTargets(ctx: WerewolfContext, sheriff: Seat): number[] {
  const clockwise = ring(ctx, sheriff.seat, 1).find((seat) => seat !== sheriff.seat);
  const counterclockwise = ring(ctx, sheriff.seat, -1).find((seat) => seat !== sheriff.seat);
  return [...new Set([clockwise, counterclockwise].filter((seat): seat is number => seat !== undefined))];
}

export function applyDirection(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  return { ...ctx.state, speechStart: decisions.flatMap((decision) => decision.targets)[0] ?? null };
}

export function describeDirection(_ctx: WerewolfContext, _seat: Seat, targets: readonly number[]): string {
  const [start] = targets;
  return start === undefined ? '没有指定发言顺序' : `指定从 ${start}号 开始发言`;
}

/**
 * 白天发言顺序：
 * - 存活警长选了起点：从起点出发、背离警长的方向依次发言，警长最后；
 * - 否则：从昨晚最大号死者的下一位开始顺时针；平安夜则从种子决定的位置开始顺时针。
 * 今天被禁言的人跳过。
 */
export function daySpeakers(ctx: WerewolfContext): number[] {
  return speakingOrder(ctx).filter((seat) => seat !== ctx.state.silencedToday);
}

function speakingOrder(ctx: WerewolfContext): number[] {
  const { sheriff, speechStart, lastNightDeaths } = ctx.state;
  if (sheriff !== null && speechStart !== null && ctx.seats.get(sheriff).alive) {
    const clockwiseNeighbor = ring(ctx, sheriff, 1).find((seat) => seat !== sheriff);
    const step: 1 | -1 = speechStart === clockwiseNeighbor ? 1 : -1;
    return [...ring(ctx, speechStart, step).filter((seat) => seat !== sheriff), sheriff];
  }
  const total = ctx.seats.count();
  const lastDeath = lastNightDeaths.length ? Math.max(...lastNightDeaths) : null;
  const start = lastDeath !== null ? (lastDeath % total) + 1 : ctx.random('speech-start').int(total) + 1;
  return ring(ctx, start, 1);
}

export function exileVoters(ctx: WerewolfContext): Seat[] {
  return ctx.seats.alive().where((seat) => canVote(ctx, seat)).list().slice();
}

/** 不能投自己；翻牌的白痴不能再被放逐 */
export function exileCandidates(ctx: WerewolfContext, voter: Seat): number[] {
  return ctx.seats.alive().except(voter).where((seat) => !(seat.role === 'idiot' && ctx.state.idiotRevealed)).ids();
}

/** 放逐投票的额外票（乌鸦的诅咒） */
export function exileBonus(ctx: WerewolfContext): VoteBonus[] {
  return specialExileHooks.flatMap((hooks) => hooks.bonus?.(ctx) ?? []);
}

export function recordExile(ctx: WerewolfContext, outcome: VoteOutcome): WerewolfState {
  return { ...ctx.state, exileTarget: outcome.kind === 'selected' ? outcome.seat : null };
}

/** 特殊角色让被放逐者免于出局的结算（最后一名狼人是魔狼时翻牌存活）；没有干预时为 null */
function heldByExile(ctx: WerewolfContext, target: Seat, state: WerewolfState): ComputeOutcome<WerewolfState> | null {
  for (const hooks of specialExileHooks) {
    const outcome = hooks.hold?.(ctx, target, state);
    if (outcome) return outcome;
  }
  return null;
}

interface BonusShare {
  readonly label: string;
  readonly votes: number;
}

/** 被放逐者拿到的各来源额外票（乌鸦的诅咒等），按登记的来源说明归类 */
function bonusSharesFor(ctx: WerewolfContext, target: number): BonusShare[] {
  return specialExileHooks.flatMap((hooks) => {
    const votes = (hooks.bonus?.(ctx) ?? []).filter((item) => item.target === target).reduce((sum, item) => sum + item.votes, 0);
    return votes > 0 ? [{ label: hooks.bonusLabel ?? '额外票', votes }] : [];
  });
}

/**
 * 额外票参与了放逐时公开得票构成（选票含警长的 1.5 票）：
 * 全员弃票、只靠诅咒票当选的情况下明确说明票从哪里来，不会显示为零票当选。
 */
function describeExileVotes(ctx: WerewolfContext, target: number): string | null {
  const bonus = bonusSharesFor(ctx, target);
  if (bonus.length === 0) return null;
  const ballots = findResult(ctx.results, 'exile_vote', 'vote')?.ballots ?? [];
  const cast = ballots.filter((ballot) => ballot.target === target).reduce((sum, ballot) => sum + ballot.weight, 0);
  const total = cast + bonus.reduce((sum, item) => sum + item.votes, 0);
  const extra = bonus.map(({ label, votes }) => `${label} ${votes} 票`).join('、');
  return cast > 0
    ? `${target}号得 ${total} 票（选票 ${cast} 票，${extra}），被放逐。`
    : `${target}号没有得到任何选票，但有额外票（${extra}），以 ${total} 票被放逐。`;
}

/** 白痴首次被放逐时翻牌免死；特殊角色的免死结算（魔狼翻牌）；其他人出局；平票或全部弃票则无人出局 */
export function resolveExile(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const target = ctx.state.exileTarget;
  const state = { ...ctx.state, exileTarget: null };
  if (target === null) return { state, log: [{ kind: 'narration', text: '本轮无人被放逐。' }] };
  const seat = ctx.seats.get(target);
  if (seat.role === 'idiot' && !ctx.state.idiotRevealed && !skillsLost(ctx, seat)) {
    return {
      state: { ...state, idiotRevealed: true },
      log: [{ kind: 'revealed', text: `${target}号翻牌，身份是白痴，免于出局，但此后失去投票权。`, data: { seat: target, role: 'idiot' } }],
    };
  }
  const held = heldByExile(ctx, seat, state);
  if (held) return held;
  const composition = describeExileVotes(ctx, target);
  return {
    state,
    ...(composition === null ? {} : { log: [{ kind: 'narration' as const, text: composition }] }),
    eliminate: [{ seat: target, reason: '被放逐', cause: 'exile' }],
  };
}
