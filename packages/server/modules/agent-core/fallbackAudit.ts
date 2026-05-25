interface FallbackEntry {
  gameType?: string;
  phase?: string | null;
  skillId?: string;
  actorId?: string | number | null;
  reason?: string;
  fallbackValue?: unknown;
  severity?: string;
}

interface FallbackEvent {
  type: string;
  gameId: string;
  gameType: string;
  namespace: string;
  phase: string | null;
  skillId: string;
  actorId: string | number | null;
  reason: string;
  fallbackValue: unknown;
  severity: string;
  createdAt: string;
}

interface FallbackAuditOptions {
  gameType?: string;
  onRecord?: (event: FallbackEvent) => void;
}

interface FallbackAudit {
  record: (entry?: FallbackEntry) => FallbackEvent;
  list: () => FallbackEvent[];
}

function createFallbackAudit(
  gameId: string,
  namespace: string = 'agent',
  options: FallbackAuditOptions = {}
): FallbackAudit {
  const events: FallbackEvent[] = [];

  function record(entry: FallbackEntry = {}): FallbackEvent {
    const event: FallbackEvent = {
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

  function list(): FallbackEvent[] {
    return events.map((event) => ({ ...event }));
  }

  return { record, list };
}

export { createFallbackAudit };
export type { FallbackAudit, FallbackEntry, FallbackEvent };
