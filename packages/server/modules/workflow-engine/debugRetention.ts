import * as repo from './debugRetentionRepository';

const DEBUG_MATCH_RETENTION_COUNT = 20;
const STALE_ACTIVE_MATCH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const WORKFLOW_MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface DebugCleanupResult {
  scanned: number; deleted: number; deletedMatchIds: string[]; releasedLogicalBytes: number; durationMs: number;
}

async function cleanupMatches(candidates: Array<{ id: string }>, startedAt: number): Promise<DebugCleanupResult> {
  let deleted = 0;
  let releasedLogicalBytes = 0;
  const deletedMatchIds: string[] = [];
  for (const match of candidates) {
    const logicalBytes = await repo.getMatchLogicalBytes(match.id);
    if (await repo.deleteMatchCascade(match.id)) {
      deleted += 1;
      releasedLogicalBytes += logicalBytes;
      deletedMatchIds.push(match.id);
    }
  }
  return { scanned: candidates.length, deleted, deletedMatchIds, releasedLogicalBytes, durationMs: Date.now() - startedAt };
}

async function cleanupTerminalDebugMatches(retainCount = DEBUG_MATCH_RETENTION_COUNT): Promise<DebugCleanupResult> {
  const startedAt = Date.now();
  const candidates = await repo.listTerminalDebugMatches();
  const result = await cleanupMatches(candidates.slice(Math.max(0, retainCount)), startedAt);
  result.scanned = candidates.length;
  console.info(JSON.stringify({ type: 'workflow-debug-retention', retainCount, ...result }));
  return result;
}

async function cleanupStaleActiveMatches(nowMs = Date.now()): Promise<DebugCleanupResult> {
  const startedAt = Date.now();
  const cutoffIso = new Date(nowMs - STALE_ACTIVE_MATCH_MAX_AGE_MS).toISOString();
  const candidates = await repo.listStaleActiveMatches(cutoffIso);
  const result = await cleanupMatches(candidates, startedAt);
  console.info(JSON.stringify({ type: 'workflow-stale-active-retention', cutoffIso, ...result }));
  return result;
}

async function runWorkflowMaintenance(): Promise<void> {
  for (const cleanup of [cleanupTerminalDebugMatches, cleanupStaleActiveMatches]) {
    try { await cleanup(); }
    catch (error) { console.error(JSON.stringify({ type: 'workflow-retention-error', message: (error as Error).message })); }
  }
}

function scheduleWorkflowMaintenance(
  run: () => void | Promise<void> = runWorkflowMaintenance,
  schedule: typeof setInterval = setInterval,
): NodeJS.Timeout {
  void run();
  const timer = schedule(() => { void run(); }, WORKFLOW_MAINTENANCE_INTERVAL_MS);
  timer.unref();
  return timer;
}

export { DEBUG_MATCH_RETENTION_COUNT, STALE_ACTIVE_MATCH_MAX_AGE_MS, WORKFLOW_MAINTENANCE_INTERVAL_MS,
  cleanupTerminalDebugMatches, cleanupStaleActiveMatches, runWorkflowMaintenance, scheduleWorkflowMaintenance };
export type { DebugCleanupResult };
