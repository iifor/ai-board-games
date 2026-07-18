import type {
  GameRuntimeRunContext,
  GameSessionMetadata,
} from '@ai-presenter/shared/types/gameEngine';
import { runDebateViaEngine } from '../debate-runner';
import { getGameEngine } from '../engine-registry';
import { runWerewolfViaEngine } from '../werewolf-runner';

type GameRunner = (
  config: Record<string, unknown>,
  context?: GameRuntimeRunContext,
) => Promise<Record<string, unknown>>;

interface ResolvedGameRunner {
  gameType: string;
  run: GameRunner;
  session: GameSessionMetadata;
}

function resolveGameRunner(gameType: string): ResolvedGameRunner {
  const engine = getGameEngine();
  const definition = engine.getDefinition(gameType);
  if (!definition) throw new Error(`GameDefinition not registered: ${gameType}`);

  const session = definition.metadata?.session || {
    startMessage: '游戏开始',
    doneMessage: '游戏结束。',
  };

  if (gameType === 'debate') {
    return { gameType, run: runDebateViaEngine as unknown as GameRunner, session };
  }
  if (gameType === 'werewolf') {
    return { gameType, run: runWerewolfViaEngine as GameRunner, session };
  }
  if (!definition.runtime) {
    throw new Error(`GameDefinition runtime not registered: ${gameType}`);
  }

  return {
    gameType,
    session,
    run: (config, context) => engine.runGame(gameType, { config }, context),
  };
}

export { resolveGameRunner };
export type { GameRunner, ResolvedGameRunner };
