import type { AudienceSeat } from '@battle/shared';
import type { CSSProperties } from 'react';
import { Avatar } from '../../../../components/Avatar';
import './MobileSeat.css';

interface MobileSeatProps {
  readonly seat: AudienceSeat;
  readonly speaking: boolean;
  readonly selected: boolean;
  readonly sheriff?: boolean | undefined;
  /** 圆桌座位按百分比定位；列表排布时不传 */
  readonly style?: CSSProperties | undefined;
  readonly onSelect: (seat: number) => void;
}

/** 手机座位：圆形头像 + 座号；出局变淡加虚线，正在发言亮起阵营色光圈，上帝视角下狼人阵营带红圈 */
export function MobileSeat({ seat, speaking, selected, sheriff = false, style, onSelect }: MobileSeatProps) {
  const classes = ['mobile-seat', speaking ? 'is-speaking' : '', seat.alive ? '' : 'is-out', selected ? 'is-selected' : ''].filter(Boolean).join(' ');
  const label = `${seat.seat}号 ${seat.name}${seat.roleName ? `（${seat.roleName}）` : ''}${seat.alive ? '' : '，已出局'}${speaking ? '，正在发言' : ''}`;
  return (
    <button type="button" className={classes} data-team={seat.team ?? undefined} style={style} aria-label={label} aria-pressed={selected} onClick={() => onSelect(seat.seat)}>
      <Avatar className="mobile-seat-avatar" variant="portrait" name={seat.appearanceName ?? seat.name} avatar={seat.avatar} fallback={String(seat.seat)} />
      <b className="mobile-seat-no">{seat.seat}</b>
      {sheriff ? <i className="mobile-seat-badge" aria-hidden="true">警</i> : null}
      {seat.roleName ? <small className="mobile-seat-role">{seat.roleName}</small> : null}
    </button>
  );
}
