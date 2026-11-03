import type { AudienceSeat } from '@battle/shared';
import { Avatar } from '../../../components/Avatar';
import { teamLabel } from '../utils';
import './SpeakerCard.css';

interface SpeakerAvatarProps {
  readonly seat: AudienceSeat;
  readonly className?: string | undefined;
}

/** 大头像：带阵营色光环与座位号角标（内置海报 → 玩家头像 → 首字），发言者大卡与终局 MVP 共用 */
export function SpeakerAvatar({ seat, className }: SpeakerAvatarProps) {
  return (
    <span className={['speaker-avatar', className].filter(Boolean).join(' ')} data-team={seat.team ?? undefined}>
      <Avatar className="speaker-avatar-image" name={seat.name} avatar={seat.avatar} fallback={String(seat.seat)}>
        <b className="speaker-avatar-no">{seat.seat}</b>
      </Avatar>
    </span>
  );
}

interface SpeakerCardProps {
  readonly seat: AudienceSeat;
}

/**
 * 发言者大卡：没有立绘的说话人站到舞台中央时显示——大头像、名字、座位号与观众可见的身份 / 阵营
 * （与座位卡同一口径：不可见为"身份未知"）。装饰性内容，名字由字幕栏播报
 */
export function SpeakerCard({ seat }: SpeakerCardProps) {
  return (
    <div className="speaker-card" data-team={seat.team ?? undefined}>
      <SpeakerAvatar seat={seat} />
      <strong className="speaker-card-name">{seat.name}</strong>
      <span className="speaker-card-meta">
        <em className="ui-pill ui-pill-soft">{seat.seat} 号{seat.position === null ? '' : ` · ${seat.position}号位`}</em>
        <em className="ui-pill ui-pill-accent">{seat.roleName ?? '身份未知'}</em>
        {seat.team ? <em className="ui-pill speaker-card-team">{teamLabel(seat.team)}</em> : null}
      </span>
    </div>
  );
}
