import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openCutoverTargetSession } from '../../packages/db-migrator/src/cutover/targetSession';

interface QueryResult { rows: Array<Record<string, unknown>>; rowCount: number }

function safeGate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    serverVersionNum: 160010,
    database: 'consensus', role: 'consensus_migrator',
    superuser: false, createdb: false, createrole: false, ssl: true,
    schemaExists: false, userTableCount: 0,
    ...overrides,
  };
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cutover-session-'));
  const caPath = path.join(root, 'ca.crt');
  await fs.writeFile(caPath, 'test-ca');
  return { root, caPath };
}

test('production target session uses explicit verified TLS, locks once, gates identity, and unlocks on the same client', async () => {
  const files = await fixture();
  const calls: string[] = [];
  let clientOptions: Record<string, unknown> | undefined;
  const client = {
    connect: async () => { calls.push('connect'); },
    query: async (sql: string): Promise<QueryResult> => {
      calls.push(sql);
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }], rowCount: 1 };
      if (sql.includes('server_version_num')) return { rows: [safeGate()], rowCount: 1 };
      if (sql.includes('pg_advisory_unlock')) return { rows: [{ unlocked: true }], rowCount: 1 };
      throw new Error(`unexpected query: ${sql}`);
    },
    end: async () => { calls.push('end'); },
  };
  try {
    const session = await openCutoverTargetSession({
      targetUrl: 'postgresql://consensus_migrator:secret@postgres:5432/consensus?sslmode=verify-full',
      tlsMode: 'verify-full', caPath: files.caPath,
    }, { createClient: (options) => { clientOptions = options as Record<string, unknown>; return client; } });
    assert.deepEqual(clientOptions?.ssl, { ca: 'test-ca', rejectUnauthorized: true });
    assert.equal(clientOptions?.connectionTimeoutMillis, 5_000);
    assert.equal(clientOptions?.statement_timeout, 30_000);
    assert.equal(calls.filter((entry) => entry.includes('pg_try_advisory_lock')).length, 1);
    await session.release();
    assert.equal(calls.filter((entry) => entry.includes('pg_advisory_unlock')).length, 1);
    assert.equal(calls.at(-1), 'end');
  } finally {
    await fs.rm(files.root, { recursive: true, force: true });
  }
});

test('production target gate rejects every unsafe server state before returning a mutating session', async () => {
  const files = await fixture();
  const cases: Array<[string, Record<string, unknown>]> = [
    ['wrong version', { serverVersionNum: 150000 }],
    ['wrong database', { database: 'other' }],
    ['wrong role', { role: 'consensus_app' }],
    ['superuser', { superuser: true }],
    ['createdb', { createdb: true }],
    ['createrole', { createrole: true }],
    ['no TLS', { ssl: false }],
    ['schema exists', { schemaExists: true }],
    ['user table exists', { userTableCount: 1 }],
  ];
  try {
    for (const [label, override] of cases) {
      const queries: string[] = [];
      const client = {
        connect: async () => undefined,
        query: async (sql: string): Promise<QueryResult> => {
          queries.push(sql);
          if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }], rowCount: 1 };
          if (sql.includes('server_version_num')) return { rows: [safeGate(override)], rowCount: 1 };
          if (sql.includes('pg_advisory_unlock')) return { rows: [{ unlocked: true }], rowCount: 1 };
          throw new Error('unexpected query');
        },
        end: async () => undefined,
      };
      await assert.rejects(openCutoverTargetSession({
        targetUrl: 'postgresql://consensus_migrator:secret@postgres:5432/consensus?sslmode=verify-full',
        tlsMode: 'verify-full', caPath: files.caPath,
      }, { createClient: () => client }), (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'CUTOVER_TARGET_UNSAFE', label);
        return true;
      });
      assert.equal(queries.some((sql) => /^\s*(?:create|insert|update|delete|drop|truncate)\b/i.test(sql)), false, label);
    }
  } finally {
    await fs.rm(files.root, { recursive: true, force: true });
  }
});

test('production target session rejects wrong URL identity, TLS mode, or a held lock with fixed redacted errors', async () => {
  const files = await fixture();
  const noCall = () => assert.fail('invalid local configuration must not create a client');
  try {
    for (const targetUrl of [
      'postgresql://consensus_app:secret@postgres:5432/consensus?sslmode=verify-full',
      'postgresql://consensus_migrator:secret@127.0.0.1:5432/consensus?sslmode=verify-full',
      'postgresql://consensus_migrator:secret@postgres:6543/consensus?sslmode=verify-full',
      'postgresql://consensus_migrator:secret@postgres:5432/other?sslmode=verify-full',
    ]) {
      await assert.rejects(openCutoverTargetSession({
        targetUrl, tlsMode: 'verify-full', caPath: files.caPath,
      }, { createClient: noCall }), (error: unknown) => (
        (error as { code?: string }).code === 'CUTOVER_TARGET_UNSAFE'
      ));
    }
    await assert.rejects(openCutoverTargetSession({
      targetUrl: 'postgresql://consensus_migrator:secret@postgres:5432/consensus',
      tlsMode: 'require', caPath: files.caPath,
    }, { createClient: noCall }), (error: unknown) => (
      (error as { code?: string }).code === 'CUTOVER_TARGET_UNSAFE'
    ));

    let ended = false;
    const locked = {
      connect: async () => undefined,
      query: async () => ({ rows: [{ locked: false }], rowCount: 1 }),
      end: async () => { ended = true; },
    };
    await assert.rejects(openCutoverTargetSession({
      targetUrl: 'postgresql://consensus_migrator:secret@postgres:5432/consensus?sslmode=verify-full',
      tlsMode: 'verify-full', caPath: files.caPath,
    }, { createClient: () => locked }), (error: unknown) => (
      (error as { code?: string }).code === 'CUTOVER_ALREADY_RUNNING'
    ));
    assert.equal(ended, true);
  } finally {
    await fs.rm(files.root, { recursive: true, force: true });
  }
});

test('one global advisory lock serializes cutovers regardless of run identifier or evidence directory', async () => {
  const files = await fixture();
  let held = false;
  const createClient = () => ({
    connect: async () => undefined,
    query: async (sql: string): Promise<QueryResult> => {
      if (sql.includes('pg_try_advisory_lock')) {
        if (held) return { rows: [{ locked: false }], rowCount: 1 };
        held = true;
        return { rows: [{ locked: true }], rowCount: 1 };
      }
      if (sql.includes('server_version_num')) return { rows: [safeGate()], rowCount: 1 };
      if (sql.includes('pg_advisory_unlock')) {
        held = false;
        return { rows: [{ unlocked: true }], rowCount: 1 };
      }
      throw new Error('unexpected query');
    },
    end: async () => undefined,
  });
  const options = {
    targetUrl: 'postgresql://consensus_migrator:secret@postgres:5432/consensus?sslmode=verify-full',
    tlsMode: 'verify-full', caPath: files.caPath,
  };
  try {
    const first = await openCutoverTargetSession(options, { createClient });
    await assert.rejects(openCutoverTargetSession(options, { createClient }), (error: unknown) => (
      (error as { code?: string }).code === 'CUTOVER_ALREADY_RUNNING'
    ));
    await first.release();
    const afterRelease = await openCutoverTargetSession(options, { createClient });
    await afterRelease.release();
  } finally {
    await fs.rm(files.root, { recursive: true, force: true });
  }
});
