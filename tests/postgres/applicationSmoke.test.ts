import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runApplicationSmoke } from '../../packages/db-migrator/src/smoke/applicationSmoke';
import { setDbExecutorForTests } from '../../packages/server/db';
import { startApplicationSmokeRuntime } from '../../packages/server/smoke/applicationSmokeLifecycle';
import type { DbExecutor } from '../../packages/server/db/types';
import {
  endSpan,
  recordEvent,
  shutdownObservability,
  startLlmSpan,
  type TraceContext,
} from '../../packages/server/modules/observability';
import { createSmokeSchema } from './smokeHarness';

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('application smoke restores database environment when runtime startup fails', async () => {
  const schema = await createSmokeSchema();
  const originalUrl = process.env.DATABASE_URL;
  const originalSchema = process.env.DATABASE_SCHEMA;
  process.env.DATABASE_URL = 'sentinel-existing-url';
  delete process.env.DATABASE_SCHEMA;
  try {
    await assert.rejects(
      startApplicationSmokeRuntime({
        runId: 'environment-restore',
        targetUrl: schema.targetUrl,
        targetSchema: schema.schema,
      }, {
        createApplication: async () => { throw new Error('controlled application startup failure'); },
      }),
      /controlled application startup failure/,
    );
    assert.equal(process.env.DATABASE_URL, 'sentinel-existing-url');
    assert.equal(process.env.DATABASE_SCHEMA, undefined);
  } finally {
    await shutdownObservability();
    setDbExecutorForTests(null);
    await schema.close();
    restoreEnvironment('DATABASE_URL', originalUrl);
    restoreEnvironment('DATABASE_SCHEMA', originalSchema);
  }
});

test('observability shutdown drains writes enqueued while shutdown is in progress', async () => {
  await shutdownObservability();
  let orphanWrites = 0;
  const orphanDatabase: DbExecutor = {
    async queryOne() { return null; },
    async queryMany() { return []; },
    async execute() { orphanWrites += 1; return { rowCount: 1 }; },
    async withTransaction(operation) { return operation(orphanDatabase); },
    async healthCheck() { return true; },
    async close() {},
  };
  const orphanErrors: unknown[][] = [];
  const originalOrphanError = console.error;
  console.error = (...args: unknown[]) => { orphanErrors.push(args); };
  setDbExecutorForTests(orphanDatabase);
  const orphanSpan = startLlmSpan({ 'gen_ai.request.model': 'no-game-context' });
  endSpan(orphanSpan, 'ok');
  await shutdownObservability();
  console.error = originalOrphanError;
  setDbExecutorForTests(null);
  assert.equal(orphanWrites, 0, 'standalone LLM spans must not persist orphan rows');
  assert.equal(orphanErrors.length, 0);
  const firstWriteEntered = deferred();
  const releaseFirstWrite = deferred();
  let writes = 0;
  const database: DbExecutor = {
    async queryOne() { return null; },
    async queryMany() { return []; },
    async execute() {
      writes += 1;
      if (writes === 1) {
        firstWriteEntered.resolve();
        await releaseFirstWrite.promise;
      }
      return { rowCount: 1 };
    },
    async withTransaction(operation) { return operation(database); },
    async healthCheck() { return true; },
    async close() {},
  };
  const trace = {
    traceId: 'application-smoke-drain',
    gameId: 'application-smoke-drain',
    gameType: 'undercover',
    gameMode: 'real',
  } as TraceContext;
  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  setDbExecutorForTests(database);
  try {
    recordEvent(trace, { type: 'before-shutdown' });
    await firstWriteEntered.promise;
    let shutdownFinished = false;
    const shutdown = shutdownObservability().then(() => { shutdownFinished = true; });
    recordEvent(trace, { type: 'during-shutdown' });
    await Promise.resolve();
    assert.equal(shutdownFinished, false);
    releaseFirstWrite.resolve();
    await shutdown;
    assert.equal(writes, 4, 'two events and their two counter updates must all drain');
    assert.equal(errors.length, 0);
  } finally {
    console.error = originalError;
    setDbExecutorForTests(null);
    releaseFirstWrite.resolve();
    await shutdownObservability();
  }
});

test('compiled application smoke exercises the real app without paid external calls', async () => {
  const schema = await createSmokeSchema();
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-application-smoke-'));
  const runId = `application-smoke-${Date.now()}`;
  try {
    const report = await runApplicationSmoke({
      runId,
      targetUrl: schema.targetUrl,
      targetSchema: schema.schema,
      outputDirectory,
    });

    assert.equal(report.status, 'passed');
    assert.deepEqual(
      report.checks.filter((check) => check.status === 'passed').map((check) => check.id),
      [
        'health.connected',
        'auth.initial-password-change',
        'config.read-and-crud',
        'undercover.persisted-without-external-calls',
        'history.detail-and-replay-order',
        'memory.created-and-updated',
        'workflow.observability-delete',
        'health.disconnected',
        'teardown.observability-drained',
      ],
    );
    assert.equal(
      await schema.database.queryOne<{ count: number }>(
        'SELECT COUNT(*) AS count FROM player_game_memories WHERE game_type = $1',
        ['undercover'],
      ).then((row) => Number(row?.count || 0)),
      1,
      'formal deletion keeps cross-game memory',
    );
    const reportPath = path.join(outputDirectory, `${runId}-smoke.json`);
    const persisted = await fs.readFile(reportPath, 'utf8');
    assert.doesNotMatch(persisted, /postgres(?:ql)?:\/\//i);
    assert.doesNotMatch(persisted, /consensus_test/i);
  } finally {
    await schema.close();
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
});
