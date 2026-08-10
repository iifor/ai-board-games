import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { buildManifest } from '../../packages/db-migrator/src/backup/manifest';
import { main } from '../../packages/db-migrator/src/cli';
import { runRehearsal } from '../../packages/db-migrator/src/commands/rehearse';
import { migrateSqliteToPostgres } from '../../packages/db-migrator/src/importer';
import { writeJsonArtifactExclusive, writeReadinessReport } from '../../packages/db-migrator/src/reporting/reportWriter';
import type { ReadinessReport } from '../../packages/db-migrator/src/reporting/reportTypes';
import {
  assertRehearsalDatabase,
  buildRehearsalSchema,
  createRehearsalSchema,
  rehearsalSchemaExists,
  runRehearsalAdapter,
} from '../../packages/db-migrator/src/postgres/rehearsalSchema';
import { createPostgresExecutor } from '../../packages/server/db/postgres';
import { executeRequest } from '../../packages/server/db/postgres/rehearsalAdapter';
import type { DbExecutor } from '../../packages/server/db/types';
import type { MigrationClient, MigrationReport } from '../../packages/db-migrator/src/types';

async function writePassedSmoke(options: {
  runId: string;
  targetSchema: string;
  outputDirectory: string;
}): Promise<ReadinessReport> {
  const report: ReadinessReport = {
    runId: options.runId,
    schema: options.targetSchema,
    stage: 'smoke',
    status: 'passed',
    startedAt: '2026-08-10T00:00:00.000Z',
    finishedAt: '2026-08-10T00:00:00.000Z',
    durationMs: 0,
    checks: [{ id: 'application.smoke', status: 'passed', message: 'Injected rehearsal smoke passed' }],
    artifacts: [],
    errors: [],
  };
  await writeReadinessReport({ outputDirectory: options.outputDirectory, report });
  return report;
}

