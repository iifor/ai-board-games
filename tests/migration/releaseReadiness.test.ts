import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { ReadinessCheck, ReadinessReport } from '../../packages/db-migrator/src/reporting/reportTypes';
import { runReleaseReadiness } from '../../packages/db-migrator/src/commands/release-readiness';

const OPERATOR_CHECKS = [
  'ci.release-gates',
  'tests.no-critical-skips',
  'backup.restore-drill',
  'runtime.no-sqlite',
  'postgres.tls',
  'postgres.least-privilege',
  'postgres.pool-and-timeouts',
  'docs.runtime-truth',
  'operator.signoff',
] as const;

function readinessReport(
  runId: string,
  stage: ReadinessReport['stage'],
  checks: ReadinessCheck[],
  overrides: Partial<ReadinessReport> = {},
): ReadinessReport {
  return {
    runId,
    stage,
    status: 'passed',
    startedAt: '2026-08-10T00:00:00.000Z',
    finishedAt: '2026-08-10T00:01:00.000Z',
    durationMs: 60_000,
    checks,
    artifacts: [],
    errors: [],
    ...overrides,
  };
}

function smokeChecks(): ReadinessCheck[] {
  return [
    'health.connected',
    'health.disconnected',
    'auth.initial-password-change',
    'config.read-and-crud',
    'undercover.persisted-without-external-calls',
    'history.detail-and-replay-order',
    'memory.created-and-updated',
    'workflow.observability-delete',
    'teardown.observability-drained',
  ].map((id) => ({ id, status: 'passed', message: `${id} passed` }));
}

async function sha256(candidate: string): Promise<string> {
  return createHash('sha256').update(await fs.readFile(candidate)).digest('hex');
}

interface Fixture {
  root: string;
  reportPaths: string[];
  signoffPath: string;
  outputDirectory: string;
  reports: ReadinessReport[];
  signoff: Record<string, unknown>;
  persist(): Promise<void>;
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'release-readiness-'));
  const reportsDirectory = path.join(root, 'reports');
  await fs.mkdir(reportsDirectory);
  const reports = [
    readinessReport('backup-1', 'backup', [
      { id: 'backup.execute', status: 'passed', message: 'executed' },
      { id: 'backup.publish', status: 'passed', message: 'published' },
    ]),
    readinessReport('rehearsal-1', 'rehearsal', [
      { id: 'source.snapshot.sha256', status: 'passed', expected: 'a'.repeat(64), actual: 'a'.repeat(64), message: 'verified' },
      { id: 'validation', status: 'passed', message: 'passed' },
      { id: 'smoke', status: 'passed', message: 'passed' },
    ], { schema: 'consensus_rehearsal_a', durationMs: 61_000 }),
    readinessReport('rehearsal-2', 'rehearsal', [
      { id: 'source.snapshot.sha256', status: 'passed', expected: 'a'.repeat(64), actual: 'a'.repeat(64), message: 'verified' },
      { id: 'validation', status: 'passed', message: 'passed' },
      { id: 'smoke', status: 'passed', message: 'passed' },
    ], { schema: 'consensus_rehearsal_b', durationMs: 30_000 }),
    readinessReport('rehearsal-1', 'smoke', smokeChecks(), { schema: 'consensus_rehearsal_a' }),
    readinessReport('rehearsal-2', 'smoke', smokeChecks(), { schema: 'consensus_rehearsal_b' }),
    readinessReport('environment-1', 'release', OPERATOR_CHECKS.map((id) => ({
      id,
      status: 'passed',
      message: `${id} passed`,
    }))),
    readinessReport('restore-drill-1', 'backup', [
      { id: 'backup.restore-drill', status: 'passed', message: 'isolated restore passed' },
    ]),
  ];
  const reportPaths = reports.map((_report, index) => path.join(reportsDirectory, `report-${index + 1}.json`));
  const signoffPath = path.join(root, 'operator-signoff.json');
  const outputDirectory = path.join(root, 'output');
  const signoff: Record<string, unknown> = {};

  const fixture: Fixture = {
    root,
    reportPaths,
    signoffPath,
    outputDirectory,
    reports,
    signoff,
    async persist() {
      for (let index = 0; index < reports.length; index += 1) {
        await fs.writeFile(reportPaths[index], `${JSON.stringify(reports[index], null, 2)}\n`);
      }
      Object.assign(signoff, {
        version: 1,
        approved: true,
        approvedBy: 'release-operator',
        approvedAt: '2026-08-10T02:00:00.000Z',
        checks: OPERATOR_CHECKS.map((id) => ({ id, status: 'passed' })),
        reportManifest: await Promise.all(reportPaths.map(async (candidate) => ({
          path: path.relative(root, candidate).split(path.sep).join('/'),
          sha256: await sha256(candidate),
        }))),
      });
      await fs.writeFile(signoffPath, `${JSON.stringify(signoff, null, 2)}\n`);
    },
  };
  return fixture;
}

