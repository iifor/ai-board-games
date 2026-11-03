import type { AudienceView } from '@battle/shared';
import { HOST_POSTER, resolvePoster } from '../../../utils/posters';
import { describeEvent } from '../playback/describe';
import type { StreamItem } from '../types';
import { hasSpotlight, seatOf } from '../utils';
import { SpeakerCard } from './SpeakerCard';
import './SpeakerSpotlight.css';

interface SpeakerSpotlightProps {
  readonly item: StreamItem | null;
  readonly view: AudienceView | null;
}

/** 说话人的立绘：站在舞台中央的槽位里，占满可用高度；没有立绘的玩家换成发言者大卡；主持人（也站在这里）始终用立绘 */
export function SpeakerSpotlight({ item, view }: SpeakerSpotlightProps) {
  const event = item?.event;
  if (!event || !view || !hasSpotlight(event.kind)) return null;
  const seat = seatOf(view, describeEvent(event).speaker);
  const src = seat ? resolvePoster(seat.name, seat.avatar, 'cutout') : HOST_POSTER;
  const classes = ['speaker-spotlight', seat ? '' : 'is-host', src ? '' : 'is-card'].filter(Boolean).join(' ');
  return (
    <figure key={`${event.seq}-${src ?? 'card'}`} className={classes} aria-hidden="true">
      {src ? <img src={src} alt="" /> : seat ? <SpeakerCard seat={seat} /> : null}
    </figure>
  );
}
