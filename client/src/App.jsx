import React, { useEffect } from 'react';
import { ConsensusGame } from './features/consensus/ConsensusGame';
import { DebateGame } from './features/debate/DebateGame';
import { GameSelectPage } from './components/GameSelectPage';
import { HomePage } from './components/HomePage';
import { WerewolfGame } from './components/WerewolfGame';
import { buildGamePath, getRouteGameId, useClientRouter } from './router/clientRouter';

const PLAYER_SELECTION_STORAGE_KEY = 'consensus-mist:selected-player-ids';

export function App() {
  const { route, navigate } = useClientRouter();
  const replayGameId = route.name === 'game' ? getRouteGameId(route) : '';

  useEffect(() => {
    if (route.name !== 'game') return;
    if (replayGameId) return;
  }, [route, replayGameId]);

  function openSelectPage() {
    navigate('/games');
  }

  function startGame(gameKey, playerIds, gameId = '') {
    saveSelectedPlayerIds(gameKey, playerIds);
    navigate(buildGamePath(gameKey, { gameId }));
  }

  if (route.name === 'home') {
    return <HomePage onStart={openSelectPage} />;
  }

  if (route.name === 'game') {
    if (route.gameKey === 'debate') {
      return <DebateGame replayGameId={replayGameId} onReturnToSelect={openSelectPage} />;
    }

    if (route.gameKey === 'werewolf') {
      return <WerewolfGame replayGameId={replayGameId} onReturnToSelect={openSelectPage} />;
    }

    return <ConsensusGame replayGameId={replayGameId} onReturnToSelect={openSelectPage} />;
  }

  return (
    <GameSelectPage
      onStartConsensus={(playerIds) => startGame('consensus', playerIds)}
      onStartDebate={(playerIds) => startGame('debate', playerIds)}
      onStartWerewolf={(playerIds) => startGame('werewolf', playerIds)}
      onReplayGame={(gameType, gameId, playerIds = []) => startGame(gameType, playerIds, gameId)}
    />
  );
}

function saveSelectedPlayerIds(gameKey, playerIds) {
  const cleanIds = playerIds.map(Number).filter(Boolean);
  const stored = readStoredSelections();
  stored[gameKey] = cleanIds;
  window.sessionStorage.setItem(PLAYER_SELECTION_STORAGE_KEY, JSON.stringify(stored));
}

function readStoredSelections() {
  try {
    return JSON.parse(window.sessionStorage.getItem(PLAYER_SELECTION_STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
