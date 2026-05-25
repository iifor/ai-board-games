import { createFallbackAudit as createCoreFallbackAudit } from '../../agent-core';

function createFallbackAudit(gameId: string, options: Record<string, unknown> = {}) {
  return createCoreFallbackAudit(gameId, 'werewolf', { gameType: 'werewolf', ...options });
}

export { createFallbackAudit };
