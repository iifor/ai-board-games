import path from 'node:path';
import { verifyPublishedBackup } from '../backup/manifestEvidence';
import { isSafeRunId } from '../backup/publication';
import { assertBackupWriteBoundary } from '../backup/writeBoundary';
import { writeReadinessReport } from '../reporting/reportWriter';
import type { ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';

export interface VerifyBackupOptions {
  runId: string;
  backupDirectory: string;
  manifestPath: string;
  outputDirectory: string;
}

function report(
  options: VerifyBackupOptions,
  started: number,
  checks: ReadinessCheck[],
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
    artifacts: [],
    errors,
  };
}

export async function runVerifyBackup(options: VerifyBackupOptions): Promise<ReadinessReport> {
  const started = Date.now();
  const checks: ReadinessCheck[] = [];
  const errors: ReadinessReport['errors'] = [];
  const output = path.resolve(options.outputDirectory || '.');
  const backup = path.resolve(options.backupDirectory || '.');
  if (!isSafeRunId(options.runId) || !options.backupDirectory.trim()
    || !options.manifestPath.trim() || !options.outputDirectory.trim()) {
    throw Object.assign(new Error('Backup verification parameters are invalid'), { code: 'BACKUP_VERIFY_PARAMETERS_INVALID' });
  }
  await assertBackupWriteBoundary({
    backupDirectory: backup,
    outputDirectory: output,
    writePaths: [
      path.join(output, `${options.runId}-backup.json`),
      path.join(output, `${options.runId}-backup.md`),
    ],
    errorCode: 'BACKUP_VERIFY_OUTPUT_UNSAFE',
  });
  try {
    const verified = await verifyPublishedBackup(backup, options.manifestPath);
    const identity = JSON.stringify({
      runId: verified.manifest.runId,
      manifestSha256: verified.manifestFile.sha256,
    });
    checks.push({
      id: 'backup.verify-manifest',
      status: 'passed',
      expected: identity,
      actual: identity,
      message: 'Published backup file set, identities, sizes, and SHA-256 values match its stable manifest',
    });
  } catch (error) {
    const code = (error as Error & { code?: string }).code || 'BACKUP_VERIFY_FAILED';
    const message = 'Backup evidence verification failed';
    checks.push({ id: 'backup.verify-manifest', status: 'failed', message });
    errors.push({ code, message });
  }
  const result = report(options, started, checks, errors);
  await writeReadinessReport({ outputDirectory: output, report: result });
  return result;
}
