import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { getDbExecutor, setDbExecutorForTests } from '../../packages/server/db';
import type { DatabaseConfig } from '../../packages/server/db/config';
import type { DbExecutor } from '../../packages/server/db/types';
import { shutdownObservability } from '../../packages/server/modules/observability';
import { startApplicationSmokeRuntime } from '../../packages/server/smoke/applicationSmokeLifecycle';
import { readTestDatabaseUrl } from './helpers';
import { createSmokeSchema } from './smokeHarness';

const DATABASE_ENVIRONMENT = [
  'DATABASE_CA_PATH',
  'DATABASE_CONNECTION_TIMEOUT_MS',
  'DATABASE_POOL_MAX',
  'DATABASE_SCHEMA',
  'DATABASE_SSL',
  'DATABASE_STATEMENT_TIMEOUT_MS',
  'DATABASE_URL',
] as const;

type DatabaseEnvironmentName = typeof DATABASE_ENVIRONMENT[number];

function createNoopDatabase(onClose: () => void = () => undefined): DbExecutor {
  const database: DbExecutor = {
    async queryOne() { return null; },
    async queryMany() { return []; },
    async execute() { return { rowCount: 0 }; },
    async withTransaction(operation) { return operation(database); },
    async healthCheck() { return true; },
    async close() { onClose(); },
  };
  return database;
}

function snapshotDatabaseEnvironment(): Record<DatabaseEnvironmentName, string | undefined> {
  return Object.fromEntries(DATABASE_ENVIRONMENT.map((name) => [name, process.env[name]]))
    as Record<DatabaseEnvironmentName, string | undefined>;
}

