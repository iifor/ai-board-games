import type { AudienceSeat, AudienceView } from '@battle/shared';
import type { ReactNode } from 'react';
import { MobileSeat } from './MobileSeat';
import './MobileVersus.css';

interface MobileVersusProps {
  readonly view: AudienceView;
  readonly speaking: number | null;
  readonly selected: number | null;
  readonly onSelect: (seat: number) => void;
  /** 中间：说话人头像 */
  readonly center: ReactNode;
}

const byPosition = (a: AudienceSeat, b: AudienceSeat) => (a.position ?? 99) - (b.position ?? 99);

/** 辩论赛手机舞台：正方一列、反方一列，中间是说话人，评委席在中间下方 */
export function MobileVersus({ view, speaking, selected, onSelect, center }: MobileVersusProps) {
  const seat = (item: AudienceSeat) => (
    <MobileSeat key={item.seat} seat={item} speaking={item.seat === speaking} selected={item.seat === selected} onSelect={onSelect} />
  );
  const team = (key: string) => view.seats.filter((item) => item.team === key).sort(byPosition);
  return (
    <div className="mobile-versus">
      <section className="mobile-versus-side" data-team="pro" aria-label="正方">
        <h3>正方</h3>
        {team('pro').map(seat)}
      </section>
      <div className="mobile-versus-center">
        {center}
        <section className="mobile-versus-bench" aria-label="评委席">
          <h3>评委</h3>
          <div>{team('judge').map(seat)}</div>
        </section>
      </div>
      <section className="mobile-versus-side" data-team="con" aria-label="反方">
        <h3>反方</h3>
        {team('con').map(seat)}
      </section>
    </div>
  );
}
