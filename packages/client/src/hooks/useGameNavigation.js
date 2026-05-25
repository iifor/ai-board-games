import { useClientRouter, buildGamePath } from '../router/clientRouter';

const PLAYER_SELECTION_STORAGE_KEY = 'ai-boardgame:selected-player-ids';

export function useGameNavigation() {
  const { route, navigate } = useClientRouter();
  const replayGameId = route.name === 'game' ? route.searchParams.get('gameId') || '' : '';

  function openSelectPage() {
    navigate('/games');
  }

  function startGame(gameKey, playerIds, gameId = '') {
    const cleanIds = playerIds.map(Number).filter(Boolean);
    const stored = readStoredSelections();
    stored[gameKey] = cleanIds;
    window.sessionStorage.setItem(PLAYER_SELECTION_STORAGE_KEY, JSON.stringify(stored));
    navigate(buildGamePath(gameKey, { gameId }));
  }

  return { route, navigate, replayGameId, openSelectPage, startGame };
}

function readStoredSelections() {
  try {
    return JSON.parse(window.sessionStorage.getItem(PLAYER_SELECTION_STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
