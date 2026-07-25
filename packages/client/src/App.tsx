import { useEffect } from 'react';
import { DebateGame } from './features/debate/DebateGame';
import { DebateGameV2 } from './features/debate-v2';
import { GameSelectPage } from './pages/GameSelectPage';
import { HomePage } from './pages/HomePage';
import { WerewolfGame } from './features/werewolf/WerewolfGame';
import { WerewolfGameV2 } from './features/werewolf-v2';
import { UndercoverGame } from './features/undercover';
import { useGameNavigation } from './hooks/useGameNavigation';

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
    if (route.gameKey === 'debate') {
      if (route.version === 'v2') {
        return <DebateGameV2 replayGameId={replayGameId} onReturnToSelect={openSelectPage} />;
      }
      return <DebateGame replayGameId={replayGameId} onReturnToSelect={openSelectPage} />;
    }

    if (route.gameKey === 'undercover') {
      return (
        <UndercoverGame
          playerIds={selectedPlayerIds}
          replayGameId={replayGameId}
          onReturnToSelect={openSelectPage}
          variant={route.version === 'v2' ? 'v2' : 'classic'}
        />
      );
    }

    if (route.version === 'v2') {
      return <WerewolfGameV2 replayGameId={replayGameId} onReturnToSelect={openSelectPage} />;
    }
    return <WerewolfGame replayGameId={replayGameId} onReturnToSelect={openSelectPage} />;
  }

  return (
    <GameSelectPage
      onStartGame={(gameType, playerIds) => startGame(gameType, playerIds)}
      onReplayGame={(gameType, gameId, playerIds = []) => startGame(gameType, playerIds, gameId)}
    />
  );
}
