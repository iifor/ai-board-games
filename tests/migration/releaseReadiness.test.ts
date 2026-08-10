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
const RELEASE_CANDIDATE = '0123456789abcdef0123456789abcdef01234567';

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

function uniqueEvidencePaths(candidates: string[]): string[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const resolved = path.resolve(candidate);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface Fixture {
  root: string;
  reportPaths: string[];
  artifactPaths: string[];
  signoffPath: string;
  outputDirectory: string;
  reports: ReadinessReport[];
  signoff: Record<string, unknown>;
  persist(readinessRunId?: string): Promise<void>;
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'release-readiness-'));
  const reportsDirectory = path.join(root, 'reports');
  const artifactsDirectory = path.join(root, 'artifacts');
  await fs.mkdir(reportsDirectory);
  await fs.mkdir(artifactsDirectory);
  const artifactPaths = [
    'backup.sqlite', 'backup-manifest.json',
    'rehearsal-1-migration.json', 'rehearsal-1-validation.json',
    'rehearsal-2-migration.json', 'rehearsal-2-validation.json',
    'restore.sqlite', 'restore-manifest.json', 'environment-tls.log',
  ].map((name) => path.join(artifactsDirectory, name));
  for (const [index, candidate] of artifactPaths.entries()) {
    await fs.writeFile(candidate, `artifact-${index}\n`);
  }
  const reports = [
    readinessReport('backup-1', 'backup', [
      { id: 'backup.execute', status: 'passed', message: 'executed' },
      { id: 'backup.publish', status: 'passed', message: 'published' },
      { id: 'source.raw-wal', status: 'skipped', message: 'Source SQLite WAL sidecar does not exist; no file fabricated' },
      { id: 'source.raw-shm', status: 'skipped', message: 'Source SQLite SHM sidecar does not exist; no file fabricated' },
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
  reports[0].artifacts = [
    { type: 'backup', path: artifactPaths[0], sha256: await sha256(artifactPaths[0]) },
    { type: 'manifest', path: artifactPaths[1], sha256: await sha256(artifactPaths[1]) },
  ];
  reports[1].artifacts = [
    { type: 'migration-report', path: artifactPaths[2] },
    { type: 'validation-report', path: artifactPaths[3] },
    { type: 'smoke-report', path: reportPaths[3] },
  ];
  reports[2].artifacts = [
    { type: 'migration-report', path: artifactPaths[4] },
    { type: 'validation-report', path: artifactPaths[5] },
    { type: 'smoke-report', path: reportPaths[4] },
  ];
  reports[6].artifacts = [
    { type: 'backup', path: artifactPaths[6], sha256: await sha256(artifactPaths[6]) },
    { type: 'manifest', path: artifactPaths[7], sha256: await sha256(artifactPaths[7]) },
  ];
  const signoffPath = path.join(root, 'operator-signoff.json');
  const outputDirectory = path.join(root, 'output');
  const signoff: Record<string, unknown> = {};

  const fixture: Fixture = {
    root,
    reportPaths,
    artifactPaths,
    signoffPath,
    outputDirectory,
    reports,
    signoff,
    async persist(readinessRunId = 'release-pass') {
      for (let index = 0; index < reports.length; index += 1) {
        await fs.writeFile(reportPaths[index], `${JSON.stringify(reports[index], null, 2)}\n`);
      }
      Object.assign(signoff, {
        releaseCandidate: RELEASE_CANDIDATE,
        readinessRunId,
        goLiveOwner: { name: 'go-live-owner', approvedAt: '2026-08-10T01:55:00.000Z' },
        rollbackOwner: { name: 'rollback-owner', approvedAt: '2026-08-10T01:56:00.000Z' },
        maintenanceWindowMinutes: 3,
        status: 'approved',
        version: 1,
        approved: true,
        approvedBy: 'independent-release-operator',
        approvedAt: '2026-08-10T02:00:00.000Z',
        checks: OPERATOR_CHECKS.map((id) => ({ id, status: 'passed' })),
        reportManifest: await Promise.all(uniqueEvidencePaths([
          ...reportPaths,
          ...reports.flatMap((report) => (
            Array.isArray(report.artifacts) ? report.artifacts.map((artifact) => path.resolve(artifact.path)) : []
          )),
        ]).map(async (candidate) => ({
          path: path.relative(root, candidate).split(path.sep).join('/'),
          sizeBytes: (await fs.stat(candidate)).size,
          sha256: await sha256(candidate),
        }))),
      });
      await fs.writeFile(signoffPath, `${JSON.stringify(signoff, null, 2)}\n`);
    },
  };
  return fixture;
}

async function runFixture(fixture: Fixture, runId = `release-${Date.now()}-${Math.random().toString(16).slice(2)}`) {
  await fixture.persist(runId);
  return runReleaseReadiness({
    runId,
    releaseCandidate: RELEASE_CANDIDATE,
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

test('accepts immutable raw evidence artifacts in the signed manifest closure', async (t) => {
  const fixture = await createFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  fixture.reports[5].artifacts = [
    { type: 'evidence', path: fixture.artifactPaths[8], sha256: await sha256(fixture.artifactPaths[8]) },
  ];

  assert.equal((await runFixture(fixture, 'release-raw-evidence')).status, 'passed');
});

test('fails when a required report is missing or any input report failed', async (t) => {
  const missing = await createFixture();
  const missingRestore = await createFixture();
  const failed = await createFixture();
  t.after(() => Promise.all([missing, missingRestore, failed].map((item) => fs.rm(item.root, { recursive: true, force: true }))));
  missing.reportPaths.splice(4, 1);
  missing.reports.splice(4, 1);
  missing.reports[2].artifacts = missing.reports[2].artifacts.filter((artifact) => artifact.type !== 'smoke-report');
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

  await tampered.persist('release-tampered');
  await fs.appendFile(tampered.reportPaths[0], 'tampered');
  const tamperedResult = await runReleaseReadiness({
    runId: 'release-tampered', reportPaths: tampered.reportPaths,
    releaseCandidate: RELEASE_CANDIDATE,
    outputDirectory: tampered.outputDirectory, operatorSignoffPath: tampered.signoffPath,
  });
  assert.equal(tamperedResult.status, 'failed');

  await escaped.persist('release-escaped');
  const signoff = JSON.parse(await fs.readFile(escaped.signoffPath, 'utf8'));
  signoff.reportManifest[0].path = '../outside.json';
  await fs.writeFile(escaped.signoffPath, JSON.stringify(signoff));
  const escapedResult = await runReleaseReadiness({
    runId: 'release-escaped', reportPaths: escaped.reportPaths,
    releaseCandidate: RELEASE_CANDIDATE,
    outputDirectory: escaped.outputDirectory, operatorSignoffPath: escaped.signoffPath,
  });
  assert.equal(escapedResult.status, 'failed');
});

test('fails closed when a report omits its required artifact evidence', async (t) => {
  const fixture = await createFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  fixture.reports[0].artifacts = [];

  assert.equal((await runFixture(fixture)).status, 'failed');
});

test('fails closed when signed artifact bytes, size, path, or claims are invalid', async (t) => {
  const fixtures = await Promise.all(['missing', 'tampered', 'size', 'escape', 'conflict'].map(() => createFixture()));
  t.after(() => Promise.all(fixtures.map((fixture) => fs.rm(fixture.root, { recursive: true, force: true }))));

  await fixtures[0].persist('release-artifact-case-0');
  await fs.rm(fixtures[0].artifactPaths[0]);

  await fixtures[1].persist('release-artifact-case-1');
  await fs.appendFile(fixtures[1].artifactPaths[0], 'tampered');

  await fixtures[2].persist('release-artifact-case-2');
  const sizeSignoff = JSON.parse(await fs.readFile(fixtures[2].signoffPath, 'utf8'));
  sizeSignoff.reportManifest.find((entry: { path: string }) => entry.path.endsWith('backup.sqlite')).sizeBytes += 1;
  await fs.writeFile(fixtures[2].signoffPath, JSON.stringify(sizeSignoff));

  const outside = path.join(path.dirname(fixtures[3].root), `${path.basename(fixtures[3].root)}-outside.bin`);
  await fs.writeFile(outside, 'outside');
  t.after(() => fs.rm(outside, { force: true }));
  fixtures[3].reports[0].artifacts[0].path = outside;

  fixtures[4].reports[1].artifacts[1].path = fixtures[4].reports[1].artifacts[0].path;

  for (const [index, fixture] of fixtures.entries()) {
    const result = fixture === fixtures[0] || fixture === fixtures[1] || fixture === fixtures[2]
      ? await runReleaseReadiness({
        runId: `release-artifact-case-${index}`,
        releaseCandidate: RELEASE_CANDIDATE,
        reportPaths: fixture.reportPaths,
        outputDirectory: fixture.outputDirectory,
        operatorSignoffPath: fixture.signoffPath,
      })
      : await runFixture(fixture);
    assert.equal(result.status, 'failed');
    assert.doesNotMatch(JSON.stringify(result), new RegExp(path.basename(fixture.root), 'i'));
  }
});

test('fails closed when a passed candidate contains non-passed checks, errors, or incomplete shape', async (t) => {
  const fixtures = await Promise.all(['check', 'errors', 'shape'].map(() => createFixture()));
  t.after(() => Promise.all(fixtures.map((fixture) => fs.rm(fixture.root, { recursive: true, force: true }))));
  fixtures[0].reports[5].checks.push({ id: 'adversarial.hidden', status: 'failed', message: 'must fail closed' });
  fixtures[1].reports[5].errors.push({ code: 'HIDDEN_ERROR', message: 'must fail closed' });
  (fixtures[2].reports[5] as unknown as { artifacts?: unknown }).artifacts = undefined;

  for (const fixture of fixtures) assert.equal((await runFixture(fixture)).status, 'failed');
});

test('fails closed when operator signoff contains a failed internal check', async (t) => {
  const fixture = await createFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  await fixture.persist('release-failed-signoff-check');
  const signoff = JSON.parse(await fs.readFile(fixture.signoffPath, 'utf8'));
  signoff.checks.push({ id: 'adversarial.hidden', status: 'failed' });
  await fs.writeFile(fixture.signoffPath, JSON.stringify(signoff));

  const result = await runReleaseReadiness({
    runId: 'release-failed-signoff-check',
    releaseCandidate: RELEASE_CANDIDATE,
    reportPaths: fixture.reportPaths,
    outputDirectory: fixture.outputDirectory,
    operatorSignoffPath: fixture.signoffPath,
  });
  assert.equal(result.status, 'failed');
});

test('fails closed when plan-critical signoff identity, candidate, run, window, or status is invalid', async (t) => {
  const cases: Array<[string, (signoff: Record<string, any>) => void]> = [
    ['candidate', (signoff) => { signoff.releaseCandidate = 'f'.repeat(40); }],
    ['placeholder candidate', (signoff) => { signoff.releaseCandidate = '0'.repeat(40); }],
    ['run', (signoff) => { signoff.readinessRunId = 'another-release-run'; }],
    ['owners', (signoff) => { signoff.rollbackOwner.name = signoff.goLiveOwner.name; }],
    ['operator', (signoff) => { signoff.approvedBy = signoff.rollbackOwner.name; }],
    ['window', (signoff) => { signoff.maintenanceWindowMinutes = 2; }],
    ['status', (signoff) => { signoff.status = 'pending'; signoff.approved = false; }],
  ];
  for (const [name, mutate] of cases) {
    const fixture = await createFixture();
    t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
    await fixture.persist('release-signoff-contract');
    const signoff = JSON.parse(await fs.readFile(fixture.signoffPath, 'utf8')) as Record<string, any>;
    mutate(signoff);
    await fs.writeFile(fixture.signoffPath, JSON.stringify(signoff));
    const result = await runReleaseReadiness({
      runId: 'release-signoff-contract',
      releaseCandidate: RELEASE_CANDIDATE,
      reportPaths: fixture.reportPaths,
      outputDirectory: fixture.outputDirectory,
      operatorSignoffPath: fixture.signoffPath,
    });
    assert.equal(result.status, 'failed', name);
  }
});

test('rejects a placeholder release candidate before reading evidence', async () => {
  await assert.rejects(
    () => runReleaseReadiness({
      runId: 'release-placeholder-candidate',
      releaseCandidate: '0'.repeat(40),
      reportPaths: ['not-read.json'],
      outputDirectory: 'not-written',
      operatorSignoffPath: 'not-read-signoff.json',
    }),
    (error: unknown) => (error as { code?: string }).code === 'INVALID_PARAMETERS',
  );
});

test('fails when a final required gate is skipped even though optional producer checks may skip', async (t) => {
  const fixture = await createFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const required = fixture.reports[5].checks.find((check) => check.id === 'runtime.no-sqlite');
  assert.ok(required);
  required.status = 'skipped';

  assert.equal((await runFixture(fixture)).status, 'failed');
});

test('fails when an undeclared producer check is skipped', async (t) => {
  const fixture = await createFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  fixture.reports[0].checks.push({ id: 'producer.unknown-optional', status: 'skipped', message: 'not a declared optional check' });

  assert.equal((await runFixture(fixture)).status, 'failed');
});

test('fails when a backup-only optional check is skipped by another report stage', async (t) => {
  const fixture = await createFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  fixture.reports[5].checks.push({ id: 'source.raw-wal', status: 'skipped', message: 'wrong producer stage' });

  assert.equal((await runFixture(fixture)).status, 'failed');
});

test('fails when independent rehearsals reuse one or all artifact paths, including aliases', async (t) => {
  const variantNames = [
    'one-shared-artifact',
    'all-shared-artifacts',
    'lexical-path-alias',
    ...(process.platform === 'win32' ? ['case-path-alias'] : []),
  ];
  const fixtures = await Promise.all(variantNames.map(() => createFixture()));
  t.after(() => Promise.all(fixtures.map((fixture) => fs.rm(fixture.root, { recursive: true, force: true }))));

  fixtures[0].reports[2].artifacts[0].path = fixtures[0].reports[1].artifacts[0].path;
  fixtures[1].reports[2].artifacts = fixtures[1].reports[1].artifacts.map((artifact) => ({ ...artifact }));
  const shared = fixtures[2].reports[1].artifacts[0].path;
  fixtures[2].reports[2].artifacts[0].path = path.join(path.dirname(shared), 'alias-segment', '..', path.basename(shared));
  if (process.platform === 'win32') {
    fixtures[3].reports[2].artifacts[0].path = fixtures[3].reports[1].artifacts[0].path.toUpperCase();
  }

  for (const [index, fixture] of fixtures.entries()) {
    assert.equal((await runFixture(fixture)).status, 'failed', variantNames[index]);
  }
});
