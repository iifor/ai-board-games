import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildManifest, hashFile } from '../../packages/db-migrator/src/backup/manifest';
import { runCutover } from '../../packages/db-migrator/src/commands/cutover';
import { writeReadinessReport } from '../../packages/db-migrator/src/reporting/reportWriter';
import type { ReadinessReport } from '../../packages/db-migrator/src/reporting/reportTypes';
import type { MigrationReport } from '../../packages/db-migrator/src/types';

const RELEASE = '0123456789abcdef0123456789abcdef01234567';
const NOW = new Date('2026-08-11T03:30:00.000Z');

async function createFixture(runId = 'production-cutover') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cutover-command-'));
  const backup = path.join(root, 'backup');
  await fs.mkdir(path.join(backup, 'sqlite-raw'), { recursive: true });
  const sourceSnapshotPath = path.join(backup, 'sqlite-consistent.sqlite');
  await fs.writeFile(sourceSnapshotPath, 'consistent-snapshot');
  await fs.writeFile(path.join(backup, 'sqlite-raw', 'source.sqlite'), 'raw-snapshot');
  const sourceManifestPath = path.join(backup, 'manifest.json');
  const manifest = await buildManifest(backup, 'backup-run');
  await fs.writeFile(sourceManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const caPath = path.join(root, 'ca.crt');
  await fs.writeFile(caPath, 'test-ca');
  const authorizationPath = path.join(root, `${runId}-authorization-input.json`);
  await fs.writeFile(authorizationPath, `${JSON.stringify({
    version: 1, purpose: 'production-cutover', status: 'approved', approved: true,
    releaseCandidate: RELEASE, cutoverRunId: runId,
    backupManifestSha256: await hashFile(sourceManifestPath),
    sourceSnapshotSha256: await hashFile(sourceSnapshotPath),
    target: {
      database: 'consensus', schema: 'consensus', role: 'consensus_migrator',
      host: 'postgres', port: 5432, tlsMode: 'verify-full',
    },
    maintenanceWindow: { startsAt: '2026-08-11T03:00:00.000Z', endsAt: '2026-08-11T04:00:00.000Z' },
    approvals: [
      { role: 'go-live-owner', name: 'Alice Operator', approvedAt: '2026-08-11T02:40:00.000Z' },
      { role: 'rollback-owner', name: 'Bob Operator', approvedAt: '2026-08-11T02:41:00.000Z' },
      { role: 'independent-reviewer', name: 'Carol Reviewer', approvedAt: '2026-08-11T02:42:00.000Z' },
    ],
  }, null, 2)}\n`);
  return {
    root,
    options: {
      runId, sourceSnapshotPath, sourceManifestPath, authorizationPath,
      outputDirectory: path.join(root, 'evidence'), execute: true,
      targetUrl: 'postgresql://consensus_migrator:secret@postgres:5432/consensus?sslmode=verify-full',
      releaseCandidate: RELEASE, tlsMode: 'verify-full', caPath,
    },
  };
}

function migrationReport(sourcePath: string): MigrationReport {
  return {
    status: 'succeeded', sourcePath, targetSchema: 'consensus',
    startedAt: NOW.toISOString(), durationMs: 1, tables: {}, skippedTables: [], errors: [], validation: 'passed',
  };
}

async function phaseReport(
  options: { runId: string; targetSchema: string; outputDirectory: string },
  stage: 'validation' | 'smoke',
  status: 'passed' | 'failed',
): Promise<ReadinessReport> {
  const report: ReadinessReport = {
    runId: options.runId, schema: options.targetSchema, stage, status,
    startedAt: NOW.toISOString(), finishedAt: NOW.toISOString(), durationMs: 0,
    checks: [{ id: `${stage}.complete`, status, message: `${stage} ${status}` }],
    artifacts: [], errors: status === 'failed' ? [{ code: `${stage.toUpperCase()}_FAILED`, message: `${stage} failed` }] : [],
  };
  await writeReadinessReport({ outputDirectory: options.outputDirectory, report });
  return report;
}

