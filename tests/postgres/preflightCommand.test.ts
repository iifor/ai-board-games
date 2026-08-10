import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { main } from '../../packages/db-migrator/src/cli';
import { IMPORT_TABLES } from '../../packages/db-migrator/src/constants';
import { runPreflight, type PreflightOptions } from '../../packages/db-migrator/src/commands/preflight';
import type { ReadinessReport } from '../../packages/db-migrator/src/reporting/reportTypes';
import { migratePostgres } from '../../packages/server/db/postgres/migrate';
import type { DbExecutor } from '../../packages/server/db/types';
import { withTestSchema } from './helpers';

const testDatabaseUrl = (): string => {
  const value = process.env.TEST_DATABASE_URL?.trim();
  if (!value) throw new Error('TEST_DATABASE_URL is required');
  return value;
};

function sqliteFixture(): string {
  const file = path.join(os.tmpdir(), `preflight-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const database = new Database(file);
  database.exec('CREATE TABLE fixture (id INTEGER PRIMARY KEY, value TEXT NOT NULL); INSERT INTO fixture (value) VALUES (\'ready\');');
  database.close();
  return file;
}

function createOutputDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-output-'));
}

function options(sourcePath: string, outputDirectory: string, overrides: Partial<PreflightOptions> = {}): PreflightOptions {
  return {
    runId: `preflight-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sourcePath,
    targetUrl: testDatabaseUrl(),
    targetSchema: 'consensus',
    outputDirectory,
    resourceDirectories: [],
    requireTls: false,
    ...overrides,
  };
}

function errorCodes(report: Awaited<ReturnType<typeof runPreflight>>): string[] {
  return report.errors.map((error) => error.code);
}

function emptyExecutor(version: string): DbExecutor {
  return {
    queryOne: async <T extends object>(sql: string): Promise<T | null> => {
      if (sql.includes('server_version_num')) return { server_version_num: version } as T;
      return null;
    },
    queryMany: async <T extends object>(): Promise<T[]> => [],
    execute: async () => ({ rowCount: 0 }),
    withTransaction: async <T>(operation: (transaction: DbExecutor) => Promise<T>) => operation(emptyExecutor(version)),
    healthCheck: async () => true,
    close: async () => undefined,
  };
}

function freshTargetExecutor(close: () => Promise<void> = async () => undefined): DbExecutor {
  return {
    queryOne: async <T extends object>(sql: string): Promise<T | null> => {
      if (sql.includes('server_version_num')) return { server_version_num: '160000' } as T;
      if (sql.includes('pg_namespace')) return { exists: false } as T;
      return null;
    },
    queryMany: async <T extends object>(): Promise<T[]> => [],
    execute: async () => ({ rowCount: 0 }),
    withTransaction: async <T>(operation: (transaction: DbExecutor) => Promise<T>) => operation(freshTargetExecutor(close)),
    healthCheck: async () => true,
    close,
  };
}

function sqliteWithCloseFailure(sourcePath: string): { sqlite: Database.Database; release: () => void } {
  const sqlite = new Database(sourcePath, { readonly: true, fileMustExist: true });
  const realClose = sqlite.close.bind(sqlite);
  sqlite.close = (() => { throw new Error('SQLITE_CLOSE_FAILURE'); }) as typeof sqlite.close;
  return { sqlite, release: () => realClose() };
}

