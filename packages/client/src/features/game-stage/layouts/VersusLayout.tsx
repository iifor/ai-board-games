import type { AudienceSeat } from '@battle/shared';
import { SeatCard } from '../components/SeatCard';
import type { LayoutProps } from './types';
import './VersusLayout.css';

interface Topic {
  readonly title: string;
  readonly pro: string;
  readonly con: string;
}

function isTopic(value: unknown): value is Topic {
  return typeof value === 'object' && value !== null && 'title' in value && 'pro' in value && 'con' in value;
}

const byPosition = (a: AudienceSeat, b: AudienceSeat) => (a.position ?? 99) - (b.position ?? 99);

/** 对垒布局：左正方、右反方、下方评委席，中间辩题与舞台内容 */
export function VersusLayout({ view, speaking, center }: LayoutProps) {
  const side = (team: string) => view.seats.filter((seat) => seat.team === team).sort(byPosition);
  const topic = isTopic(view.extra.topic) ? view.extra.topic : null;
  const column = (team: string, label: string) => (
    <section className={`versus-side versus-side-${team}`} aria-label={label}>
      <h3>{label}</h3>
      {side(team).map((seat, index) => (
        <div key={seat.seat} className="ui-fade-up" style={{ animationDelay: `${index * 70}ms` }}>
          <SeatCard seat={seat} speaking={seat.seat === speaking} />
        </div>
      ))}
    </section>
  );
  return (
    <div className="versus-layout">
      {column('pro', '正方')}
      <div className="versus-center">
        {topic ? (
          <div className="versus-topic glass-panel ui-fade-up">
            <span className="hud-label">辩题</span>
            <h2>{topic.title}</h2>
            <p><span className="versus-pro">正方</span>{topic.pro}</p>
            <p><span className="versus-con">反方</span>{topic.con}</p>
          </div>
        ) : null}
        {center}
      </div>
      {column('con', '反方')}
      <section className="versus-bench" aria-label="评委席">
        <h3>评委席</h3>
        <div className="versus-bench-seats">
          {side('judge').map((seat) => <SeatCard key={seat.seat} seat={seat} speaking={seat.seat === speaking} />)}
        </div>
      </section>
    </div>
  );
}
