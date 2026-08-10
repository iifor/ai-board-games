import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { buildManifest, hashFile } from '../../packages/db-migrator/src/backup/manifest';
import { main } from '../../packages/db-migrator/src/cli';
import {
  runValidation,
  type ValidateDependencies,
  type ValidateOptions,
} from '../../packages/db-migrator/src/commands/validate';
import { migrateSqliteToPostgres } from '../../packages/db-migrator/src/importer';
import { createPostgresExecutor } from '../../packages/server/db/postgres';
import { migratePostgres } from '../../packages/server/db/postgres/migrate';
import type { DbExecutor } from '../../packages/server/db/types';
import { withTestSchema } from './helpers';

interface ValidationFixture {
  database: DbExecutor;
  options: ValidateOptions;
  root: string;
}

const timestamp = '2026-08-08T00:00:00.000Z';

function createSourceFixture(candidate: string): void {
  const database = new Database(candidate);
  database.exec(`
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      must_change_password INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE players (
      id INTEGER PRIMARY KEY,
      nickname TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL,
      sex TEXT NOT NULL,
      personality TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      model_id INTEGER,
      fallback_model_id INTEGER,
      voice_package_id INTEGER,
      temperature REAL NOT NULL,
      enabled INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE games (
      id TEXT PRIMARY KEY,
      game_type TEXT NOT NULL,
      mode TEXT NOT NULL,
      skin_id TEXT,
      skin_name TEXT NOT NULL,
      winner TEXT,
      win_reason TEXT NOT NULL,
      topic_json TEXT NOT NULL,
      players_json TEXT NOT NULL,
      rounds_json TEXT NOT NULL,
      event_json TEXT NOT NULL,
      audio_resources_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE game_playback_events (
      game_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      protocol_version INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      view_mode TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      media_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (game_id, sequence)
    );
    CREATE TABLE player_game_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_type TEXT NOT NULL,
      owner_player_id INTEGER NOT NULL,
      subject_player_id INTEGER NOT NULL,
      games_played INTEGER NOT NULL,
      familiarity_score REAL NOT NULL,
      traits_json TEXT NOT NULL,
      recent_summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  database.prepare('INSERT INTO app_settings VALUES (?, ?, ?)').run(
    'validation-config',
    JSON.stringify({ apiKey: 'top-secret-config', enabled: true }),
    timestamp,
  );
  database.prepare('INSERT INTO admin_users VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    7,
    'validation-admin',
    'super-secret-password-hash',
    'Validation Admin',
    1,
    0,
    timestamp,
    timestamp,
  );
  const insertPlayer = database.prepare('INSERT INTO players VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertPlayer.run(101, 'Alpha', 'Alpha Name', '/alpha.png', '未知', 'private-alpha-personality', 'test', 'model-a', null, null, null, 0.5, 1, 1, timestamp, timestamp);
  insertPlayer.run(102, 'Beta', 'Beta Name', '/beta.png', '未知', 'private-beta-personality', 'test', 'model-b', null, null, null, 0.6, 1, 2, timestamp, timestamp);
  database.prepare('INSERT INTO games VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'validation-game',
    'werewolf',
    'standard',
    null,
    '',
    'villagers',
    'private-win-reason',
    JSON.stringify({ title: 'private-topic' }),
    JSON.stringify([{ id: 101 }, { id: 102 }]),
    JSON.stringify([{ day: 1 }]),
    JSON.stringify([{ type: 'private-event' }]),
    JSON.stringify([]),
    timestamp,
  );
  database.prepare('INSERT INTO game_playback_events VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'validation-game',
    1,
    1,
    'speech',
    'public',
    JSON.stringify({ text: 'private-playback-payload' }),
    JSON.stringify([]),
    timestamp,
  );
  database.prepare('INSERT INTO player_game_memories VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    11,
    'werewolf',
    101,
    102,
    3,
    0.75,
    JSON.stringify({ trust: 'private-memory-trait' }),
    'private-memory-summary',
    timestamp,
    timestamp,
  );
  database.close();
}

async function prepareFixture(
  database: DbExecutor,
  schema: string,
  runId = `validation-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
): Promise<{ root: string; options: ValidateOptions }> {
  await migratePostgres(database);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-validation-'));
  const backupRoot = path.join(root, 'backup');
  const rawRoot = path.join(backupRoot, 'sqlite-raw');
  const sourceSnapshotPath = path.join(backupRoot, 'sqlite-consistent.sqlite');
  fs.mkdirSync(rawRoot, { recursive: true });
  createSourceFixture(sourceSnapshotPath);
  fs.copyFileSync(sourceSnapshotPath, path.join(rawRoot, 'source.sqlite'));
  const manifest = await buildManifest(backupRoot, `backup-${runId}`);
  const sourceManifestPath = path.join(backupRoot, 'manifest.json');
  fs.writeFileSync(sourceManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const migrationReport = await migrateSqliteToPostgres({
    sourcePath: sourceSnapshotPath,
    targetUrl: process.env.TEST_DATABASE_URL!,
    targetSchema: schema,
  });
  const migrationReportPath = path.join(root, 'migration-report.json');
  fs.writeFileSync(migrationReportPath, `${JSON.stringify(migrationReport, null, 2)}\n`, 'utf8');
  return {
    root,
    options: {
      runId,
      sourceSnapshotPath,
      sourceManifestPath,
      migrationReportPath,
      targetUrl: process.env.TEST_DATABASE_URL!,
      targetSchema: schema,
      outputDirectory: path.join(root, 'reports'),
    },
  };
}

async function withValidationFixture(operation: (fixture: ValidationFixture) => Promise<void>): Promise<void> {
  await withTestSchema(async (database, schema) => {
    const fixture = await prepareFixture(database, schema);
    try {
      await operation({ database, ...fixture });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}

function errorCodes(report: Awaited<ReturnType<typeof runValidation>>): string[] {
  return report.errors.map((error) => error.code);
}

function readonlyExecutor(schema: string, close?: () => Promise<void>): DbExecutor {
  const real = createPostgresExecutor({
    connectionString: process.env.TEST_DATABASE_URL!,
    schema,
    poolMax: 1,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 30_000,
    ssl: false,
  });
  const assertRead = (sql: string): void => assert.match(sql, /^\s*(?:SELECT|SHOW)\b/i);
  return {
    queryOne: async <T extends object>(sql: string, params?: readonly unknown[]): Promise<T | null> => {
      assertRead(sql);
      return real.queryOne<T>(sql, params);
    },
    queryMany: async <T extends object>(sql: string, params?: readonly unknown[]): Promise<T[]> => {
      assertRead(sql);
      return real.queryMany<T>(sql, params);
    },
    execute: async () => { throw new Error('validation must not execute writes'); },
    withTransaction: async () => { throw new Error('validation must not open write transactions'); },
    healthCheck: () => real.healthCheck(),
    close: async () => {
      await real.close();
      if (close) await close();
    },
  };
}

test('validation passes source/import/target checks using only reads and emits hashed report evidence', async () => {
  await withValidationFixture(async ({ options }) => {
    const report = await runValidation(options, {
      createPostgres: (_url, schema) => readonlyExecutor(schema),
    });
    assert.equal(report.status, 'passed');
    assert.deepEqual(errorCodes(report), []);
    const skipped = report.checks.filter((check) => check.status === 'skipped');
    assert.ok(skipped.length > 0);
    assert.ok(skipped.every((check) => check.message === 'intentionally not migrated'));
    for (const table of ['admin_users', 'app_settings', 'players', 'games', 'game_playback_events', 'player_game_memories']) {
      const sample = report.checks.find((check) => check.id === `sample.${table}`);
      assert.equal(sample?.status, 'passed');
      assert.match(sample?.actual || '', /^sha256:[a-f0-9]{64}$/);
    }
    const artifact = report.artifacts.find((candidate) => candidate.type === 'validation-report');
    assert.ok(artifact?.path);
    assert.match(artifact?.sha256 || '', /^[a-f0-9]{64}$/);
    assert.equal(await hashFile(artifact!.path), artifact?.sha256);
    const serialized = JSON.stringify(report) + fs.readFileSync(artifact!.path, 'utf8');
    for (const secret of [
      'super-secret-password-hash',
      'top-secret-config',
      'private-alpha-personality',
      'private-topic',
      'private-playback-payload',
      'private-memory-summary',
    ]) assert.doesNotMatch(serialized, new RegExp(secret));
  });
});

test('validation reports ROW_COUNT_MISMATCH when target and importer counts diverge from the source', async () => {
  await withValidationFixture(async ({ database, options }) => {
    await database.execute('DELETE FROM game_playback_events');
    const report = await runValidation(options);
    assert.equal(report.status, 'failed');
    assert.ok(errorCodes(report).includes('ROW_COUNT_MISMATCH'));
    const count = report.checks.find((check) => check.id === 'row-count.game_playback_events');
    assert.equal(count?.status, 'failed');
    assert.equal(count?.expected, 'source=1; importer.source=1; importer.imported=1; importer.target=1');
    assert.equal(count?.actual, 'target=0');
  });
});

test('validation reports ROW_COUNT_MISMATCH when the migration report count is inconsistent', async () => {
  await withValidationFixture(async ({ options }) => {
    const migrationReport = JSON.parse(fs.readFileSync(options.migrationReportPath, 'utf8')) as {
      tables: Record<string, { sourceRows: number; importedRows: number; targetRows: number }>;
    };
    migrationReport.tables.admin_users.importedRows = 0;
    fs.writeFileSync(options.migrationReportPath, `${JSON.stringify(migrationReport, null, 2)}\n`, 'utf8');
    const report = await runValidation(options);
    assert.equal(report.status, 'failed');
    assert.ok(errorCodes(report).includes('ROW_COUNT_MISMATCH'));
    assert.equal(report.checks.find((check) => check.id === 'row-count.admin_users')?.status, 'failed');
  });
});

test('validation rejects a successful migration report from another target schema', async () => {
  await withValidationFixture(async ({ options }) => {
    const migrationReport = JSON.parse(fs.readFileSync(options.migrationReportPath, 'utf8')) as { targetSchema: string };
    migrationReport.targetSchema = 'another_schema';
    fs.writeFileSync(options.migrationReportPath, `${JSON.stringify(migrationReport, null, 2)}\n`, 'utf8');
    const report = await runValidation(options);
    assert.equal(report.status, 'failed');
    assert.ok(errorCodes(report).includes('MIGRATION_REPORT_INVALID'));
  });
});

test('validation reports ORPHAN_FOREIGN_KEY after a target constraint is removed and an orphan is inserted', async () => {
  await withValidationFixture(async ({ database, options }) => {
    await database.execute('ALTER TABLE game_players DROP CONSTRAINT game_players_player_id_fkey');
    await database.execute("INSERT INTO game_players (game_id, player_id, player_snapshot_json) VALUES ('validation-game', 999, '{}'::jsonb)");
    const report = await runValidation(options);
    assert.equal(report.status, 'failed');
    assert.ok(errorCodes(report).includes('ORPHAN_FOREIGN_KEY'));
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /999/);
  });
});

test('validation reports JSON_SEMANTICS_INVALID for a non-object object field', async () => {
  await withValidationFixture(async ({ database, options }) => {
    await database.execute("UPDATE games SET topic_json = '[]'::jsonb WHERE id = 'validation-game'");
    const report = await runValidation(options);
    assert.equal(report.status, 'failed');
    assert.ok(errorCodes(report).includes('JSON_SEMANTICS_INVALID'));
    assert.equal(report.checks.find((check) => check.id === 'json.games.topic_json')?.status, 'failed');
  });
});

test('validation reports TIMESTAMP_SEMANTICS_INVALID for a non-finite target timestamp', async () => {
  await withValidationFixture(async ({ database, options }) => {
    await database.execute("UPDATE games SET created_at = 'infinity'::timestamptz WHERE id = 'validation-game'");
    const report = await runValidation(options);
    assert.equal(report.status, 'failed');
    assert.ok(errorCodes(report).includes('TIMESTAMP_SEMANTICS_INVALID'));
    assert.equal(report.checks.find((check) => check.id === 'timestamp.games.created_at')?.status, 'failed');
    assert.ok(report.checks.some((check) => check.id === 'skipped.workflow_events' && check.status === 'skipped'));
  });
});

test('validation reports IDENTITY_SEQUENCE_INVALID when the next identity is not greater than MAX(id)', async () => {
  await withValidationFixture(async ({ database, options }) => {
    await database.queryOne("SELECT setval(pg_get_serial_sequence('admin_users', 'id'), 7, false)");
    const report = await runValidation(options);
    assert.equal(report.status, 'failed');
    assert.ok(errorCodes(report).includes('IDENTITY_SEQUENCE_INVALID'));
    assert.equal(report.checks.find((check) => check.id === 'identity.admin_users')?.status, 'failed');
  });
});

test('validation reports BUSINESS_SAMPLE_MISMATCH using hashes instead of source values', async () => {
  await withValidationFixture(async ({ database, options }) => {
    await database.execute("UPDATE admin_users SET display_name = 'leaked-target-value' WHERE id = 7");
    const report = await runValidation(options);
    assert.equal(report.status, 'failed');
    assert.ok(errorCodes(report).includes('BUSINESS_SAMPLE_MISMATCH'));
    const check = report.checks.find((candidate) => candidate.id === 'sample.admin_users');
    assert.equal(check?.status, 'failed');
    assert.match(check?.expected || '', /^sha256:[a-f0-9]{64}$/);
    assert.match(check?.actual || '', /^sha256:[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(report), /leaked-target-value|Validation Admin/);
  });
});

test('validation never includes malformed source row values in query failure messages', async () => {
  await withValidationFixture(async ({ options }) => {
    const source = new Database(options.sourceSnapshotPath);
    source.prepare('UPDATE games SET topic_json = ? WHERE id = ?').run('private-malformed-source-json', 'validation-game');
    source.close();
    const backupRoot = path.dirname(options.sourceManifestPath);
    fs.copyFileSync(options.sourceSnapshotPath, path.join(backupRoot, 'sqlite-raw', 'source.sqlite'));
    const manifest = await buildManifest(backupRoot, 'rebuilt-validation-manifest');
    fs.writeFileSync(options.sourceManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const report = await runValidation(options);
    assert.equal(report.status, 'failed');
    assert.ok(errorCodes(report).includes('VALIDATION_QUERY_FAILED'));
    assert.doesNotMatch(JSON.stringify(report), /private-malformed-source-json/);
  });
});

test('validation reports SOURCE_HASH_MISMATCH before opening SQLite or PostgreSQL', async () => {
  await withValidationFixture(async ({ options }) => {
    fs.appendFileSync(options.sourceSnapshotPath, Buffer.from([0]));
    let sqliteOpened = false;
    let postgresOpened = false;
    const report = await runValidation(options, {
      createSqlite: () => {
        sqliteOpened = true;
        throw new Error('must not open SQLite');
      },
      createPostgres: () => {
        postgresOpened = true;
        throw new Error('must not open PostgreSQL');
      },
    });
    assert.equal(report.status, 'failed');
    assert.deepEqual(errorCodes(report), ['SOURCE_HASH_MISMATCH']);
    assert.equal(sqliteOpened, false);
    assert.equal(postgresOpened, false);
    assert.ok(report.checks.some((check) => check.id === 'skipped.game_traces' && check.status === 'skipped'));
  });
});

test('validation records both close failures after otherwise-passed checks', async () => {
  await withValidationFixture(async ({ options }) => {
    const sqlite = new Database(options.sourceSnapshotPath, { readonly: true, fileMustExist: true });
    const realClose = sqlite.close.bind(sqlite);
    sqlite.close = (() => { throw new Error('SQLITE_CLOSE_FAILURE'); }) as typeof sqlite.close;
    const dependencies: Partial<ValidateDependencies> = {
      createSqlite: () => sqlite,
      createPostgres: (_url, schema) => readonlyExecutor(schema, async () => {
        throw new Error('POSTGRES_CLOSE_FAILURE');
      }),
    };
    try {
      const report = await runValidation(options, dependencies);
      assert.equal(report.status, 'failed');
      assert.deepEqual(errorCodes(report), ['SQLITE_CLOSE_FAILED', 'POSTGRES_CLOSE_FAILED']);
    } finally {
      realClose();
    }
  });
});

test('validation redacts a PostgreSQL URL as one placeholder without retaining endpoint components', async () => {
  await withValidationFixture(async ({ options }) => {
    const url = 'postgresql://route_user:route_password@route.host:5432/route_database?sslmode=require';
    const report = await runValidation({ ...options, targetUrl: url }, {
      createPostgres: () => { throw new Error(`DATABASE_URL=${url}`); },
    });
    const serialized = JSON.stringify(report);
    assert.match(serialized, /\[REDACTED_DATABASE_URL\]/);
    for (const component of ['route_user', 'route_password', 'route.host', '5432', 'route_database', 'sslmode']) {
      assert.doesNotMatch(serialized, new RegExp(component));
    }
  });
});

test('validate CLI routes all required paths and exits from the readiness report status', async () => {
  await withValidationFixture(async ({ options }) => {
    const stdout: string[] = [];
    const exitCodes: number[] = [];
    const cliRunId = `${options.runId}-cli`;
    await main([
      'validate',
      '--source-snapshot', options.sourceSnapshotPath,
      '--manifest', options.sourceManifestPath,
      '--migration-report', options.migrationReportPath,
      '--target', options.targetUrl,
      '--schema', options.targetSchema,
      '--output', options.outputDirectory,
      '--run-id', cliRunId,
    ], {
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
      setExitCode: (code) => exitCodes.push(code),
    });
    assert.deepEqual(exitCodes, [0]);
    assert.equal(stdout.length, 1);
    const report = JSON.parse(stdout[0]) as { runId: string; stage: string; status: string };
    assert.equal(report.runId, cliRunId);
    assert.equal(report.stage, 'validation');
    assert.equal(report.status, 'passed');
  });
});
