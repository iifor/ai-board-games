function createFallbackAudit(gameId) {
  const events = [];

  return {
    record(entry = {}) {
      const event = {
        type: 'decision-fallback',
        gameId,
        skillId: entry.skillId || 'agent-decision',
        actorId: entry.actorId || null,
        reason: entry.reason || 'fallback',
        fallbackValue: entry.fallbackValue,
        createdAt: new Date().toISOString()
      };
      events.push(event);
      console.warn(`[werewolf:fallback] ${event.skillId} actor=${event.actorId || 'host'} reason=${event.reason}`);
      return event;
    },
    list() {
      return events.map((event) => ({ ...event }));
    }
  };
}

module.exports = {
  createFallbackAudit
};
