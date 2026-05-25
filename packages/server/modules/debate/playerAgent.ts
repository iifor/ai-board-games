import { BasePlayerAgent } from '../agent-core';
import type { DebatePlayer } from './utils';

interface DebateAgentOptions {
  onFallback?: (entry: Record<string, unknown>) => void;
  gameId?: string;
  [key: string]: unknown;
}

class DebateAgent extends BasePlayerAgent {
  constructor(agent: DebatePlayer, systemPrompt: string, options: DebateAgentOptions = {}) {
    super(agent, systemPrompt, {
      ...options,
      gameType: 'debate',
      resolveRole: (player: DebatePlayer) => player.sideLabel || player.side || '',
      resolveFaction: (player: DebatePlayer) => player.side || '',
    });
  }
}

export { DebateAgent };
export type { DebateAgentOptions };