function prepareRehearsalFixture(): {
  root: string;
  sourceSnapshotPath: string;
  sourceManifestPath: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-rehearsal-'));
  const backupRoot = path.join(root, 'backup');
  const rawRoot = path.join(backupRoot, 'sqlite-raw');
  const sourceSnapshotPath = path.join(backupRoot, 'sqlite-consistent.sqlite');
  fs.mkdirSync(rawRoot, { recursive: true });
  const sqlite = new Database(sourceSnapshotPath);
  sqlite.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL, enabled INTEGER NOT NULL, must_change_password INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE players (
      id INTEGER PRIMARY KEY, nickname TEXT NOT NULL, name TEXT NOT NULL, avatar TEXT NOT NULL,
      sex TEXT NOT NULL, personality TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
      model_id INTEGER, fallback_model_id INTEGER, voice_package_id INTEGER, temperature REAL NOT NULL,
      enabled INTEGER NOT NULL, sort_order INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE games (
      id TEXT PRIMARY KEY, game_type TEXT NOT NULL, mode TEXT NOT NULL, skin_id TEXT, skin_name TEXT NOT NULL,
      winner TEXT, win_reason TEXT NOT NULL, topic_json TEXT NOT NULL, players_json TEXT NOT NULL,
      rounds_json TEXT NOT NULL, event_json TEXT NOT NULL, audio_resources_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE game_playback_events (
      game_id TEXT NOT NULL, sequence INTEGER NOT NULL, protocol_version INTEGER NOT NULL,
      event_type TEXT NOT NULL, view_mode TEXT NOT NULL, payload_json TEXT NOT NULL,
      media_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (game_id, sequence)
    );
    CREATE TABLE player_game_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT, game_type TEXT NOT NULL, owner_player_id INTEGER NOT NULL,
      subject_player_id INTEGER NOT NULL, games_played INTEGER NOT NULL, familiarity_score REAL NOT NULL,
      traits_json TEXT NOT NULL, recent_summary TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  sqlite.close();
  fs.copyFileSync(sourceSnapshotPath, path.join(rawRoot, 'source.sqlite'));
  return { root, sourceSnapshotPath, sourceManifestPath: path.join(backupRoot, 'manifest.json') };
}

async function finalizeRehearsalFixture(
  fixture: ReturnType<typeof prepareRehearsalFixture>,
): Promise<void> {
  const manifest = await buildManifest(path.dirname(fixture.sourceManifestPath), 'rehearsal-fixture');
  fs.writeFileSync(fixture.sourceManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function withDatabaseUrl<T>(value: string, operation: () => Promise<T>): Promise<T> {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = value;
  try {
    return await operation();
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
}

test('rehearsal schema is deterministic, safe, and run-specific', () => {
  const now = new Date('2026-08-10T04:05:06.789Z');
  const first = buildRehearsalSchema('release-candidate-a', now);
  const second = buildRehearsalSchema('release-candidate-b', now);

  assert.match(first, /^consensus_rehearsal_20260810t040506789z_[a-f0-9]{10}$/);
  assert.match(first, /^[a-z0-9_]+$/);
  assert.notEqual(first, second);
  assert.equal(first, buildRehearsalSchema('release-candidate-a', now));
});

test('rehearsal database gate accepts only dedicated test databases', () => {
  assert.doesNotThrow(() => assertRehearsalDatabase('postgresql://user:secret@127.0.0.1:15432/consensus_test'));
  assert.doesNotThrow(() => assertRehearsalDatabase('postgresql://user:secret@127.0.0.1:15432/consensus_rehearsal'));
  assert.throws(
    () => assertRehearsalDatabase('postgresql://user:secret@db.internal:5432/consensus'),
    (error: unknown) => (error as { code?: string }).code === 'REHEARSAL_DATABASE_UNSAFE',
  );
});

test('db-migrator sends the target URL through adapter stdin and never argv', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rehearsal-adapter-spy-'));
  const spyPath = path.join(root, 'spy.cjs');
  fs.writeFileSync(spyPath, `
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', () => {
      const request = JSON.parse(input);
      process.stdout.write(JSON.stringify({
        ok: true,
        schema: request.schema,
        exists: false,
        receivedUrl: request.targetUrl,
        argv: process.argv.slice(2),
      }));
    });
  `, 'utf8');
  const targetUrl = 'postgresql://stdin_user:stdin_password@127.0.0.1:15432/consensus_test';
  try {
    const response = await runRehearsalAdapter(
      'exists',
      targetUrl,
      buildRehearsalSchema('stdin-adapter', new Date('2026-08-10T00:00:00.000Z')),
      { adapterFilePath: spyPath },
    ) as { receivedUrl?: string; argv?: string[] };
    assert.equal(response.receivedUrl, targetUrl);
    assert.deepEqual(response.argv, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rehearse rejects a literal target argument before source or database access', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rehearsal-argv-rejection-'));
  const targetUrl = 'postgresql://argv_user:argv_password@203.0.113.77:6543/consensus_test';
  const stdout: string[] = [];
  const stderr: string[] = [];
  const outputDirectory = path.join(root, 'must-not-be-created');
  try {
    await assert.rejects(
      main([
        'rehearse',
        '--source-snapshot', path.join(root, 'must-not-be-opened.sqlite'),
        '--manifest', path.join(root, 'must-not-be-opened.json'),
        '--target', targetUrl,
        '--output', outputDirectory,
        '--run-id', 'argv-target-rejected',
        '--execute',
      ], {
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
        setExitCode: () => assert.fail('rejected arguments must not produce a readiness exit code'),
      }),
      (error: unknown) => {
        const failure = error as Error & { code?: string };
        assert.equal(failure.code, 'REHEARSAL_TARGET_ARG_FORBIDDEN');
        assert.equal(failure.message, 'Rehearsal target must be provided through DATABASE_URL');
        assert.doesNotMatch(
          `${failure.code}\n${failure.message}\n${stdout.join('\n')}\n${stderr.join('\n')}`,
          /argv_user|argv_password|203\.0\.113\.77|6543|postgres(?:ql)?:\/\//i,
        );
        return true;
      },
    );
    assert.equal(fs.existsSync(outputDirectory), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('compiled server adapter creates and migrates one isolated schema without putting the target URL in argv', async () => {
  const root = path.resolve(__dirname, '../..');
  const runtimePath = path.join(root, 'packages/server/dev-runtime.cjs');
  const runtimeCheckBefore = spawnSync(process.execPath, ['--check', runtimePath], { encoding: 'utf8' });
  assert.equal(runtimeCheckBefore.status, 0, runtimeCheckBefore.stderr);
  const sentinelPath = path.join(root, 'packages/server/dist/server-entry-sentinel.js');
  fs.mkdirSync(path.dirname(sentinelPath), { recursive: true });
  fs.writeFileSync(sentinelPath, 'module.exports = true;\n', 'utf8');
  const build = spawnSync(process.env.ComSpec || 'cmd.exe', [
    '/d', '/s', '/c', 'pnpm.cmd --filter @ai-presenter/server run build',
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  assert.equal(fs.existsSync(sentinelPath), true, 'server build must preserve unrelated server dist output');
  fs.rmSync(sentinelPath);
  const runtimeCheckAfter = spawnSync(process.execPath, ['--check', runtimePath], { encoding: 'utf8' });
  assert.equal(runtimeCheckAfter.status, 0, runtimeCheckAfter.stderr);
  const adapterPath = path.join(root, 'packages/server/dist/db/postgres/rehearsalAdapter.js');
  assert.equal(fs.existsSync(adapterPath), true, 'server build must emit the rehearsal adapter');

  const targetUrl = process.env.TEST_DATABASE_URL!;
  const schema = buildRehearsalSchema(`adapter-${Date.now()}`, new Date());
  const cleanup = createPostgresExecutor({
    connectionString: targetUrl,
    schema: 'public',
    poolMax: 1,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 30_000,
    ssl: false,
  });
  try {
    assert.equal(await rehearsalSchemaExists(targetUrl, schema), false);
    await createRehearsalSchema(targetUrl, schema);
    assert.equal(await rehearsalSchemaExists(targetUrl, schema), true);
    await assert.rejects(
      createRehearsalSchema(targetUrl, schema),
      (error: unknown) => (error as { code?: string }).code === 'REHEARSAL_TARGET_EXISTS',
    );
    const migrated = createPostgresExecutor({
      connectionString: targetUrl,
      schema,
      poolMax: 1,
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 30_000,
      ssl: false,
    });
    try {
      const applied = await migrated.queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM schema_migrations');
      assert.ok(Number(applied?.count) > 0);
    } finally {
      await migrated.close();
    }
  } finally {
    await cleanup.execute(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await cleanup.close();
  }
});

test('server adapter preserves the primary operation failure when close also fails', async () => {
  const primary = Object.assign(new Error('private primary detail'), { code: 'PRIMARY_FAILURE' });
  const executor: DbExecutor = {
    queryOne: async () => { throw primary; },
    queryMany: async () => [],
    execute: async () => ({ rowCount: 0 }),
    withTransaction: async () => { throw new Error('not used'); },
    healthCheck: async () => false,
    close: async () => { throw Object.assign(new Error('private close detail'), { code: 'CLOSE_FAILURE' }); },
  };
  await assert.rejects(
    executeRequest({
      operation: 'exists',
      targetUrl: process.env.TEST_DATABASE_URL!,
      schema: buildRehearsalSchema(`close-${Date.now()}`, new Date()),
    }, {
      createExecutor: () => executor,
    }),
    (error: unknown) => error === primary,
  );
});

test('rehearsal dry-run is non-mutating and two executions are isolated with the same source hash', async () => {
  const fixture = prepareRehearsalFixture();
  await finalizeRehearsalFixture(fixture);
  const targetUrl = process.env.TEST_DATABASE_URL!;
  const schemas: string[] = [];
  const cleanup = createPostgresExecutor({
    connectionString: targetUrl,
    schema: 'public',
    poolMax: 1,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 30_000,
    ssl: false,
  });
  const base = {
    sourceSnapshotPath: fixture.sourceSnapshotPath,
    sourceManifestPath: fixture.sourceManifestPath,
    targetUrl,
  };
  try {
    const dryRun = await runRehearsal({
      ...base,
      runId: `dry-${process.pid}-${Date.now()}`,
      outputDirectory: path.join(fixture.root, 'dry-reports'),
      execute: false,
    }, {
      schemaExists: async () => { throw new Error('dry-run must not open PostgreSQL'); },
    });
    assert.equal(dryRun.report.status, 'passed');
    assert.equal(dryRun.migrationReportPath, undefined);
    assert.equal(dryRun.validationReportPath, undefined);
    assert.equal(await rehearsalSchemaExists(targetUrl, dryRun.schema), false);

    const firstRunId = `first-${process.pid}-${Date.now()}`;
    const firstOutput = path.join(fixture.root, 'first-reports');
    const first = await runRehearsal({
      ...base,
      runId: firstRunId,
      outputDirectory: firstOutput,
      execute: true,
    }, {
      now: () => new Date('2026-08-10T01:00:00.000Z'),
      smoke: writePassedSmoke,
    });
    schemas.push(first.schema);
    assert.equal(first.report.status, 'passed');
    assert.ok(first.migrationReportPath && fs.existsSync(first.migrationReportPath));
    assert.ok(first.validationReportPath && fs.existsSync(first.validationReportPath));
    const firstHash = first.report.checks.find((check) => check.id === 'source.snapshot.sha256')?.actual;
    assert.match(firstHash || '', /^[a-f0-9]{64}$/);

    const reusedSchema = buildRehearsalSchema(firstRunId, new Date('2026-08-10T02:00:00.000Z'));
    schemas.push(reusedSchema);
    const reused = await runRehearsal({
      ...base,
      runId: firstRunId,
      outputDirectory: path.join(fixture.root, 'reused-run-reports'),
      execute: true,
    }, {
      now: () => new Date('2026-08-10T02:00:00.000Z'),
    });
    assert.equal(reused.schema, reusedSchema);
    assert.equal(reused.report.status, 'failed');
    assert.ok(reused.report.errors.some((error) => error.code === 'REHEARSAL_TARGET_EXISTS'));
    assert.equal(await rehearsalSchemaExists(targetUrl, reusedSchema), false);

    const firstDb = createPostgresExecutor({
      connectionString: targetUrl, schema: first.schema, poolMax: 1,
      connectionTimeoutMs: 5_000, statementTimeoutMs: 30_000, ssl: false,
    });
    try {
      await firstDb.execute(
        `INSERT INTO app_settings (key, value_json, updated_at) VALUES ($1, $2, $3)`,
        ['first-only', JSON.stringify({ isolated: true }), new Date().toISOString()],
      );
    } finally {
      await firstDb.close();
    }

    const second = await runRehearsal({
      ...base,
      runId: `second-${process.pid}-${Date.now()}`,
      outputDirectory: path.join(fixture.root, 'second-reports'),
      execute: true,
    }, {
      smoke: writePassedSmoke,
    });
    schemas.push(second.schema);
    assert.equal(second.report.status, 'passed');
    assert.notEqual(second.schema, first.schema);
    assert.equal(
      second.report.checks.find((check) => check.id === 'source.snapshot.sha256')?.actual,
      firstHash,
    );
    const firstCount = await cleanup.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM "${first.schema}".app_settings WHERE key = 'first-only'`,
    );
    const secondCount = await cleanup.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM "${second.schema}".app_settings WHERE key = 'first-only'`,
    );
    assert.equal(Number(firstCount?.count), 1);
    assert.equal(Number(secondCount?.count), 0);
  } finally {
    for (const schema of schemas) await cleanup.execute(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await cleanup.close();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('concurrent schemas with the same runId hash allow only one atomic create-and-migrate', async () => {
  const targetUrl = process.env.TEST_DATABASE_URL!;
  const runId = `concurrent-${process.pid}-${Date.now()}`;
  const firstSchema = buildRehearsalSchema(runId, new Date('2026-08-10T03:00:00.000Z'));
  const secondSchema = buildRehearsalSchema(runId, new Date('2026-08-10T03:00:01.000Z'));
  const cleanup = createPostgresExecutor({
    connectionString: targetUrl, schema: 'public', poolMax: 1,
    connectionTimeoutMs: 5_000, statementTimeoutMs: 30_000, ssl: false,
  });
  try {
    const results = await Promise.allSettled([
      createRehearsalSchema(targetUrl, firstSchema),
      createRehearsalSchema(targetUrl, secondSchema),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejection = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined;
    assert.equal((rejection?.reason as { code?: string }).code, 'REHEARSAL_TARGET_EXISTS');
    const existing = await cleanup.queryMany<{ schema_name: string }>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ($1, $2)`,
      [firstSchema, secondSchema],
    );
    assert.equal(existing.length, 1);
  } finally {
    await cleanup.execute(`DROP SCHEMA IF EXISTS "${firstSchema}" CASCADE`);
    await cleanup.execute(`DROP SCHEMA IF EXISTS "${secondSchema}" CASCADE`);
    await cleanup.close();
  }
});

test('exclusive JSON artifact publication cleans a synced temporary file when publication fails', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rehearsal-artifact-'));
  const finalPath = path.join(root, 'migration.json');
  try {
    await assert.rejects(writeJsonArtifactExclusive({
      finalPath,
      payload: { status: 'failed' },
      fileSystem: {
        mkdir: (directory) => fs.promises.mkdir(directory, { recursive: true }).then(() => undefined),
        open: async (candidate, flags) => {
          const handle = await fs.promises.open(candidate, flags);
          return {
            writeFile: (content) => handle.writeFile(content, 'utf8').then(() => undefined),
            sync: () => handle.sync(),
            close: () => handle.close(),
          };
        },
        link: async () => { throw Object.assign(new Error('injected publication failure'), { code: 'EIO' }); },
        rename: (sourcePath, targetPath) => fs.promises.rename(sourcePath, targetPath),
        rm: (candidate) => fs.promises.rm(candidate, { force: true }),
        stat: (candidate) => fs.promises.stat(candidate),
      },
    }), /injected publication failure/);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('exclusive JSON artifact publication reports cleanup failure while preserving the published final', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rehearsal-artifact-cleanup-'));
  const finalPath = path.join(root, 'migration.json');
  try {
    await assert.rejects(writeJsonArtifactExclusive({
      finalPath,
      payload: { status: 'succeeded' },
      fileSystem: {
        mkdir: (directory) => fs.promises.mkdir(directory, { recursive: true }).then(() => undefined),
        open: async (candidate, flags) => {
          const handle = await fs.promises.open(candidate, flags);
          return {
            writeFile: (content) => handle.writeFile(content, 'utf8').then(() => undefined),
            sync: () => handle.sync(),
            close: () => handle.close(),
          };
        },
        link: (sourcePath, targetPath) => fs.promises.link(sourcePath, targetPath),
        rename: (sourcePath, targetPath) => fs.promises.rename(sourcePath, targetPath),
        rm: async () => { throw Object.assign(new Error('injected cleanup failure'), { code: 'EIO' }); },
        stat: (candidate) => fs.promises.stat(candidate),
      },
    }), (error: unknown) => (error as { code?: string }).code === 'ARTIFACT_TEMP_CLEANUP_FAILED');
    assert.equal(fs.existsSync(finalPath), true);
    assert.match(fs.readFileSync(finalPath, 'utf8'), /"status": "succeeded"/);
    assert.ok(fs.readdirSync(root).some((entry) => entry.startsWith('migration.json.tmp-')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rehearsal preserves the migrated schema and reports while rolling back a failed import', async () => {
  const fixture = prepareRehearsalFixture();
  const source = new Database(fixture.sourceSnapshotPath);
  source.prepare('INSERT INTO app_settings VALUES (?, ?, ?)').run(
    'invalid-json', '{broken', '2026-08-10T00:00:00.000Z',
  );
  source.close();
  fs.copyFileSync(fixture.sourceSnapshotPath, path.join(path.dirname(fixture.sourceSnapshotPath), 'sqlite-raw/source.sqlite'));
  await finalizeRehearsalFixture(fixture);
  const targetUrl = process.env.TEST_DATABASE_URL!;
  const runId = `failed-${process.pid}-${Date.now()}`;
  let schema = '';
  const cleanup = createPostgresExecutor({
    connectionString: targetUrl, schema: 'public', poolMax: 1,
    connectionTimeoutMs: 5_000, statementTimeoutMs: 30_000, ssl: false,
  });
  try {
    const result = await runRehearsal({
      runId,
      sourceSnapshotPath: fixture.sourceSnapshotPath,
      sourceManifestPath: fixture.sourceManifestPath,
      targetUrl,
      outputDirectory: path.join(fixture.root, 'failed-reports'),
      execute: true,
    });
    schema = result.schema;
    assert.equal(result.report.status, 'failed');
    assert.ok(result.report.errors.some((error) => error.code === 'REHEARSAL_IMPORT_FAILED'));
    assert.equal(await rehearsalSchemaExists(targetUrl, schema), true);
    assert.ok(result.migrationReportPath && fs.existsSync(result.migrationReportPath));
    assert.ok(fs.existsSync(path.join(fixture.root, 'failed-reports', `${runId}-rehearsal.json`)));
    const count = await cleanup.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM "${schema}".app_settings`,
    );
    assert.equal(Number(count?.count), 0);
  } finally {
    if (schema) await cleanup.execute(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await cleanup.close();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('import failure diagnostics stay with the caller while rehearsal files and CLI use allowlisted text', async () => {
  const fixture = prepareRehearsalFixture();
  await finalizeRehearsalFixture(fixture);
  const rawMessage = 'connect ECONNREFUSED adversarial.host (198.51.100.44:6543) for postgresql://endpoint_user:endpoint_password@adversarial.host:6543/consensus_test';
  const driverError = new Error(rawMessage);
  const client: MigrationClient = {
    connect: async () => { throw driverError; },
    query: async <T extends object>(): Promise<{ rows: T[]; rowCount: number }> => ({ rows: [], rowCount: 0 }),
    end: async () => undefined,
  };
  let importerError: (Error & { migrationReport?: MigrationReport }) | undefined;
  const outputDirectory = path.join(fixture.root, 'sanitized-failure-reports');
  try {
    try {
      await migrateSqliteToPostgres({
        sourcePath: fixture.sourceSnapshotPath,
        targetUrl: process.env.TEST_DATABASE_URL!,
        targetSchema: 'consensus',
      }, { createClient: async () => client });
      assert.fail('import must fail with the injected driver error');
    } catch (error) {
      importerError = error as Error & { migrationReport?: MigrationReport };
    }
    assert.equal(importerError, driverError, 'the immediate caller keeps the original Error object');
    assert.deepEqual(
      importerError.migrationReport?.errors,
      ['MIGRATION_IMPORT_FAILED: SQLite to PostgreSQL import failed'],
    );

    const runId = `sanitized-failure-${process.pid}-${Date.now()}`;
    const result = await runRehearsal({
      runId,
      sourceSnapshotPath: fixture.sourceSnapshotPath,
      sourceManifestPath: fixture.sourceManifestPath,
      targetUrl: process.env.TEST_DATABASE_URL!,
      outputDirectory,
      execute: true,
    }, {
      now: () => new Date('2026-08-10T06:00:00.000Z'),
      runExists: async () => false,
      schemaExists: async () => false,
      createSchema: async () => undefined,
      migrate: async () => { throw importerError; },
      validate: async () => assert.fail('validation must not run after import failure'),
    });
    assert.equal(result.report.status, 'failed');
    assert.ok(result.migrationReportPath && fs.existsSync(result.migrationReportPath));

    const stdout: string[] = [];
    const stderr: string[] = [];
    await main(['rehearse'], {
      runReadinessCommand: async () => result.report,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
      setExitCode: () => undefined,
    });
    const persisted = fs.readdirSync(outputDirectory)
      .map((name) => fs.readFileSync(path.join(outputDirectory, name), 'utf8'))
      .join('\n');
    const observable = `${JSON.stringify(importerError.migrationReport)}\n${persisted}\n${stdout.join('\n')}\n${stderr.join('\n')}`;
    assert.doesNotMatch(
      observable,
      /endpoint_user|endpoint_password|adversarial\.host|198\.51\.100\.44|6543|postgres(?:ql)?:\/\//i,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('rehearse CLI reads its target from DATABASE_URL and emits only a structured sanitized report', async () => {
  const fixture = prepareRehearsalFixture();
  await finalizeRehearsalFixture(fixture);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  try {
    await withDatabaseUrl(process.env.TEST_DATABASE_URL!, () => main([
        'rehearse',
        '--source-snapshot', fixture.sourceSnapshotPath,
        '--manifest', fixture.sourceManifestPath,
        '--output', path.join(fixture.root, 'cli-reports'),
        '--run-id', `cli-${process.pid}-${Date.now()}`,
      ], {
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
        setExitCode: (code) => exitCodes.push(code),
      }));
    assert.deepEqual(exitCodes, [0]);
    assert.equal(stdout.length, 1);
    const report = JSON.parse(stdout[0]) as { stage: string; status: string };
    assert.deepEqual(report, { ...report, stage: 'rehearsal', status: 'passed' });
    const serialized = stdout.join('\n') + stderr.join('\n');
    assert.doesNotMatch(serialized, /postgres(?:ql)?:\/\//i);
    assert.doesNotMatch(serialized, /consensus_test:consensus_test/i);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('failed rehearse CLI output includes the preserved schema but never its environment target', async () => {
  const fixture = prepareRehearsalFixture();
  await finalizeRehearsalFixture(fixture);
  const stdout: string[] = [];
  const exitCodes: number[] = [];
  const unsafeTarget = 'postgresql://private_user:private_password@private.host:5432/consensus';
  try {
    await withDatabaseUrl(unsafeTarget, () => main([
        'rehearse',
        '--source-snapshot', fixture.sourceSnapshotPath,
        '--manifest', fixture.sourceManifestPath,
        '--output', path.join(fixture.root, 'failed-cli-reports'),
        '--run-id', `failed-cli-${process.pid}-${Date.now()}`,
        '--execute',
      ], {
        stdout: (line) => stdout.push(line),
        stderr: () => undefined,
        setExitCode: (code) => exitCodes.push(code),
      }));
    assert.deepEqual(exitCodes, [1]);
    const report = JSON.parse(stdout[0]) as { schema?: string; status: string; errors: Array<{ code: string }> };
    assert.equal(report.status, 'failed');
    assert.match(report.schema || '', /^consensus_rehearsal_[a-z0-9_]+$/);
    assert.ok(report.errors.some((error) => error.code === 'REHEARSAL_DATABASE_UNSAFE'));
    assert.doesNotMatch(stdout.join('\n'), /private_user|private_password|private\.host|5432|postgres(?:ql)?:\/\//i);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('compiled db-migrator dist runs rehearsal without loading server TypeScript', async () => {
  const fixture = prepareRehearsalFixture();
  await finalizeRehearsalFixture(fixture);
  const root = path.resolve(__dirname, '../..');
  let schema = '';
  const cleanup = createPostgresExecutor({
    connectionString: process.env.TEST_DATABASE_URL!, schema: 'public', poolMax: 1,
    connectionTimeoutMs: 5_000, statementTimeoutMs: 30_000, ssl: false,
  });
  try {
    const build = spawnSync(process.env.ComSpec || 'cmd.exe', [
      '/d', '/s', '/c', 'pnpm.cmd --filter @ai-presenter/db-migrator run build',
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    const cliPath = path.join(root, 'packages/db-migrator/dist/cli.js');
    assert.equal(fs.existsSync(cliPath), true);
    const run = spawnSync(process.execPath, [
      cliPath,
      'rehearse',
      '--source-snapshot', fixture.sourceSnapshotPath,
      '--manifest', fixture.sourceManifestPath,
      '--output', path.join(fixture.root, 'dist-reports'),
      '--run-id', `dist-${process.pid}-${Date.now()}`,
      '--execute',
    ], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL! },
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const report = JSON.parse(run.stdout.trim()) as { schema: string; stage: string; status: string };
    schema = report.schema;
    assert.equal(report.stage, 'rehearsal');
    assert.equal(report.status, 'passed');
    assert.doesNotMatch(run.stdout + run.stderr, /postgres(?:ql)?:\/\//i);
  } finally {
    if (schema) await cleanup.execute(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await cleanup.close();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
