import * as repo from './debugRetentionRepository';

const DEBUG_MATCH_RETENTION_COUNT = 20;

interface DebugCleanupResult {
  scanned: number;
  deleted: number;
  deletedMatchIds: string[];
  releasedLogicalBytes: number;
  durationMs: number;
}

function cleanupTerminalDebugMatches(
  retainCount: number = DEBUG_MATCH_RETENTION_COUNT,
): DebugCleanupResult {
  const startedAt = Date.now();
  const candidates = repo.listTerminalDebugMatches();
  const stale = candidates.slice(Math.max(0, retainCount));
  let deleted = 0;
  let releasedLogicalBytes = 0;
  const deletedMatchIds: string[] = [];
  for (const match of stale) {
    const logicalBytes = repo.getMatchLogicalBytes(match.id);
    if (repo.deleteMatchCascade(match.id)) {
      deleted += 1;
      releasedLogicalBytes += logicalBytes;
      deletedMatchIds.push(match.id);
    }
  }
  const result = {
    scanned: candidates.length,
    deleted,
    deletedMatchIds,
    releasedLogicalBytes,
    durationMs: Date.now() - startedAt,
  };
  console.info(JSON.stringify({
    type: 'workflow-debug-retention',
    retainCount,
    ...result,
  }));
  return result;
}

export { DEBUG_MATCH_RETENTION_COUNT, cleanupTerminalDebugMatches };
export type { DebugCleanupResult };
