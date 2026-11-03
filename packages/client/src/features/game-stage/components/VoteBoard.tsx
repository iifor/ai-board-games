import type { AudienceView, StageEvent } from '@battle/shared';
import { seatOf } from '../utils';
import './VoteBoard.css';

type VoteEvent = Extract<StageEvent, { kind: 'vote_tallied' }>;

interface VoteBoardProps {
  readonly event: VoteEvent;
  readonly view: AudienceView;
  /** 票数条与结果推迟这么久再出现（等选票飞完）；票板本身立刻弹出 */
  readonly delayMs?: number | undefined;
}

function outcomeText(event: VoteEvent, view: AudienceView): string {
  if (event.outcome === null) return '平票，进入复投';
  if (event.outcome.kind === 'none') return '无人当选';
  const seat = seatOf(view, event.outcome.seat);
  return `${seat ? seat.name : `${event.outcome.seat}号`} 当选${event.outcome.byTieBreak ? '（平票随机）' : ''}`;
}

/** 票板：每个目标一根票数条，按得票比例依次长出；最后盖上结果。计票结果由字幕栏播报，这里不做 live region */
export function VoteBoard({ event, view, delayMs = 0 }: VoteBoardProps) {
  const max = Math.max(1, ...event.tally.map((row) => row.votes));
  const selected = event.outcome?.kind === 'selected' ? event.outcome.seat : null;
  return (
    <div className="vote-board glass-panel" role="group" aria-label={event.title}>
      <span className="hud-label">{event.title}{event.runoff ? ` · 第 ${event.runoff + 1} 轮` : ''}</span>
      <ul>
        {event.tally.map((row, index) => (
          <li key={row.target} className={row.target === selected ? 'is-selected' : ''} style={{ animationDelay: `${delayMs + index * 90}ms` }}>
            <span>{seatOf(view, row.target)?.name ?? `${row.target}号`}</span>
            <i><b style={{ width: `${(row.votes / max) * 100}%`, animationDelay: `${delayMs + index * 90 + 120}ms` }} /></i>
            <strong>{row.votes}</strong>
          </li>
        ))}
        {event.tally.length === 0 ? <li className="vote-board-empty">无人投票</li> : null}
      </ul>
      <p className="vote-board-outcome" style={{ animationDelay: `${delayMs + event.tally.length * 90 + 400}ms` }}>{outcomeText(event, view)}</p>
    </div>
  );
}
