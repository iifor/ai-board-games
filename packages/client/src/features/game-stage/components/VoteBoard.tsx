import { systemChoiceLabel, type AudienceView, type StageEvent } from '@battle/shared';
import { seatOf, speakerLabel } from '../utils';
import './VoteBoard.css';

type VoteEvent = Extract<StageEvent, { kind: 'vote_tallied' }>;

interface VoteBoardProps {
  readonly event: VoteEvent;
  readonly view: AudienceView;
  /** 票数条与结果推迟这么久再出现（等选票飞完）；票板本身立刻弹出 */
  readonly delayMs?: number | undefined;
}

function outcomeText(event: VoteEvent, view: AudienceView): string {
  if (event.view.gameKey === 'werewolf' && event.phaseId === 'exile_vote' && event.outcome) {
    if (event.outcome.kind === 'none') return event.tied.length ? '平票' : '无人得票';
    return `${speakerLabel(event.outcome.seat, seatOf(view, event.outcome.seat)?.name)} 得票最高`;
  }
  if (event.outcome === null) return '平票，进入复投';
  if (event.outcome.kind === 'none') return '无人当选';
  const seat = seatOf(view, event.outcome.seat);
  return `${speakerLabel(event.outcome.seat, seat?.name)} 当选${event.outcome.byTieBreak ? '（平票随机）' : ''}`;
}

/** 票板：每个目标一根票数条，按得票比例依次长出；最后盖上结果。狼人杀放逐结果由法官在结算后播报 */
export function VoteBoard({ event, view, delayMs = 0 }: VoteBoardProps) {
  const max = Math.max(1, ...event.tally.map((row) => row.votes));
  const selected = event.outcome?.kind === 'selected' ? event.outcome.seat : null;
  return (
    <div className="vote-board glass-panel" role="group" aria-label={event.title}>
      <span className="hud-label">{event.title}{event.runoff ? ` · 第 ${event.runoff + 1} 轮` : ''}</span>
      <ul>
        {event.tally.map((row, index) => (
          <li key={row.target} className={row.target === selected ? 'is-selected' : ''} style={{ animationDelay: `${delayMs + index * 90}ms` }}>
            <span>{speakerLabel(row.target, seatOf(view, row.target)?.name)}</span>
            <i><b style={{ width: `${(row.votes / max) * 100}%`, animationDelay: `${delayMs + index * 90 + 120}ms` }} /></i>
            <strong>{row.votes}</strong>
          </li>
        ))}
        {event.tally.length === 0 ? <li className="vote-board-empty">无人投票</li> : null}
      </ul>
      {Object.entries(event.systemChoices ?? {}).map(([seat, source]) => {
        const ballot = event.ballots.find(b => b.voter === Number(seat));
        return <div key={seat}>{seat}号 · {systemChoiceLabel(source)} · {ballot ? `投给${ballot.target}号` : '弃票'}</div>;
      })}
      <p className="vote-board-outcome" style={{ animationDelay: `${delayMs + event.tally.length * 90 + 400}ms` }}>{outcomeText(event, view)}</p>
    </div>
  );
}
