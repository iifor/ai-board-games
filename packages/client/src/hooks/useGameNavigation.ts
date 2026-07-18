import { useClientRouter, buildGamePath } from '../router/clientRouter';

const PLAYER_SELECTION_STORAGE_KEY = 'ai-boardgame:selected-player-ids';
type GameRouteVersion = 'v1' | 'v2';
export const DEFAULT_GAME_ROUTE_VERSION: GameRouteVersion = 'v2';

export function useGameNavigation() {
  const { route, navigate } = useClientRouter();
  const replayGameId = route.name === 'game' ? route.searchParams.get('gameId') || '' : '';
  const selectedPlayerIds = route.name === 'game' ? readStoredPlayerSelection(route.gameKey) : [];

  function openSelectPage() {
    navigate('/games');
  }

  function startGame(gameKey: string, playerIds: number[], gameId: string = '', version: GameRouteVersion = DEFAULT_GAME_ROUTE_VERSION) {
    const cleanIds = [...new Set(playerIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    const stored = readStoredSelections();
    stored[gameKey] = cleanIds;
    window.sessionStorage.setItem(PLAYER_SELECTION_STORAGE_KEY, JSON.stringify(stored));
    navigate(buildGamePath(gameKey, { gameId, version }));
  }

  return { route, navigate, replayGameId, selectedPlayerIds, openSelectPage, startGame };
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
