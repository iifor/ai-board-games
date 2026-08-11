import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runApplicationSmoke } from '../../packages/db-migrator/src/smoke/applicationSmoke';
import { setDbExecutorForTests } from '../../packages/server/db';
import type { DbExecutor } from '../../packages/server/db/types';
import {
  endSpan,
  recordEvent,
  shutdownObservability,
  startLlmSpan,
  type TraceContext,
} from '../../packages/server/modules/observability';
import { createSmokeSchema } from './smokeHarness';

const PREEXISTING_OWNER = 901001;
const PREEXISTING_SUBJECT = 901002;

async function seedPreexistingPlayersAndMemory(database: DbExecutor): Promise<string[]> {
  for (const [id, nickname, sortOrder] of [
    [PREEXISTING_OWNER, 'Existing Owner', -200],
    [PREEXISTING_SUBJECT, 'Existing Subject', -199],
  ] as const) {
    await database.execute(`INSERT INTO players (
      id, nickname, name, personality, provider, model, enabled, sort_order, created_at, updated_at
    ) VALUES ($1, $2, $2, 'must remain unchanged', 'existing-provider', 'existing-model', 1, $3,
      '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`, [id, nickname, sortOrder]);
  }
  await database.execute(`INSERT INTO player_game_memories (
    game_type, owner_player_id, subject_player_id, games_played, familiarity_score,
    traits_json, recent_summary, created_at, updated_at
  ) VALUES ('undercover', $1, $2, 41, 0.75, '{"immutable":true}'::jsonb,
    'preexisting memory', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`,
  [PREEXISTING_OWNER, PREEXISTING_SUBJECT]);
  return seedSnapshot(database);
}

async function smokeOwnedRowCounts(database: DbExecutor): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of ['games', 'matches', 'game_traces', 'admin_users'] as const) {
    result[table] = await database.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${table}`,
    ).then((row) => Number(row?.count || 0));
  }
  result.syntheticPlayers = await database.queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM players WHERE provider LIKE 'application-smoke-%'",
  ).then((row) => Number(row?.count || 0));
  result.syntheticMemories = await database.queryOne<{ count: number }>(`
    SELECT COUNT(*) AS count FROM player_game_memories
    WHERE recent_summary IN ('first smoke memory', 'updated smoke memory')
  `).then((row) => Number(row?.count || 0));
  return result;
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

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
    const before = await seedPreexistingPlayersAndMemory(schema.database);
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
        'teardown.synthetic-fixtures-removed',
        'teardown.observability-drained',
      ],
    );
    const after = await seedSnapshot(schema.database);
    assert.deepEqual(after, before, 'preexisting players and memory must remain byte-for-byte unchanged');
    assert.deepEqual(await smokeOwnedRowCounts(schema.database), {
      games: 0, matches: 0, game_traces: 0, admin_users: 0,
      syntheticPlayers: 0, syntheticMemories: 0,
    });
    const reportPath = path.join(outputDirectory, `${runId}-smoke.json`);
    const persisted = await fs.readFile(reportPath, 'utf8');
    assert.doesNotMatch(persisted, /postgres(?:ql)?:\/\//i);
    assert.doesNotMatch(persisted, /consensus_test/i);
  } finally {
    await schema.close();
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
});

test('compiled application smoke fails when observability child rows survive formal deletion', async () => {
  const schema = await createSmokeSchema();
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-application-smoke-orphan-'));
  const runId = `application-smoke-orphan-${Date.now()}`;
  try {
    await schema.database.execute('ALTER TABLE trace_spans DROP CONSTRAINT trace_spans_trace_id_fkey');
    await schema.database.execute('ALTER TABLE game_events DROP CONSTRAINT game_events_trace_id_fkey');
    const report = await runApplicationSmoke({
      runId,
      targetUrl: schema.targetUrl,
      targetSchema: schema.schema,
      outputDirectory,
    });

    assert.equal(report.status, 'failed');
    assert.equal(
      report.checks.some((check) => check.id === 'workflow.observability-delete' && check.status === 'passed'),
      false,
    );
    assert.deepEqual(await smokeOwnedRowCounts(schema.database), {
      games: 0, matches: 0, game_traces: 0, admin_users: 0,
      syntheticPlayers: 0, syntheticMemories: 0,
    });
  } finally {
    await schema.close();
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
});

async function seedSnapshot(database: DbExecutor): Promise<string[]> {
  return database.queryMany<{ value: string }>(`
    SELECT to_jsonb(value)::text AS value FROM (
      SELECT * FROM players WHERE id IN ($1, $2) ORDER BY id
    ) value
    UNION ALL
    SELECT to_jsonb(value)::text AS value FROM (
      SELECT * FROM player_game_memories
      WHERE owner_player_id = $1 AND subject_player_id = $2
    ) value
  `, [PREEXISTING_OWNER, PREEXISTING_SUBJECT]).then((rows) => rows.map((row) => row.value));
}
