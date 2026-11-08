import type { AudienceSeat } from '@battle/shared';
import { SeatCard } from '../components/SeatCard';
import { isAsleep } from '../utils';
import type { LayoutProps } from './types';
import { debateTopicOf } from './debateTopic';
import './VersusLayout.css';

const byPosition = (a: AudienceSeat, b: AudienceSeat) => (a.position ?? 99) - (b.position ?? 99);

/** 左右队伍各自展示立场和座位，中间播放，下方为评委席。 */
export function VersusLayout({ view, speaking, center, badges, period = 'day', onSeatSelect, selectedSeat = null }: LayoutProps) {
  const side = (team: string) => view.seats.filter((seat) => seat.team === team).sort(byPosition);
  const topic = debateTopicOf(view);
  const card = (seat: AudienceSeat) => (
    <SeatCard key={seat.seat} seat={seat} speaking={seat.seat === speaking} asleep={isAsleep(seat, speaking, period)} badges={badges?.[seat.seat] ?? []} onSelect={onSeatSelect} selected={seat.seat === selectedSeat} />
  );
  const column = (team: 'pro' | 'con', label: string) => (
    <section className={`versus-side versus-side-${team}`} aria-label={label}>
      <header className="versus-team-heading">
        <h3>{label}</h3>
        {topic?.[team] && <p>{topic[team]}</p>}
      </header>
      {side(team).map((seat) => (
        <div key={seat.seat} className="ui-fade-up">
          {card(seat)}
        </div>
      ))}
    </section>
  );
  return (
    <div className="versus-layout">
      {column('pro', '正方')}
      <div className="versus-center">
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
