import React, { useEffect } from 'react';
import { DebateGame } from './features/debate/DebateGame';
import { GameSelectPage } from './pages/GameSelectPage';
import { HomePage } from './pages/HomePage';
import { WerewolfGame } from './features/werewolf/WerewolfGame';
import { useGameNavigation } from './hooks/useGameNavigation';

export function App() {
  const { route, replayGameId, openSelectPage, startGame } = useGameNavigation();

  useEffect(() => {
    if (route.name !== 'game') return;
    if (replayGameId) return;
  }, [route, replayGameId]);

  if (route.name === 'home') {
    return <HomePage onStart={openSelectPage} />;
  }

  if (route.name === 'game') {
    if (route.gameKey === 'debate') {
      return <DebateGame replayGameId={replayGameId} onReturnToSelect={openSelectPage} />;
    }

    return <WerewolfGame replayGameId={replayGameId} onReturnToSelect={openSelectPage} />;
  }

  return (
    <GameSelectPage
      onStartDebate={(playerIds) => startGame('debate', playerIds)}
      onStartWerewolf={(playerIds) => startGame('werewolf', playerIds)}
      onReplayGame={(gameType, gameId, playerIds = []) => startGame(gameType, playerIds, gameId)}
    />
  );
}
