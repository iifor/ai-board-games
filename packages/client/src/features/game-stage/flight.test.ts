import { describe, expect, it } from 'vitest';
import {
  arcControl, arcKeyframes, arcPoints, FLIGHT_FALLBACK_MS, FLIGHT_MAX_MS, flightBudgetMs, flightTiming, planFlight, voteFlightOf, type VoteEvent,
} from './animation/ballotFlight';
import { meta } from './stage.fixtures';

const timing = { durationMs: 400, staggerMs: 100, totalMs: 700 };
const anchors: Record<number, { x: number; y: number }> = { 1: { x: 100, y: 0 }, 2: { x: 200, y: 100 }, 3: { x: 100, y: 200 }, 4: { x: 0, y: 100 } };
const anchorOf = (seat: number) => anchors[seat] ?? null;
const centre = { x: 100, y: 100 };

describe('ballot flight budget and timing', () => {
  it('spends at most six tenths of the dwell on the flight, capped, and falls back to 1.2 s without a speed', () => {
    expect(flightBudgetMs(null)).toBe(FLIGHT_FALLBACK_MS);
    expect(flightBudgetMs(2000)).toBe(1200);
    expect(flightBudgetMs(60_000)).toBe(FLIGHT_MAX_MS);
    expect(flightBudgetMs(0)).toBe(0);
  });

  it('splits the budget into a per-ballot duration and a stagger so the last ballot lands within the budget', () => {
    expect(flightTiming(0, 1000)).toEqual({ durationMs: 0, staggerMs: 0, totalMs: 0 });
    expect(flightTiming(5, 0)).toEqual({ durationMs: 0, staggerMs: 0, totalMs: 0 });
    expect(flightTiming(1, 1000)).toEqual({ durationMs: 450, staggerMs: 0, totalMs: 450 });
    const twelve = flightTiming(12, 1280);
    expect(twelve.durationMs).toBe(576);
    expect(twelve.staggerMs).toBe(64);
    expect(twelve.totalMs).toBeLessThanOrEqual(1280);
    // 预算再小也保证最短的时长与间隔，飞行看得清，宁可略超预算
    const tight = flightTiming(12, 300);
    expect(tight.durationMs).toBe(240);
    expect(tight.staggerMs).toBe(40);
  });

  it('scales the flight with the playback speed and skips it under reduced motion', () => {
    const event: VoteEvent = {
      ...meta, kind: 'vote_tallied', title: '放逐投票', runoff: 0, abstained: [4],
      ballots: [{ voter: 1, target: 2, weight: 1 }, { voter: 3, target: 2, weight: 1 }], tally: [{ target: 2, votes: 2 }], tied: [], outcome: { kind: 'selected', seat: 2, byTieBreak: false },
    };
    const normal = voteFlightOf(event, 1, false);
    const fast = voteFlightOf(event, 2, false);
    expect(normal.seq).toBe(event.seq);
    expect(normal.ballots).toBe(event.ballots);
    expect(normal.timing.totalMs).toBeGreaterThan(0);
    expect(fast.timing.totalMs).toBeLessThan(normal.timing.totalMs);
    expect(voteFlightOf(event, 1, true).timing.totalMs).toBe(0);
    expect(voteFlightOf(event, null, false).timing.totalMs).toBeLessThanOrEqual(FLIGHT_FALLBACK_MS);
  });
});

describe('ballot arc', () => {
  it('bends the chord towards the table centre and lifts it off the straight line', () => {
    const control = arcControl({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 });
    expect(control.x).toBeCloseTo(50, 5);
    expect(control.y).toBeGreaterThan(0);
    expect(control.y).toBeLessThan(100);
    // 正对面的两个座位：弦穿过桌心，法线抬升让它仍是一条弧
    const across = arcControl(anchors[1]!, anchors[3]!, centre);
    expect(across.x).not.toBeCloseTo(100, 5);
  });

  it('samples the curve from the voter to the target and fades the token in and out at the ends', () => {
    const from = anchors[1]!;
    const to = anchors[2]!;
    const points = arcPoints(from, to, arcControl(from, to, centre), 10);
    expect(points).toHaveLength(11);
    expect(points[0]).toEqual(from);
    expect(points[10]?.x).toBeCloseTo(to.x, 5);
    expect(points[10]?.y).toBeCloseTo(to.y, 5);
    const frames = arcKeyframes(points);
    expect(frames[0]).toMatchObject({ offset: 0, opacity: 0 });
    expect(frames[0]?.transform).toContain('translate(100px, 0px)');
    expect(frames[10]).toMatchObject({ offset: 1, opacity: 0 });
    expect(frames[5]?.opacity).toBe(1);
  });
});

describe('ballot flight plan', () => {
  it('launches ballots in voter order, abstentions last, and skips seats without a position', () => {
    const plan = planFlight(
      [{ voter: 3, target: 1, weight: 1 }, { voter: 1, target: 2, weight: 1.5 }, { voter: 9, target: 1, weight: 1 }],
      [4],
      anchorOf,
      centre,
      timing,
    );
    expect(plan.items.map((item) => item.key)).toEqual(['b1-2', 'b3-1', 'a4']);
    expect(plan.items.map((item) => item.delayMs)).toEqual([0, 100, 200]);
    expect(plan.items[0]).toMatchObject({ kind: 'ballot', weight: 1.5, from: anchors[1], to: anchors[2], durationMs: 400 });
    expect(plan.items[2]).toMatchObject({ kind: 'abstain', voter: 4, at: anchors[4] });
    expect(plan.totalMs).toBe(600);
    expect(planFlight([{ voter: 1, target: 2, weight: 1 }], [], anchorOf, centre, { durationMs: 0, staggerMs: 0, totalMs: 0 })).toEqual({ items: [], totalMs: 0 });
  });
});
