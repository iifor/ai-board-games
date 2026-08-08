import { performance } from 'perf_hooks';

const SLOW_PERSISTENCE_MS = 500;

interface PersistenceTiming {
  correlationId: string;
  matchId: string;
  operation: string;
  debugMode: boolean;
  startedAt: number;
  stages: Record<string, number>;
  bytes: Record<string, number>;
  databaseBefore: DatabaseFileSizes;
}

interface DatabaseFileSizes {
  databaseBytes: number;
  walBytes: number;
}

function createPersistenceTiming(
  correlationId: string,
  matchId: string,
  operation: string,
  debugMode: boolean,
): PersistenceTiming {
  return {
    correlationId,
    matchId,
    operation,
    debugMode,
    startedAt: performance.now(),
    stages: {},
    bytes: {},
    databaseBefore: { databaseBytes: 0, walBytes: 0 },
  };
}

function measureStage<T>(timing: PersistenceTiming, stage: string, run: () => T): T {
  const startedAt = performance.now();
  try {
    return run();
  } finally {
    timing.stages[stage] = roundMs((timing.stages[stage] || 0) + performance.now() - startedAt);
  }
}

function addStageDuration(timing: PersistenceTiming, stage: string, durationMs: number): void {
  timing.stages[stage] = roundMs((timing.stages[stage] || 0) + durationMs);
}

function addBytes(timing: PersistenceTiming, key: string, value: string | Buffer): void {
  timing.bytes[key] = (timing.bytes[key] || 0) + Buffer.byteLength(value);
}

function finishPersistenceTiming(
  timing: PersistenceTiming,
  extra: Record<string, unknown> = {},
): void {
  if (!timing.debugMode) return;
  const totalMs = roundMs(performance.now() - timing.startedAt);
  const databaseAfter = { databaseBytes: 0, walBytes: 0 };
  const payload = {
    type: 'workflow-persistence-timing',
    correlationId: timing.correlationId,
    matchId: timing.matchId,
    operation: timing.operation,
    totalMs,
    stages: timing.stages,
    bytes: timing.bytes,
    database: {
      before: timing.databaseBefore,
      after: databaseAfter,
      databaseDeltaBytes: databaseAfter.databaseBytes - timing.databaseBefore.databaseBytes,
      walDeltaBytes: databaseAfter.walBytes - timing.databaseBefore.walBytes,
    },
    ...extra,
  };
  const serialized = JSON.stringify(payload);
  if (totalMs >= SLOW_PERSISTENCE_MS) console.warn(serialized);
  else console.info(serialized);
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export {
  SLOW_PERSISTENCE_MS,
  createPersistenceTiming,
  measureStage,
  addStageDuration,
  addBytes,
  finishPersistenceTiming,
};
export type { PersistenceTiming };
