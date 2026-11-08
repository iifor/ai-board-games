import type { AudienceView } from '@battle/shared';
import type { SegmentControl } from '../playback/segment';
import type { StreamItem } from '../types';
import { speechOrderOf } from '../utils';
import { SpeechOrder } from './SpeechOrder';
import { SubtitleBar } from './SubtitleBar';
import { VoteBoard } from './VoteBoard';
import './DebateBroadcast.css';

interface DebateBroadcastProps {
  readonly view: AudienceView;
  readonly current: StreamItem | null;
  readonly played: readonly StreamItem[];
  readonly control: SegmentControl | null;
}

/** 两段之间及暂停、播完时保留最后一段；屏幕与音频使用同一个播放游标。 */
export function DebateBroadcast({ view, current, played, control }: DebateBroadcastProps) {
  const item = current ?? played.at(-1) ?? null;
  const event = item?.event;
  const order = speechOrderOf(played, current, view);
  return (
    <section className="debate-broadcast" aria-label="舞台播报">
      <SubtitleBar item={item} view={view} control={control} />
      {event?.kind === 'vote_tallied' ? <VoteBoard key={event.seq} event={event} view={view} /> :
        order.length > 1 && <SpeechOrder seats={order} current={null} view={view} />}
    </section>
  );
}
