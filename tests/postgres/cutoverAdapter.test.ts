import assert from 'node:assert/strict';
import test from 'node:test';
import { executeRequest, parseRequest } from '../../packages/server/db/postgres/cutoverAdapter';
import type { DbExecutor } from '../../packages/server/db/types';

const REQUEST = {
  targetUrl: 'postgresql://consensus_migrator:secret@postgres:5432/consensus?sslmode=verify-full',
  schema: 'consensus',
  tlsMode: 'verify-full',
  ca: 'test-ca',
};

function executor(overrides: Partial<DbExecutor> = {}): DbExecutor {
  return {
    queryOne: async () => ({
      serverVersionNum: 160010, database: 'consensus', role: 'consensus_migrator', ssl: true,
      schemaExists: false,
    }),
    queryMany: async () => [],
    execute: async () => ({ rowCount: 0 }),
    withTransaction: async (operation) => operation(executor()),
    healthCheck: async () => true,
    close: async () => undefined,
    ...overrides,
  };
}

test('compiled cutover adapter creates exactly consensus and runs canonical migrations once', async () => {
  const calls: string[] = [];
  let config: Record<string, unknown> | undefined;
  const database = executor({
    queryOne: async (sql) => {
      calls.push(sql);
      return {
        serverVersionNum: 160010, database: 'consensus', role: 'consensus_migrator', ssl: true,
        schemaExists: false,
      } as never;
    },
    execute: async (sql) => { calls.push(sql); return { rowCount: 0 }; },
  });
  let migrated = 0;
  const result = await executeRequest(REQUEST, {
    createExecutor: (value) => { config = value as Record<string, unknown>; return database; },
    migrate: async (value) => { assert.equal(value, database); migrated += 1; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.schema, 'consensus');
  assert.deepEqual(config?.ssl, { ca: 'test-ca', rejectUnauthorized: true });
  assert.equal(calls.filter((sql) => /^CREATE SCHEMA "consensus"$/i.test(sql)).length, 1);
  assert.equal(migrated, 1);
});

test('compiled cutover adapter fails closed for wrong input, target identity, or existing schema without migrate', async () => {
  for (const candidate of [
    { ...REQUEST, schema: 'other' },
    { ...REQUEST, tlsMode: 'require' },
    { ...REQUEST, targetUrl: 'postgresql://consensus_app:secret@postgres:5432/consensus?sslmode=verify-full' },
    { ...REQUEST, extra: true },
  ]) {
    assert.throws(
      () => parseRequest(JSON.stringify(candidate)),
      (error: unknown) => (error as { code?: string }).code === 'CUTOVER_ADAPTER_INPUT_INVALID',
    );
  }

  let migrated = false;
  await assert.rejects(executeRequest(REQUEST, {
    createExecutor: () => executor({
      queryOne: async () => ({
        serverVersionNum: 160010, database: 'consensus', role: 'consensus_migrator', ssl: true,
        schemaExists: true,
      }) as never,
    }),
    migrate: async () => { migrated = true; },
  }), (error: unknown) => (error as { code?: string }).code === 'CUTOVER_TARGET_UNSAFE');
  assert.equal(migrated, false);
});

test('compiled cutover adapter preserves a primary failure when close also fails', async () => {
  const primary = Object.assign(new Error('private failure'), { code: 'PRIMARY' });
  await assert.rejects(executeRequest(REQUEST, {
    createExecutor: () => executor({
      queryOne: async () => { throw primary; },
      close: async () => { throw new Error('private close failure'); },
    }),
  }), (error: unknown) => error === primary);
});
