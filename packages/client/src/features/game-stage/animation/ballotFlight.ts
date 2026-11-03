import type { StageEvent, VoteBallot } from '@battle/shared';
import type { RingPoint } from '../layouts/ringGeometry';
import { describeEvent, displayDuration } from '../playback/describe';

export type VoteEvent = Extract<StageEvent, { kind: 'vote_tallied' }>;

/** 选票飞行最多占这段停留时长的比例，剩下的时间留给票数条长出 */
export const FLIGHT_BUDGET_RATIO = 0.6;
/** 一次计票里全部选票飞完的最长时间 */
export const FLIGHT_MAX_MS = 3000;
/** 拿不到播放速度（没有当前段）时的保守上限 */
export const FLIGHT_FALLBACK_MS = 1200;

const BALLOT_MIN_MS = 240;
const BALLOT_MAX_MS = 700;
const STAGGER_MIN_MS = 40;
const STAGGER_MAX_MS = 140;
const ARC_SAMPLES = 14;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface FlightTiming {
  /** 每张选票飞行（或弃票闪烁）的时长 */
  readonly durationMs: number;
  /** 相邻两张选票起飞的间隔 */
  readonly staggerMs: number;
  /** 最后一张落地的时刻，票板从这时开始长条 */
  readonly totalMs: number;
}

/** 舞台布局拿到的计票信息：选票、弃票与时间安排；布局自己把座位换算成坐标 */
export interface VoteFlight {
  readonly seq: number;
  readonly ballots: readonly VoteBallot[];
  readonly abstained: readonly number[];
  readonly timing: FlightTiming;
}

export interface FlightKeyframe {
  readonly offset: number;
  readonly transform: string;
  readonly opacity: number;
}

export interface BallotFlightItem {
  readonly kind: 'ballot';
  readonly key: string;
  readonly voter: number;
  readonly target: number;
  readonly weight: number;
  readonly from: RingPoint;
  readonly to: RingPoint;
  readonly keyframes: readonly FlightKeyframe[];
  readonly delayMs: number;
  readonly durationMs: number;
}

export interface AbstainFlightItem {
  readonly kind: 'abstain';
  readonly key: string;
  readonly voter: number;
  readonly at: RingPoint;
  readonly delayMs: number;
  readonly durationMs: number;
}

export type FlightItem = BallotFlightItem | AbstainFlightItem;

export interface FlightPlan {
  readonly items: readonly FlightItem[];
  readonly totalMs: number;
}

/** 飞行时间预算：停留时长的六成，封顶；没有停留时长时用保守上限 */
export function flightBudgetMs(dwellMs: number | null): number {
  if (dwellMs === null) return FLIGHT_FALLBACK_MS;
  return Math.round(clamp(dwellMs * FLIGHT_BUDGET_RATIO, 0, FLIGHT_MAX_MS));
}

/** 把预算分给 count 张选票：单张时长取预算的一部分（有上下限），其余摊成起飞间隔；预算为 0 时不飞 */
export function flightTiming(count: number, budgetMs: number): FlightTiming {
  if (count <= 0 || budgetMs <= 0) return { durationMs: 0, staggerMs: 0, totalMs: 0 };
  const durationMs = Math.min(budgetMs, Math.round(clamp(budgetMs * 0.45, BALLOT_MIN_MS, BALLOT_MAX_MS)));
  const staggerMs = count > 1 ? Math.round(clamp((budgetMs - durationMs) / (count - 1), STAGGER_MIN_MS, STAGGER_MAX_MS)) : 0;
  return { durationMs, staggerMs, totalMs: durationMs + staggerMs * (count - 1) };
}

/** 当前计票事件的飞行安排：按播放速度缩放的停留时长决定预算；减少动效时预算为 0（票板立刻长条） */
export function voteFlightOf(event: VoteEvent, rate: number | null, reducedMotion: boolean): VoteFlight {
  const dwell = rate === null ? null : displayDuration(describeEvent(event).text, rate);
  const budget = reducedMotion ? 0 : flightBudgetMs(dwell);
  const count = event.ballots.length + event.abstained.length;
  return { seq: event.seq, ballots: event.ballots, abstained: event.abstained, timing: flightTiming(count, budget) };
}

/**
 * 弧线的控制点：从弦中点朝桌心挪一段，再沿弦的法线抬一点——
 * 相邻座位之间的票绕着桌边飞进来，正对面的两个座位之间也不会是一条直线
 */
export function arcControl(from: RingPoint, to: RingPoint, centre: RingPoint): RingPoint {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / distance, y: dx / distance };
  return {
    x: mid.x + (centre.x - mid.x) * 0.35 + normal.x * distance * 0.12,
    y: mid.y + (centre.y - mid.y) * 0.35 + normal.y * distance * 0.12,
  };
}

/** 二次贝塞尔曲线上的等参数采样点（含两端） */
export function arcPoints(from: RingPoint, to: RingPoint, control: RingPoint, samples: number = ARC_SAMPLES): readonly RingPoint[] {
  const points: RingPoint[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    points.push({ x: a * from.x + b * control.x + c * to.x, y: a * from.y + b * control.y + c * to.y });
  }
  return points;
}

const round = (value: number) => Math.round(value * 10) / 10;

/** 沿弧线飞的关键帧：起点淡入放大，终点缩小消失（落进卡片，卡片随即一弹） */
export function arcKeyframes(points: readonly RingPoint[]): readonly FlightKeyframe[] {
  const last = points.length - 1;
  return points.map((pointAt, index) => {
    const t = last === 0 ? 1 : index / last;
    const scale = index === 0 ? 0.5 : index === last ? 0.6 : 1 + 0.15 * Math.sin(t * Math.PI);
    const opacity = index === 0 || index === last ? 0 : 1;
    return { offset: t, transform: `translate(${round(pointAt.x)}px, ${round(pointAt.y)}px) scale(${round(scale)})`, opacity };
  });
}

/**
 * 整个计票的飞行计划：选票按投票者座位号依次起飞，弃票排在最后原地闪烁；
 * 布局里没有坐标的座位（理论上不会有）跳过，不占起飞位
 */
export function planFlight(
  ballots: readonly VoteBallot[],
  abstained: readonly number[],
  anchorOf: (seat: number) => RingPoint | null,
  centre: RingPoint,
  timing: FlightTiming,
): FlightPlan {
  if (timing.totalMs <= 0) return { items: [], totalMs: 0 };
  const items: FlightItem[] = [];
  const slot = () => items.length * timing.staggerMs;
  for (const ballot of [...ballots].sort((a, b) => a.voter - b.voter)) {
    const from = anchorOf(ballot.voter);
    const to = anchorOf(ballot.target);
    if (!from || !to) continue;
    const keyframes = arcKeyframes(arcPoints(from, to, arcControl(from, to, centre)));
    items.push({ kind: 'ballot', key: `b${ballot.voter}-${ballot.target}`, voter: ballot.voter, target: ballot.target, weight: ballot.weight, from, to, keyframes, delayMs: slot(), durationMs: timing.durationMs });
  }
  for (const voter of [...abstained].sort((a, b) => a - b)) {
    const at = anchorOf(voter);
    if (!at) continue;
    items.push({ kind: 'abstain', key: `a${voter}`, voter, at, delayMs: slot(), durationMs: timing.durationMs });
  }
  const last = items[items.length - 1];
  return { items, totalMs: last ? last.delayMs + last.durationMs : 0 };
}
