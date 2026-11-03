import type { PublicPlayerDto } from '@battle/shared';
import type { CSSProperties } from 'react';
import { Avatar } from '../../../components/Avatar';
import './SeatGrid.css';

type SeatStyle = CSSProperties & Record<'--seat-delay', string>;

/** 首次渲染时已就座的座位依次弹出的间隔（ms） */
const SEAT_STAGGER = 40;

const chipStyle = (delay: number): SeatStyle => ({ '--seat-delay': `${delay}ms` });

interface SeatGridProps {
  /** 已就座的玩家，下标即座位顺序 */
  readonly seated: readonly PublicPlayerDto[];
  readonly max: number;
  readonly onUnseat: (playerId: number) => void;
  /** 座位槽元素登记（飞入动效的落点） */
  readonly registerSlot?: ((seatIndex: number, element: HTMLElement | null) => void) | undefined;
  /** 该玩家的座位卡片要等多久再弹出（等飞行落地） */
  readonly arrivalDelay?: ((playerId: number) => number) | undefined;
}

/**
 * 座位带：1..max 号座位按选中顺序坐人，空位只显示号码，坐了人的座位点击即取消就座。
 * 坐了人的座位按玩家 ID 做 key：前面有人离席时后面的人只是挪位，不会重新弹出；超出上限的座位标红
 */
export function SeatGrid({ seated, max, onUnseat, registerSlot, arrivalDelay }: SeatGridProps) {
  const count = Math.max(max, seated.length);
  return (
    <ol className="seat-grid" aria-label="座位顺序">
      {Array.from({ length: count }, (_, index) => {
        const player = seated[index];
        const classes = ['seat-slot', player ? 'is-filled' : '', index >= max ? 'is-over' : ''].filter(Boolean).join(' ');
        return (
          <li key={player ? `p${player.id}` : `e${index}`} className={classes} ref={(element) => registerSlot?.(index, element)}>
            {player ? (
              <button
                type="button"
                className="seat-chip"
                style={chipStyle(arrivalDelay?.(player.id) || index * SEAT_STAGGER)}
                onClick={() => onUnseat(player.id)}
                aria-label={`${index + 1} 号 ${player.name}，点击取消就座`}
              >
                <Avatar className="seat-chip-avatar" name={player.name} avatar={player.avatar} />
                <b className="seat-chip-no" aria-hidden="true">{index + 1}</b>
                <i className="seat-chip-remove" aria-hidden="true">×</i>
                <span className="seat-chip-name">{player.name}</span>
              </button>
            ) : (
              <span className="seat-slot-empty" aria-hidden="true">{index + 1}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