test('preflight reports SOURCE_NOT_FOUND without opening a target connection', async () => {
  const outputDirectory = createOutputDirectory();
  try {
    const report = await runPreflight(options(path.join(outputDirectory, 'missing.sqlite'), outputDirectory));
    assert.equal(report.status, 'failed');
    assert.deepEqual(errorCodes(report), ['SOURCE_NOT_FOUND']);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('preflight reports SOURCE_INTEGRITY_FAILED for an unreadable SQLite image', async () => {
  const sourcePath = sqliteFixture();
  const outputDirectory = createOutputDirectory();
  fs.writeFileSync(sourcePath, Buffer.from('not a sqlite database'));
  try {
    const report = await runPreflight(options(sourcePath, outputDirectory));
    assert.equal(report.status, 'failed');
    assert.deepEqual(errorCodes(report), ['SOURCE_INTEGRITY_FAILED']);
  } finally {
    fs.rmSync(sourcePath, { force: true });
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('preflight reports POSTGRES_VERSION_UNSUPPORTED for a non-16 server', async () => {
  const sourcePath = sqliteFixture();
  const outputDirectory = createOutputDirectory();
  try {
    const report = await runPreflight(options(sourcePath, outputDirectory), {
      createPostgres: () => emptyExecutor('150002'),
    });
    assert.equal(report.status, 'failed');
    assert.deepEqual(errorCodes(report), ['POSTGRES_VERSION_UNSUPPORTED']);
  } finally {
    fs.rmSync(sourcePath, { force: true });
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('preflight reports TARGET_NOT_EMPTY when an import table already has data', async () => {
  await withTestSchema(async (database, schema) => {
    await migratePostgres(database);
    const sourcePath = sqliteFixture();
    const outputDirectory = createOutputDirectory();
    try {
      await database.execute(`INSERT INTO skins (id, name, version, source, terms_json, background, truth, clues_json, noises_json, memory_examples_json, enabled)
        VALUES ('preflight-skin', 'Preflight', 'v1', 'test', '[]', '', '', '[]', '[]', '[]', 1)`);
      const report = await runPreflight(options(sourcePath, outputDirectory, { targetSchema: schema }));
      assert.equal(report.status, 'failed');
      assert.deepEqual(errorCodes(report), ['TARGET_NOT_EMPTY']);
      assert.equal((await database.queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM skins'))?.count, 1);
    } finally {
      fs.rmSync(sourcePath, { force: true });
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});

test('preflight reports TLS_REQUIRED only after a safe empty target has passed its database checks', async () => {
  await withTestSchema(async (database, schema) => {
    await migratePostgres(database);
    const sourcePath = sqliteFixture();
    const outputDirectory = createOutputDirectory();
    try {
      const report = await runPreflight(options(sourcePath, outputDirectory, { targetSchema: schema, requireTls: true }));
      assert.equal(report.status, 'failed');
      assert.deepEqual(errorCodes(report), ['TLS_REQUIRED']);
      assert.equal(report.checks.find((check) => check.id === 'target.import-tables-empty')?.status, 'passed');
    } finally {
      fs.rmSync(sourcePath, { force: true });
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});

test('preflight reports INSUFFICIENT_DISK_SPACE before it opens PostgreSQL', async () => {
  const sourcePath = sqliteFixture();
  const outputDirectory = createOutputDirectory();
  const resourceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-resource-'));
  fs.writeFileSync(path.join(resourceDirectory, 'resource.bin'), Buffer.alloc(64));
  let createdPostgres = false;
  try {
    const report = await runPreflight(options(sourcePath, outputDirectory, { resourceDirectories: [resourceDirectory] }), {
      availableBytes: async () => 1,
      createPostgres: () => {
        createdPostgres = true;
        return emptyExecutor('160000');
      },
    });
    assert.equal(report.status, 'failed');
    assert.deepEqual(errorCodes(report), ['INSUFFICIENT_DISK_SPACE']);
    assert.equal(createdPostgres, false);
  } finally {
    fs.rmSync(sourcePath, { force: true });
    fs.rmSync(outputDirectory, { recursive: true, force: true });
    fs.rmSync(resourceDirectory, { recursive: true, force: true });
  }
});

test('preflight accepts a missing target schema without creating it or writing source/output files', async () => {
  await withTestSchema(async (database) => {
    const sourcePath = sqliteFixture();
    const outputDirectory = createOutputDirectory();
    const missingSchema = `preflight_fresh_${process.pid}_${Date.now()}`;
    const sourceDirectoryEntries = fs.readdirSync(path.dirname(sourcePath)).sort();
    const outputEntries = fs.readdirSync(outputDirectory).sort();
    try {
      const report = await runPreflight(options(sourcePath, outputDirectory, { targetSchema: missingSchema }));
      assert.equal(report.status, 'passed');
      assert.ok(report.checks.every((check) => check.status === 'passed'));
      assert.equal(report.checks.find((check) => check.id === 'target.schema-is-fresh')?.status, 'passed');
      assert.equal((await database.queryOne<{ exists: boolean }>('SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = $1) AS exists', [missingSchema]))?.exists, false);
      assert.deepEqual(fs.readdirSync(path.dirname(sourcePath)).sort(), sourceDirectoryEntries);
      assert.deepEqual(fs.readdirSync(outputDirectory).sort(), outputEntries);
    } finally {
      fs.rmSync(sourcePath, { force: true });
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});

test('preflight leaves an existing migrated empty target unchanged', async () => {
  await withTestSchema(async (database, schema) => {
    await migratePostgres(database);
    const sourcePath = sqliteFixture();
    const outputDirectory = createOutputDirectory();
    try {
      const before = await Promise.all(IMPORT_TABLES.map(async (table) => ({
        table,
        count: (await database.queryOne<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "${table}"`))?.count,
      })));
      const report = await runPreflight(options(sourcePath, outputDirectory, { targetSchema: schema }));
      const after = await Promise.all(IMPORT_TABLES.map(async (table) => ({
        table,
        count: (await database.queryOne<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "${table}"`))?.count,
      })));
      assert.equal(report.status, 'passed');
      assert.deepEqual(after, before);
    } finally {
      fs.rmSync(sourcePath, { force: true });
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});

test('preflight records POSTGRES_CLOSE_FAILED after otherwise-passed checks', async () => {
  const sourcePath = sqliteFixture();
  const outputDirectory = createOutputDirectory();
  let postgresCloseAttempts = 0;
  try {
    const report = await runPreflight(options(sourcePath, outputDirectory), {
      createPostgres: () => freshTargetExecutor(async () => {
        postgresCloseAttempts += 1;
        throw new Error('POSTGRES_CLOSE_FAILURE');
      }),
    });
    assert.equal(report.status, 'failed');
    assert.deepEqual(errorCodes(report), ['POSTGRES_CLOSE_FAILED']);
    assert.equal(report.checks.find((check) => check.id === 'target.close')?.status, 'failed');
    assert.equal(postgresCloseAttempts, 1);
  } finally {
    fs.rmSync(sourcePath, { force: true });
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('preflight records SQLITE_CLOSE_FAILED after otherwise-passed checks', async () => {
  const sourcePath = sqliteFixture();
  const outputDirectory = createOutputDirectory();
  const source = sqliteWithCloseFailure(sourcePath);
  try {
    const report = await runPreflight(options(sourcePath, outputDirectory), {
      createSqlite: () => source.sqlite,
      createPostgres: () => freshTargetExecutor(),
    });
    assert.equal(report.status, 'failed');
    assert.deepEqual(errorCodes(report), ['SQLITE_CLOSE_FAILED']);
    assert.equal(report.checks.find((check) => check.id === 'source.close')?.status, 'failed');
  } finally {
    source.release();
    fs.rmSync(sourcePath, { force: true });
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('preflight records both close failures after otherwise-passed checks', async () => {
  const sourcePath = sqliteFixture();
  const outputDirectory = createOutputDirectory();
  const source = sqliteWithCloseFailure(sourcePath);
  let postgresCloseAttempts = 0;
  try {
    const report = await runPreflight(options(sourcePath, outputDirectory), {
      createSqlite: () => source.sqlite,
      createPostgres: () => freshTargetExecutor(async () => {
        postgresCloseAttempts += 1;
        throw new Error('POSTGRES_CLOSE_FAILURE');
      }),
    });
    assert.equal(report.status, 'failed');
    assert.deepEqual(errorCodes(report), ['SQLITE_CLOSE_FAILED', 'POSTGRES_CLOSE_FAILED']);
    assert.equal(postgresCloseAttempts, 1);
  } finally {
    source.release();
    fs.rmSync(sourcePath, { force: true });
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('preflight preserves an earlier failure while recording close failures', async () => {
  const sourcePath = sqliteFixture();
  const outputDirectory = createOutputDirectory();
  const source = sqliteWithCloseFailure(sourcePath);
  let postgresCloseAttempts = 0;
  try {
    const report = await runPreflight(options(sourcePath, outputDirectory), {
      createSqlite: () => source.sqlite,
      createPostgres: () => {
        const executor = emptyExecutor('150000');
        executor.close = async () => {
          postgresCloseAttempts += 1;
          throw new Error('POSTGRES_CLOSE_FAILURE');
        };
        return executor;
      },
    });
    assert.equal(report.status, 'failed');
    assert.deepEqual(errorCodes(report), [
      'POSTGRES_VERSION_UNSUPPORTED',
      'SQLITE_CLOSE_FAILED',
      'POSTGRES_CLOSE_FAILED',
    ]);
    assert.equal(postgresCloseAttempts, 1);
  } finally {
    source.release();
    fs.rmSync(sourcePath, { force: true });
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('preflight CLI route redacts PostgreSQL URLs from readiness reports before stdout', async () => {
  const url = 'postgresql://route_user:route_password@route.host:5432/route_database?sslmode=require';
  const report: ReadinessReport = {
    runId: 'preflight-route-redaction',
    stage: 'preflight',
    status: 'failed',
    startedAt: '2026-08-10T00:00:00.000Z',
    finishedAt: '2026-08-10T00:00:01.000Z',
    durationMs: 1000,
    checks: [{ id: 'target.postgres-version', status: 'failed', actual: url, message: `upstream rejected ${url}` }],
    artifacts: [],
    errors: [{ code: 'POSTGRES_CONNECTION_FAILED', message: `DATABASE_URL=${url}` }],
  };
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  await main(['preflight'], {
    runReadinessCommand: async () => report,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    setExitCode: (code) => exitCodes.push(code),
  });
  assert.deepEqual(exitCodes, [1]);
  assert.equal(stdout.length, 1);
  for (const line of [...stdout, ...stderr]) {
    assert.match(line, /\[REDACTED_DATABASE_URL\]/);
    for (const component of ['route_user', 'route_password', 'route.host', '5432', 'route_database', 'sslmode']) {
      assert.doesNotMatch(line, new RegExp(component));
    }
  }
});
