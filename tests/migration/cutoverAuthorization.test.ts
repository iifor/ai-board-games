import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadCutoverAuthorization } from '../../packages/db-migrator/src/cutover/authorization';

const RELEASE = '0123456789abcdef0123456789abcdef01234567';
const MANIFEST_HASH = '1'.repeat(64);
const SOURCE_HASH = '2'.repeat(64);
const NOW = new Date('2026-08-11T03:30:00.000Z');

function validAuthorization(): Record<string, unknown> {
  return {
    version: 1,
    purpose: 'production-cutover',
    status: 'approved',
    approved: true,
    releaseCandidate: RELEASE,
    cutoverRunId: 'cutover-20260811',
    backupManifestSha256: MANIFEST_HASH,
    sourceSnapshotSha256: SOURCE_HASH,
    target: {
      database: 'consensus', schema: 'consensus', role: 'consensus_migrator',
      host: 'postgres', port: 5432, tlsMode: 'verify-full',
    },
    maintenanceWindow: {
      startsAt: '2026-08-11T03:00:00.000Z',
      endsAt: '2026-08-11T04:00:00.000Z',
    },
    approvals: [
      { role: 'go-live-owner', name: 'Alice Operator', approvedAt: '2026-08-11T02:40:00.000Z' },
      { role: 'rollback-owner', name: 'Bob Operator', approvedAt: '2026-08-11T02:41:00.000Z' },
      { role: 'independent-reviewer', name: 'Carol Reviewer', approvedAt: '2026-08-11T02:42:00.000Z' },
    ],
  };
}

async function validate(value: unknown, now = NOW): Promise<unknown> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cutover-auth-'));
  const authorizationPath = path.join(root, 'authorization.json');
  await fs.writeFile(authorizationPath, `${JSON.stringify(value)}\n`, 'utf8');
  try {
    return await loadCutoverAuthorization({
      authorizationPath,
      runId: 'cutover-20260811',
      releaseCandidate: RELEASE,
      manifestSha256: MANIFEST_HASH,
      sourceSnapshotSha256: SOURCE_HASH,
      now,
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('cutover authorization accepts exactly the approved v1 production contract', async () => {
  const loaded = await validate(validAuthorization()) as { sha256: string; bytes: Buffer };
  assert.match(loaded.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Buffer.isBuffer(loaded.bytes));
});

test('cutover authorization rejects malformed, extra, stale, mismatched, or placeholder approvals', async () => {
  const cases: Array<[string, (value: Record<string, any>) => void, Date?]> = [
    ['extra root field', (value) => { value.extra = true; }],
    ['extra target field', (value) => { value.target.extra = true; }],
    ['extra approval field', (value) => { value.approvals[0].extra = true; }],
    ['placeholder identity', (value) => { value.approvals[0].name = 'REPLACE_WITH_GO_LIVE_OWNER'; }],
    ['duplicate identity', (value) => { value.approvals[1].name = 'alice operator'; }],
    ['future approval', (value) => { value.approvals[0].approvedAt = '2026-08-11T03:36:00.000Z'; }],
    ['outside maintenance window', () => undefined, new Date('2026-08-11T04:00:00.001Z')],
    ['wrong run', (value) => { value.cutoverRunId = 'another-run'; }],
    ['wrong candidate', (value) => { value.releaseCandidate = '3'.repeat(40); }],
    ['all-zero candidate', (value) => { value.releaseCandidate = '0'.repeat(40); }],
    ['uppercase candidate', (value) => { value.releaseCandidate = RELEASE.toUpperCase(); }],
    ['wrong manifest hash', (value) => { value.backupManifestSha256 = '4'.repeat(64); }],
    ['all-zero manifest hash', (value) => { value.backupManifestSha256 = '0'.repeat(64); }],
    ['wrong source hash', (value) => { value.sourceSnapshotSha256 = '5'.repeat(64); }],
    ['wrong target database', (value) => { value.target.database = 'other'; }],
    ['wrong target schema', (value) => { value.target.schema = 'other'; }],
    ['wrong target role', (value) => { value.target.role = 'consensus_app'; }],
    ['wrong target host', (value) => { value.target.host = '127.0.0.1'; }],
    ['wrong target port', (value) => { value.target.port = 6543; }],
    ['wrong target tls', (value) => { value.target.tlsMode = 'require'; }],
    ['approval roles out of order', (value) => { value.approvals.reverse(); }],
    ['invalid window order', (value) => { value.maintenanceWindow.endsAt = value.maintenanceWindow.startsAt; }],
  ];

  for (const [label, mutate, now] of cases) {
    const candidate = validAuthorization() as Record<string, any>;
    mutate(candidate);
    await assert.rejects(
      validate(candidate, now),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'CUTOVER_AUTHORIZATION_INVALID', label);
        return true;
      },
      label,
    );
  }
});

test('cutover authorization rejects malformed JSON and files larger than one MiB', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cutover-auth-bounds-'));
  const authorizationPath = path.join(root, 'authorization.json');
  const options = {
    authorizationPath,
    runId: 'cutover-20260811', releaseCandidate: RELEASE,
    manifestSha256: MANIFEST_HASH, sourceSnapshotSha256: SOURCE_HASH, now: NOW,
  };
  try {
    await fs.writeFile(authorizationPath, '{broken', 'utf8');
    await assert.rejects(loadCutoverAuthorization(options), (error: unknown) => (
      (error as { code?: string }).code === 'CUTOVER_AUTHORIZATION_INVALID'
    ));
    await fs.writeFile(authorizationPath, Buffer.alloc(1024 * 1024 + 1, 0x20));
    await assert.rejects(loadCutoverAuthorization(options), (error: unknown) => (
      (error as { code?: string }).code === 'CUTOVER_AUTHORIZATION_INVALID'
    ));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
