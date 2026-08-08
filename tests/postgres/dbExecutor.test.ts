import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { readDatabaseConfig } from '../../packages/server/db/config';
import { PostgresExecutor } from '../../packages/server/db/postgres';

type RecordedQuery = { text: string; values?: readonly unknown[] };

function createClient(options: { failCommitOnce?: boolean } = {}) {
  const queries: RecordedQuery[] = [];
  let commitAttempts = 0;
  const client = {
    async query(text: string, values?: readonly unknown[]): Promise<QueryResult<Record<string, unknown>>> {
      queries.push({ text, values });
      if (text === 'COMMIT') {
        commitAttempts += 1;
        if (options.failCommitOnce && commitAttempts === 1) {
          const error = new Error('serialization failure') as Error & { code?: string };
          error.code = '40001';
          throw error;
        }
      }
      if (text.startsWith('SELECT')) {
        return { rows: [{ value: 7 }], rowCount: 1 } as QueryResult<Record<string, unknown>>;
      }
      return { rows: [], rowCount: 1 } as unknown as QueryResult<Record<string, unknown>>;
    },
    release() {},
  } as unknown as PoolClient;
  return { client, queries };
}

function createPool(clients: PoolClient[]) {
  let index = 0;
  return {
    async connect() {
      const client = clients[index];
      index += 1;
      if (!client) throw new Error('unexpected connection request');
      return client;
    },
    async query(text: string, values?: readonly unknown[]) {
      return clients[0].query(text, values as unknown[]);
    },
    async end() {},
  } as unknown as Pool;
}

test('database config requires DATABASE_URL', () => {
  assert.throws(
    () => readDatabaseConfig({ NODE_ENV: 'production' }),
    /DATABASE_URL/,
  );
});

test('database config rejects an unsafe schema identifier', () => {
  assert.throws(
    () => readDatabaseConfig({ DATABASE_URL: 'postgres://localhost/consensus', DATABASE_SCHEMA: 'bad-name' }),
    /DATABASE_SCHEMA/,
  );
});

test('transaction commits queries through the acquired client', async () => {
  const { client, queries } = createClient();
  const executor = new PostgresExecutor(createPool([client]));

  const value = await executor.withTransaction(async (transaction) => {
    const row = await transaction.queryOne<{ value: number }>('SELECT $1::int AS value', [7]);
    return row?.value;
  });

  assert.equal(value, 7);
  assert.deepEqual(queries.map((query) => query.text), ['BEGIN', 'SELECT $1::int AS value', 'COMMIT']);
});

test('transaction rolls back and does not retry a business error', async () => {
  const { client, queries } = createClient();
  const executor = new PostgresExecutor(createPool([client]));
  let attempts = 0;

  await assert.rejects(
    executor.withTransaction(async () => {
      attempts += 1;
      throw new Error('business conflict');
    }),
    /business conflict/,
  );

  assert.equal(attempts, 1);
  assert.deepEqual(queries.map((query) => query.text), ['BEGIN', 'ROLLBACK']);
});

test('transaction retries a serialization failure as a whole unit', async () => {
  const first = createClient({ failCommitOnce: true });
  const second = createClient();
  const executor = new PostgresExecutor(createPool([first.client, second.client]));
  let attempts = 0;

  const result = await executor.withTransaction(async () => {
    attempts += 1;
    return 'ok';
  });

  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
  assert.deepEqual(first.queries.map((query) => query.text), ['BEGIN', 'COMMIT', 'ROLLBACK']);
  assert.deepEqual(second.queries.map((query) => query.text), ['BEGIN', 'COMMIT']);
});
