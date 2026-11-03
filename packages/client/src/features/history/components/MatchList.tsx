import { formatMatchTitle, type MatchSummaryDto } from '@battle/shared';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { formatDateTime, formatWinner } from '../../../utils/format';
import './MatchList.css';

type RowStyle = CSSProperties & Record<'--i', number>;

/** 进场错峰只排前几行，长列表后面的行一起出现 */
const MAX_STAGGER_ROWS = 10;

const rowStyle = (index: number): RowStyle => ({ '--i': Math.min(index, MAX_STAGGER_ROWS) });

/** 历史对局列表：行依次淡入上浮，悬停 / 聚焦时上浮并点亮"回放" */
export function MatchList({ matches }: { readonly matches: readonly MatchSummaryDto[] }) {
  return (
    <ul className="match-list">
      {matches.map((match, index) => (
        <li key={match.id} className="card match-row ui-fade-up" data-game={match.gameKey} style={rowStyle(index)}>
          <Link to={`/matches/${match.id}`}>
            <strong>{formatMatchTitle(match)}</strong>
            <span className="ui-pill ui-pill-accent">{formatWinner(match)}</span>
            <time dateTime={match.createdAt}>{formatDateTime(match.createdAt)}</time>
            <b className="match-row-replay">回放 →</b>
          </Link>
        </li>
      ))}
    </ul>
  );
}
