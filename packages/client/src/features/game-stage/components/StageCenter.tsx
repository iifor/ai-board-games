import type { AudienceView } from '@battle/shared';
import type { StreamItem } from '../types';
import { roundLabel, seatOf } from '../utils';
import { VoteBoard } from './VoteBoard';
import './StageCenter.css';

interface StageCenterProps {
  readonly view: AudienceView;
  readonly current: StreamItem | null;
}

/** 舞台中央：计票时显示票板，出局时显示出局提示，其余时间显示天数与阶段 */
export function StageCenter({ view, current }: StageCenterProps) {
  const event = current?.event;
  if (event?.kind === 'vote_tallied') return <VoteBoard key={event.seq} event={event} view={view} />;
  if (event?.kind === 'seat_eliminated') {
    const seat = seatOf(view, event.seat);
    return (
      <div key={event.seq} className="stage-center stage-center-eliminated">
        <strong>{seat ? seat.name : `${event.seat}号`} 出局</strong>
        <span>{event.reason}</span>
      </div>
    );
  }
  return (
    <div className="stage-center">
      <strong>{roundLabel(view)}</strong>
      <span>{view.phase?.title ?? (view.status === 'completed' ? '对局结束' : '准备中')}</span>
    </div>
  );
}
