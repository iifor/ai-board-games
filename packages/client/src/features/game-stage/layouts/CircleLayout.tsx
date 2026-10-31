import { SeatCard } from '../components/SeatCard';
import type { LayoutProps } from './types';
import './CircleLayout.css';

/** 环形布局：座位绕一圈，中间是字幕；专用标记来自 view.extra（如警长、板子名） */
export function CircleLayout({ view, speaking, center }: LayoutProps) {
  const sheriff = typeof view.extra.sheriff === 'number' ? view.extra.sheriff : null;
  const board = typeof view.extra.board === 'string' ? view.extra.board : null;
  const count = view.seats.length;
  return (
    <div className="circle-layout">
      <div className="circle-ring">
        {view.seats.map((seat, index) => {
          const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
          const style = { left: `${50 + 42 * Math.cos(angle)}%`, top: `${50 + 42 * Math.sin(angle)}%` };
          return (
            <div key={seat.seat} className="circle-seat" style={style}>
              <SeatCard seat={seat} speaking={seat.seat === speaking} badges={seat.seat === sheriff ? ['警长'] : []} />
            </div>
          );
        })}
        <div className="circle-center">
          {board ? <span className="circle-board">{board}</span> : null}
          {center}
        </div>
      </div>
    </div>
  );
}
