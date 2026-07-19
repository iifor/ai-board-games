import * as repo from './debugRetentionRepository';

const DEBUG_MATCH_RETENTION_COUNT = 20;
const STALE_ACTIVE_MATCH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const WORKFLOW_MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;

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

function cleanupStaleActiveMatches(nowMs: number = Date.now()): DebugCleanupResult {
  const startedAt = Date.now();
  const cutoffIso = new Date(nowMs - STALE_ACTIVE_MATCH_MAX_AGE_MS).toISOString();
  const candidates = repo.listStaleActiveMatches(cutoffIso);
  let deleted = 0;
  let releasedLogicalBytes = 0;
  const deletedMatchIds: string[] = [];
  for (const match of candidates) {
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
    type: 'workflow-stale-active-retention',
    cutoffIso,
    ...result,
  }));
  return result;
}

function runWorkflowMaintenance(): void {
  for (const cleanup of [cleanupTerminalDebugMatches, cleanupStaleActiveMatches]) {
    try {
      cleanup();
    } catch (error) {
      console.error(JSON.stringify({
        type: 'workflow-retention-error',
        message: (error as Error).message,
      }));
    }
  }
}

function scheduleWorkflowMaintenance(
  run: () => void = runWorkflowMaintenance,
  schedule: typeof setInterval = setInterval,
): NodeJS.Timeout {
  run();
  const timer = schedule(run, WORKFLOW_MAINTENANCE_INTERVAL_MS);
  timer.unref();
  return timer;
}

export {
  DEBUG_MATCH_RETENTION_COUNT,
  STALE_ACTIVE_MATCH_MAX_AGE_MS,
  WORKFLOW_MAINTENANCE_INTERVAL_MS,
  cleanupTerminalDebugMatches,
  cleanupStaleActiveMatches,
  runWorkflowMaintenance,
  scheduleWorkflowMaintenance,
};
export type { DebugCleanupResult };
