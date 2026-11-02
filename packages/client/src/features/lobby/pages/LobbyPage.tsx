import { StatusView } from '../../../components/StatusView';
import { useAsync } from '../../../hooks/useAsync';
import { fetchCatalog } from '../../../services/games';
import { fetchHistory } from '../../../services/matches';
import { GameList } from '../components/GameList';
import { LobbyHero } from '../components/LobbyHero';
import { RecentMatches } from '../components/RecentMatches';

/** 大厅：游戏目录 + 最近对局；历史加载失败不影响大厅本身 */
export function LobbyPage() {
  const data = useAsync(async () => {
    const [games, history] = await Promise.all([fetchCatalog(), fetchHistory().catch(() => [])]);
    return { games, history };
  }, []);
  if (data.status === 'loading') return <StatusView kind="loading" />;
  if (data.status === 'error') return <StatusView kind="error" message={data.message} onRetry={data.reload} />;
  if (!data.data.games.length) return <StatusView kind="empty" message="还没有可玩的游戏" />;
  const { games, history } = data.data;
  return (
    <section>
      <LobbyHero primaryGame={games.find((game) => game.key === 'werewolf') ?? games[0] ?? null} latest={history[0] ?? null} />
      <GameList games={games} />
      <RecentMatches matches={history} />
    </section>
  );
}
