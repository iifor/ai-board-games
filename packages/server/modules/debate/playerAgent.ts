import { BasePlayerAgent } from '../agent-core';
import type { DebatePlayer } from './utils';

interface DebateAgentOptions {
  onError?: (entry: Record<string, unknown>) => void;
  gameId?: string;
  fallbackModel?: {
    apiKey?: string;
    baseUrl?: string;
    provider?: string;
    model?: string;
    apiFormat?: string;
  } | null;
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
