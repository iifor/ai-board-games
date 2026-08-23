import { useEffect } from 'react';
import { GameSelectPage } from './pages/GameSelectPage';
import { HomePage } from './pages/HomePage';
import { useGameNavigation } from './hooks/useGameNavigation';
import { renderRegisteredGame } from './games/renderers';

export function App() {
  const { route, replayGameId, selectedPlayerIds, openSelectPage, startGame } = useGameNavigation();

  useEffect(() => {
    if (route.name !== 'game') return;
    if (replayGameId) return;
  }, [route, replayGameId]);

  if (route.name === 'home') {
    return <HomePage onStart={openSelectPage} />;
  }

  if (route.name === 'game') {
    return renderRegisteredGame(route.gameKey, {
      version: route.version,
      playerIds: selectedPlayerIds,
      replayGameId,
      onReturnToSelect: openSelectPage,
    });
  }

  return (
    <GameSelectPage
      onStartGame={(gameType, playerIds) => startGame(gameType, playerIds)}
      onReplayGame={(gameType, gameId, playerIds = []) => startGame(gameType, playerIds, gameId)}
    />
  );
}
