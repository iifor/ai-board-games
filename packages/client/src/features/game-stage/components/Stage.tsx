import type { AudienceView, StageLayout } from '@battle/shared';
import { useMemo } from 'react';
import { voteFlightOf, type VoteFlight } from '../animation/ballotFlight';
import { prefersReducedMotion } from '../animation/motion';
import { LAYOUTS } from '../layouts/registry';
import { describeEvent } from '../playback/describe';
import type { SegmentControl } from '../playback/segment';
import type { SeatSelectHandler, StreamItem } from '../types';
import { judgeBadges, periodOf } from '../utils';
import { StageCenter } from './StageCenter';

interface StageProps {
  readonly layout: StageLayout;
  readonly view: AudienceView | null;
  readonly current: StreamItem | null;
  readonly played: readonly StreamItem[];
  /** 当前这段的播放控制：选票飞行按它的倍速缩放时长 */
  readonly control?: SegmentControl | null | undefined;
  /** 点击座位卡片：打开座位资料弹层（由舞台页持有弹层状态） */
  readonly onSeatSelect?: SeatSelectHandler | undefined;
  readonly selectedSeat?: number | null | undefined;
}

/** 正在播的计票 → 选票飞行安排（布局有座位坐标时才飞；票板等飞完再长条） */
function voteFlight(layout: StageLayout, current: StreamItem | null, control: SegmentControl | null): VoteFlight | null {
  const event = current?.event;
  if (!event || event.kind !== 'vote_tallied' || !LAYOUTS[layout].ballotFlight) return null;
  return voteFlightOf(event, control?.rate ?? null, prefersReducedMotion());
}

/** 按游戏声明的布局渲染座位；中央放立绘、票板等舞台内容，座位徽章来自已播放的事件，昼夜与选票飞行也在这里算出交给布局 */
export function Stage({ layout, view, current, played, control = null, onSeatSelect, selectedSeat = null }: StageProps) {
  // 同一段只算一次：布局按 vote 的引用缓存飞行计划
  const vote = useMemo(() => voteFlight(layout, current, control), [layout, current, control]);
  if (!view) return <p className="stage-waiting">等待对局开始…</p>;
  const { Component: Layout } = LAYOUTS[layout];
  const speaking = current ? describeEvent(current.event).speaker : null;
  return (
    <Layout
      view={view}
      speaking={speaking}
      period={periodOf(view)}
      vote={vote}
      badges={judgeBadges(played)}
      onSeatSelect={onSeatSelect}
      selectedSeat={selectedSeat}
      center={<StageCenter view={view} current={current} played={played} voteDelayMs={vote?.timing.totalMs ?? 0} />}
    />
  );
}
