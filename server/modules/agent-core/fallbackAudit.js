function createFallbackAudit(gameId, namespace = 'agent', options = {}) {
  const events = [];

  function record(entry = {}) {
    const event = {
      type: 'agent-fallback',
      gameId,
      gameType: options.gameType || entry.gameType || '',
      namespace,
      phase: entry.phase || null,
      skillId: entry.skillId || 'agent-decision',
      actorId: entry.actorId ?? null,
      reason: entry.reason || 'fallback',
      fallbackValue: entry.fallbackValue,
      severity: entry.severity || 'warning',
      createdAt: new Date().toISOString()
    };
    events.push(event);
    options.onRecord?.(event);
    console.warn(`[${namespace}:fallback] ${event.skillId} actor=${event.actorId || 'host'} reason=${event.reason}`);
    return event;
  }

  function list() {
    return events.map((event) => ({ ...event }));
  }

  return { record, list };
}

module.exports = { createFallbackAudit };
