import { useLocation, useParams } from 'react-router';
import { StatusView } from '../../../components/StatusView';
import { useAsync } from '../../../hooks/useAsync';
import { fetchCatalog, fetchPlayers } from '../../../services/games';
import { SetupForm } from '../components/SetupForm';
import { isSetupInitial } from '../utils';

/** 开局页：从终局"同样阵容再来一局"进入时，路由 state 带上一局的板子与玩家 */
export function SetupPage() {
  const gameKey = useParams().gameKey ?? '';
  const { state } = useLocation();
  const initial = isSetupInitial(state) ? state : undefined;
  const data = useAsync(async () => {
    const [catalog, players] = await Promise.all([fetchCatalog(), fetchPlayers()]);
    return { game: catalog.find((item) => item.key === gameKey) ?? null, players };
  }, [gameKey]);

  if (data.status === 'loading') return <StatusView kind="loading" />;
  if (data.status === 'error') return <StatusView kind="error" message={data.message} onRetry={data.reload} />;
  if (!data.data.game) return <StatusView kind="empty" message="游戏不存在" />;
  if (!data.data.players.length && !import.meta.env.DEV) return <StatusView kind="empty" message="暂无可用的 AI 玩家，请在后台为玩家绑定模型并启用" />;
  return <SetupForm game={data.data.game} players={data.data.players} initial={initial} />;
}
