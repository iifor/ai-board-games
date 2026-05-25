import { BasePlayerAgent, normalizeText } from '../agent-core';

interface PlayerAgentOptions {
  onFallback?: (entry: unknown) => void;
  gameId?: string;
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
    super(player, systemPrompt, {
      ...options,
      gameType: 'werewolf',
      resolveRole: (item: PlayerLike) => item.role || item.roleLabel || '',
      resolveFaction: (item: PlayerLike) => item.faction || ''
    });
  }
}

export { PlayerAgent, normalizeText };
