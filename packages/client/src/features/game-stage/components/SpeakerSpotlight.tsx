import type { AudienceView } from '@battle/shared';
import { HOST_POSTER, resolvePoster } from '../../../utils/posters';
import { describeEvent } from '../playback/describe';
import type { StreamItem } from '../types';
import { hasSpotlight, seatOf } from '../utils';
import './SpeakerSpotlight.css';

interface SpeakerSpotlightProps {
  readonly item: StreamItem | null;
  readonly view: AudienceView | null;
}

/** 说话人的立绘：站在舞台中央的槽位里，占满可用高度；主持人也站在这里 */
export function SpeakerSpotlight({ item, view }: SpeakerSpotlightProps) {
  const event = item?.event;
  if (!event || !view || !hasSpotlight(event.kind)) return null;
  const seat = seatOf(view, describeEvent(event).speaker);
  const src = seat ? resolvePoster(seat.name, seat.avatar, 'cutout') : HOST_POSTER;
  if (!src) return null;
  return (
    <figure key={`${event.seq}-${src}`} className={`speaker-spotlight ${seat ? '' : 'is-host'}`} aria-hidden="true">
      <img src={src} alt="" />
    </figure>
  );
}
