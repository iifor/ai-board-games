import { createHash } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import path from 'node:path';
import { isSafeRunId } from '../backup/publication';
import { writeReadinessReport } from '../reporting/reportWriter';
import type { ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';

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
const SHA256 = /^[a-f0-9]{64}$/;

export interface ReleaseReadinessOptions {
  runId: string;
  reportPaths: string[];
  outputDirectory: string;
  operatorSignoffPath: string;
}

export interface ReleaseReadinessReport extends ReadinessReport {
  maintenanceWindowMinutes: number;
}

interface ReportManifestEntry { path: string; sha256: string }
interface OperatorSignoff {
  version: 1;
  approved: boolean;
  approvedBy: string;
  approvedAt: string;
  checks: Array<{ id: string; status: 'passed' | 'failed' }>;
  reportManifest: ReportManifestEntry[];
}

interface StableJson<T> { value: T; sha256: string; resolvedPath: string }

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function sameFile(left: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint }, right: typeof left): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs;
}

async function readStableJson<T>(candidate: string, rootPath: string, rootRealPath: string): Promise<StableJson<T>> {
  const resolvedPath = path.resolve(candidate);
  if (!isInside(rootPath, resolvedPath)) throw new Error('Evidence path escapes the signoff directory');
  const before = await fs.lstat(resolvedPath, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile()) throw new Error('Evidence must be a regular non-reparse file');
  const beforeRealPath = await fs.realpath(resolvedPath);
  if (!isInside(rootRealPath, beforeRealPath)) throw new Error('Evidence resolves outside the signoff directory');
  const noFollow = fsConstants.O_NOFOLLOW || 0;
  const handle = await fs.open(resolvedPath, fsConstants.O_RDONLY | noFollow);
  let bytes: Buffer;
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameFile(before, opened)) throw new Error('Evidence changed while opening');
    bytes = await handle.readFile();
    const afterRead = await handle.stat({ bigint: true });
    if (!sameFile(opened, afterRead) || BigInt(bytes.length) !== opened.size) throw new Error('Evidence changed while reading');
  } finally {
    await handle.close();
  }
  const after = await fs.lstat(resolvedPath, { bigint: true });
  const afterRealPath = await fs.realpath(resolvedPath);
  if (!sameFile(before, after) || afterRealPath !== beforeRealPath) throw new Error('Evidence path changed after reading');
  return {
    value: JSON.parse(bytes.toString('utf8')) as T,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    resolvedPath,
  };
}

function safeManifestPath(candidate: string): boolean {
  return Boolean(candidate)
    && !candidate.includes('\\')
    && !path.posix.isAbsolute(candidate)
    && path.posix.normalize(candidate) === candidate
    && candidate !== '..'
    && !candidate.startsWith('../');
}

function pathKey(candidate: string): string {
  const resolved = path.resolve(candidate);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isReadinessReport(value: unknown): value is ReadinessReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<ReadinessReport>;
  return typeof report.runId === 'string'
    && ['preflight', 'backup', 'import', 'validation', 'rehearsal', 'smoke', 'release'].includes(report.stage || '')
    && ['passed', 'failed'].includes(report.status || '')
    && Number.isFinite(report.durationMs) && Number(report.durationMs) >= 0
    && Array.isArray(report.checks) && report.checks.every((check) => (
      check && typeof check.id === 'string' && ['passed', 'failed', 'skipped'].includes(check.status)
    ));
}

function isSignoff(value: unknown): value is OperatorSignoff {
  if (!value || typeof value !== 'object') return false;
  const signoff = value as Partial<OperatorSignoff>;
  return signoff.version === 1 && typeof signoff.approved === 'boolean'
    && typeof signoff.approvedBy === 'string' && Boolean(signoff.approvedBy.trim())
    && typeof signoff.approvedAt === 'string' && Number.isFinite(Date.parse(signoff.approvedAt))
    && Array.isArray(signoff.checks) && Array.isArray(signoff.reportManifest);
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

async function loadEvidence(options: ReleaseReadinessOptions): Promise<{ reports: ReadinessReport[]; signoff: OperatorSignoff }> {
  const signoffPath = path.resolve(options.operatorSignoffPath);
  const rootPath = path.dirname(signoffPath);
  const rootRealPath = await fs.realpath(rootPath);
  const signoff = await readStableJson<unknown>(signoffPath, rootPath, rootRealPath);
  if (!isSignoff(signoff.value)) throw new Error('Operator signoff is malformed');
  const manifest = signoff.value.reportManifest;
  if (manifest.length !== options.reportPaths.length || new Set(manifest.map((entry) => entry.path)).size !== manifest.length) {
    throw new Error('Report manifest does not exactly cover the supplied reports');
  }
  for (const entry of manifest) {
    if (!safeManifestPath(entry.path) || !SHA256.test(entry.sha256)) throw new Error('Report manifest entry is invalid');
  }
  const byPath = new Map(manifest.map((entry) => [pathKey(path.resolve(rootPath, ...entry.path.split('/'))), entry]));
  if (byPath.size !== options.reportPaths.length) throw new Error('Report manifest paths are ambiguous');
  const suppliedPaths = options.reportPaths.map((reportPath) => path.resolve(reportPath));
  if (new Set(suppliedPaths.map(pathKey)).size !== suppliedPaths.length) throw new Error('Supplied report paths are duplicated');
  const reports: ReadinessReport[] = [];
  for (const candidate of suppliedPaths) {
    const expected = byPath.get(pathKey(candidate));
    if (!expected) throw new Error('Supplied report is absent from the signed manifest');
    const captured = await readStableJson<unknown>(candidate, rootPath, rootRealPath);
    if (captured.sha256 !== expected.sha256 || !isReadinessReport(captured.value)) throw new Error('Report hash or shape is invalid');
    reports.push(captured.value);
  }
  return { reports, signoff: signoff.value };
}

function evaluate(reports: ReadinessReport[], signoff: OperatorSignoff): { checks: ReadinessCheck[]; minutes: number } {
  const backup = reports.filter((report) => report.stage === 'backup');
  const executedBackups = backup.filter((report) => report.checks.some((check) => check.id === 'backup.execute'));
  const rehearsals = reports.filter((report) => report.stage === 'rehearsal');
  const smokes = reports.filter((report) => report.stage === 'smoke');
  const allReportsPassed = reports.length > 0 && reports.every((report) => report.status === 'passed');
  const first = rehearsals[0];
  const second = rehearsals[1];
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
  result.set('backup.executed', executedBackups.length === 1 && checkPassed(executedBackups[0], 'backup.execute'));
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
  const maxDuration = rehearsals.length === 2 ? Math.max(first.durationMs, second.durationMs) : 0;
  return { checks, minutes: maxDuration ? Math.ceil((2 * maxDuration) / 60_000) : 0 };
}

export async function runReleaseReadiness(options: ReleaseReadinessOptions): Promise<ReleaseReadinessReport> {
  if (!isSafeRunId(options.runId)) throw Object.assign(new Error('runId must be a safe, non-empty identifier'), { code: 'INVALID_RUN_ID' });
  if (!options.outputDirectory.trim() || !options.operatorSignoffPath.trim() || !options.reportPaths.length) {
    throw Object.assign(new Error('reports, operator signoff and output directory are required'), { code: 'INVALID_PARAMETERS' });
  }
  const started = Date.now();
  let checks: ReadinessCheck[];
  let maintenanceWindowMinutes = 0;
  try {
    const evidence = await loadEvidence(options);
    ({ checks, minutes: maintenanceWindowMinutes } = evaluate(evidence.reports, evidence.signoff));
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