async function runFixture(fixture: Fixture, runId = `release-${Date.now()}-${Math.random().toString(16).slice(2)}`) {
  await fixture.persist();
  return runReleaseReadiness({
    runId,
    reportPaths: fixture.reportPaths,
    outputDirectory: fixture.outputDirectory,
    operatorSignoffPath: fixture.signoffPath,
  });
}

test('passes only complete evidence and computes a three-minute maintenance window', async (t) => {
  const fixture = await createFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));

  const result = await runFixture(fixture, 'release-pass');

  assert.equal(result.status, 'passed');
  assert.equal((result as ReadinessReport & { maintenanceWindowMinutes?: number }).maintenanceWindowMinutes, 3);
  assert.deepEqual(result.checks.map((check) => check.id), [
    'ci.release-gates', 'tests.no-critical-skips', 'backup.executed', 'backup.restore-drill',
    'rehearsal.first', 'rehearsal.second', 'rehearsal.same-source-hash', 'runtime.no-sqlite',
    'postgres.tls', 'postgres.least-privilege', 'postgres.pool-and-timeouts', 'smoke.health',
    'smoke.auth-and-config', 'smoke.game-replay-memory-delete', 'docs.runtime-truth', 'operator.signoff',
  ]);
  await fs.access(path.join(fixture.outputDirectory, 'release-pass-release.json'));
  await fs.access(path.join(fixture.outputDirectory, 'release-pass-release.md'));
});

test('fails when a required report is missing or any input report failed', async (t) => {
  const missing = await createFixture();
  const missingRestore = await createFixture();
  const failed = await createFixture();
  t.after(() => Promise.all([missing, missingRestore, failed].map((item) => fs.rm(item.root, { recursive: true, force: true }))));
  missing.reportPaths.splice(4, 1);
  missing.reports.splice(4, 1);
  assert.equal((await runFixture(missing)).status, 'failed');
  missingRestore.reportPaths.pop();
  missingRestore.reports.pop();
  assert.equal((await runFixture(missingRestore)).status, 'failed');
  failed.reports[1].status = 'failed';
  failed.reports[1].errors = [{ code: 'FAILED', message: 'failed' }];
  assert.equal((await runFixture(failed)).status, 'failed');
});

test('fails when rehearsals are not independent or do not use the same source hash', async (t) => {
  const cases = await Promise.all(['hash', 'schema', 'run', 'internal-hash'].map(() => createFixture()));
  t.after(() => Promise.all(cases.map((item) => fs.rm(item.root, { recursive: true, force: true }))));
  cases[0].reports[2].checks[0].actual = 'b'.repeat(64);
  cases[1].reports[2].schema = cases[1].reports[1].schema;
  cases[2].reports[2].runId = cases[2].reports[1].runId;
  cases[3].reports[2].checks[0].expected = 'b'.repeat(64);
  for (const fixture of cases) assert.equal((await runFixture(fixture)).status, 'failed');
});

test('fails when backup is dry-run or any operational gate is absent', async (t) => {
  const dryRun = await createFixture();
  t.after(() => fs.rm(dryRun.root, { recursive: true, force: true }));
  dryRun.reports[0].checks[0].status = 'skipped';
  assert.equal((await runFixture(dryRun)).status, 'failed');

  for (const missingId of OPERATOR_CHECKS) {
    const fixture = await createFixture();
    try {
      for (const report of fixture.reports) {
        report.checks = report.checks.filter((check) => check.id !== missingId);
      }
      const result = await runFixture(fixture);
      assert.equal(result.status, 'failed', missingId);
      assert.equal(result.checks.find((check) => check.id === missingId)?.status, 'failed', missingId);
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  }
});

test('fails closed when a report hash or manifest path does not match', async (t) => {
  const tampered = await createFixture();
  const escaped = await createFixture();
  t.after(() => Promise.all([tampered, escaped].map((item) => fs.rm(item.root, { recursive: true, force: true }))));

  await tampered.persist();
  await fs.appendFile(tampered.reportPaths[0], 'tampered');
  const tamperedResult = await runReleaseReadiness({
    runId: 'release-tampered', reportPaths: tampered.reportPaths,
    outputDirectory: tampered.outputDirectory, operatorSignoffPath: tampered.signoffPath,
  });
  assert.equal(tamperedResult.status, 'failed');

  await escaped.persist();
  const signoff = JSON.parse(await fs.readFile(escaped.signoffPath, 'utf8'));
  signoff.reportManifest[0].path = '../outside.json';
  await fs.writeFile(escaped.signoffPath, JSON.stringify(signoff));
  const escapedResult = await runReleaseReadiness({
    runId: 'release-escaped', reportPaths: escaped.reportPaths,
    outputDirectory: escaped.outputDirectory, operatorSignoffPath: escaped.signoffPath,
  });
  assert.equal(escapedResult.status, 'failed');
});
