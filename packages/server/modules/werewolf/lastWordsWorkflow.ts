interface LastWordsQueueItem {
  playerId: number;
  source: 'night' | 'exile';
}

interface LastWordsRecord {
  playerId: number;
  text: string;
  thinking?: string;
  source: 'night' | 'exile';
  day: number;
}

interface LastWordsRound {
  day?: number;
  phase?: string;
  lastWords?: LastWordsRecord[];
  pendingLastWords?: LastWordsQueueItem[];
}

interface LastWordsResult {
  actorId: number;
  payload: Record<string, unknown>;
}

function enqueueNightLastWords(round: LastWordsRound, playerIds: number[]): void {
  if (Number(round.day) !== 1) return;
  enqueue(round, playerIds, 'night');
}

function enqueueExileLastWords(round: LastWordsRound, playerId: number | null | undefined): void {
  if (playerId == null) return;
  enqueue(round, [playerId], 'exile');
}

function getPendingLastWords(round: LastWordsRound): LastWordsQueueItem[] {
  const completed = new Set((round.lastWords || []).map((item) => Number(item.playerId)));
  return (round.pendingLastWords || []).filter((item) => !completed.has(Number(item.playerId)));
}

function applyLastWordsResults(round: LastWordsRound, results: LastWordsResult[]): LastWordsRecord[] {
  const byActor = new Map(results.map((result) => [Number(result.actorId), result.payload]));
  const records = getPendingLastWords(round).map((item) => {
    const payload = byActor.get(Number(item.playerId)) || {};
    return {
      playerId: Number(item.playerId),
      text: String(payload.text || ''),
      ...(payload.thinking ? { thinking: String(payload.thinking) } : {}),
      source: item.source,
      day: Number(round.day) || 1,
    };
  });
  round.lastWords = [...(round.lastWords || []), ...records];
  round.pendingLastWords = [];
  return records;
}

function enqueue(round: LastWordsRound, playerIds: number[], source: LastWordsQueueItem['source']): void {
  const completed = new Set((round.lastWords || []).map((item) => Number(item.playerId)));
  const queued = new Set((round.pendingLastWords || []).map((item) => Number(item.playerId)));
  const next = [...(round.pendingLastWords || [])];
  for (const rawId of playerIds) {
    const playerId = Number(rawId);
    if (!playerId || completed.has(playerId) || queued.has(playerId)) continue;
    next.push({ playerId, source });
    queued.add(playerId);
  }
  round.pendingLastWords = next;
}

export {
  enqueueNightLastWords,
  enqueueExileLastWords,
  getPendingLastWords,
  applyLastWordsResults,
};

export type {
  LastWordsQueueItem,
  LastWordsRecord,
  LastWordsRound,
  LastWordsResult,
};
