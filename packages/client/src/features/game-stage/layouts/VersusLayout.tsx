import type { AudienceSeat } from '@battle/shared';
import { SeatCard } from '../components/SeatCard';
import { isAsleep } from '../utils';
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

/** 对垒布局：左正方、右反方（标题下带各自观点），中间辩题与舞台内容，下方评委席（带判定徽章）；没有座位坐标，不播选票飞行 */
export function VersusLayout({ view, speaking, center, badges, period = 'day', onSeatSelect, selectedSeat = null }: LayoutProps) {
  const side = (team: string) => view.seats.filter((seat) => seat.team === team).sort(byPosition);
  const topic = isTopic(view.extra.topic) ? view.extra.topic : null;
  const card = (seat: AudienceSeat) => (
    <SeatCard key={seat.seat} seat={seat} speaking={seat.seat === speaking} asleep={isAsleep(seat, speaking, period)} badges={badges?.[seat.seat] ?? []} onSelect={onSeatSelect} selected={seat.seat === selectedSeat} />
  );
  const column = (team: 'pro' | 'con', label: string) => (
    <section className={`versus-side versus-side-${team}`} aria-label={label}>
      <h3>{label}{topic ? <span>{topic[team]}</span> : null}</h3>
      {side(team).map((seat, index) => (
        <div key={seat.seat} className="ui-fade-up" style={{ animationDelay: `${index * 70}ms` }}>
          {card(seat)}
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
            <p><span className="versus-pro">正方</span>{topic.pro}<span className="versus-con">反方</span>{topic.con}</p>
          </div>
        ) : null}
        <div className="versus-stage">{center}</div>
      </div>
      {column('con', '反方')}
      <section className="versus-bench" aria-label="评委席">
        <h3>评委席</h3>
        <div className="versus-bench-seats">
          {side('judge').map(card)}
        </div>
      </section>
    </div>
  );
}
