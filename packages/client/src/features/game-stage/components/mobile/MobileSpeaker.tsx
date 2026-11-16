import type { AudienceView } from '@battle/shared';
import { Avatar } from '../../../../components/Avatar';
import { HOST_POSTER } from '../../../../utils/posters';
import { phaseTitle } from '../../hudStatus';
import { describeEvent } from '../../playback/describe';
import type { StreamItem } from '../../types';
import { periodOf, seatOf } from '../../utils';
import './MobileSpeaker.css';

interface MobileSpeakerProps {
  readonly view: AudienceView;
  readonly item: StreamItem | null;
}

/** 桌心 / 舞台中间：当前说话人的大头像与名字；主持人播报显示主持人；没有内容时显示昼夜与阶段 */
export function MobileSpeaker({ view, item }: MobileSpeakerProps) {
  const display = item ? describeEvent(item.event) : null;
  const seat = seatOf(view, display?.speaker ?? null);
  if (seat) {
    return (
      <figure key={seat.seat} className="mobile-speaker" data-team={seat.team ?? undefined}>
        <Avatar className="mobile-speaker-avatar" variant="portrait" name={seat.appearanceName ?? seat.name} avatar={seat.avatar} fallback={String(seat.seat)} />
        <figcaption>{seat.seat}号 · {seat.name}</figcaption>
      </figure>
    );
  }
  if (display?.text) {
    return (
      <figure className="mobile-speaker is-host">
        <Avatar className="mobile-speaker-avatar" name="主持人" src={HOST_POSTER} />
        <figcaption>主持人</figcaption>
      </figure>
    );
  }
  const night = view.gameKey === 'werewolf' && periodOf(view) === 'night';
  return (
    <div className="mobile-speaker is-idle">
      <span aria-hidden="true">{night ? '☾' : '☀'}</span>
      <small>{view.status === 'completed' ? '对局结束' : phaseTitle(view) ?? '等待开始'}</small>
    </div>
  );
}
