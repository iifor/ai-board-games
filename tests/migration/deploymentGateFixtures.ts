import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../../packages/db-migrator/src/cli';
import { REQUIRED_RELEASE_CHECKS } from '../../packages/db-migrator/src/commands/release-readiness';

export const RELEASE_CANDIDATE = 'a066a4bb1fb9e49e50c742aa08248239f1d9a136';
export const TOOLING_HEAD = '6469e71bd3f0a54c3b09356daad2be94016f5b87';
export const RUNTIME_DIGEST = `sha256:${'a'.repeat(64)}`;
export const OPS_DIGEST = `sha256:${'b'.repeat(64)}`;
export const CANDIDATE_TREE = 'd'.repeat(40);
export const FREEZE_ID = 'freeze-first-deployment-001';
export const SOURCE_SQLITE = 'packages/data/ai-presenter.sqlite';
export const RESOURCE_PATHS = ['packages/server/resources', 'avatars'];
export const GO_LIVE_OWNER = 'go-live-owner-a';

export function sha256(bytes: string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function writeJson(candidate: string, value: unknown) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(candidate, bytes, 'utf8');
  return { sizeBytes: Buffer.byteLength(bytes), sha256: sha256(bytes) };
}

export async function createFreezeFixture(root: string, now: number) {
  const maintenancePath = path.join(root, 'maintenance-authorization.json');
  const maintenance = {
    version: 1, purpose: 'postgresql-first-deployment-maintenance', status: 'approved',
    changeId: 'change-first-deployment-001', releaseCandidate: RELEASE_CANDIDATE, toolingHead: TOOLING_HEAD,
    approvedAt: new Date(now - 90_000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(),
    approver: { name: 'maintenance-owner-d', approvedAt: new Date(now - 90_000).toISOString() },
  };
  const maintenanceCapture = await writeJson(maintenancePath, maintenance);
  const freezePath = path.join(root, 'freeze-receipt.json');
  const freeze = {
    version: 1, purpose: 'postgresql-first-deployment-freeze', status: 'frozen',
    changeId: maintenance.changeId, freezeId: FREEZE_ID, releaseCandidate: RELEASE_CANDIDATE,
    toolingHead: TOOLING_HEAD, frozenAt: new Date(now - 60_000).toISOString(),
    sourceSqliteRelativePath: SOURCE_SQLITE, resourceRelativePaths: [...RESOURCE_PATHS],
    maintenanceAuthorization: { path: 'maintenance-authorization.json', ...maintenanceCapture },
    checks: [
      { id: 'sqlite-writer.stopped', status: 'passed' },
      { id: 'background-tasks.stopped', status: 'passed' },
    ],
    platformApprover: { name: 'platform-approver-e', approvedAt: new Date(now - 50_000).toISOString() },
  };
  const freezeCapture = await writeJson(freezePath, freeze);
  return { maintenancePath, maintenance, freezePath, freeze, freezeCapture };
}

export async function persistFreezeFixture(fixture: Awaited<ReturnType<typeof createFreezeFixture>>) {
  const capture = await writeJson(fixture.maintenancePath, fixture.maintenance);
  fixture.freeze.maintenanceAuthorization = { path: 'maintenance-authorization.json', ...capture };
  fixture.freezeCapture = await writeJson(fixture.freezePath, fixture.freeze);
}

export async function runFreeze(fixture: Awaited<ReturnType<typeof createFreezeFixture>>, expected: Record<string, string> = {}) {
  return runCli([
    'verify-freeze-receipt', '--receipt', fixture.freezePath,
    '--receipt-sha256', expected.receiptSha256 || fixture.freezeCapture.sha256,
    '--release-candidate', expected.releaseCandidate || RELEASE_CANDIDATE,
    '--tooling-head', expected.toolingHead || TOOLING_HEAD, '--freeze-id', expected.freezeId || FREEZE_ID,
    '--source-sqlite', expected.sourceSqlite || SOURCE_SQLITE,
    '--resources', expected.resources || RESOURCE_PATHS.join(','),
    '--go-live-owner', expected.goLiveOwner || GO_LIVE_OWNER,
  ]);
}

export async function createTrafficFixture(now = Date.now()) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'deployment-traffic-gate-'));
  const freezeFixture = await createFreezeFixture(root, now);
  const inputManifestPath = path.join(root, 'application-input-manifest.json');
  const inputPaths = [
    'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'packages/shared',
    'packages/client', 'packages/admin', 'packages/server', 'packages/db-migrator/package.json',
  ];
  const inputEntries = inputPaths.map((input, index) => ({
    mode: '100644', blobSha1: String(index + 1).repeat(40),
    path: input.includes('.') ? input : `${input}/package.json`,
  })).sort((left, right) => (left.path < right.path ? -1 : (left.path > right.path ? 1 : 0)));
  const inputManifest = {
    version: 1, purpose: 'consensus-application-build-inputs', releaseCandidate: RELEASE_CANDIDATE,
    inputPaths,
    entries: inputEntries,
    manifestSha256: sha256(inputEntries.map((entry) => (
      `${entry.mode} ${entry.blobSha1}\t${entry.path}\n`
    )).join('')),
  };
  const inputManifestCapture = await writeJson(inputManifestPath, inputManifest);
  const buildReceiptPath = path.join(root, 'production-build-receipt.json');
  const buildReceipt = {
    version: 1, purpose: 'postgresql-production-image-build', status: 'built',
    buildId: 'production-build-001', releaseCandidate: RELEASE_CANDIDATE, candidateTree: CANDIDATE_TREE,
    toolingHead: TOOLING_HEAD,
    applicationInputManifest: { path: 'application-input-manifest.json', ...inputManifestCapture },
    applicationInputManifestSha256: inputManifest.manifestSha256,
    runtimeImageDigest: RUNTIME_DIGEST, opsImageDigest: OPS_DIGEST,
    builtAt: new Date(now - 40_000).toISOString(),
  };
  const buildReceiptCapture = await writeJson(buildReceiptPath, buildReceipt);
  const releasePath = path.join(root, 'release.json');
  const release = {
    runId: 'readiness-traffic-gate', stage: 'release', status: 'passed', releaseCandidate: RELEASE_CANDIDATE,
    startedAt: new Date(now - 30_000).toISOString(), finishedAt: new Date(now - 20_000).toISOString(),
    durationMs: 10_000, maintenanceWindowMinutes: 60,
    freezeReceiptSha256: freezeFixture.freezeCapture.sha256,
    checks: REQUIRED_RELEASE_CHECKS.map((id) => ({ id, status: 'passed', message: `Verified evidence: ${id}` })),
    artifacts: [], errors: [],
  };
  const releaseCapture = await writeJson(releasePath, release);
  const authorizationPath = path.join(root, 'traffic-authorization.json');
  const authorization = {
    version: 1, purpose: 'postgresql-first-deployment-traffic', status: 'approved',
    readinessRunId: release.runId, releaseCandidate: RELEASE_CANDIDATE, toolingHead: TOOLING_HEAD,
    runtimeImageDigest: RUNTIME_DIGEST, opsImageDigest: OPS_DIGEST,
    releaseReport: { path: 'release.json', ...releaseCapture },
    buildReceipt: { path: 'production-build-receipt.json', ...buildReceiptCapture },
    freezeReceipt: { path: 'freeze-receipt.json', ...freezeFixture.freezeCapture },
    approvals: [
      { role: 'go-live-owner', name: GO_LIVE_OWNER, approvedAt: new Date(now - 15_000).toISOString() },
      { role: 'rollback-owner', name: 'rollback-owner-b', approvedAt: new Date(now - 14_000).toISOString() },
      { role: 'independent-reviewer', name: 'independent-reviewer-c', approvedAt: new Date(now - 13_000).toISOString() },
    ],
    approvedAt: new Date(now - 12_000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(),
  };
  await writeJson(authorizationPath, authorization);
  return {
    root, authorizationPath, authorization, release, releasePath,
    inputManifestPath, inputManifest, buildReceiptPath, buildReceipt,
    ...freezeFixture,
  };
}

