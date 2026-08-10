import { constants as fsConstants, promises as fs } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { buildManifest, hashFile, verifyManifest, type BackupManifest } from '../backup/manifest';
import { redactSecrets, writeReadinessReport } from '../reporting/reportWriter';
import type { ReadinessArtifact, ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';

export interface BackupOptions {
  runId: string;
  sourcePath: string;
  outputDirectory: string;
  resourceDirectories: string[];
  execute: boolean;
}

interface ResourceFile { source: string; destination: string; sizeBytes: number }
interface BackupPlan { resources: ResourceFile[]; estimatedBytes: number }

const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function result(
  options: BackupOptions,
  started: number,
  checks: ReadinessCheck[],
  artifacts: ReadinessArtifact[],
  errors: ReadinessReport['errors'],
): ReadinessReport {
  const finished = Date.now();
  return {
    runId: options.runId,
    stage: 'backup',
    status: errors.length ? 'failed' : 'passed',
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    checks,
    artifacts,
    errors,
  };
}

function addFailure(checks: ReadinessCheck[], errors: ReadinessReport['errors'], code: string, error: unknown): void {
  const message = redactSecrets(error instanceof Error ? error.message : String(error));
  checks.push({ id: 'backup.execute', status: 'failed', message });
  errors.push({ code, message });
}

function errorCode(error: unknown): string {
  return (error as Error & { code?: string }).code || 'BACKUP_FAILED';
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

async function pathExists(candidate: string): Promise<boolean> {
  try { await fs.lstat(candidate); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function assertRegularFile(candidate: string, code: string): Promise<number> {
  const stats = await fs.lstat(candidate);
  if (stats.isSymbolicLink()) throw codedError(code, `Reparse point is not allowed: ${candidate}`);
  if (!stats.isFile()) throw codedError(code, `Regular file is required: ${candidate}`);
  return stats.size;
}

async function inspectResourceRoot(root: string, index: number): Promise<ResourceFile[]> {
  const resolvedRoot = path.resolve(root);
  const rootStats = await fs.lstat(resolvedRoot);
  if (rootStats.isSymbolicLink()) throw codedError('RESOURCE_REPARSE_POINT', `Resource reparse point is not allowed: ${resolvedRoot}`);
  if (!rootStats.isDirectory()) throw codedError('RESOURCE_DIRECTORY_INVALID', `Resource directory is required: ${resolvedRoot}`);
  const files: ResourceFile[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      const stats = await fs.lstat(candidate);
      if (stats.isSymbolicLink()) throw codedError('RESOURCE_REPARSE_POINT', `Resource reparse point is not allowed: ${candidate}`);
      if (stats.isDirectory()) await visit(candidate);
      else if (stats.isFile()) {
        const relative = path.relative(resolvedRoot, candidate);
        if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          throw codedError('RESOURCE_PATH_ESCAPE', `Resource path escapes its root: ${candidate}`);
        }
        files.push({ source: candidate, destination: path.join('resources', `resource-${String(index).padStart(3, '0')}`, relative), sizeBytes: stats.size });
      } else throw codedError('RESOURCE_FILE_INVALID', `Resource entry is not a regular file: ${candidate}`);
    }
  };
  await visit(resolvedRoot);
  return files;
}

async function planBackup(options: BackupOptions): Promise<BackupPlan> {
  if (!SAFE_RUN_ID.test(options.runId) || options.runId === '.' || options.runId === '..') throw codedError('INVALID_RUN_ID', 'runId must be a safe, non-empty identifier');
  if (!options.sourcePath.trim() || !options.outputDirectory.trim()) throw codedError('INVALID_PARAMETERS', 'sourcePath and outputDirectory are required');
  if (!Array.isArray(options.resourceDirectories) || options.resourceDirectories.some((item) => !item.trim())) {
    throw codedError('INVALID_PARAMETERS', 'resourceDirectories must contain non-empty paths');
  }
  if (typeof options.execute !== 'boolean') throw codedError('INVALID_PARAMETERS', 'execute must be boolean');

  let estimatedBytes = await assertRegularFile(path.resolve(options.sourcePath), 'SOURCE_DATABASE_INVALID');
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${path.resolve(options.sourcePath)}${suffix}`;
    if (await pathExists(sidecar)) estimatedBytes += await assertRegularFile(sidecar, 'SOURCE_SIDECAR_INVALID');
  }
  const resources = (await Promise.all(options.resourceDirectories.map((root, index) => inspectResourceRoot(root, index)))).flat();
  estimatedBytes += resources.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  return { resources, estimatedBytes };
}

async function assertResourceStillSafe(resource: ResourceFile, root: string): Promise<void> {
  const relative = path.relative(path.resolve(root), resource.source);
  let cursor = path.resolve(root);
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    const stats = await fs.lstat(cursor);
    if (stats.isSymbolicLink()) throw codedError('RESOURCE_REPARSE_POINT', `Resource reparse point is not allowed: ${cursor}`);
  }
  await assertRegularFile(resource.source, 'RESOURCE_FILE_INVALID');
}

async function writeManifest(candidate: string, manifest: BackupManifest): Promise<void> {
  const handle = await fs.open(candidate, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function copyVerified(source: string, destination: string): Promise<void> {
  await fs.copyFile(source, destination, fsConstants.COPYFILE_EXCL);
  const [sourceStats, destinationStats, sourceHash, destinationHash] = await Promise.all([
    fs.stat(source), fs.stat(destination), hashFile(source), hashFile(destination),
  ]);
  if (sourceStats.size !== destinationStats.size || sourceHash !== destinationHash) {
    throw codedError('COPIED_FILE_MISMATCH', `Copied artifact verification failed: ${destination}`);
  }
}

async function preserveFailureSite(workingRoot: string | undefined, failedRoot: string, manifestPath: string | undefined): Promise<string | undefined> {
  if (!workingRoot || !await pathExists(workingRoot)) return undefined;
  if (manifestPath) await fs.rm(manifestPath, { force: true });
  if (await pathExists(failedRoot)) return workingRoot;
  await fs.rename(workingRoot, failedRoot);
  return failedRoot;
}

export async function runBackup(options: BackupOptions): Promise<ReadinessReport> {
  const started = Date.now();
  const checks: ReadinessCheck[] = [];
  let artifacts: ReadinessArtifact[] = [];
  const errors: ReadinessReport['errors'] = [];
  const output = path.resolve(options.outputDirectory || '.');
  const source = path.resolve(options.sourcePath || '.');
  const finalRoot = path.join(output, options.runId || 'invalid');
  const stagingRoot = path.join(output, `.${options.runId || 'invalid'}.staging`);
  const failedRoot = path.join(output, `${options.runId || 'invalid'}.failed`);
  let workingRoot: string | undefined;
  let manifestPath: string | undefined;

  try {
    const plan = await planBackup({ ...options, sourcePath: source, outputDirectory: output });
    checks.push({ id: 'backup.parameters', status: 'passed', message: 'Backup paths and resource roots are valid' });
    checks.push({ id: 'backup.estimated-bytes', status: 'passed', actual: `${plan.estimatedBytes} bytes`, message: 'Backup input capacity calculated without source writes' });
    if (!options.execute) {
      checks.push({ id: 'backup.execute', status: 'skipped', message: 'dry-run; no files created' });
      checks.push({ id: 'backup.publish', status: 'skipped', message: 'dry-run; no files created' });
      return result(options, started, checks, [], errors);
    }

    if (await pathExists(finalRoot) || await pathExists(stagingRoot) || await pathExists(failedRoot)) {
      throw codedError('BACKUP_RUN_ALREADY_EXISTS', 'Backup run, staging site, or failed site already exists');
    }
    await fs.mkdir(output, { recursive: true });
    await fs.mkdir(stagingRoot);
    workingRoot = stagingRoot;
    const consistentPath = path.join(stagingRoot, 'sqlite-consistent.sqlite');
    const sqlite = new Database(source, { readonly: true, fileMustExist: true });
    try { await sqlite.backup(consistentPath); } finally { sqlite.close(); }
    const consistent = new Database(consistentPath, { readonly: true, fileMustExist: true });
    try {
      const integrity = consistent.prepare('PRAGMA integrity_check').pluck().get();
      if (integrity !== 'ok') throw codedError('CONSISTENT_DATABASE_INVALID', `Consistent SQLite integrity check returned: ${String(integrity)}`);
    } finally { consistent.close(); }
    checks.push({ id: 'sqlite.consistent', status: 'passed', expected: 'ok', actual: 'ok', message: 'SQLite backup API produced an integrity-checked snapshot' });

    const rawRoot = path.join(stagingRoot, 'sqlite-raw');
    await fs.mkdir(rawRoot);
    await copyVerified(source, path.join(rawRoot, 'source.sqlite'));
    for (const [suffix, id] of [['-wal', 'source.raw-wal'], ['-shm', 'source.raw-shm']] as const) {
      const sidecar = `${source}${suffix}`;
      if (!await pathExists(sidecar)) {
        checks.push({ id, status: 'skipped', message: `Source SQLite ${suffix.slice(1).toUpperCase()} sidecar does not exist; no file fabricated` });
        continue;
      }
      await assertRegularFile(sidecar, 'SOURCE_SIDECAR_INVALID');
      await copyVerified(sidecar, path.join(rawRoot, `source.sqlite${suffix}`));
      checks.push({ id, status: 'passed', message: `Source SQLite ${suffix.slice(1).toUpperCase()} sidecar archived` });
    }

    for (const resource of plan.resources) {
      const rootIndex = Number(resource.destination.split(path.sep)[1].slice('resource-'.length));
      await assertResourceStillSafe(resource, options.resourceDirectories[rootIndex]);
      const destination = path.join(stagingRoot, resource.destination);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await copyVerified(resource.source, destination);
    }
    checks.push({ id: 'resources.archived', status: 'passed', actual: `${plan.resources.length} files`, message: 'Resource files archived without following reparse points' });

    const manifest = await buildManifest(stagingRoot, options.runId);
    manifestPath = path.join(stagingRoot, 'manifest.json');
    await writeManifest(manifestPath, manifest);
    await verifyManifest(stagingRoot, manifest);
    checks.push({ id: 'manifest.verified', status: 'passed', actual: `${manifest.entries.length} files`, message: 'Backup manifest hashes and file set verified' });
    artifacts = manifest.entries.map((entry) => ({ type: 'backup', path: `${options.runId}/${entry.path}`, sha256: entry.sha256 }));
    artifacts.push({ type: 'manifest', path: `${options.runId}/manifest.json`, sha256: await hashFile(manifestPath) });
    checks.push({ id: 'source.read-only', status: 'passed', message: 'Backup issued no source checkpoint, VACUUM, journal mutation, or write transaction' });
    checks.push({ id: 'backup.execute', status: 'passed', message: 'Backup artifacts created and verified' });

    await fs.rename(stagingRoot, finalRoot);
    workingRoot = finalRoot;
    manifestPath = path.join(finalRoot, 'manifest.json');
    checks.push({ id: 'backup.publish', status: 'passed', message: 'Unique backup run published atomically' });
    const report = result(options, started, checks, artifacts, errors);
    await writeReadinessReport({ outputDirectory: output, report });
    return report;
  } catch (error) {
    addFailure(checks, errors, errorCode(error), error);
    let preserved: string | undefined;
    try { preserved = await preserveFailureSite(workingRoot, failedRoot, manifestPath); }
    catch (preserveError) { addFailure(checks, errors, 'BACKUP_FAILURE_SITE_ERROR', preserveError); }
    const report = result(options, started, checks, [], errors);
    if (preserved) {
      try { await writeReadinessReport({ outputDirectory: preserved, report }); }
      catch (reportError) { addFailure(checks, errors, 'BACKUP_REPORT_WRITE_FAILED', reportError); }
    }
    return result(options, started, checks, [], errors);
  }
}
