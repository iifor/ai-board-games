import { SeatCard } from '../components/SeatCard';
import type { LayoutProps } from './types';
import './CircleLayout.css';

/** 环形布局：座位绕圆桌一圈，桌面中央是板子与舞台内容；专用标记来自 view.extra（如警长） */
export function CircleLayout({ view, speaking, center }: LayoutProps) {
  const sheriff = typeof view.extra.sheriff === 'number' ? view.extra.sheriff : null;
  const board = typeof view.extra.board === 'string' ? view.extra.board : null;
  const count = view.seats.length;
  return (
    <div className="circle-layout">
      <div className="circle-ring">
        <div className="circle-table" aria-hidden="true" />
        {view.seats.map((seat, index) => {
          const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
          const style = { left: `${50 + 45 * Math.cos(angle)}%`, top: `${50 + 44 * Math.sin(angle)}%`, animationDelay: `${index * 50}ms` };
          return (
            <div key={seat.seat} className="circle-seat ui-fade-up" style={style}>
              <SeatCard seat={seat} speaking={seat.seat === speaking} badges={seat.seat === sheriff ? ['警长'] : []} variant="stack" />
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
