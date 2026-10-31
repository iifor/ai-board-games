import type { MatchSummaryDto } from '@battle/shared';
import { Link } from 'react-router';
import './MatchList.css';

export function MatchList({ matches }: { readonly matches: readonly MatchSummaryDto[] }) {
  return (
    <ul className="match-list">
      {matches.map((match) => (
        <li key={match.id} className="card">
          <Link to={`/matches/${match.id}`}>
            <strong>{match.gameTitle}{match.variantName ? ` · ${match.variantName}` : ''}</strong>
            <span>{match.result?.winnerLabel ?? '未分胜负'}</span>
            <time dateTime={match.createdAt}>{new Date(match.createdAt).toLocaleString('zh-CN')}</time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
