import type { AudienceSeat } from '@battle/shared';
import { Avatar } from '../../../components/Avatar';
import './SeatCard.css';

interface SeatCardProps {
  readonly seat: AudienceSeat;
  readonly speaking: boolean;
  readonly badges?: readonly string[];
  /** stack：头像在上名字在下（环形布局）；row：横向（对垒布局） */
  readonly variant?: 'row' | 'stack';
}

/** 座位卡片：海报头像、名字、身份（可见时）、存活状态；正在发言时亮起光环，出局后盖"出局"戳 */
export function SeatCard({ seat, speaking, badges = [], variant = 'row' }: SeatCardProps) {
  const classes = ['seat-card', `seat-card-${variant}`, speaking ? 'seat-card-speaking' : '', seat.alive ? '' : 'seat-card-out', seat.team ? `seat-team-${seat.team}` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} title={seat.label}>
      <Avatar className="seat-card-avatar" name={seat.name} avatar={seat.avatar} fallback={String(seat.seat)}>
        <b className="seat-card-no">{seat.seat}</b>
      </Avatar>
      <div className="seat-card-body">
        <strong>{seat.name}</strong>
        <span className="seat-card-role">
          {seat.roleName ?? '身份未知'}{seat.position === null ? '' : ` · ${seat.position}号位`}
        </span>
        {badges.length ? <span className="seat-card-badges">{badges.map((badge) => <em key={badge} className="ui-pill">{badge}</em>)}</span> : null}
      </div>
      {seat.alive ? null : <span className="seat-card-stamp" aria-label="出局">出局</span>}
    </div>
  );
}
