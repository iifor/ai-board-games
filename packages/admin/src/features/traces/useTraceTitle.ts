import { formatMatchTitle, type TraceMatchDto } from '@battle/shared';
import { useAsync } from '../../hooks/useAsync';
import { fetchCatalog } from '../../services/matches';

export function useTraceTitle() {
  const catalog = useAsync(fetchCatalog, []);
  return (match: TraceMatchDto) => {
    const game = catalog.status === 'ready' ? catalog.data.find((item) => item.key === match.gameKey) : undefined;
    const variant = game?.variants.find((item) => item.key === match.variantKey);
    return formatMatchTitle({ gameTitle: game?.title ?? match.gameKey, variantName: variant?.name ?? match.variantKey });
  };
}
