import { Link, useParams } from 'react-router';
import { StatusView } from '../../../components/StatusView';
import { useAsync } from '../../../hooks/useAsync';
import { fetchCatalog, fetchPlayers } from '../../../services/games';
import { SetupForm } from '../components/SetupForm';

export function SetupPage() {
  const gameKey = useParams().gameKey ?? '';
  const data = useAsync(async () => {
    const [catalog, players] = await Promise.all([fetchCatalog(), fetchPlayers()]);
    return { game: catalog.find((item) => item.key === gameKey) ?? null, players };
  }, [gameKey]);

  if (data.status === 'loading') return <StatusView kind="loading" />;
  if (data.status === 'error') return <StatusView kind="error" message={data.message} onRetry={data.reload} />;
  if (!data.data.game) return <StatusView kind="empty" message="游戏不存在" />;
  if (!data.data.players.length) return <StatusView kind="empty" message="还没有可用的 AI 玩家，请先在后台创建" />;
  return (
    <section>
      <Link to="/">← 返回大厅</Link>
      <h1>{data.data.game.title}</h1>
      <SetupForm game={data.data.game} players={data.data.players} />
    </section>
  );
}
