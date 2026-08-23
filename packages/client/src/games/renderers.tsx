import type { ReactNode } from 'react';
import { DebateGame } from '../features/debate/DebateGame';
import { DebateGameV2 } from '../features/debate-v2';
import { UndercoverGame } from '../features/undercover';
import { WerewolfGame } from '../features/werewolf/WerewolfGame';
import { WerewolfGameV2 } from '../features/werewolf-v2';
import { AvalonGame } from '../features/avalon';
import type { GameKey, GameRouteVersion } from './catalog';

interface GameRendererProps {
  version: GameRouteVersion;
  playerIds: number[];
  replayGameId: string;
  onReturnToSelect: () => void;
}

type GameRenderer = (props: GameRendererProps) => ReactNode;

const GAME_RENDERERS: Record<GameKey, GameRenderer> = {
  debate: ({ version, replayGameId, onReturnToSelect }) => version === 'v2'
    ? <DebateGameV2 replayGameId={replayGameId} onReturnToSelect={onReturnToSelect} />
    : <DebateGame replayGameId={replayGameId} onReturnToSelect={onReturnToSelect} />,
  werewolf: ({ version, replayGameId, onReturnToSelect }) => version === 'v2'
    ? <WerewolfGameV2 replayGameId={replayGameId} onReturnToSelect={onReturnToSelect} />
    : <WerewolfGame replayGameId={replayGameId} onReturnToSelect={onReturnToSelect} />,
  undercover: ({ version, playerIds, replayGameId, onReturnToSelect }) => (
    <UndercoverGame
      playerIds={playerIds}
      replayGameId={replayGameId}
      onReturnToSelect={onReturnToSelect}
      variant={version === 'v2' ? 'v2' : 'classic'}
    />
  ),
  avalon: ({ version, playerIds, replayGameId, onReturnToSelect }) => (
    <AvalonGame
      playerIds={playerIds}
      replayGameId={replayGameId}
      onReturnToSelect={onReturnToSelect}
      variant={version === 'v2' ? 'v2' : 'classic'}
    />
  ),
};

function renderRegisteredGame(gameKey: string, props: GameRendererProps): ReactNode {
  const renderer = GAME_RENDERERS[gameKey as GameKey];
  if (!renderer) return null;
  return renderer(props);
}

export { renderRegisteredGame };
export type { GameRendererProps };
