import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

test('current production documentation describes the PostgreSQL-only runtime contract', async () => {
  const documents = await Promise.all(projectDocs.map(async (name) => ({ name, text: await readDoc(name) })));
  const summaryTruth = section(documents.find(({ name }) => name === 'project-summary.md')!.text, '## 当前生产运行真相');
  const serverTruth = section(documents.find(({ name }) => name === 'project-server.md')!.text, '## 当前生产运行真相');
  const workflowTruth = section(documents.find(({ name }) => name === 'project-workflow.md')!.text, '## PostgreSQL 工作流持久化契约');
  const deployment = documents.find(({ name }) => name === 'postgresql-deployment.md')!.text;
  const runtimeTruth = `${summaryTruth}\n${serverTruth}\n${workflowTruth}\n${deployment}`;

  assert.match(summaryTruth, /生产唯一业务数据库.{0,12}PostgreSQL 16/);
  assert.match(serverTruth, /异步 `DbExecutor`/);
  assert.match(serverTruth, /启动.{0,24}migration/);
  assert.match(serverTruth, /\/api\/toc\/health.{0,40}(真实|实际).*PostgreSQL/);
  for (const variable of environmentVariables) assert.match(runtimeTruth, new RegExp(`\\b${variable}\\b`), variable);

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

test('rollback runbook restores one SQLite and resources point and quarantines failed PostgreSQL targets', async () => {
  const rollback = await readDoc('runbooks/postgresql-rollback.md');
  assert.match(rollback, /同一时间点.{0,80}SQLite.{0,20}WAL.{0,20}SHM.{0,40}资源/isu);
  assert.match(rollback, /旧镜像/);
  assert.match(rollback, /失败.{0,20}PostgreSQL.{0,40}仅.{0,10}排障/isu);
  assert.match(rollback, /不得.{0,30}(下次|后续).{0,30}目标/isu);
  assert.match(rollback, /全新.{0,12}(空库|schema)/u);
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
  assert.equal(example.approved, true);
  assert.equal(example.status, 'approved');
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
    approvedBy: 'REPLACE_WITH_INDEPENDENT_OPERATOR',
    approvedAt: '1970-01-01T00:00:00.000Z',
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