export async function persistTrafficFixture(fixture: Awaited<ReturnType<typeof createTrafficFixture>>) {
  await persistFreezeFixture(fixture);
  const inputCapture = await writeJson(fixture.inputManifestPath, fixture.inputManifest);
  fixture.buildReceipt.applicationInputManifest = { path: 'application-input-manifest.json', ...inputCapture };
  const buildCapture = await writeJson(fixture.buildReceiptPath, fixture.buildReceipt);
  const releaseCapture = await writeJson(fixture.releasePath, fixture.release);
  fixture.authorization.releaseReport = { path: 'release.json', ...releaseCapture };
  fixture.authorization.buildReceipt = { path: 'production-build-receipt.json', ...buildCapture };
  fixture.authorization.freezeReceipt = { path: 'freeze-receipt.json', ...fixture.freezeCapture };
  await writeJson(fixture.authorizationPath, fixture.authorization);
}

export async function runTraffic(fixture: Awaited<ReturnType<typeof createTrafficFixture>>, expected: Record<string, string> = {}) {
  return runCli([
    'verify-traffic-authorization', '--authorization', fixture.authorizationPath,
    '--release-candidate', expected.releaseCandidate || RELEASE_CANDIDATE,
    '--tooling-head', expected.toolingHead || TOOLING_HEAD,
    '--runtime-image-digest', expected.runtimeImageDigest || RUNTIME_DIGEST,
    '--ops-image-digest', expected.opsImageDigest || OPS_DIGEST,
    '--candidate-tree', expected.candidateTree || CANDIDATE_TREE,
    '--application-input-manifest-sha256', expected.applicationInputManifestSha256 || fixture.inputManifest.manifestSha256,
    '--runtime-application-input-sha256', expected.runtimeApplicationInputSha256 || fixture.inputManifest.manifestSha256,
  ]);
}

