import type { AudienceSeat } from '@battle/shared';
import './SeatCard.css';

interface SeatCardProps {
  readonly seat: AudienceSeat;
  readonly speaking: boolean;
  readonly badges?: readonly string[];
}

/** 座位卡片：名字、身份（可见时）、存活状态、正在发言高亮 */
export function SeatCard({ seat, speaking, badges = [] }: SeatCardProps) {
  const classes = ['seat-card', speaking ? 'seat-card-speaking' : '', seat.alive ? '' : 'seat-card-out', seat.team ? `seat-team-${seat.team}` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} title={seat.label}>
      <div className="seat-card-avatar" aria-hidden>
        {seat.avatar ? <img src={seat.avatar} alt="" /> : <span>{seat.seat}</span>}
      </div>
      <div className="seat-card-body">
        <strong>{seat.seat}号 {seat.name}</strong>
        <span className="seat-card-role">
          {seat.roleName ?? '身份未知'}{seat.position === null ? '' : ` · ${seat.position}号位`}{seat.alive ? '' : ' · 出局'}
        </span>
        {badges.length ? <span className="seat-card-badges">{badges.join(' ')}</span> : null}
      </div>
    </div>
  );
}
