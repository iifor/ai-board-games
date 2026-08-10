import path from 'node:path';
import { isSafeRunId } from '../backup/publication';
import { writeReadinessReport } from '../reporting/reportWriter';
import type { ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';
import { loadReleaseEvidence, type OperatorSignoff } from '../release/evidence';
import { hasMatchingBackupVerification } from '../release/backupVerification';

export const REQUIRED_RELEASE_CHECKS = [
  'ci.release-gates',
  'tests.no-critical-skips',
  'backup.executed',
  'backup.restore-drill',
  'rehearsal.first',
  'rehearsal.second',
  'rehearsal.same-source-hash',
  'runtime.no-sqlite',
  'postgres.tls',
  'postgres.least-privilege',
  'postgres.pool-and-timeouts',
  'smoke.health',
  'smoke.auth-and-config',
  'smoke.game-replay-memory-delete',
  'docs.runtime-truth',
  'operator.signoff',
] as const;

const SIGNED_CHECKS = REQUIRED_RELEASE_CHECKS.filter((id) => ![
  'backup.executed', 'rehearsal.first', 'rehearsal.second', 'rehearsal.same-source-hash',
  'smoke.health', 'smoke.auth-and-config', 'smoke.game-replay-memory-delete',
].includes(id));
const OPTIONAL_SKIPPED_CHECKS = new Set(['source.raw-wal', 'source.raw-shm']);
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;

function isReleaseCandidate(value: string): boolean {
  return GIT_SHA.test(value) && !/^0{40}$/.test(value);
}

export interface ReleaseReadinessOptions {
  runId: string;
  releaseCandidate: string;
  reportPaths: string[];
  outputDirectory: string;
  operatorSignoffPath: string;
}

export interface ReleaseReadinessReport extends ReadinessReport {
  maintenanceWindowMinutes: number;
}

function checkPassed(report: ReadinessReport, id: string): boolean {
  const matching = report.checks.filter((check) => check.id === id);
  return report.status === 'passed' && matching.length > 0 && matching.every((check) => check.status === 'passed');
}

function sourceHash(report: ReadinessReport): string | undefined {
  const matching = report.checks.filter((item) => item.id === 'source.snapshot.sha256');
  if (matching.length !== 1 || matching[0].status !== 'passed') return undefined;
  const check = matching[0];
  return check.actual && check.actual === check.expected && SHA256.test(check.actual) ? check.actual : undefined;
}

function smokePassed(report: ReadinessReport, ids: string[]): boolean {
  return report.status === 'passed' && ids.every((id) => checkPassed(report, id));
}

function gate(id: typeof REQUIRED_RELEASE_CHECKS[number], passed: boolean, message: string): ReadinessCheck {
  return { id, status: passed ? 'passed' : 'failed', message: passed ? message : `Required evidence failed: ${id}` };
}

function evaluate(
  reports: ReadinessReport[],
  signoff: OperatorSignoff,
  expected: Pick<ReleaseReadinessOptions, 'runId' | 'releaseCandidate'>,
): { checks: ReadinessCheck[]; minutes: number } {
  const backup = reports.filter((report) => report.stage === 'backup');
  const executedBackups = backup.filter((report) => report.checks.some((check) => check.id === 'backup.execute'));
  const rehearsals = reports.filter((report) => report.stage === 'rehearsal');
  const smokes = reports.filter((report) => report.stage === 'smoke');
  const first = rehearsals[0];
  const second = rehearsals[1];
  const maxDuration = rehearsals.length === 2 ? Math.max(first.durationMs, second.durationMs) : 0;
  const minutes = maxDuration ? Math.ceil((2 * maxDuration) / 60_000) : 0;
  const signoffContextMatches = signoff.releaseCandidate === expected.releaseCandidate
    && signoff.readinessRunId === expected.runId
    && signoff.maintenanceWindowMinutes === minutes;
  const allReportsPassed = signoffContextMatches && reports.length > 0 && reports.every((report) => (
    report.status === 'passed' && report.errors.length === 0
    && report.checks.length > 0 && report.checks.every((check) => (
      check.status !== 'failed'
      && (check.status !== 'skipped' || (report.stage === 'backup' && OPTIONAL_SKIPPED_CHECKS.has(check.id)))
    ))
  )) && signoff.approved && signoff.checks.length > 0
    && signoff.checks.every((check) => check.status === 'passed');
  const firstHash = first && sourceHash(first);
  const secondHash = second && sourceHash(second);
  const independent = rehearsals.length === 2 && first.runId !== second.runId
    && Boolean(first.schema) && Boolean(second.schema) && first.schema !== second.schema;
  const rehearsalPassed = (report: ReadinessReport | undefined): boolean => Boolean(
    report && checkPassed(report, 'validation') && checkPassed(report, 'smoke'),
  );
  const smokeFor = (rehearsal: ReadinessReport | undefined): ReadinessReport | undefined => (
    rehearsal && smokes.find((report) => report.runId === rehearsal.runId && report.schema === rehearsal.schema)
  );
  const smokeOne = smokeFor(first);
  const smokeTwo = smokeFor(second);
  const bothSmoke = (ids: string[]): boolean => smokes.length === 2
    && Boolean(smokeOne && smokeTwo && smokePassed(smokeOne, ids) && smokePassed(smokeTwo, ids));
  const signed = (id: string): boolean => {
    const approvals = signoff.checks.filter((check) => check.id === id);
    const evidence = reports.flatMap((report) => report.checks.filter((check) => check.id === id));
    return signoff.approved && approvals.length > 0 && approvals.every((check) => check.status === 'passed')
      && evidence.length > 0 && evidence.every((check) => check.status === 'passed');
  };
  const result = new Map<string, boolean>(SIGNED_CHECKS.map((id) => [id, signed(id)]));
  result.set('backup.executed', executedBackups.length === 1 && checkPassed(executedBackups[0], 'backup.execute')
    && hasMatchingBackupVerification(reports));
  result.set('backup.restore-drill', signed('backup.restore-drill')
    && backup.some((report) => checkPassed(report, 'backup.restore-drill')));
  result.set('rehearsal.first', independent && rehearsalPassed(first));
  result.set('rehearsal.second', independent && rehearsalPassed(second));
  result.set('rehearsal.same-source-hash', Boolean(independent && firstHash && firstHash === secondHash));
  result.set('smoke.health', bothSmoke(['health.connected', 'health.disconnected']));
  result.set('smoke.auth-and-config', bothSmoke(['auth.initial-password-change', 'config.read-and-crud']));
  result.set('smoke.game-replay-memory-delete', bothSmoke([
    'undercover.persisted-without-external-calls', 'history.detail-and-replay-order',
    'memory.created-and-updated', 'workflow.observability-delete', 'teardown.observability-drained',
  ]));
  const checks = REQUIRED_RELEASE_CHECKS.map((id) => gate(
    id,
    allReportsPassed && result.get(id) === true,
    id === 'operator.signoff' ? 'Independent operator signoff is complete' : `Verified evidence: ${id}`,
  ));
  return { checks, minutes };
}

export async function runReleaseReadiness(options: ReleaseReadinessOptions): Promise<ReleaseReadinessReport> {
  if (!isSafeRunId(options.runId)) throw Object.assign(new Error('runId must be a safe, non-empty identifier'), { code: 'INVALID_RUN_ID' });
  if (!isReleaseCandidate(options.releaseCandidate) || !options.outputDirectory.trim()
    || !options.operatorSignoffPath.trim() || !options.reportPaths.length) {
    throw Object.assign(new Error('reports, operator signoff and output directory are required'), { code: 'INVALID_PARAMETERS' });
  }
  const started = Date.now();
  let checks: ReadinessCheck[];
  let maintenanceWindowMinutes = 0;
  try {
    const evidence = await loadReleaseEvidence(options.reportPaths, options.operatorSignoffPath);
    ({ checks, minutes: maintenanceWindowMinutes } = evaluate(evidence.reports, evidence.signoff, options));
  } catch {
    checks = REQUIRED_RELEASE_CHECKS.map((id) => gate(id, false, ''));
  }
  const finished = Date.now();
  const failed = checks.filter((check) => check.status !== 'passed');
  const report: ReleaseReadinessReport = {
    runId: options.runId,
    stage: 'release',
    status: failed.length ? 'failed' : 'passed',
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    maintenanceWindowMinutes,
    checks,
    artifacts: [],
    errors: failed.map((check) => ({ code: 'REQUIRED_RELEASE_CHECK_FAILED', message: check.message })),
  };
  await writeReadinessReport({ outputDirectory: path.resolve(options.outputDirectory), report });
  return report;
}