function restoreDatabaseEnvironment(snapshot: Record<DatabaseEnvironmentName, string | undefined>): void {
  for (const name of DATABASE_ENVIRONMENT) {
    const value = snapshot[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function usePlainDatabaseEnvironment(): void {
  delete process.env.DATABASE_CA_PATH;
  delete process.env.DATABASE_CONNECTION_TIMEOUT_MS;
  delete process.env.DATABASE_POOL_MAX;
  delete process.env.DATABASE_SSL;
  delete process.env.DATABASE_STATEMENT_TIMEOUT_MS;
}

test('application smoke restores the previous executor when runtime startup fails', async () => {
  const environment = snapshotDatabaseEnvironment();
  const schema = await createSmokeSchema();
  const sentinel = createNoopDatabase();
  setDbExecutorForTests(sentinel);
  process.env.DATABASE_URL = 'sentinel-existing-url';
  delete process.env.DATABASE_SCHEMA;
  usePlainDatabaseEnvironment();
  try {
    await assert.rejects(
      startApplicationSmokeRuntime({
        runId: 'executor-failure-restore',
        targetUrl: schema.targetUrl,
        targetSchema: schema.schema,
      }, {
        createApplication: async () => { throw new Error('controlled application startup failure'); },
      }),
      /controlled application startup failure/,
    );
    assert.strictEqual(getDbExecutor(), sentinel);
    assert.equal(process.env.DATABASE_URL, 'sentinel-existing-url');
    assert.equal(process.env.DATABASE_SCHEMA, undefined);
  } finally {
    await shutdownObservability();
    setDbExecutorForTests(null);
    await schema.close();
    restoreDatabaseEnvironment(environment);
  }
});

test('application smoke restores the previous executor after a successful runtime close', async () => {
  const environment = snapshotDatabaseEnvironment();
  const schema = await createSmokeSchema();
  const sentinel = createNoopDatabase();
  setDbExecutorForTests(sentinel);
  usePlainDatabaseEnvironment();
  let runtime: Awaited<ReturnType<typeof startApplicationSmokeRuntime>> | undefined;
  try {
    runtime = await startApplicationSmokeRuntime({
      runId: 'executor-success-restore',
      targetUrl: schema.targetUrl,
      targetSchema: schema.schema,
    }, {
      createApplication: async () => express(),
      createExecutor: (config) => createNoopDatabase(),
    });
    await runtime.close();
    assert.strictEqual(getDbExecutor(), sentinel);
  } finally {
    await runtime?.close();
    await shutdownObservability();
    setDbExecutorForTests(null);
    await schema.close();
    restoreDatabaseEnvironment(environment);
  }
});

test('application smoke rejects canonical SSL configuration before application startup and restores state', async () => {
  const environment = snapshotDatabaseEnvironment();
  const sentinel = createNoopDatabase();
  const targetUrl = readTestDatabaseUrl();
  const missingCaPath = path.join(os.tmpdir(), `consensus-missing-ca-${process.pid}-${Date.now()}.pem`);
  let applicationCalls = 0;
  setDbExecutorForTests(sentinel);
  process.env.DATABASE_URL = 'sentinel-existing-url';
  process.env.DATABASE_SCHEMA = 'sentinel_schema';
  process.env.DATABASE_SSL = 'require';
  process.env.DATABASE_CA_PATH = missingCaPath;
  try {
    await assert.rejects(
      startApplicationSmokeRuntime({
        runId: 'canonical-config-failure',
        targetUrl,
        targetSchema: 'canonical_config_failure',
      }, {
        createApplication: async () => {
          applicationCalls += 1;
          throw new Error('application startup must not be reached');
        },
      }),
      (error: Error & { code?: string }) => {
        assert.equal(error.code, 'ENOENT');
        assert.doesNotMatch(error.message, new RegExp(targetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        return true;
      },
    );
    assert.equal(applicationCalls, 0);
    assert.strictEqual(getDbExecutor(), sentinel);
    assert.equal(process.env.DATABASE_URL, 'sentinel-existing-url');
    assert.equal(process.env.DATABASE_SCHEMA, 'sentinel_schema');
  } finally {
    await shutdownObservability();
    setDbExecutorForTests(null);
    restoreDatabaseEnvironment(environment);
  }
});

test('application smoke passes canonical pool, timeout, and CA settings to its executors', async () => {
  const environment = snapshotDatabaseEnvironment();
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-smoke-ca-'));
  const caPath = path.join(temporaryDirectory, 'ca.pem');
  const targetUrl = readTestDatabaseUrl();
  const sentinel = createNoopDatabase();
  const configs: DatabaseConfig[] = [];
  let closed = 0;
  await fs.writeFile(caPath, 'application-smoke-test-ca', 'utf8');
  setDbExecutorForTests(sentinel);
  process.env.DATABASE_URL = 'sentinel-existing-url';
  process.env.DATABASE_SCHEMA = 'sentinel_schema';
  process.env.DATABASE_SSL = 'require';
  process.env.DATABASE_CA_PATH = caPath;
  process.env.DATABASE_POOL_MAX = '7';
  process.env.DATABASE_CONNECTION_TIMEOUT_MS = '1234';
  process.env.DATABASE_STATEMENT_TIMEOUT_MS = '5678';
  let runtime: Awaited<ReturnType<typeof startApplicationSmokeRuntime>> | undefined;
  try {
    runtime = await startApplicationSmokeRuntime({
      runId: 'canonical-config-success',
      targetUrl,
      targetSchema: 'canonical_config_success',
    }, {
      createApplication: async () => express(),
      createExecutor: (config) => {
        configs.push(config);
        return createNoopDatabase(() => { closed += 1; });
      },
    });
    await runtime.close();
    assert.deepEqual(configs, [
      {
        connectionString: targetUrl,
        schema: 'canonical_config_success',
        poolMax: 7,
        connectionTimeoutMs: 1234,
        statementTimeoutMs: 5678,
        ssl: { rejectUnauthorized: true, ca: 'application-smoke-test-ca' },
      },
      {
        connectionString: targetUrl,
        schema: 'canonical_config_success',
        poolMax: 1,
        connectionTimeoutMs: 1234,
        statementTimeoutMs: 5678,
        ssl: { rejectUnauthorized: true, ca: 'application-smoke-test-ca' },
      },
    ]);
    assert.equal(closed, 2);
    assert.strictEqual(getDbExecutor(), sentinel);
    assert.equal(process.env.DATABASE_URL, 'sentinel-existing-url');
    assert.equal(process.env.DATABASE_SCHEMA, 'sentinel_schema');
  } finally {
    await runtime?.close();
    await shutdownObservability();
    setDbExecutorForTests(null);
    restoreDatabaseEnvironment(environment);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});
