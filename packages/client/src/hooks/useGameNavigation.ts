import { useClientRouter, buildGamePath } from '../router/clientRouter';

const PLAYER_SELECTION_STORAGE_KEY = 'ai-boardgame:selected-player-ids';
type GameRouteVersion = 'v1' | 'v2';
export const DEFAULT_GAME_ROUTE_VERSION: GameRouteVersion = 'v2';

export function useGameNavigation() {
  const { route, navigate } = useClientRouter();
  const replayGameId = route.name === 'game' ? route.searchParams.get('gameId') || '' : '';
  const selectedPlayerIds = route.name === 'game' ? readStoredPlayerSelection(route.gameKey) : [];
  const preserveCurrentVisualQaHost = (path: string) => preserveVisualQaHost(
    path,
    route.searchParams.toString(),
    typeof document !== 'undefined' && document.querySelector('script[src*="/@vite/client"]') !== null,
  );

  function openSelectPage() {
    navigate(preserveCurrentVisualQaHost('/games'));
  }

  function startGame(gameKey: string, playerIds: number[], gameId: string = '', version: GameRouteVersion = DEFAULT_GAME_ROUTE_VERSION) {
    const cleanIds = [...new Set(playerIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    const stored = readStoredSelections();
    stored[gameKey] = cleanIds;
    window.sessionStorage.setItem(PLAYER_SELECTION_STORAGE_KEY, JSON.stringify(stored));
    navigate(preserveCurrentVisualQaHost(buildGamePath(gameKey, { gameId, version })));
  }

  return { route, navigate, replayGameId, selectedPlayerIds, openSelectPage, startGame };
}

export function preserveVisualQaHost(path: string, search: string, isDevelopment: boolean): string {
  return isDevelopment && new URLSearchParams(search).get('visualQaHost') === '1'
    ? `${path}${path.includes('?') ? '&' : '?'}visualQaHost=1`
    : path;
}

export function readStoredPlayerSelection(gameKey: string): number[] {
  const playerIds = readStoredSelections()[gameKey];
  return Array.isArray(playerIds)
    ? playerIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
}

function readStoredSelections(): Record<string, number[]> {
  try {
    return JSON.parse(window.sessionStorage.getItem(PLAYER_SELECTION_STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
