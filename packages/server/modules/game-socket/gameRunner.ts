import type {
  GamePresentationSession,
  GameRuntimeRunContext,
  GameSessionMetadata,
} from '@ai-presenter/shared/types/gameEngine';
import { getGameEngine } from '../engine-registry';

type GameRunner = (
  config: Record<string, unknown>,
  context?: GameRuntimeRunContext,
) => Promise<Record<string, unknown>>;

interface ResolvedGameRunner {
  gameType: string;
  run: GameRunner;
  session: GameSessionMetadata;
  createPresentationSession?: (viewMode: string, replayView?: Record<string, unknown>) => GamePresentationSession;
}

function resolveGameRunner(gameType: string): ResolvedGameRunner {
  const engine = getGameEngine();
  const definition = engine.getDefinition(gameType);
  if (!definition) throw new Error(`GameDefinition not registered: ${gameType}`);

  const session = definition.metadata?.session || {
    startMessage: '游戏开始',
    doneMessage: '游戏结束。',
  };

  if (!definition.runtime) {
    throw new Error(`GameDefinition runtime not registered: ${gameType}`);
  }

  return {
    gameType,
    session,
    run: (config, context) => engine.runGame(gameType, { config }, context),
    createPresentationSession: (viewMode, replayView) => definition.presentation?.createSession({ viewMode, replayView }) || {
      projectEvent: (event) => isInternalEvent(event) ? null : event,
      projectGame: (game) => game,
    },
  };
}

function isInternalEvent(event: Record<string, unknown>): boolean {
  return event.channel === 'system' || event.visibility === 'system';
}

export { resolveGameRunner };
export type { GameRunner, ResolvedGameRunner };
