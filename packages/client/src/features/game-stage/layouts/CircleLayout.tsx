import { useMemo, useRef, type CSSProperties } from 'react';
import { useElementSize } from '../../../hooks/useElementSize';
import { SeatCard } from '../components/SeatCard';
import { ringGeometry, type RingSize } from './ringGeometry';
import type { LayoutProps } from './types';
import './CircleLayout.css';

/** 竖排座位卡片的原始尺寸（含一行徽章），与 SeatCard.css 的 .seat-card-stack 对应 */
const SEAT_CARD: RingSize = { width: 118, height: 140 };
/** 量到容器尺寸之前（首帧、静态渲染）按这个比例摆放 */
const FALLBACK_BOX: RingSize = { width: 1020, height: 600 };

type RingStyle = CSSProperties & Record<'--seat-scale' | '--ring-card-w' | '--ring-card-h', string | number>;

const percent = (value: number | undefined, total: number) => `${((value ?? 0) / total) * 100}%`;

/**
 * 环形布局：座位绕圆桌一圈（1 号在正上方，顺时针，按弧长等分），圆桌中央留给舞台内容；
 * 椭圆半径由量到的容器尺寸、座位数与卡片尺寸算出，放不下时整体缩小卡片。警长标记来自 view.extra
 */
export function CircleLayout({ view, speaking, center, badges }: LayoutProps) {
  const sheriff = typeof view.extra.sheriff === 'number' ? view.extra.sheriff : null;
  const board = typeof view.extra.board === 'string' ? view.extra.board : null;
  const ringRef = useRef<HTMLDivElement | null>(null);
  const box = useElementSize(ringRef) ?? FALLBACK_BOX;
  const count = view.seats.length;
  const geometry = useMemo(() => ringGeometry(count, box, SEAT_CARD), [count, box]);
  const ringStyle: RingStyle = { '--seat-scale': geometry.scale, '--ring-card-w': `${geometry.card.width}px`, '--ring-card-h': `${geometry.card.height}px` };
  return (
    <div className="circle-layout">
      <div className="circle-ring" ref={ringRef} style={ringStyle}>
        <div className="circle-table" aria-hidden="true" />
        {view.seats.map((seat, index) => {
          const position = geometry.seats[index];
          const seatBadges = [...(seat.seat === sheriff ? ['警长'] : []), ...(badges?.[seat.seat] ?? [])];
          return (
            <div key={seat.seat} className="circle-seat" style={{ left: percent(position?.x, box.width), top: percent(position?.y, box.height) }}>
              <div className="circle-seat-card ui-fade-up" style={{ animationDelay: `${index * 50}ms` }}>
                <SeatCard seat={seat} speaking={seat.seat === speaking} badges={seatBadges} variant="stack" />
              </div>
            </div>
          );
        })}
        <div className="circle-center">
          {center}
          {board ? <span className="circle-board ui-pill">{board}</span> : null}
        </div>
      </div>
    </div>
  );
}
