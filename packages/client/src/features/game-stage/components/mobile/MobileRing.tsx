import type { AudienceView } from '@battle/shared';
import type { ReactNode } from 'react';
import { ringPercents } from '../../layouts/ringGeometry';
import { MobileSeat } from './MobileSeat';
import './MobileRing.css';

interface MobileRingProps {
  readonly view: AudienceView;
  readonly speaking: number | null;
  readonly selected: number | null;
  readonly onSelect: (seat: number) => void;
  /** 桌心：说话人头像 */
  readonly center: ReactNode;
}

/** 狼人杀手机圆桌：座位等分在正方形容器的圆周上（1 号在正上方顺时针），桌心放说话人 */
export function MobileRing({ view, speaking, selected, onSelect, center }: MobileRingProps) {
  const points = ringPercents(view.seats.length);
  const sheriff = typeof view.extra.sheriff === 'number' ? view.extra.sheriff : null;
  return (
    <div className="mobile-ring" role="group" aria-label="座位">
      <div className="mobile-ring-center">{center}</div>
      {view.seats.map((seat, index) => {
        const point = points[index] ?? { x: 50, y: 50 };
        return (
          <MobileSeat key={seat.seat} seat={seat} speaking={seat.seat === speaking} selected={seat.seat === selected}
            sheriff={seat.seat === sheriff} onSelect={onSelect} style={{ left: `${point.x}%`, top: `${point.y}%` }} />
        );
      })}
    </div>
  );
}
