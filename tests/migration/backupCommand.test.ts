import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runBackup } from '../../packages/db-migrator/src/commands/backup';
import { verifyManifest, type BackupManifest } from '../../packages/db-migrator/src/backup/manifest';
import { main } from '../../packages/db-migrator/src/cli';

interface WalFixture {
  root: string;
  sourcePath: string;
  resources: string;
  output: string;
  database: Database.Database;
}

function createWalFixture(): WalFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'db-backup-'));
  const sourcePath = path.join(root, 'live.sqlite');
  const resources = path.join(root, 'resources');
  const output = path.join(root, 'backups');
  fs.mkdirSync(path.join(resources, 'nested'), { recursive: true });
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(resources, 'nested', 'asset.txt'), 'resource-content');
  const database = new Database(sourcePath);
  assert.equal(database.pragma('journal_mode = WAL', { simple: true }), 'wal');
  database.pragma('wal_autocheckpoint = 0');
  database.exec('CREATE TABLE events (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
  database.prepare('INSERT INTO events (body) VALUES (?)').run('committed-in-wal');
  assert.equal(fs.existsSync(`${sourcePath}-wal`), true);
  assert.equal(fs.existsSync(`${sourcePath}-shm`), true);
  return { root, sourcePath, resources, output, database };
}

function cleanupFixture(fixture: WalFixture): void {
  fixture.database.close();
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

function sha256(candidate: string): string {
  return createHash('sha256').update(fs.readFileSync(candidate)).digest('hex');
}

function relativeFiles(root: string): string[] {
  const found: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else found.push(path.relative(root, candidate).split(path.sep).join('/'));
    }
  };
  visit(root);
  return found.sort();
}

test('backup dry-run reports skipped mutations without creating files or changing the WAL source', async () => {
  const fixture = createWalFixture();
  const dryRunOutput = path.join(fixture.root, 'does-not-exist');
  const sourceMtime = fs.statSync(fixture.sourcePath, { bigint: true }).mtimeNs;
  const walHash = sha256(`${fixture.sourcePath}-wal`);
  try {
    const report = await runBackup({
      runId: 'dry-run-001',
      sourcePath: fixture.sourcePath,
      outputDirectory: dryRunOutput,
      resourceDirectories: [fixture.resources],
      execute: false,
    });

    assert.equal(report.status, 'passed');
    assert.equal(report.stage, 'backup');
    assert.equal(report.artifacts.length, 0);
    assert.equal(report.checks.some((check) => check.status === 'skipped' && check.message === 'dry-run; no files created'), true);
    assert.equal(fs.existsSync(dryRunOutput), false);
    assert.equal(fs.statSync(fixture.sourcePath, { bigint: true }).mtimeNs, sourceMtime);
    assert.equal(sha256(`${fixture.sourcePath}-wal`), walHash);
    assert.equal(fixture.database.pragma('journal_mode', { simple: true }), 'wal');
  } finally {
    cleanupFixture(fixture);
  }
});

