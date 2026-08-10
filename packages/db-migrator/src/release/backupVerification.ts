import type { ReadinessReport } from '../reporting/reportTypes';

const SHA256 = /^[a-f0-9]{64}$/;

interface VerificationIdentity { runId: string; manifestSha256: string }

function identity(report: ReadinessReport): VerificationIdentity | undefined {
  const checks = report.checks.filter((check) => check.id === 'backup.verify-manifest');
  if (report.stage !== 'backup' || report.status !== 'passed' || checks.length !== 1
    || checks[0].status !== 'passed' || checks[0].actual !== checks[0].expected || !checks[0].actual) return undefined;
  try {
    const value = JSON.parse(checks[0].actual) as Partial<VerificationIdentity>;
    return typeof value.runId === 'string' && SHA256.test(value.manifestSha256 || '')
      ? { runId: value.runId, manifestSha256: value.manifestSha256! }
      : undefined;
  } catch {
    return undefined;
  }
}

export function hasMatchingBackupVerification(reports: ReadinessReport[]): boolean {
  const executed = reports.filter((report) => report.checks.some((check) => check.id === 'backup.execute'));
  const verified = reports.filter((report) => report.artifacts.length === 0
    && report.checks.some((check) => check.id === 'backup.verify-manifest')
    && !report.checks.some((check) => ['backup.execute', 'backup.restore-drill'].includes(check.id)));
  if (executed.length !== 1 || verified.length !== 1 || verified[0].artifacts.length !== 0) return false;
  const metadata = identity(verified[0]);
  const manifests = executed[0].artifacts.filter((artifact) => artifact.type === 'manifest');
  return Boolean(metadata && metadata.runId === executed[0].runId && manifests.length === 1
    && manifests[0].sha256 === metadata.manifestSha256);
}

export function assertMatchingBackupVerification(reports: ReadinessReport[]): void {
  if (!hasMatchingBackupVerification(reports)) throw new Error('Backup verification evidence is incomplete');
}
