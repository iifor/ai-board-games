import { BasePlayerAgent, normalizeText } from '../agent-core';

interface PlayerAgentOptions {
  onError?: (entry: unknown) => void;
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

interface PlayerLike {
  id: string | number;
  nickname?: string;
  name?: string;
  personality?: string;
  role?: string;
  roleLabel?: string;
  faction?: string;
  [key: string]: unknown;
}

class PlayerAgent extends BasePlayerAgent {
  constructor(player: PlayerLike, systemPrompt: string, options: PlayerAgentOptions = {}) {
    const { onError, ...rest } = options;
    super(player, systemPrompt, {
      ...rest,
      onError,
      gameType: 'werewolf',
      resolveRole: (item: PlayerLike) => item.role || item.roleLabel || '',
      resolveFaction: (item: PlayerLike) => item.faction || ''
    });
  }
}

export { PlayerAgent, normalizeText };
