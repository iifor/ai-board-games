import { StatusView } from '../../../components/StatusView';
import { useAsync } from '../../../hooks/useAsync';
import { fetchHistory } from '../../../services/matches';
import { MatchList } from '../components/MatchList';

export function HistoryPage() {
  const history = useAsync(fetchHistory, []);
  if (history.status === 'loading') return <StatusView kind="loading" />;
  if (history.status === 'error') return <StatusView kind="error" message={history.message} onRetry={history.reload} />;
  return (
    <section>
      <h1>历史对局</h1>
      {history.data.length ? <MatchList matches={history.data} /> : <StatusView kind="empty" message="还没有完成的对局" />}
    </section>
  );
}