test('cutover dry-run verifies source inputs but makes zero database calls and zero output writes', async () => {
  const fixture = await createFixture('dry-cutover');
  const output = fixture.options.outputDirectory;
  try {
    const result = await runCutover({ ...fixture.options, authorizationPath: undefined, execute: false }, {
      now: () => NOW,
      reserveEvidence: async () => assert.fail('dry-run must not reserve output'),
      openTargetSession: async () => assert.fail('dry-run must not connect PostgreSQL'),
      createSchema: async () => assert.fail('dry-run must not create schema'),
      migrate: async () => assert.fail('dry-run must not import'),
      validate: async () => assert.fail('dry-run must not validate target'),
      smoke: async () => assert.fail('dry-run must not run smoke'),
    });
    assert.equal(result.status, 'passed');
    assert.equal(result.stage, 'cutover');
    assert.equal(result.checks.find((check) => check.id === 'execution')?.status, 'skipped');
    assert.equal(await fs.stat(output).then(() => true, () => false), false);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('cutover keeps one session through all phases and publishes the complete successful closure', async () => {
  const fixture = await createFixture();
  const calls: string[] = [];
  try {
    const result = await runCutover(fixture.options, {
      now: () => NOW,
      openTargetSession: async () => ({
        client: {} as never,
        release: async () => {
          calls.push('release');
          await fs.access(path.join(fixture.options.outputDirectory, 'production-cutover-cutover.json'));
        },
      }),
      createSchema: async () => { calls.push('schema'); },
      migrate: async (options) => { calls.push('import'); return migrationReport(options.sourcePath); },
      validate: async (options) => {
        calls.push(`validate:${options.runId}:${options.targetSchema}`);
        return phaseReport(options, 'validation', 'passed');
      },
      smoke: async (options) => {
        calls.push(`smoke:${options.runId}:${options.targetSchema}`);
        assert.equal((options as typeof options & { productionCutover?: boolean }).productionCutover, true);
        return phaseReport(options, 'smoke', 'passed');
      },
    });
    assert.equal(result.status, 'passed');
    for (const id of ['source.manifest.sha256', 'authorization.sha256', 'release.candidate']) {
      assert.match(result.checks.find((check) => check.id === id)?.actual || '', id === 'release.candidate' ? /^[a-f0-9]{40}$/ : /^[a-f0-9]{64}$/);
    }
    const targetCheck = result.checks.find((check) => check.id === 'target.safe');
    assert.equal(targetCheck?.actual, 'database=consensus;schema=consensus;role=consensus_migrator;tls=verify-full');
    assert.doesNotMatch(JSON.stringify(result), /postgresql:\/\/|@postgres|:5432|secret/i);
    assert.deepEqual(calls, [
      'schema', 'import', 'validate:production-cutover:consensus',
      'smoke:production-cutover:consensus', 'release',
    ]);
    assert.deepEqual(result.artifacts.map((artifact) => artifact.type), [
      'owner-receipt', 'authorization', 'manifest', 'migration-report', 'validation-report', 'smoke-report',
    ]);
    for (const artifact of result.artifacts) {
      assert.match(artifact.sha256 || '', /^[a-f0-9]{64}$/);
      await fs.access(path.join(fixture.options.outputDirectory, artifact.path));
    }
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('cutover validation failure suppresses smoke while preserving reservation, schema, and fixed reports', async () => {
  const fixture = await createFixture('validation-failure');
  let smokeCalled = false;
  try {
    const result = await runCutover(fixture.options, {
      now: () => NOW,
      openTargetSession: async () => ({ client: {} as never, release: async () => undefined }),
      createSchema: async () => undefined,
      migrate: async (options) => migrationReport(options.sourcePath),
      validate: async (options) => phaseReport(options, 'validation', 'failed'),
      smoke: async () => { smokeCalled = true; return assert.fail('smoke must be suppressed'); },
    });
    assert.equal(result.status, 'failed');
    assert.equal(smokeCalled, false);
    assert.equal(result.checks.find((check) => check.id === 'validation')?.status, 'failed');
    await fs.access(path.join(fixture.options.outputDirectory, 'validation-failure-owner-receipt.json'));
    await fs.access(path.join(fixture.options.outputDirectory, 'validation-failure-migration.json'));
    await fs.access(path.join(fixture.options.outputDirectory, 'validation-failure-validation.json'));
    await fs.access(path.join(fixture.options.outputDirectory, 'validation-failure-cutover.json'));
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('cutover rejects an unsafe environment before reservation or database access', async () => {
  const fixture = await createFixture('unsafe-environment');
  let reservationCalled = false;
  try {
    await assert.rejects(runCutover({
      ...fixture.options,
      targetUrl: 'postgresql://consensus_migrator:secret@wrong-host:5432/consensus?sslmode=verify-full',
    }, {
      now: () => NOW,
      reserveEvidence: async () => {
        reservationCalled = true;
        return assert.fail('unsafe environment must not reserve evidence');
      },
      openTargetSession: async () => assert.fail('unsafe environment must not connect'),
    }), (error: unknown) => (error as { code?: string }).code === 'CUTOVER_TARGET_UNSAFE');
    assert.equal(reservationCalled, false);
    assert.equal(await fs.stat(fixture.options.outputDirectory).then(() => true, () => false), false);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('cutover smoke failure preserves its report, fails closure, and releases the held session', async () => {
  const fixture = await createFixture('smoke-failure');
  let released = false;
  try {
    const result = await runCutover(fixture.options, {
      now: () => NOW,
      openTargetSession: async () => ({ client: {} as never, release: async () => { released = true; } }),
      createSchema: async () => undefined,
      migrate: async (options) => migrationReport(options.sourcePath),
      validate: async (options) => phaseReport(options, 'validation', 'passed'),
      smoke: async (options) => phaseReport(options, 'smoke', 'failed'),
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.checks.find((check) => check.id === 'smoke')?.status, 'failed');
    assert.equal(released, true);
    await fs.access(path.join(fixture.options.outputDirectory, 'smoke-failure-smoke.json'));
    await fs.access(path.join(fixture.options.outputDirectory, 'smoke-failure-cutover.json'));
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('cutover session close failure never replaces an already-recorded phase failure', async () => {
  const fixture = await createFixture('primary-before-close');
  try {
    const result = await runCutover(fixture.options, {
      now: () => NOW,
      openTargetSession: async () => ({
        client: {} as never,
        release: async () => { throw Object.assign(new Error('close failed'), { code: 'CUTOVER_SESSION_CLOSE_FAILED' }); },
      }),
      createSchema: async () => undefined,
      migrate: async (options) => migrationReport(options.sourcePath),
      validate: async (options) => phaseReport(options, 'validation', 'failed'),
      smoke: async () => assert.fail('smoke must remain suppressed'),
    });
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.errors.map((error) => error.code), ['CUTOVER_VALIDATION_FAILED']);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
