import { formatMatchTitle, type MatchSummaryDto } from '@battle/shared';
import { Link } from 'react-router';
import { StatusView } from '../../../components/StatusView';
import type { AsyncState } from '../../../hooks/useAsync';
import { formatDateTime, formatWinner } from '../../../utils/format';
import './RecentMatches.css';

interface RecentMatchesProps {
  readonly history: AsyncState<readonly MatchSummaryDto[]>;
  readonly onRetry: () => void;
  readonly limit?: number;
}

/** 大厅底部的最近对局，点开即回放；拉取失败显示错误与重试，和"还没有对局"区分开 */
export function RecentMatches({ history, onRetry, limit = 3 }: RecentMatchesProps) {
  if (history.status === 'ready' && !history.data.length) return null;
  return (
    <section className="recent-matches">
      <div className="recent-matches-head">
        <h2>最近对局</h2>
        <Link to="/history">全部历史 →</Link>
      </div>
      {history.status === 'loading' ? <StatusView kind="loading" /> : null}
      {history.status === 'error' ? <StatusView kind="error" message={`最近对局加载失败：${history.message}`} onRetry={onRetry} /> : null}
      {history.status === 'ready' ? (
        <div className="recent-matches-grid">
          {history.data.slice(0, limit).map((match, index) => (
            <Link key={match.id} className="recent-match ui-fade-up" data-game={match.gameKey} to={`/matches/${match.id}`} style={{ animationDelay: `${200 + index * 70}ms` }}>
              <strong>{formatMatchTitle(match)}</strong>
              <span className="recent-match-winner ui-pill ui-pill-accent">{formatWinner(match)}</span>
              <time dateTime={match.createdAt}>{formatDateTime(match.createdAt)} · 回放</time>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
