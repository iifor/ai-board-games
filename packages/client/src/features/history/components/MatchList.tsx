import type { MatchSummaryDto } from '@battle/shared';
import { Link } from 'react-router';
import { formatDateTime, formatMatchTitle, formatWinner } from '../../../utils/format';
import './MatchList.css';

export function MatchList({ matches }: { readonly matches: readonly MatchSummaryDto[] }) {
  return (
    <ul className="match-list">
      {matches.map((match) => (
        <li key={match.id} className="card">
          <Link to={`/matches/${match.id}`}>
            <strong>{formatMatchTitle(match)}</strong>
            <span className="ui-pill ui-pill-accent">{formatWinner(match)}</span>
            <time dateTime={match.createdAt}>{formatDateTime(match.createdAt)}</time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
