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
  const initialize = new Database(sourcePath);
  initialize.exec('CREATE TABLE events (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
  initialize.close();
  const database = new Database(sourcePath);
  assert.equal(database.pragma('journal_mode = WAL', { simple: true }), 'wal');
  database.pragma('wal_autocheckpoint = 0');
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

interface SourceMetadata {
  name: string;
  size: number;
  mtimeNs: string;
  sha256: string;
}

function sourceMetadata(sourcePath: string): SourceMetadata[] {
  return ['', '-wal', '-shm'].flatMap((suffix) => {
    const candidate = `${sourcePath}${suffix}`;
    if (!fs.existsSync(candidate)) return [];
    const stats = fs.statSync(candidate, { bigint: true });
    return [{ name: path.basename(candidate), size: Number(stats.size), mtimeNs: stats.mtimeNs.toString(), sha256: sha256(candidate) }];
  });
}

function failedSites(output: string, runId: string): string[] {
  if (!fs.existsSync(output)) return [];
  return fs.readdirSync(output, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${runId}.failed-`))
    .map((entry) => path.join(output, entry.name));
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
  const before = sourceMetadata(fixture.sourcePath);
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
    assert.deepEqual(sourceMetadata(fixture.sourcePath), before);
  } finally {
    cleanupFixture(fixture);
  }
});

test('a failed dry-run still creates no output or failure evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'db-backup-invalid-dry-run-'));
  const output = path.join(root, 'must-not-exist');
  try {
    const report = await runBackup({
      runId: 'invalid-dry-run', sourcePath: path.join(root, 'missing.sqlite'),
      outputDirectory: output, resourceDirectories: [], execute: false,
    });
    assert.equal(report.status, 'failed');
    assert.equal(fs.existsSync(output), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('execute validation failure confines evidence for an unsafe run id to a unique failed site', async () => {
  const fixture = createWalFixture();
  try {
    const report = await runBackup({
      runId: '../escape', sourcePath: fixture.sourcePath, outputDirectory: fixture.output,
      resourceDirectories: [], execute: true,
    });
    assert.equal(report.status, 'failed');
    const entries = fs.readdirSync(fixture.output, { withFileTypes: true });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].isDirectory(), true);
    assert.match(entries[0].name, /^invalid-run\.failed-/);
    const failureSite = path.join(fixture.output, entries[0].name);
    assert.equal(fs.existsSync(path.join(failureSite, 'invalid-run-backup.json')), true);
    assert.equal(fs.existsSync(path.join(fixture.output, 'escape-backup.json')), false);
  } finally {
    cleanupFixture(fixture);
  }
});

test('execute creates a consistent SQLite snapshot, raw WAL archive, resources, report, and verified manifest', async () => {
  const fixture = createWalFixture();
  const runId = 'backup-20260810-001';
  const before = sourceMetadata(fixture.sourcePath);
  const walHash = sha256(`${fixture.sourcePath}-wal`);
  const rawSourceHash = sha256(fixture.sourcePath);
  try {
    const mainOnlyPath = path.join(fixture.root, 'main-only.sqlite');
    fs.copyFileSync(fixture.sourcePath, mainOnlyPath);
    const mainOnly = new Database(mainOnlyPath, { readonly: true, fileMustExist: true });
    try { assert.deepEqual(mainOnly.prepare('SELECT body FROM events ORDER BY id').pluck().all(), []); }
    finally { mainOnly.close(); }
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

    assert.deepEqual(sourceMetadata(fixture.sourcePath), before);
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
    const failures = failedSites(fixture.output, runId);
    assert.equal(failures.length, 1);
    assert.equal(fs.existsSync(path.join(failures[0], `${runId}-backup.json`)), true);
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
    assert.equal(failedSites(fixture.output, 'junction-escape').length, 1);
  } finally {
    cleanupFixture(fixture);
  }
});

test('a copy failure preserves a sanitized .failed site without publishing a manifest', async () => {
  const fixture = createWalFixture();
  const runId = 'copy-failure';
  const originalOpen = fs.promises.open;
  fs.promises.open = async (candidate, flags, mode) => {
    if (path.resolve(String(candidate)).startsWith(`${path.resolve(fixture.output)}${path.sep}`)
      && String(candidate).endsWith('asset.txt') && typeof flags === 'number') {
      throw new Error('copy failed postgresql://user:secret@host/database');
    }
    return originalOpen(candidate, flags as never, mode);
  };
  try {
    const report = await runBackup({
      runId,
      sourcePath: fixture.sourcePath,
      outputDirectory: fixture.output,
      resourceDirectories: [fixture.resources],
      execute: true,
    });
    const failures = failedSites(fixture.output, runId);
    assert.equal(report.status, 'failed');
    assert.match(report.errors[0]?.message || '', /\[REDACTED_DATABASE_URL\]/);
    assert.doesNotMatch(JSON.stringify(report), /user|secret|host|database/);
    assert.equal(fs.existsSync(path.join(fixture.output, runId)), false);
    assert.equal(failures.length, 1);
    const failedRoot = failures[0];
    assert.equal(fs.existsSync(path.join(failedRoot, 'manifest.json')), false);
    const failedReport = fs.readFileSync(path.join(failedRoot, `${runId}-backup.json`), 'utf8');
    assert.match(failedReport, /\[REDACTED_DATABASE_URL\]/);
    assert.doesNotMatch(failedReport, /user|secret|host|database/);
  } finally {
    fs.promises.open = originalOpen;
    cleanupFixture(fixture);
  }
});

test('a silently corrupted copy fails verification and cannot publish a manifest', async () => {
  const fixture = createWalFixture();
  const runId = 'copy-corruption';
  const originalOpen = fs.promises.open;
  fs.promises.open = async (candidate, flags, mode) => {
    const handle = await originalOpen(candidate, flags as never, mode);
    if (path.resolve(String(candidate)).startsWith(`${path.resolve(fixture.output)}${path.sep}`)
      && String(candidate).endsWith('asset.txt') && typeof flags === 'number') {
      const originalWrite = handle.write.bind(handle);
      handle.write = async (buffer, offset, length, position) => {
        const corrupt = Buffer.alloc(length, 0x58);
        return originalWrite(corrupt, 0, length, position);
      };
    }
    return handle;
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
    assert.equal(report.errors[0]?.code, 'RESOURCE_PATH_CHANGED');
    assert.equal(fs.existsSync(path.join(fixture.output, runId)), false);
    const failures = failedSites(fixture.output, runId);
    assert.equal(failures.length, 1);
    assert.equal(fs.existsSync(path.join(failures[0], 'manifest.json')), false);
  } finally {
    fs.promises.open = originalOpen;
    cleanupFixture(fixture);
  }
});

test('a WAL source without SHM is recovered only in staging and gains no source sidecar', async () => {
  const fixture = createWalFixture();
  const isolatedRoot = path.join(fixture.root, 'wal-without-shm');
  const isolatedSource = path.join(isolatedRoot, 'source.sqlite');
  fs.mkdirSync(isolatedRoot);
  fs.copyFileSync(fixture.sourcePath, isolatedSource);
  fs.copyFileSync(`${fixture.sourcePath}-wal`, `${isolatedSource}-wal`);
  const before = sourceMetadata(isolatedSource);
  try {
    const report = await runBackup({
      runId: 'wal-without-shm', sourcePath: isolatedSource, outputDirectory: fixture.output,
      resourceDirectories: [], execute: true,
    });
    assert.equal(report.status, 'passed');
    assert.deepEqual(sourceMetadata(isolatedSource), before);
    assert.equal(fs.existsSync(`${isolatedSource}-shm`), false);
    const consistent = new Database(path.join(fixture.output, 'wal-without-shm', 'sqlite-consistent.sqlite'), { readonly: true });
    try { assert.deepEqual(consistent.prepare('SELECT body FROM events ORDER BY id').pluck().all(), ['committed-in-wal']); }
    finally { consistent.close(); }
  } finally {
    cleanupFixture(fixture);
  }
});

test('a source change during raw copy fails once without retry or a valid manifest', async () => {
  const fixture = createWalFixture();
  const runId = 'source-change';
  const originalCopyFile = fs.promises.copyFile;
  const originalOpen = fs.promises.open;
  let sourceOpens = 0;
  let mutated = false;
  const mutate = (): void => {
    if (mutated) return;
    mutated = true;
    fixture.database.prepare('INSERT INTO events (body) VALUES (?)').run('concurrent-change');
  };
  fs.promises.copyFile = async (source, destination, mode) => {
    const copied = await originalCopyFile(source, destination, mode);
    if (path.resolve(String(source)) === path.resolve(fixture.sourcePath)) mutate();
    return copied;
  };
  fs.promises.open = async (candidate, flags, mode) => {
    const handle = await originalOpen(candidate, flags as never, mode);
    if (path.resolve(String(candidate)) === path.resolve(fixture.sourcePath) && ++sourceOpens === 2) mutate();
    return handle;
  };
  try {
    const report = await runBackup({
      runId, sourcePath: fixture.sourcePath, outputDirectory: fixture.output,
      resourceDirectories: [], execute: true,
    });
    assert.equal(mutated, true);
    assert.equal(report.status, 'failed');
    assert.equal(report.errors[0]?.code, 'SOURCE_CHANGED_DURING_BACKUP');
    assert.equal(fs.existsSync(path.join(fixture.output, runId, 'manifest.json')), false);
    assert.equal(failedSites(fixture.output, runId).length, 1);
  } finally {
    fs.promises.copyFile = originalCopyFile;
    fs.promises.open = originalOpen;
    cleanupFixture(fixture);
  }
});

test('a source sidecar that disappears while opening is reported as a source change', async () => {
  const fixture = createWalFixture();
  const isolatedRoot = path.join(fixture.root, 'disappearing-sidecar');
  const isolatedSource = path.join(isolatedRoot, 'source.sqlite');
  const isolatedWal = `${isolatedSource}-wal`;
  fs.mkdirSync(isolatedRoot);
  fs.copyFileSync(fixture.sourcePath, isolatedSource);
  fs.copyFileSync(`${fixture.sourcePath}-wal`, isolatedWal);
  const originalOpen = fs.promises.open;
  let walOpens = 0;
  fs.promises.open = async (candidate, flags, mode) => {
    if (path.resolve(String(candidate)) === path.resolve(isolatedWal) && ++walOpens === 2) {
      fs.rmSync(isolatedWal);
    }
    return originalOpen(candidate, flags as never, mode);
  };
  try {
    const report = await runBackup({
      runId: 'sidecar-disappeared', sourcePath: isolatedSource, outputDirectory: fixture.output,
      resourceDirectories: [], execute: true,
    });
    assert.equal(report.status, 'failed');
    assert.equal(report.errors[0]?.code, 'SOURCE_CHANGED_DURING_BACKUP');
    assert.equal(fs.existsSync(path.join(fixture.output, 'sidecar-disappeared', 'manifest.json')), false);
  } finally {
    fs.promises.open = originalOpen;
    cleanupFixture(fixture);
  }
});

test('a resource directory swapped to an outside junction cannot retain copied outside bytes', async (context) => {
  const fixture = createWalFixture();
  const runId = 'resource-swap';
  const nested = path.join(fixture.resources, 'nested');
  const saved = path.join(fixture.resources, 'nested-safe');
  const outside = path.join(fixture.root, 'swap-outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'asset.txt'), 'outside-secret-bytes');
  const originalCopyFile = fs.promises.copyFile;
  const originalOpen = fs.promises.open;
  let successfulResourceOpens = 0;
  let swapped = false;
  const swap = (): void => {
    if (swapped) return;
    fs.renameSync(nested, saved);
    fs.symlinkSync(outside, nested, process.platform === 'win32' ? 'junction' : 'dir');
    swapped = true;
  };
  try {
    fs.promises.copyFile = async (source, destination, mode) => {
      if (path.resolve(String(source)) === path.resolve(nested, 'asset.txt')) swap();
      return originalCopyFile(source, destination, mode);
    };
    fs.promises.open = async (candidate, flags, mode) => {
      const isResource = path.resolve(String(candidate)) === path.resolve(nested, 'asset.txt');
      if (isResource && successfulResourceOpens >= 1) swap();
      const handle = await originalOpen(candidate, flags as never, mode);
      if (isResource) successfulResourceOpens += 1;
      return handle;
    };
  } catch (error) {
    cleanupFixture(fixture);
    context.skip(`junction swap unavailable: ${(error as Error).message}`);
    return;
  }
  try {
    const report = await runBackup({
      runId, sourcePath: fixture.sourcePath, outputDirectory: fixture.output,
      resourceDirectories: [fixture.resources], execute: true,
    });
    assert.equal(swapped, true);
    assert.equal(report.status, 'failed');
    assert.equal(report.errors.some((entry) => entry.code === 'RESOURCE_PATH_CHANGED' || entry.code === 'RESOURCE_REPARSE_POINT'), true);
    const failures = failedSites(fixture.output, runId);
    assert.equal(failures.length, 1);
    for (const candidate of relativeFiles(failures[0])) {
      assert.notEqual(fs.readFileSync(path.join(failures[0], ...candidate.split('/')), 'utf8'), 'outside-secret-bytes');
    }
  } finally {
    fs.promises.copyFile = originalCopyFile;
    fs.promises.open = originalOpen;
    if (swapped) {
      fs.rmSync(nested, { recursive: true, force: true });
      fs.renameSync(saved, nested);
    }
    cleanupFixture(fixture);
  }
});

test('a concurrently created destination is preserved and this run writes separate failure evidence', async () => {
  const fixture = createWalFixture();
  const runId = 'reservation-race';
  const finalRoot = path.join(fixture.output, runId);
  const originalMkdir = fs.promises.mkdir;
  let injected = false;
  fs.promises.mkdir = async (candidate, options) => {
    if (!injected && path.resolve(String(candidate)) === path.resolve(finalRoot)) {
      injected = true;
      await originalMkdir(candidate, options);
      await fs.promises.writeFile(path.join(finalRoot, 'owner.txt'), 'concurrent-owner');
    }
    return originalMkdir(candidate, options);
  };
  try {
    const report = await runBackup({
      runId, sourcePath: fixture.sourcePath, outputDirectory: fixture.output,
      resourceDirectories: [], execute: true,
    });
    assert.equal(injected, true);
    assert.equal(report.status, 'failed');
    assert.equal(fs.readFileSync(path.join(finalRoot, 'owner.txt'), 'utf8'), 'concurrent-owner');
    assert.equal(fs.existsSync(path.join(finalRoot, 'manifest.json')), false);
    assert.equal(failedSites(fixture.output, runId).length, 1);
  } finally {
    fs.promises.mkdir = originalMkdir;
    cleanupFixture(fixture);
  }
});

test('partial publication quarantines only the reserved directory and never exposes a manifest', async () => {
  const fixture = createWalFixture();
  const runId = 'partial-publication';
  const finalRoot = path.join(fixture.output, runId);
  const originalRename = fs.promises.rename;
  let injected = false;
  fs.promises.rename = async (source, destination) => {
    if (!injected && path.resolve(String(destination)) === path.resolve(finalRoot, 'sqlite-raw')) {
      injected = true;
      throw Object.assign(new Error('INJECTED_PARTIAL_PUBLICATION'), { code: 'EIO' });
    }
    return originalRename(source, destination);
  };
  try {
    const report = await runBackup({
      runId, sourcePath: fixture.sourcePath, outputDirectory: fixture.output,
      resourceDirectories: [], execute: true,
    });
    assert.equal(injected, true);
    assert.equal(report.status, 'failed');
    assert.equal(fs.existsSync(finalRoot), false);
    const failures = failedSites(fixture.output, runId);
    assert.equal(failures.length, 1);
    assert.equal(fs.existsSync(path.join(failures[0], 'manifest.json')), false);
  } finally {
    fs.promises.rename = originalRename;
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
