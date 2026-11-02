import type { AudienceView } from '@battle/shared';
import { SPEECH_ORDER_LIMIT } from '../constants';
import { seatOf } from '../utils';
import './SpeechOrder.css';

interface SpeechOrderProps {
  readonly seats: readonly number[];
  readonly current: number | null;
  readonly view: AudienceView;
}

/** 本阶段的发言顺序：已发言的座位依次排开，正在发言的高亮；太长时折叠更早的 */
export function SpeechOrder({ seats, current, view }: SpeechOrderProps) {
  const shown = seats.slice(-SPEECH_ORDER_LIMIT);
  return (
    <ol className="speech-order glass-panel" aria-label="发言顺序">
      {shown.length < seats.length ? <li className="speech-order-more">…</li> : null}
      {shown.map((seat) => (
        <li key={seat} className={seat === current ? 'is-current' : ''}>
          {seatOf(view, seat)?.name ?? `${seat}号`}
        </li>
      ))}
    </ol>
  );
}
