import type { AudienceView } from '@battle/shared';
import { describeEvent } from '../playback/describe';
import type { StreamItem } from '../types';
import { seatOf, speechOrderOf } from '../utils';
import { SpeakerSpotlight } from './SpeakerSpotlight';
import { SpeechOrder } from './SpeechOrder';
import { VoteBoard } from './VoteBoard';
import './StageCenter.css';

interface StageCenterProps {
  readonly view: AudienceView;
  readonly current: StreamItem | null;
  readonly played: readonly StreamItem[];
  /** 票板的票数条等选票飞完再长出（布局不飞票时为 0） */
  readonly voteDelayMs?: number | undefined;
}

/** 舞台中央：计票时是票板，出局时是出局提示，其余时间站着说话人的立绘（上方是本阶段的发言顺序） */
export function StageCenter({ view, current, played, voteDelayMs = 0 }: StageCenterProps) {
  const event = current?.event;
  if (event?.kind === 'vote_tallied') return <VoteBoard key={event.seq} event={event} view={view} delayMs={voteDelayMs} />;
  if (event?.kind === 'seat_eliminated') {
    const seat = seatOf(view, event.seat);
    return (
      <div key={event.seq} className="stage-center stage-center-eliminated">
        <strong>{seat ? seat.name : `${event.seat}号`} 出局</strong>
        <span>{event.reason}</span>
      </div>
    );
  }
  const order = speechOrderOf(played, current, view);
  const speaking = event ? describeEvent(event).speaker : null;
  return (
    <div className="stage-center">
      {order.length > 1 ? <SpeechOrder seats={order} current={speaking} view={view} /> : null}
      <SpeakerSpotlight item={current} view={view} />
    </div>
  );
}
