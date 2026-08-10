import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadReleaseEvidence } from '../../packages/db-migrator/src/release/evidence';

const repoRoot = path.resolve(__dirname, '../..');
const docsRoot = path.join(repoRoot, 'docs');
const runbooksRoot = path.join(docsRoot, 'runbooks');

const projectDocs = [
  'README.md',
  'project-summary.md',
  'project-server.md',
  'project-workflow.md',
  'postgresql-deployment.md',
] as const;

const environmentVariables = [
  'DATABASE_URL',
  'DATABASE_SCHEMA',
  'DATABASE_SSL',
  'DATABASE_CA_PATH',
  'DATABASE_POOL_MAX',
  'DATABASE_CONNECTION_TIMEOUT_MS',
  'DATABASE_STATEMENT_TIMEOUT_MS',
] as const;

const signedCheckIds = [
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

interface SignoffExample {
  releaseCandidate: string;
  readinessRunId: string;
  goLiveOwner: { name: string; approvedAt: string };
  rollbackOwner: { name: string; approvedAt: string };
  maintenanceWindowMinutes: number;
  status: string;
  version: number;
  approved: boolean;
  approvedBy: string;
  approvedAt: string;
  checks: Array<{ id: string; status: 'passed' | 'failed' }>;
  reportManifest: Array<{ path: string; sizeBytes: number; sha256: string }>;
}

async function readDoc(relativePath: string): Promise<string> {
  return fs.readFile(path.join(docsRoot, relativePath), 'utf8');
}

function section(document: string, heading: string): string {
  const start = document.indexOf(heading);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const rest = document.slice(start + heading.length);
  const nextHeading = rest.search(/^##?\s/m);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

function numberedStep(runbook: string, number: number): string {
  const match = new RegExp(`^#{2,3} ${number}\\.\\s+.+$`, 'm').exec(runbook);
  assert.ok(match, `missing step ${number}`);
  const rest = runbook.slice(match.index + match[0].length);
  const next = /^#{2,3} \d+\.\s+.+$/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

test('current production documentation describes the PostgreSQL-only runtime contract', async () => {
  const documents = await Promise.all(projectDocs.map(async (name) => ({ name, text: await readDoc(name) })));
  const summaryTruth = section(documents.find(({ name }) => name === 'project-summary.md')!.text, '## 当前生产运行真相');
  const serverTruth = section(documents.find(({ name }) => name === 'project-server.md')!.text, '## 当前生产运行真相');
  const workflowTruth = section(documents.find(({ name }) => name === 'project-workflow.md')!.text, '## PostgreSQL 工作流持久化契约');
  const deployment = documents.find(({ name }) => name === 'postgresql-deployment.md')!.text;
  const productionEnvironment = section(deployment, '## 必需环境变量');
  const runtimeTruth = `${summaryTruth}\n${serverTruth}\n${workflowTruth}\n${deployment}`;

  assert.match(summaryTruth, /生产唯一业务数据库.{0,12}PostgreSQL 16/);
  assert.match(serverTruth, /异步 `DbExecutor`/);
  assert.match(serverTruth, /启动.{0,24}migration/);
  assert.match(serverTruth, /\/api\/toc\/health.{0,40}(真实|实际).*PostgreSQL/);
  for (const variable of environmentVariables) assert.match(runtimeTruth, new RegExp(`\\b${variable}\\b`), variable);
  assert.match(productionEnvironment, /\| `DATABASE_SSL` \| [^\r\n]*`verify-full`[^\r\n]*\|/u);
  assert.doesNotMatch(productionEnvironment, /\| `DATABASE_SSL` \| [^\r\n]*`require`[^\r\n]*\|/u);
  assert.match(deployment, /`require`[^\r\n]{0,120}仅.{0,20}代码兼容[^\r\n]{0,120}不满足.{0,20}生产.{0,20}(签署|基线)/iu);

  for (const { name, text } of documents) {
    for (const line of text.split(/\r?\n/).filter((candidate) => candidate.includes('better-sqlite3'))) {
      assert.match(line, /packages\/db-migrator/iu, `${name}: better-sqlite3 must only describe db-migrator`);
      assert.match(line, /一次性/u, `${name}: better-sqlite3 must only describe one-time migration`);
    }
  }
  assert.doesNotMatch(summaryTruth, /DATABASE_PATH|JSON fallback|SQLite volume/iu);
  assert.doesNotMatch(serverTruth, /DATABASE_PATH|JSON fallback|SQLite volume/iu);

  assert.match(workflowTruth, /SELECT \.\.\. FOR UPDATE/);
  assert.match(workflowTruth, /FOR UPDATE SKIP LOCKED/);
  assert.match(workflowTruth, /终态/);
  assert.match(workflowTruth, /player_game_memories.{0,24}保留/);
  assert.match(deployment, /最小权限/);
  assert.match(deployment, /TLS.{0,30}(CA|证书)/);
  assert.match(deployment, /WAL.{0,20}归档/);
  assert.match(deployment, /监控/);
});

test('documentation indexes both PostgreSQL operations runbooks', async () => {
  const index = await readDoc('README.md');
  assert.match(index, /runbooks\/postgresql-production-readiness\.md/);
  assert.match(index, /runbooks\/postgresql-rollback\.md/);
});

test('production-readiness runbook preserves the twelve non-exchangeable operator gates', async () => {
  const runbook = await readDoc('runbooks/postgresql-production-readiness.md');
  const headings = [...runbook.matchAll(/^### (\d+)\.\s+(.+)$/gm)];
  assert.deepEqual(headings.map((match) => Number(match[1])), Array.from({ length: 12 }, (_, index) => index + 1));
  const requiredLabels = ['输入', '命令', '预期输出', '成功条件', '失败停止点', '证据路径'];
  for (let index = 0; index < headings.length; index += 1) {
    const start = headings[index].index! + headings[index][0].length;
    const end = index + 1 < headings.length ? headings[index + 1].index! : runbook.length;
    const step = runbook.slice(start, end);
    for (const label of requiredLabels) assert.match(step, new RegExp(`\\*\\*${label}\\*\\*`), `step ${index + 1}: ${label}`);
    assert.match(step, /```powershell[\s\S]+?```/, `step ${index + 1}: copyable PowerShell command`);
  }

  const orderedFacts = [
    /SQLite\/WAL\/SHM.{0,40}资源/u,
    /preflight.{0,20}dry-run/iu,
    /backup.{0,30}--execute/iu,
    /manifest.{0,20}二次校验/iu,
    /演练 1.{0,30}全新 schema/iu,
    /validation.{0,30}同一 schema.{0,30}smoke/iu,
    /演练 2.{0,30}另一个全新 schema/iu,
    /validation.{0,30}同一 schema.{0,30}smoke/iu,
    /restore drill.{0,40}隔离目录/iu,
    /CI.{0,80}TLS.{0,80}最小权限.{0,80}pool.{0,80}timeout.{0,80}signoff/isu,
    /release-readiness/iu,
    /独立真实切换授权/u,
  ];
  let cursor = 0;
  for (const expected of orderedFacts) {
    const match = expected.exec(runbook.slice(cursor));
    assert.ok(match, `missing or out-of-order readiness fact: ${expected}`);
    cursor += match.index + match[0].length;
  }
  assert.match(runbook, /同一.{0,20}(source|源).{0,12}(SHA-?256|hash)/iu);
  assert.match(runbook, /2\s*[x×].{0,30}(maintenance window|维护窗口)/iu);
  assert.match(runbook, /失败.{0,30}(schema|现场).{0,20}保留/iu);
  assert.match(runbook, /不得.{0,30}(自动切流|连接真实生产)/u);
});

test('production-readiness evidence is raw, secret-safe, operator-approved, and independently bound', async () => {
  const runbook = await readDoc('runbooks/postgresql-production-readiness.md');
  const deployment = await readDoc('postgresql-deployment.md');
  const source = numberedStep(runbook, 1);
  const preflight = numberedStep(runbook, 2);
  const restore = numberedStep(runbook, 9);
  const signoff = numberedStep(runbook, 10);
  const aggregate = numberedStep(runbook, 11);

  assert.match(source, /Test-Path.{0,80}Source/isu);
  assert.match(source, /throw.{0,80}(SQLite|source)/isu);
  assert.match(source, /resourceFiles[\s\S]{0,500}sha256/iu);
  assert.match(preflight, /DATABASE_URL/);
  assert.doesNotMatch(preflight, /-Target\s+\$env:TEST_DATABASE_URL/iu);
  assert.match(runbook, /PGHOST\/PGPORT\/PGDATABASE\/PGUSER\/PGPASSWORD\/PGSSLMODE\/PGSSLROOTCERT/iu);
  assert.match(runbook, /psql[^\r\n]{0,120}(不得出现数据库 URL|do not pass a database URL)/iu);
  assert.doesNotMatch(runbook, /TLS[^\r\n]{0,120}使用 `PGSERVICE`/iu);
  assert.doesNotMatch(runbook, /psql\s+\$env:[A-Z_]*DATABASE_URL/iu);
  assert.doesNotMatch(deployment, /psql\s+\$env:[A-Z_]*DATABASE_URL/iu);

  assert.match(restore, /Stopwatch/);
  assert.match(restore, /better-sqlite3/);
  assert.match(restore, /PRAGMA integrity_check/);
  for (const table of ['admin_users', 'app_settings', 'players', 'games', 'game_playback_events', 'player_game_memories']) {
    assert.match(restore, new RegExp(`\\b${table}\\b`), table);
  }
  assert.match(restore, /@\('-wal','-shm'\)/);
  assert.doesNotMatch(restore, /durationMs\s*=\s*1000|AddSeconds\(-1\)/);

  for (const artifact of [
    '10-ci-release-gates.log', '10-runtime-image-build.log', '10-runtime-no-sqlite.log',
    '10-postgres-tls-session.log', '10-postgres-tls.json', '10-postgres-least-privilege.log', '10-postgres-pool-timeouts.json',
  ]) assert.match(signoff, new RegExp(artifact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), artifact);
  assert.match(signoff, /RawEvidencePaths[\s\S]{0,1800}artifacts/iu);
  assert.match(signoff, /type\s*=\s*'evidence'/);
  assert.match(signoff, /EnvironmentReportDraftPath/);
  assert.match(signoff, /status\s*=\s*'failed'/);
  assert.match(signoff, /pending independent verification/iu);
  assert.doesNotMatch(signoff, /\$environmentReport\s*=[\s\S]{0,300}status\s*=\s*'passed'/iu);
  assert.match(signoff, /Type REVIEWED_ENVIRONMENT/iu);
  assert.match(signoff, /postgresql-operator-signoff\.example\.json/);
  assert.match(signoff, /pending (?:draft|草稿)/iu);
  assert.match(signoff, /Read-Host|independent operator/iu);
  assert.match(signoff, /approvedBy/iu);
  assert.match(signoff, /goLiveOwner/iu);
  assert.match(signoff, /rollbackOwner/iu);
  assert.match(signoff, /different from go-live and rollback owners/iu);
  assert.doesNotMatch(signoff, /approvedBy\s*=\s*\$env:INDEPENDENT_OPERATOR/);
  assert.doesNotMatch(signoff, /\$signoff\.approved\s*=\s*\$true/);
  assert.match(aggregate, /-ReleaseCandidate\s+\$ReleaseCandidate/);
});

test('restore drill validates the raw SQLite WAL rollback set independently from the consistent copy', async (t) => {
  const runbook = await readDoc('runbooks/postgresql-production-readiness.md');
  const restore = numberedStep(runbook, 9);
  assert.match(restore, /Join-Path\s+\$RestoreRoot\s+'sqlite-raw\\source\.sqlite'/iu);
  assert.match(restore, /backup\.restore-drill\.raw-rollback-set/);
  assert.match(restore, /backup\.restore-drill\.consistent-copy/);
  assert.match(restore, /rawRollbackSet/);
  assert.match(restore, /consistentCopy/);

  const validationScript = /\$sqliteValidationScript\s*=\s*@'\r?\n([\s\S]*?)\r?\n'@/.exec(restore)?.[1];
  assert.ok(validationScript, 'missing embedded SQLite validation script');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'postgres-raw-restore-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const rawRoot = path.join(temporary, 'sqlite-raw');
  await fs.mkdir(rawRoot);
  const rawPath = path.join(rawRoot, 'source.sqlite');
  const consistentPath = path.join(temporary, 'sqlite-consistent.sqlite');
  const migratorRoot = path.join(repoRoot, 'packages', 'db-migrator');
  const createValidSqlite = [
    "const Database=require('better-sqlite3');",
    'const db=new Database(process.argv[1]);',
    "for(const table of ['admin_users','app_settings','players','games','game_playback_events','player_game_memories']) db.exec(`CREATE TABLE ${table}(id INTEGER PRIMARY KEY)`);",
    'db.close();',
  ].join('');
  const created = spawnSync(process.execPath, ['-e', createValidSqlite, '--', consistentPath], { cwd: migratorRoot, encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  await fs.writeFile(rawPath, Buffer.from('corrupt raw rollback bytes'));

  const consistent = spawnSync(process.execPath, ['-e', validationScript, '--', consistentPath], { cwd: migratorRoot, encoding: 'utf8' });
  assert.equal(consistent.status, 0, consistent.stderr);
  const raw = spawnSync(process.execPath, ['-e', validationScript, '--', rawPath], { cwd: migratorRoot, encoding: 'utf8' });
  assert.notEqual(raw.status, 0, 'corrupt raw rollback set must fail even when the consistent copy is valid');
});

test('readiness proves verify-full CA identity and TLS on the current PostgreSQL backend', async () => {
  const runbook = await readDoc('runbooks/postgresql-production-readiness.md');
  const deployment = await readDoc('postgresql-deployment.md');
  const signoff = numberedStep(runbook, 10);
  assert.match(signoff, /PGSERVICE[\s\S]{0,160}throw/iu);
  assert.doesNotMatch(signoff, /IsNullOrWhiteSpace\(\$env:PGSERVICE\)/iu);
  assert.match(signoff, /PGSSLMODE[\s\S]{0,120}-cne\s+'verify-full'/iu);
  assert.match(signoff, /Resolve-Path[^\n]*PGSSLROOTCERT/iu);
  assert.match(signoff, /Resolve-Path[^\n]*DATABASE_CA_PATH/iu);
  assert.match(signoff, /\$pgRootCert\s+-cne\s+\$databaseCaPath/iu);
  assert.match(signoff, /pg_stat_ssl[\s\S]{0,100}pg_backend_pid\(\)/iu);
  assert.match(signoff, /\$tlsSessionState\s+-cne\s+'true'/iu);
  assert.doesNotMatch(signoff, /SHOW\s+ssl/iu);
  for (const field of ['actualMode', 'actualRootCert', 'caSha256', 'sessionSsl']) assert.match(signoff, new RegExp(`\\b${field}\\b`), field);
  assert.match(deployment, /PGSERVICE.{0,80}(禁止|forbidden)/iu);
  assert.match(deployment, /PGSSLMODE.{0,80}verify-full/iu);
  assert.match(deployment, /pg_stat_ssl.{0,100}pg_backend_pid\(\)/iu);
});

test('rollback runbook restores one SQLite and resources point and quarantines failed PostgreSQL targets', async () => {
  const rollback = await readDoc('runbooks/postgresql-rollback.md');
  assert.match(rollback, /同一时间点.{0,80}SQLite.{0,20}WAL.{0,20}SHM.{0,40}资源/isu);
  assert.match(rollback, /旧镜像/);
  assert.match(rollback, /失败.{0,20}PostgreSQL.{0,40}仅.{0,10}排障/isu);
  assert.match(rollback, /(?:不得|禁止).{0,30}(下次|后续).{0,30}目标|禁止作为下次目标/isu);
  assert.match(rollback, /全新.{0,12}(空库|schema)/u);

  const freeze = numberedStep(rollback, 1);
  const quarantine = numberedStep(rollback, 2);
  const restore = numberedStep(rollback, 5);
  const start = numberedStep(rollback, 6);
  const smoke = numberedStep(rollback, 7);
  for (const binding of ['RollbackRunId', 'ChangeTicket', 'ExpectedOldTarget']) assert.match(freeze, new RegExp(`\\$${binding}\\b`), binding);
  for (const gate of [freeze, quarantine]) {
    assert.match(gate, /receipt|回执/iu);
    assert.match(gate, /Get-FileHash/);
    assert.match(gate, /ticketId/);
    assert.match(gate, /occurredAt/);
    assert.doesNotMatch(gate, /Stop accepting traffic|diagnostics-only-do-not-reuse'\s*\n\s*capturedAt/iu);
  }
  assert.match(freeze, /stopReceipt\.runId\s+-cne\s+\$RollbackRunId/iu);
  assert.match(freeze, /stopReceipt\.ticketId\s+-cne\s+\$ChangeTicket/iu);
  assert.match(freeze, /stopReceipt\.target\s+-cne\s+\$ExpectedOldTarget/iu);
  assert.match(quarantine, /isolationReceipt\.runId\s+-cne\s+\$RollbackRunId/iu);
  assert.match(quarantine, /isolationReceipt\.ticketId\s+-cne\s+\$ChangeTicket/iu);
  assert.match(quarantine, /isolationReceipt\.target\s+-cne\s+\$FailedTargetId/iu);
  assert.match(restore, /ResourceRestoreMap/);
  assert.match(restore, /resource-\d{3}|resource-\$\(/);
  assert.match(restore, /GetFullPath|Resolve-Path/);
  assert.match(restore, /path escape|路径逃逸/iu);
  assert.match(restore, /sizeBytes[\s\S]{0,300}sha256/iu);
  assert.match(restore, /ResourceRestoreMap\.Count[\s\S]{0,120}mappedIndexes\.Count/iu);
  assert.match(restore, /GetFileName[\s\S]{0,100}LegacyDatabaseFileName/iu);
  assert.match(restore, /sqliteRestoreEntries[\s\S]{0,1200}sha256/iu);
  assert.match(start, /RollbackStartCommand/);
  assert.match(start, /Invoke-Expression|&\s+\$RollbackStart/);
  assert.match(start, /LASTEXITCODE|ExitCode/);
  assert.match(start, /legacyDataRoot/iu);
  assert.match(start, /resourceDestinations/iu);
  assert.match(start, /ticketId/);
  assert.match(start, /occurredAt/);
  assert.match(start, /startReceipt\.runId\s+-cne\s+\$RollbackRunId/iu);
  assert.match(start, /startReceipt\.ticketId\s+-cne\s+\$ChangeTicket/iu);
  assert.match(start, /startReceipt\.target\s+-cne\s+\$ExpectedOldTarget/iu);
  assert.doesNotMatch(start, /start-plan\.json/);
  for (const check of ['admin', 'config', 'history', 'replay', 'resource']) assert.match(smoke, new RegExp(check, 'iu'), check);
  assert.match(smoke, /Get-FileHash|sha256/iu);
  assert.match(smoke, /smokeFinishedAt\s*=\s*\[DateTimeOffset\]::UtcNow/iu);
  assert.match(smoke, /trafficReceipt\.runId\s+-cne\s+\$RollbackRunId/iu);
  assert.match(smoke, /trafficReceipt\.ticketId\s+-cne\s+\$ChangeTicket/iu);
  assert.match(smoke, /trafficReceipt\.target\s+-cne\s+\$ExpectedOldTarget/iu);
  assert.match(smoke, /trafficOccurredAt\s+-lt\s+\$smokeFinishedAt/iu);
  assert.doesNotMatch(smoke, /Admin login, configuration, history, replay and resources verified/);
});

test('operator signoff example keeps plan fields and satisfies the real evidence parser shape', async (t) => {
  const examplePath = path.join(runbooksRoot, 'postgresql-operator-signoff.example.json');
  const example = JSON.parse(await fs.readFile(examplePath, 'utf8')) as SignoffExample;
  assert.deepEqual(
    ['releaseCandidate', 'readinessRunId', 'goLiveOwner', 'rollbackOwner', 'maintenanceWindowMinutes', 'status']
      .filter((field) => !(field in example)),
    [],
  );
  assert.equal(example.version, 1);
  assert.equal(example.approved, false);
  assert.equal(example.status, 'pending');
  assert.ok(example.checks.every(({ status }) => status === 'failed'));
  assert.deepEqual(example.checks.map(({ id }) => id), signedCheckIds);
  assert.ok(example.reportManifest.length > 0);
  for (const entry of example.reportManifest) {
    assert.match(entry.path, /^(?!\/)(?!\.\.\/)[^\\]+$/);
    assert.ok(Number.isSafeInteger(entry.sizeBytes) && entry.sizeBytes >= 0);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  }
  assert.doesNotMatch(JSON.stringify(example), /postgres(?:ql)?:\/\/|password|secret/iu);

  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'postgres-doc-signoff-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const reportPath = path.join(temporary, 'report.json');
  const reportBytes = Buffer.from(JSON.stringify({
    runId: 'docs-truth',
    stage: 'preflight',
    status: 'passed',
    startedAt: '2026-08-10T00:00:00.000Z',
    finishedAt: '2026-08-10T00:00:01.000Z',
    durationMs: 1000,
    checks: [{ id: 'docs.runtime-truth', status: 'passed', message: 'Documentation matches runtime' }],
    artifacts: [],
    errors: [],
  }));
  await fs.writeFile(reportPath, reportBytes);
  const parserFixture = {
    ...example,
    releaseCandidate: '0123456789abcdef0123456789abcdef01234567',
    readinessRunId: 'docs-truth',
    goLiveOwner: { name: 'go-live-owner', approvedAt: '2026-08-10T00:00:00.000Z' },
    rollbackOwner: { name: 'rollback-owner', approvedAt: '2026-08-10T00:00:01.000Z' },
    maintenanceWindowMinutes: 1,
    status: 'approved',
    approved: true,
    approvedBy: 'independent-operator',
    approvedAt: '2026-08-10T00:00:02.000Z',
    checks: example.checks.map(({ id }) => ({ id, status: 'passed' as const })),
    reportManifest: [{
      path: 'report.json',
      sizeBytes: reportBytes.length,
      sha256: createHash('sha256').update(reportBytes).digest('hex'),
    }],
  };
  const signoffPath = path.join(temporary, 'signoff.json');
  await fs.writeFile(signoffPath, JSON.stringify(parserFixture));
  const loaded = await loadReleaseEvidence([reportPath], signoffPath);
  assert.equal(loaded.signoff.version, 1);
  assert.equal(loaded.reports[0].runId, 'docs-truth');
});
