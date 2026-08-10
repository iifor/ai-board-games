import path from 'node:path';
import { verifyPublishedBackup } from '../backup/manifestEvidence';
import { isSafeRunId } from '../backup/publication';
import { writeReadinessReport } from '../reporting/reportWriter';
import type { ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';

export interface VerifyBackupOptions {
  runId: string;
  backupDirectory: string;
  manifestPath: string;
  outputDirectory: string;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
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
  try {
    if (!isSafeRunId(options.runId) || !options.backupDirectory.trim()
      || !options.manifestPath.trim() || !options.outputDirectory.trim() || isInside(backup, output)) {
      throw Object.assign(new Error('Backup verification parameters are invalid'), { code: 'BACKUP_VERIFY_PARAMETERS_INVALID' });
    }
    const verified = await verifyPublishedBackup(backup, options.manifestPath);
    checks.push({
      id: 'backup.verify-manifest',
      status: 'passed',
      actual: `${verified.manifest.entries.length} files`,
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
