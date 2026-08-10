import { promises as fs } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  assertSameSourceSnapshot,
  captureSourceSnapshot,
  captureStableFile,
  copyStableFile,
  type SourceSnapshot,
  type StableFile,
} from '../backup/fileSnapshot';
import { buildManifest, hashFile, verifyManifest, type BackupManifest } from '../backup/manifest';
import {
  createUniqueSite,
  pathExists,
  publishReserved,
  quarantineOwned,
  releaseReservation,
  reserveFinal,
  type FinalReservation,
} from '../backup/publication';
import { redactSecrets, writeReadinessReport } from '../reporting/reportWriter';
import type { ReadinessArtifact, ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';

export interface BackupOptions {
  runId: string;
  sourcePath: string;
  outputDirectory: string;
  resourceDirectories: string[];
  execute: boolean;
}

interface ResourceFile { file: StableFile; rootRealPath: string; destination: string }
interface BackupPlan { source: SourceSnapshot; sourceRootRealPath: string; resources: ResourceFile[]; estimatedBytes: number }

const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function evidenceRunId(runId: string): string {
  return SAFE_RUN_ID.test(runId) && runId !== '.' && runId !== '..' ? runId : 'invalid-run';
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function report(
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

async function inspectResourceRoot(root: string, index: number): Promise<ResourceFile[]> {
  const resolvedRoot = path.resolve(root);
  const rootStats = await fs.lstat(resolvedRoot);
  if (rootStats.isSymbolicLink()) throw codedError('RESOURCE_REPARSE_POINT', `Resource reparse point is not allowed: ${resolvedRoot}`);
  if (!rootStats.isDirectory()) throw codedError('RESOURCE_DIRECTORY_INVALID', `Resource directory is required: ${resolvedRoot}`);
  const rootRealPath = await fs.realpath(resolvedRoot);
  const files: ResourceFile[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      const stats = await fs.lstat(candidate);
      if (stats.isSymbolicLink()) throw codedError('RESOURCE_REPARSE_POINT', `Resource reparse point is not allowed: ${candidate}`);
      if (stats.isDirectory()) await visit(candidate);
      else if (stats.isFile()) {
        const relative = path.relative(resolvedRoot, candidate);
        if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          throw codedError('RESOURCE_PATH_ESCAPE', `Resource path escapes its root: ${candidate}`);
        }
        const file = await captureStableFile(candidate, rootRealPath, relative, 'RESOURCE_PATH_CHANGED');
        files.push({ file, rootRealPath, destination: path.join('resources', `resource-${String(index).padStart(3, '0')}`, relative) });
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
  const source = await captureSourceSnapshot(options.sourcePath);
  const sourceRootRealPath = await fs.realpath(path.dirname(path.resolve(options.sourcePath)));
  const resources = (await Promise.all(options.resourceDirectories.map(inspectResourceRoot))).flat();
  const estimatedBytes = source.files.reduce((sum, file) => sum + file.sizeBytes, 0)
    + resources.reduce((sum, entry) => sum + entry.file.sizeBytes, 0);
  return { source, sourceRootRealPath, resources, estimatedBytes };
}

async function copyRawSnapshot(plan: BackupPlan, stagingRoot: string, checks: ReadinessCheck[]): Promise<string> {
  const rawRoot = path.join(stagingRoot, 'sqlite-raw');
  await fs.mkdir(rawRoot);
  for (const file of plan.source.files) {
    await copyStableFile(file, plan.sourceRootRealPath, path.join(rawRoot, file.archiveName), 'SOURCE_CHANGED_DURING_BACKUP');
  }
  const after = await captureSourceSnapshot(plan.source.files[0].sourcePath);
  assertSameSourceSnapshot(plan.source, after);
  for (const suffix of ['-wal', '-shm'] as const) {
    const id = suffix === '-wal' ? 'source.raw-wal' : 'source.raw-shm';
    const archived = plan.source.files.some((file) => file.archiveName === `source.sqlite${suffix}`);
    checks.push({
      id,
      status: archived ? 'passed' : 'skipped',
      message: archived
        ? `Source SQLite ${suffix.slice(1).toUpperCase()} sidecar archived byte-for-byte`
        : `Source SQLite ${suffix.slice(1).toUpperCase()} sidecar does not exist; no file fabricated`,
    });
  }
  return rawRoot;
}

async function createConsistentDatabase(rawRoot: string, stagingRoot: string): Promise<string> {
  const recoveryRoot = path.join(stagingRoot, '.sqlite-recovery');
  const recoverySource = path.join(recoveryRoot, 'source.sqlite');
  await fs.mkdir(recoveryRoot);
  const rawRealPath = await fs.realpath(rawRoot);
  try {
    for (const archiveName of ['source.sqlite', 'source.sqlite-wal']) {
      const candidate = path.join(rawRoot, archiveName);
      if (!await pathExists(candidate)) continue;
      const stable = await captureStableFile(candidate, rawRealPath, archiveName, 'STAGED_RAW_INVALID');
      await copyStableFile(stable, rawRealPath, path.join(recoveryRoot, archiveName), 'STAGED_RAW_INVALID');
    }
    const consistentPath = path.join(stagingRoot, 'sqlite-consistent.sqlite');
    const recovery = new Database(recoverySource, { fileMustExist: true });
    try { await recovery.backup(consistentPath); } finally { recovery.close(); }
    const consistent = new Database(consistentPath, { readonly: true, fileMustExist: true });
    try {
      const integrity = consistent.prepare('PRAGMA integrity_check').pluck().get();
      if (integrity !== 'ok') throw codedError('CONSISTENT_DATABASE_INVALID', `Consistent SQLite integrity check returned: ${String(integrity)}`);
    } finally { consistent.close(); }
    return consistentPath;
  } finally {
    await fs.rm(recoveryRoot, { recursive: true, force: true });
  }
}

async function writeManifest(candidate: string, manifest: BackupManifest): Promise<void> {
  const handle = await fs.open(candidate, 'wx');
  try { await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
}

export async function runBackup(options: BackupOptions): Promise<ReadinessReport> {
  const started = Date.now();
  const checks: ReadinessCheck[] = [];
  const errors: ReadinessReport['errors'] = [];
  const output = path.resolve(options.outputDirectory || '.');
  const finalRoot = path.join(output, options.runId || 'invalid');
  let stagingRoot: string | undefined;
  let reservation: FinalReservation | undefined;

  try {
    const plan = await planBackup({ ...options, sourcePath: path.resolve(options.sourcePath || '.') });
    checks.push({ id: 'backup.parameters', status: 'passed', message: 'Backup paths and resource roots are valid' });
    checks.push({ id: 'backup.estimated-bytes', status: 'passed', actual: `${plan.estimatedBytes} bytes`, message: 'Backup input capacity calculated without source writes' });
    if (!options.execute) {
      checks.push({ id: 'backup.execute', status: 'skipped', message: 'dry-run; no files created' });
      checks.push({ id: 'backup.publish', status: 'skipped', message: 'dry-run; no files created' });
      return report(options, started, checks, [], errors);
    }
    if (await pathExists(finalRoot)) throw codedError('BACKUP_RUN_ALREADY_EXISTS', 'Backup final run already exists');

    stagingRoot = await createUniqueSite(output, options.runId, 'staging');
    const rawRoot = await copyRawSnapshot(plan, stagingRoot, checks);
    const consistentPath = await createConsistentDatabase(rawRoot, stagingRoot);
    checks.push({ id: 'sqlite.consistent', status: 'passed', expected: 'ok', actual: 'ok', message: 'Staged raw SQLite recovery produced an integrity-checked snapshot' });

    for (const resource of plan.resources) {
      const destination = path.join(stagingRoot, resource.destination);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await copyStableFile(resource.file, resource.rootRealPath, destination, 'RESOURCE_PATH_CHANGED');
    }
    checks.push({ id: 'resources.archived', status: 'passed', actual: `${plan.resources.length} files`, message: 'Resource files archived from held, identity-checked handles' });

    const manifest = await buildManifest(stagingRoot, options.runId);
    const manifestPath = path.join(stagingRoot, 'manifest.json');
    await writeManifest(manifestPath, manifest);
    await verifyManifest(stagingRoot, manifest);
    checks.push({ id: 'manifest.verified', status: 'passed', actual: `${manifest.entries.length} files`, message: 'Backup manifest hashes and file set verified' });
    const artifacts: ReadinessArtifact[] = manifest.entries.map((entry) => ({ type: 'backup', path: `${options.runId}/${entry.path}`, sha256: entry.sha256 }));
    artifacts.push({ type: 'manifest', path: `${options.runId}/manifest.json`, sha256: await hashFile(manifestPath) });
    checks.push({ id: 'source.read-only', status: 'passed', message: 'Source accessed only through filesystem reads; SQLite opened staged recovery files only' });
    checks.push({ id: 'backup.execute', status: 'passed', message: 'Backup artifacts created and verified' });

    reservation = await reserveFinal(output, options.runId);
    await publishReserved(stagingRoot, reservation, manifest);
    stagingRoot = undefined;
    checks.push({ id: 'backup.publish', status: 'passed', message: 'Exclusively reserved run published with manifest last' });
    const passedReport = report(options, started, checks, artifacts, errors);
    await writeReadinessReport({ outputDirectory: output, report: passedReport });
    await releaseReservation(reservation);
    reservation = undefined;
    return passedReport;
  } catch (error) {
    addFailure(checks, errors, errorCode(error), error);
    if (!options.execute) return report(options, started, checks, [], errors);
    let failureSite: string | undefined;
    try { failureSite = await quarantineOwned(stagingRoot, reservation, output, options.runId); }
    catch (quarantineError) { addFailure(checks, errors, 'BACKUP_FAILURE_SITE_ERROR', quarantineError); }
    if (!failureSite) {
      try { failureSite = await createUniqueSite(output, options.runId, 'failed'); }
      catch (siteError) { addFailure(checks, errors, 'BACKUP_FAILURE_SITE_ERROR', siteError); }
    }
    const failedReport = report(options, started, checks, [], errors);
    if (failureSite) {
      const evidenceReport = { ...failedReport, runId: evidenceRunId(options.runId) };
      try { await writeReadinessReport({ outputDirectory: failureSite, report: evidenceReport }); }
      catch (reportError) { addFailure(checks, errors, 'BACKUP_REPORT_WRITE_FAILED', reportError); }
    }
    return report(options, started, checks, [], errors);
  }
}