const OBSERVATION_CHECKS = [
  'health.recorded', 'pool-saturation.recorded', 'slow-queries.recorded', 'errors.recorded',
  'business-writes.recorded', 'disk-volume.recorded', 'postgresql-backup-restore.passed',
] as const;

export async function createObservationFixture() {
  const traffic = await createTrafficFixture(Date.now() - 3 * 60 * 60 * 1000);
  const trafficAuthorizationSha256 = sha256(await fs.readFile(traffic.authorizationPath, 'utf8'));
  const now = Date.now();
  const startedAt = new Date(now - 7_200_000).toISOString();
  const finishedAt = new Date(now - 3_000_000).toISOString();
  const restorePath = path.join(traffic.root, 'postgresql-backup-restore.json');
  const restore = {
    version: 1, purpose: 'postgresql-backup-restore-test', status: 'passed',
    readinessRunId: traffic.authorization.readinessRunId, trafficAuthorizationSha256,
    backupId: 'postgresql-backup-after-first-deployment', restoreTarget: 'isolated-restore-target',
    backupCreatedAt: new Date(now - 6_000_000).toISOString(), startedAt: new Date(now - 3_100_000).toISOString(),
    finishedAt: new Date(now - 2_900_000).toISOString(), isolatedTarget: true,
  };
  const restoreCapture = await writeJson(restorePath, restore);
  const observationPath = path.join(traffic.root, 'observation.json');
  const observation = {
    version: 1, purpose: 'postgresql-first-deployment-observation', status: 'completed',
    readinessRunId: traffic.authorization.readinessRunId, trafficAuthorizationSha256,
    startedAt, finishedAt, postgresqlBusinessWritesObserved: true,
    checks: OBSERVATION_CHECKS.map((id) => ({ id, status: 'passed' })),
    backupRestoreReceipt: { path: 'postgresql-backup-restore.json', ...restoreCapture },
  };
  await writeJson(observationPath, observation);
  return { ...traffic, observationPath, observation, restorePath, restore };
}

export async function persistObservationFixture(fixture: Awaited<ReturnType<typeof createObservationFixture>>) {
  const capture = await writeJson(fixture.restorePath, fixture.restore);
  fixture.observation.backupRestoreReceipt = { path: 'postgresql-backup-restore.json', ...capture };
  await writeJson(fixture.observationPath, fixture.observation);
}

export async function runObservation(fixture: Awaited<ReturnType<typeof createObservationFixture>>) {
  return runCli(['verify-observation-receipt', '--observation', fixture.observationPath,
    '--traffic-authorization', fixture.authorizationPath]);
}

async function runCli(argv: string[]) {
  const stdout: string[] = [];
  const exits: number[] = [];
  await main(argv, { stdout: (line) => stdout.push(line), stderr: () => undefined, setExitCode: (code) => exits.push(code) });
  return { stdout, exits };
}
