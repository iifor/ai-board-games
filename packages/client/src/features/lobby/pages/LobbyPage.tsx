import { StatusView } from '../../../components/StatusView';
import { useAsync } from '../../../hooks/useAsync';
import { fetchCatalog } from '../../../services/games';
import { GameList } from '../components/GameList';

export function LobbyPage() {
  const catalog = useAsync(fetchCatalog, []);
  if (catalog.status === 'loading') return <StatusView kind="loading" />;
  if (catalog.status === 'error') return <StatusView kind="error" message={catalog.message} onRetry={catalog.reload} />;
  if (!catalog.data.length) return <StatusView kind="empty" message="还没有可玩的游戏" />;
  return (
    <section>
      <h1>选择游戏</h1>
      <GameList games={catalog.data} />
    </section>
  );
}
