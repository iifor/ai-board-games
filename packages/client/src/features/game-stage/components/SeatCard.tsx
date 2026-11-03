import type { AudienceSeat } from '@battle/shared';
import { Avatar } from '../../../components/Avatar';
import type { SeatSelectHandler } from '../types';
import './SeatCard.css';
import './SeatCardButton.css';

interface SeatCardProps {
  readonly seat: AudienceSeat;
  readonly speaking: boolean;
  /** 夜晚闭眼：压暗去色、月光描边、闭眼小图标；由布局按昼夜与行动座位算出 */
  readonly asleep?: boolean | undefined;
  readonly badges?: readonly string[];
  /** stack：头像在上名字在下（环形布局）；row：横向（对垒布局） */
  readonly variant?: 'row' | 'stack';
  /** 点击 / 回车 / 空格：打开这个座位的资料弹层 */
  readonly onSelect?: SeatSelectHandler | undefined;
  /** 弹层已打开的座位：描边高亮 */
  readonly selected?: boolean | undefined;
}

/**
 * 座位卡片：海报头像、名字、身份（可见时）、存活状态；正在发言时亮起光环，夜晚闭眼，出局后盖"出局"戳。
 * 卡片本身是按钮（可聚焦、回车 / 空格打开座位弹层）；按钮样式的抹平在 SeatCardButton.css
 */
export function SeatCard({ seat, speaking, asleep = false, badges = [], variant = 'row', onSelect, selected = false }: SeatCardProps) {
  const classes = ['seat-card', `seat-card-${variant}`, 'seat-card-trigger', speaking ? 'seat-card-speaking' : '', asleep ? 'seat-card-asleep' : '', seat.alive ? '' : 'seat-card-out', selected ? 'is-selected' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={classes}
      title={seat.label}
      data-team={seat.team ?? undefined}
      data-seat-trigger={seat.seat}
      aria-haspopup={onSelect ? 'dialog' : undefined}
      aria-expanded={onSelect ? selected : undefined}
      onClick={onSelect ? (event) => onSelect(seat.seat, event.currentTarget) : undefined}
    >
      <Avatar className="seat-card-avatar" name={seat.name} avatar={seat.avatar} fallback={String(seat.seat)}>
        <b className="seat-card-no">{seat.seat}</b>
      </Avatar>
      {/* 按钮里只能放短语内容，所以是 span 而不是 div；样式按类名不受影响 */}
      <span className="seat-card-body">
        <strong>{seat.name}</strong>
        <span className="seat-card-role">
          {seat.roleName ?? '身份未知'}{seat.position === null ? '' : ` · ${seat.position}号位`}
        </span>
        {badges.length ? <span className="seat-card-badges">{badges.map((badge) => <em key={badge} className="ui-pill">{badge}</em>)}</span> : null}
      </span>
      {asleep ? (
        <i className="seat-card-eyes" aria-hidden="true">
          <svg width="18" height="10" viewBox="0 0 24 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M2 2c2.5 3.2 5.8 4.8 10 4.8S19.5 5.2 22 2" />
            <path d="M6 6.2 4.6 9M12 6.8V10M18 6.2l1.4 2.8" />
          </svg>
        </i>
      ) : null}
      {seat.alive ? null : <span className="seat-card-stamp" aria-label="出局">出局</span>}
    </button>
  );
}
