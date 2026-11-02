import { StatusView } from '../../../components/StatusView';
import { useAsync } from '../../../hooks/useAsync';
import { fetchCatalog } from '../../../services/games';
import { fetchHistory } from '../../../services/matches';
import { GameList } from '../components/GameList';
import { LobbyHero } from '../components/LobbyHero';
import { RecentMatches } from '../components/RecentMatches';

/** 大厅：游戏目录 + 最近对局；目录与历史分别加载，历史失败只影响最近对局区（显示错误与重试），大厅其余部分照常 */
export function LobbyPage() {
  const games = useAsync(fetchCatalog, []);
  const history = useAsync(fetchHistory, []);
  if (games.status === 'loading') return <StatusView kind="loading" />;
  if (games.status === 'error') return <StatusView kind="error" message={games.message} onRetry={games.reload} />;
  if (!games.data.length) return <StatusView kind="empty" message="还没有可玩的游戏" />;
  return (
    <section>
      <LobbyHero primaryGame={games.data.find((game) => game.key === 'werewolf') ?? games.data[0] ?? null} history={history} />
      <GameList games={games.data} />
      <RecentMatches history={history} onRetry={history.reload} />
    </section>
  );
}
