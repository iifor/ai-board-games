import type { MatchSummaryDto } from '@battle/shared';
import { Link } from 'react-router';
import './RecentMatches.css';

interface RecentMatchesProps {
  readonly matches: readonly MatchSummaryDto[];
  readonly limit?: number;
}

/** 大厅底部的最近对局，点开即回放 */
export function RecentMatches({ matches, limit = 3 }: RecentMatchesProps) {
  if (!matches.length) return null;
  return (
    <section className="recent-matches">
      <div className="recent-matches-head">
        <h2>最近对局</h2>
        <Link to="/history">全部历史 →</Link>
      </div>
      <div className="recent-matches-grid">
        {matches.slice(0, limit).map((match, index) => (
          <Link key={match.id} className="recent-match ui-fade-up" data-game={match.gameKey} to={`/matches/${match.id}`} style={{ animationDelay: `${200 + index * 70}ms` }}>
            <strong>{match.gameTitle}{match.variantName ? ` · ${match.variantName}` : ''}</strong>
            <span className="recent-match-winner">{match.result?.winnerLabel ?? '未分胜负'}</span>
            <time dateTime={match.createdAt}>{new Date(match.createdAt).toLocaleString('zh-CN', { hour12: false })} · 回放</time>
          </Link>
        ))}
      </div>
    </section>
  );
}