test('execute creates a consistent SQLite snapshot, raw WAL archive, resources, report, and verified manifest', async () => {
  const fixture = createWalFixture();
  const runId = 'backup-20260810-001';
  const checkpointBefore = fixture.database.pragma('wal_checkpoint(PASSIVE)');
  const sourceMtime = fs.statSync(fixture.sourcePath, { bigint: true }).mtimeNs;
  const walHash = sha256(`${fixture.sourcePath}-wal`);
  const rawSourceHash = sha256(fixture.sourcePath);
  try {
    const report = await runBackup({
      runId,
      sourcePath: fixture.sourcePath,
      outputDirectory: fixture.output,
      resourceDirectories: [fixture.resources],
      execute: true,
    });

    const runRoot = path.join(fixture.output, runId);
    const consistentPath = path.join(runRoot, 'sqlite-consistent.sqlite');
    const manifestPath = path.join(runRoot, 'manifest.json');
    assert.equal(report.status, 'passed');
    assert.equal(fs.existsSync(path.join(fixture.output, `${runId}-backup.json`)), true);
    assert.equal(fs.existsSync(path.join(fixture.output, `${runId}-backup.md`)), true);
    assert.equal(fs.existsSync(path.join(fixture.output, `.${runId}.staging`)), false);
    assert.equal(fs.existsSync(path.join(fixture.output, `${runId}.failed`)), false);
    assert.equal(fs.existsSync(consistentPath), true);
    assert.equal(fs.readFileSync(path.join(runRoot, 'resources', 'resource-000', 'nested', 'asset.txt'), 'utf8'), 'resource-content');
    assert.equal(sha256(path.join(runRoot, 'sqlite-raw', 'source.sqlite')), rawSourceHash);
    assert.equal(sha256(path.join(runRoot, 'sqlite-raw', 'source.sqlite-wal')), walHash);
    assert.equal(fs.existsSync(path.join(runRoot, 'sqlite-raw', 'source.sqlite-shm')), true);

    const consistent = new Database(consistentPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(consistent.prepare('PRAGMA integrity_check').pluck().get(), 'ok');
      assert.deepEqual(consistent.prepare('SELECT body FROM events ORDER BY id').pluck().all(), ['committed-in-wal']);
    } finally {
      consistent.close();
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest;
    assert.equal(manifest.version, 1);
    assert.equal(manifest.runId, runId);
    assert.equal(manifest.sourceDatabaseSha256, rawSourceHash);
    assert.equal(manifest.consistentDatabaseSha256, sha256(consistentPath));
    assert.equal(manifest.entries.some((entry) => entry.path === 'manifest.json'), false);
    assert.deepEqual(manifest.entries.map((entry) => entry.path), [...manifest.entries.map((entry) => entry.path)].sort());
    assert.equal(manifest.entries.every((entry) => entry.sizeBytes >= 0 && /^[a-f0-9]{64}$/.test(entry.sha256)), true);
    assert.deepEqual(
      manifest.entries.map((entry) => entry.path),
      relativeFiles(runRoot).filter((entry) => entry !== 'manifest.json'),
    );
    await verifyManifest(runRoot, manifest);
    for (const entry of manifest.entries) {
      assert.equal(sha256(path.join(runRoot, ...entry.path.split('/'))), entry.sha256);
    }

    assert.equal(fs.statSync(fixture.sourcePath, { bigint: true }).mtimeNs, sourceMtime);
    assert.equal(sha256(`${fixture.sourcePath}-wal`), walHash);
    assert.equal(fixture.database.pragma('journal_mode', { simple: true }), 'wal');
    assert.deepEqual(fixture.database.pragma('wal_checkpoint(PASSIVE)'), checkpointBefore);
  } finally {
    cleanupFixture(fixture);
  }
});

test('manifest verification rejects a changed artifact', async () => {
  const fixture = createWalFixture();
  const runId = 'backup-tamper-001';
  try {
    const report = await runBackup({
      runId,
      sourcePath: fixture.sourcePath,
      outputDirectory: fixture.output,
      resourceDirectories: [fixture.resources],
      execute: true,
    });
    assert.equal(report.status, 'passed');
    const runRoot = path.join(fixture.output, runId);
    const manifest = JSON.parse(fs.readFileSync(path.join(runRoot, 'manifest.json'), 'utf8')) as BackupManifest;
    fs.appendFileSync(path.join(runRoot, 'resources', 'resource-000', 'nested', 'asset.txt'), '-tampered');
    await assert.rejects(() => verifyManifest(runRoot, manifest), /Manifest (size|hash) mismatch/);
  } finally {
    cleanupFixture(fixture);
  }
});

test('missing SQLite sidecars are skipped and never fabricated', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'db-backup-no-sidecar-'));
  const sourcePath = path.join(root, 'source.sqlite');
  const output = path.join(root, 'backups');
  fs.mkdirSync(output);
  const database = new Database(sourcePath);
  database.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY)');
  database.close();
  try {
    const report = await runBackup({ runId: 'no-sidecars', sourcePath, outputDirectory: output, resourceDirectories: [], execute: true });
    const rawRoot = path.join(output, 'no-sidecars', 'sqlite-raw');
    assert.equal(report.status, 'passed');
    assert.equal(report.checks.find((check) => check.id === 'source.raw-wal')?.status, 'skipped');
    assert.equal(report.checks.find((check) => check.id === 'source.raw-shm')?.status, 'skipped');
    assert.equal(fs.existsSync(path.join(rawRoot, 'source.sqlite-wal')), false);
    assert.equal(fs.existsSync(path.join(rawRoot, 'source.sqlite-shm')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an existing run is never overwritten', async () => {
  const fixture = createWalFixture();
  const runId = 'existing-run';
  const runRoot = path.join(fixture.output, runId);
  fs.mkdirSync(runRoot);
  fs.writeFileSync(path.join(runRoot, 'owner.txt'), 'existing-owner');
  try {
    const report = await runBackup({
      runId,
      sourcePath: fixture.sourcePath,
      outputDirectory: fixture.output,
      resourceDirectories: [fixture.resources],
      execute: true,
    });
    assert.equal(report.status, 'failed');
    assert.equal(report.errors[0]?.code, 'BACKUP_RUN_ALREADY_EXISTS');
    assert.equal(fs.readFileSync(path.join(runRoot, 'owner.txt'), 'utf8'), 'existing-owner');
    assert.equal(fs.existsSync(path.join(fixture.output, `${runId}.failed`)), false);
  } finally {
    cleanupFixture(fixture);
  }
});

test('a resource junction escape is rejected without following or copying it', async (context) => {
  const fixture = createWalFixture();
  const outside = path.join(fixture.root, 'outside');
  const secret = path.join(outside, 'outside.txt');
  fs.mkdirSync(outside);
  fs.writeFileSync(secret, 'must-not-copy');
  const junction = path.join(fixture.resources, 'escape');
  try {
    fs.symlinkSync(outside, junction, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    cleanupFixture(fixture);
    context.skip(`junction creation unavailable: ${(error as Error).message}`);
    return;
  }
  try {
    const report = await runBackup({
      runId: 'junction-escape',
      sourcePath: fixture.sourcePath,
      outputDirectory: fixture.output,
      resourceDirectories: [fixture.resources],
      execute: true,
    });
    assert.equal(report.status, 'failed');
    assert.equal(report.errors[0]?.code, 'RESOURCE_REPARSE_POINT');
    assert.equal(fs.existsSync(path.join(fixture.output, 'junction-escape')), false);
    assert.equal(fs.readFileSync(secret, 'utf8'), 'must-not-copy');
  } finally {
    cleanupFixture(fixture);
  }
});

test('a copy failure preserves a sanitized .failed site without publishing a manifest', async () => {
  const fixture = createWalFixture();
  const runId = 'copy-failure';
  const originalCopyFile = fs.promises.copyFile;
  fs.promises.copyFile = async (source, destination, mode) => {
    if (String(source).endsWith('asset.txt')) throw new Error('copy failed postgresql://user:secret@host/database');
    return originalCopyFile(source, destination, mode);
  };
  try {
    const report = await runBackup({
      runId,
      sourcePath: fixture.sourcePath,
      outputDirectory: fixture.output,
      resourceDirectories: [fixture.resources],
      execute: true,
    });
    const failedRoot = path.join(fixture.output, `${runId}.failed`);
    assert.equal(report.status, 'failed');
    assert.match(report.errors[0]?.message || '', /\[REDACTED_DATABASE_URL\]/);
    assert.doesNotMatch(JSON.stringify(report), /user|secret|host|database/);
    assert.equal(fs.existsSync(path.join(fixture.output, runId)), false);
    assert.equal(fs.existsSync(failedRoot), true);
    assert.equal(fs.existsSync(path.join(failedRoot, 'manifest.json')), false);
    const failedReport = fs.readFileSync(path.join(failedRoot, `${runId}-backup.json`), 'utf8');
    assert.match(failedReport, /\[REDACTED_DATABASE_URL\]/);
    assert.doesNotMatch(failedReport, /user|secret|host|database/);
  } finally {
    fs.promises.copyFile = originalCopyFile;
    cleanupFixture(fixture);
  }
});

test('a silently corrupted copy fails verification and cannot publish a manifest', async () => {
  const fixture = createWalFixture();
  const runId = 'copy-corruption';
  const originalCopyFile = fs.promises.copyFile;
  fs.promises.copyFile = async (source, destination, mode) => {
    if (String(source).endsWith('asset.txt')) {
      await fs.promises.writeFile(destination, 'corrupt-copy');
      return;
    }
    return originalCopyFile(source, destination, mode);
  };
  try {
    const report = await runBackup({
      runId,
      sourcePath: fixture.sourcePath,
      outputDirectory: fixture.output,
      resourceDirectories: [fixture.resources],
      execute: true,
    });
    assert.equal(report.status, 'failed');
    assert.equal(report.errors[0]?.code, 'COPIED_FILE_MISMATCH');
    assert.equal(fs.existsSync(path.join(fixture.output, runId)), false);
    assert.equal(fs.existsSync(path.join(fixture.output, `${runId}.failed`, 'manifest.json')), false);
  } finally {
    fs.promises.copyFile = originalCopyFile;
    cleanupFixture(fixture);
  }
});

test('CLI backup dispatch requires explicit execute and dry-run creates nothing', async () => {
  const fixture = createWalFixture();
  const output = path.join(fixture.root, 'cli-dry-run');
  const stdout: string[] = [];
  const exitCodes: number[] = [];
  try {
    await main([
      'backup', '--source', fixture.sourcePath, '--output', output,
      '--resources', fixture.resources, '--run-id', 'cli-dry-run',
    ], {
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
      setExitCode: (code) => exitCodes.push(code),
    });
    assert.equal(JSON.parse(stdout[0]).checks.some((check: { message: string }) => check.message === 'dry-run; no files created'), true);
    assert.deepEqual(exitCodes, [0]);
    assert.equal(fs.existsSync(output), false);
  } finally {
    cleanupFixture(fixture);
  }
});
