import { promises as fs } from 'node:fs';
import path from 'node:path';
import { captureStableFile } from '../backup/fileSnapshot';
import { verifyPublishedBackup } from '../backup/manifestEvidence';
import { isSafeRunId } from '../backup/publication';
import { assertSqlitePathBudget } from '../backup/sqliteRecovery';
import { assertBackupWriteBoundary } from '../backup/writeBoundary';
import { writeReadinessReport } from '../reporting/reportWriter';
import type { ReadinessArtifact, ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';
import {
  assertExactRestoredFileSet,
  claimRestoreOwnership,
  copyRestorePlan,
  type RestoredFile,
} from '../restore/copyVerified';
import {
  buildRestorePlan,
  loadResourceRestoreMap,
  type ResourceRestoreMapping,
  type RestorePlan,
} from '../restore/restorePlan';
import { verifyRestoredSqlite } from '../restore/sqliteVerification';

export interface RestoreDrillOptions {
  runId: string;
  backupDirectory: string;
  manifestPath: string;
  outputDirectory: string;
  restoreDirectory: string;
  resourceMap?: ResourceRestoreMapping[];
  resourceMapPath?: string;
  execute: boolean;
}

function report(
  options: RestoreDrillOptions,
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

async function assertTargetAvailable(restoreRoot: string): Promise<void> {
  try {
    const stats = await fs.lstat(restoreRoot);
    if (stats.isSymbolicLink() || !stats.isDirectory() || (await fs.readdir(restoreRoot)).length !== 0) {
      throw Object.assign(new Error('Restore target is unavailable'), { code: 'RESTORE_TARGET_NOT_EMPTY' });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
}

async function ensureOutputDirectory(output: string): Promise<void> {
  await fs.mkdir(output, { recursive: true });
  const stats = await fs.lstat(output);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw Object.assign(new Error('Restore output is invalid'), { code: 'RESTORE_OUTPUT_INVALID' });
  }
}

async function verifyRestoredFiles(plan: RestorePlan, restored: RestoredFile[]): Promise<void> {
  const rootRealPath = await fs.realpath(plan.restoreRoot);
  for (const file of plan.files) {
    const captured = await captureStableFile(file.destinationPath, rootRealPath, file.entry.path, 'RESTORE_DESTINATION_CHANGED');
    if (captured.sizeBytes !== file.entry.sizeBytes || captured.sha256 !== file.entry.sha256) {
      throw Object.assign(new Error('Restored bytes changed'), { code: 'RESTORE_DESTINATION_MISMATCH' });
    }
  }
  if (restored.length !== plan.files.length + 1) {
    throw Object.assign(new Error('Restored file set is incomplete'), { code: 'RESTORE_DESTINATION_MISMATCH' });
  }
}

function validateOptions(options: RestoreDrillOptions): void {
  if (!isSafeRunId(options.runId) || !options.backupDirectory.trim() || !options.manifestPath.trim()
    || !options.outputDirectory.trim() || !options.restoreDirectory.trim() || typeof options.execute !== 'boolean'
    || (options.resourceMap === undefined && !options.resourceMapPath?.trim())) {
    throw Object.assign(new Error('Restore drill parameters are invalid'), { code: 'RESTORE_PARAMETERS_INVALID' });
  }
}

export async function runRestoreDrill(options: RestoreDrillOptions): Promise<ReadinessReport> {
  const started = Date.now();
  const checks: ReadinessCheck[] = [];
  const errors: ReadinessReport['errors'] = [];
  const artifacts: ReadinessArtifact[] = [];
  const output = path.resolve(options.outputDirectory || '.');
  validateOptions(options);
  await assertBackupWriteBoundary({
    backupDirectory: options.backupDirectory,
    outputDirectory: output,
    restoreDirectory: options.restoreDirectory,
    writePaths: [
      path.join(output, `${options.runId}-backup.json`),
      path.join(output, `${options.runId}-backup.md`),
      options.restoreDirectory,
    ],
    errorCode: 'RESTORE_OUTPUT_UNSAFE',
  });
  try {
    if (path.dirname(path.resolve(options.restoreDirectory)) !== output) {
      throw Object.assign(new Error('Restore drill parameters are invalid'), { code: 'RESTORE_PARAMETERS_INVALID' });
    }
    const verified = await verifyPublishedBackup(options.backupDirectory, options.manifestPath);
    checks.push({ id: 'backup.verify-manifest', status: 'passed', message: 'Backup evidence is stable and manifest-complete' });
    const resourceMap = options.resourceMapPath
      ? await loadResourceRestoreMap(options.resourceMapPath)
      : options.resourceMap || [];
    const plan = buildRestorePlan(verified, output, options.restoreDirectory, resourceMap);
    assertSqlitePathBudget([
      path.join(plan.restoreRoot, 'sqlite-raw', 'source.sqlite'),
      path.join(plan.restoreRoot, 'sqlite-consistent.sqlite'),
    ]);
    await assertTargetAvailable(plan.restoreRoot);
    checks.push({ id: 'backup.restore-plan', status: 'passed', message: 'Restore targets and resource mappings are isolated and complete' });
    if (!options.execute) {
      checks.push({ id: 'backup.restore-drill', status: 'skipped', message: 'dry-run; no files or reports created' });
      return report(options, started, checks, artifacts, errors);
    }

    await ensureOutputDirectory(output);
    const ownership = await claimRestoreOwnership(output, plan.restoreRoot, options.runId);
    artifacts.push({
      type: 'evidence',
      path: path.relative(output, ownership.token.sourcePath).split(path.sep).join('/'),
      sha256: ownership.token.sha256,
    });
    const copied = await copyRestorePlan(verified, plan, ownership);
    const restored = copied.restored;
    checks.push({ id: 'backup.restore-files', status: 'passed', actual: `${restored.length} files`, message: 'Raw, consistent, manifest, and mapped resource files restored through verified Node handles' });
    const sqlite = await verifyRestoredSqlite(plan.restoreRoot);
    checks.push({ id: 'backup.restore-raw-integrity', status: 'passed', actual: sqlite.rawIntegrity, message: 'Raw rollback set passed read-only query-only integrity verification with adjacent sidecars' });
    checks.push({ id: 'backup.restore-consistent-integrity', status: 'passed', actual: sqlite.consistentIntegrity, message: 'Consistent SQLite snapshot passed independent read-only integrity verification' });
    checks.push({ id: 'backup.restore-counts', status: 'passed', actual: JSON.stringify(sqlite.counts), message: 'Raw and consistent key-table counts match' });
    await verifyRestoredFiles(plan, restored);
    await verifyPublishedBackup(options.backupDirectory, options.manifestPath);
    const expectedPaths = [
      ...plan.files.map((file) => path.relative(plan.restoreRoot, file.destinationPath).split(path.sep).join('/')),
      'manifest.json',
    ];
    await assertExactRestoredFileSet(plan.restoreRoot, expectedPaths);
    for (const restoredFile of restored) {
      const relative = path.relative(output, restoredFile.path).split(path.sep).join('/');
      artifacts.push({
        type: restoredFile.path.endsWith(`${path.sep}manifest.json`) ? 'manifest' : 'backup',
        path: relative,
        sha256: restoredFile.sha256,
      });
    }
    checks.push({ id: 'backup.restore-drill', status: 'passed', message: 'Isolated restore drill completed with source and destination evidence unchanged' });
  } catch (error) {
    const code = (error as Error & { code?: string }).code || 'RESTORE_DRILL_FAILED';
    const message = 'Restore drill failed; isolated evidence is preserved';
    checks.push({ id: 'backup.restore-drill', status: 'failed', message });
    errors.push({ code, message });
  }
  const result = report(options, started, checks, artifacts, errors);
  if (options.execute) await writeReadinessReport({ outputDirectory: output, report: result });
  return result;
}
