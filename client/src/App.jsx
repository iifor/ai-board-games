import React, { useEffect, useMemo } from 'react';
import { ConsensusGame } from './components/ConsensusGame';
import { DebateGame } from './components/DebateGame';
import { GameSelectPage } from './components/GameSelectPage';
import { HomePage } from './components/HomePage';
import { WerewolfGame } from './components/WerewolfGame';
import { buildGamePath, getRoutePlayerIds, useClientRouter } from './router/clientRouter';

const PLAYER_SELECTION_STORAGE_KEY = 'consensus-mist:selected-player-ids';

export function App() {
  const { route, navigate } = useClientRouter();
  const selectedPlayerIds = useMemo(() => resolveSelectedPlayerIds(route), [route]);

  useEffect(() => {
    if (route.name !== 'game') return;
    if (selectedPlayerIds.length) return;
    navigate('/games', { replace: true });
  }, [route, selectedPlayerIds.length]);

  function openSelectPage() {
    navigate('/games');
  }

  function startGame(gameKey, playerIds) {
    saveSelectedPlayerIds(gameKey, playerIds);
    navigate(buildGamePath(gameKey, playerIds));
  }

  if (route.name === 'home') {
    return <HomePage onStart={openSelectPage} />;
  }

  if (route.name === 'game') {
    if (!selectedPlayerIds.length) return null;

    if (route.gameKey === 'debate') {
      return <DebateGame selectedPlayerIds={selectedPlayerIds} onReturnToSelect={openSelectPage} />;
    }

    if (route.gameKey === 'werewolf') {
      return <WerewolfGame selectedPlayerIds={selectedPlayerIds} onReturnToSelect={openSelectPage} />;
    }

    return <ConsensusGame selectedPlayerIds={selectedPlayerIds} onReturnToSelect={openSelectPage} />;
  }

  return (
    <GameSelectPage
      onStartConsensus={(playerIds) => startGame('consensus', playerIds)}
      onStartDebate={(playerIds) => startGame('debate', playerIds)}
      onStartWerewolf={(playerIds) => startGame('werewolf', playerIds)}
    />
  );
}

function resolveSelectedPlayerIds(route) {
  const routeIds = getRoutePlayerIds(route);
  if (routeIds.length) return routeIds;
  if (route.name !== 'game') return [];
  return readStoredPlayerIds(route.gameKey);
}

function saveSelectedPlayerIds(gameKey, playerIds) {
  const cleanIds = playerIds.map(Number).filter(Boolean);
  const stored = readStoredSelections();
  stored[gameKey] = cleanIds;
  window.sessionStorage.setItem(PLAYER_SELECTION_STORAGE_KEY, JSON.stringify(stored));
}

function readStoredPlayerIds(gameKey) {
  const stored = readStoredSelections();
  return Array.isArray(stored[gameKey]) ? stored[gameKey].map(Number).filter(Boolean) : [];
}

function readStoredSelections() {
  try {
    return JSON.parse(window.sessionStorage.getItem(PLAYER_SELECTION_STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
