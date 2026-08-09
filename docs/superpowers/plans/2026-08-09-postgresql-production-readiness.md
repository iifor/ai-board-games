# PostgreSQL Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 PostgreSQL 16 迁移版本推进到可申请生产切换的状态：发布门禁可信、备份与演练可重复、两次生产 SQLite 副本迁移结果一致、恢复演练通过，并生成可审计的最终 PASS/FAIL 报告；本计划不执行真实生产切换。

**Architecture:** 继续以 `packages/db-migrator` 作为离线运维边界，在其中增加命令、报告与演练编排；复用 server 的 PostgreSQL executor 和 migration runner 准备临时 schema，但保持依赖方向为“离线迁移工具依赖 server 数据库基础设施”，生产 server 不依赖迁移工具。根目录 PowerShell 文件只做参数转发和退出码处理，业务判断全部留在 TypeScript。CI 将验证与部署拆成顺序 job，任何门禁失败都禁止部署。

**Tech Stack:** TypeScript 6、Node.js 20、PostgreSQL 16、`pg`、`better-sqlite3`（仅 db-migrator）、Node test runner、GitHub Actions、Docker、PowerShell 7/Windows PowerShell 5.1。

## Global Constraints

- 不连接、修改或删除真实生产 PostgreSQL；演练只允许使用明确提供的测试数据库和全新临时 schema。
- 不直接读取在线 SQLite 做导入。先通过 SQLite backup API 生成一致性副本，再从该副本导入。
- 不对源 SQLite 执行 checkpoint、VACUUM、写事务或 journal mode 修改。
- 所有命令默认 dry-run；创建目录、备份文件或 schema 必须显式传入 `--execute`。
- 不实现双写、CDC、增量导入、目标数据合并、生产 schema 删除、流量切换或自动回滚。
- 旧 workflow 与旧观测数据继续明确跳过；`player_game_memories` 必须迁移且在终态对局删除后保留。
- 报告和日志不得包含数据库密码、完整连接串、JWT、管理员密码、API Key 或源数据行内容。
- 演练产物默认放到已忽略的 `artifacts/postgres-readiness/` 或仓库外路径；数据库副本和未脱敏报告不得提交 Git。
- 保持 HTTP API、前端行为、游戏规则和共享类型兼容。
- 每次提交只暂存当前任务列出的文件，不得暂存或修改既有 Undercover、`design-qa.md` 或其他无关改动。

---

### Task 1: 建立不可绕过的 CI 发布门禁

**Files:**

- Modify: `.github/workflows/deploy-master.yml`
- Modify: `package.json`
- Create: `tests/unit/releaseGateConfig.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Responsibility:** 把验证和部署拆成两个 job；为 PR 和 master push 运行同一组门禁；确保 PR 不接触部署 secrets；自动执行 PostgreSQL 集成测试和镜像 SQLite 隔离检查。关键测试 skip guard 在 Task 7 清理完成后再加入，保证每个中间提交仍可通过完整测试。

- [ ] **Step 1: 写入失败的发布门禁结构测试**

在 `tests/unit/releaseGateConfig.test.ts` 读取 workflow 与根 `package.json`，断言：

```ts
test('release workflow verifies PostgreSQL before deployment', () => {
  const workflow = readFileSync('.github/workflows/deploy-master.yml', 'utf8');
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /postgres:\s*[\s\S]*image:\s*postgres:16/);
  assert.match(workflow, /pnpm\.cmd? run test:postgres|pnpm run test:postgres/);
  assert.match(workflow, /deploy:[\s\S]*needs:\s*verify/);
  assert.match(workflow, /github\.event_name != 'pull_request'/);
});

test('root package exposes one complete release verification command', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts['verify:release'],
    'pnpm run check && pnpm run build && pnpm run test:unit && pnpm run test:workflow && pnpm run test:migration && pnpm run test:postgres',
  );
});
```

`scanForSkippedTests` 只匹配 `test.skip(`、`it.skip(`、`describe.skip(`，错误信息列出文件和行号。

- [ ] **Step 2: 把测试文件加入 unit runner，确认失败**

在 `tests/unit/runUnitTests.cjs` 的显式文件列表加入 `releaseGateConfig.test.ts`。

Run:

```powershell
pnpm.cmd run test:unit -- releaseGateConfig.test.ts
```

Expected: FAIL，至少报告 workflow 缺少 `pull_request`、PostgreSQL service、`test:postgres`、`verify` job，以及根脚本缺失。

- [ ] **Step 3: 增加单一发布验证脚本**

在根 `package.json` 增加：

```json
"verify:release": "pnpm run check && pnpm run build && pnpm run test:unit && pnpm run test:workflow && pnpm run test:migration && pnpm run test:postgres"
```

不删除现有分项脚本；CI 和本地最终验证都调用此聚合入口。

- [ ] **Step 4: 重构 GitHub Actions job**

将 `.github/workflows/deploy-master.yml` 改为：

- `on.pull_request.branches: [master]`、`push.branches: [master]`、`workflow_dispatch`。
- `verify` job 使用 PostgreSQL 16 service，health command 为 `pg_isready`，映射 5432。
- job 级环境变量：

```yaml
TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/consensus_test
```

- 在 service 启动后先创建 `consensus_test`（service 环境用 `POSTGRES_DB: consensus_test` 可直接完成）。
- 验证步骤执行 `pnpm run verify:release`。
- 构建 `consensus-runtime-check:${{ github.sha }}` 后执行：

```bash
docker run --rm "consensus-runtime-check:${{ github.sha }}" node -e "try { require.resolve('better-sqlite3'); process.exit(1) } catch { process.exit(0) }"
```

- `deploy` job 设置 `needs: verify`，并设置：

```yaml
if: github.event_name != 'pull_request' && github.ref == 'refs/heads/master'
```

- SSH 配置与远程部署步骤只存在于 `deploy` job。

- [ ] **Step 5: 验证 workflow 与发布脚本结构**

```powershell
pnpm.cmd run test:unit -- releaseGateConfig.test.ts
```

Expected: PASS。

- [ ] **Step 6: 运行 YAML 与基础脚本验证**

Run:

```powershell
pnpm.cmd run check
pnpm.cmd run test:unit -- releaseGateConfig.test.ts
```

Expected: `check` 与 unit 均 PASS；Task 1 提交不引入暂时失败的测试。

- [ ] **Step 7: 提交当前任务**

```powershell
git add .github/workflows/deploy-master.yml package.json tests/unit/releaseGateConfig.test.ts tests/unit/runUnitTests.cjs
git commit -m "ci: enforce PostgreSQL release gates"
```

---

### Task 2: 建立统一、脱敏、原子写入的报告契约

**Files:**

- Create: `packages/db-migrator/src/reporting/reportTypes.ts`
- Create: `packages/db-migrator/src/reporting/reportWriter.ts`
- Create: `packages/db-migrator/src/cli/arguments.ts`
- Modify: `packages/db-migrator/src/cli.ts`
- Create: `tests/migration/readinessReport.test.ts`
- Modify: `tests/migration/runMigrationTests.cjs`

**Responsibility:** 为所有运维命令提供同一个报告模型、连接串脱敏、原子 JSON/Markdown 写入和稳定退出码；避免各命令各自拼接报告。

- [ ] **Step 1: 写报告契约失败测试**

在 `tests/migration/readinessReport.test.ts` 覆盖：

- JSON 与 Markdown 同时生成。
- 最终文件出现前先写 `.tmp`，完成后原子 rename；测试结束时不存在 `.tmp`。
- 报告中的 `postgresql://user:secret@host/db` 被写成 `postgresql://user:***@host/db`。
- `DATABASE_URL=...`、`JWT_SECRET=...`、`API_KEY=...` 的值不出现在文件。
- failed report 对应退出码 1，passed report 对应退出码 0。
- 报告目录已存在时不覆盖同名 run；返回 `REPORT_ALREADY_EXISTS`。

核心构造器断言：

```ts
const report: ReadinessReport = {
  runId: 'run-20260809-001',
  stage: 'preflight',
  status: 'passed',
  startedAt: '2026-08-09T00:00:00.000Z',
  finishedAt: '2026-08-09T00:00:01.000Z',
  durationMs: 1000,
  checks: [],
  artifacts: [],
  errors: [],
};
```

- [ ] **Step 2: 将测试加入 migration runner，确认失败**

修改 `tests/migration/runMigrationTests.cjs`，在 `eventMapping.test.ts` 后加入 `readinessReport.test.ts`。

Run:

```powershell
pnpm.cmd run test:migration
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现共享类型**

在 `reportTypes.ts` 定义并导出：

```ts
type ReadinessStage = 'preflight' | 'backup' | 'import' | 'validation' | 'smoke' | 'release';
type CheckStatus = 'passed' | 'failed' | 'skipped';
type ArtifactType = 'backup' | 'manifest' | 'migration-report' | 'validation-report' | 'smoke-report';

interface ReadinessCheck {
  id: string;
  status: CheckStatus;
  expected?: string;
  actual?: string;
  message: string;
}

interface ReadinessArtifact {
  type: ArtifactType;
  path: string;
  sha256?: string;
}

interface ReadinessReport {
  runId: string;
  stage: ReadinessStage;
  status: 'passed' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  checks: ReadinessCheck[];
  artifacts: ReadinessArtifact[];
  errors: Array<{ code: string; message: string }>;
}
```

不得在公共类型中放完整连接串、管理员凭据或源数据样本字段。

- [ ] **Step 4: 实现报告 writer**

`reportWriter.ts` 导出：

```ts
interface WriteReportOptions {
  outputDirectory: string;
  report: ReadinessReport;
}

interface WrittenReport {
  jsonPath: string;
  markdownPath: string;
}

function redactSecrets(value: string): string;
async function writeReadinessReport(options: WriteReportOptions): Promise<WrittenReport>;
```

实现要求：

- 递归清洗 `message`、`expected`、`actual`、`path`、`errors[].message`。
- URL 使用 `URL` 解析后只替换 password；无法解析时使用保守模式替换敏感环境变量赋值。
- 写入 `<runId>-<stage>.json.tmp` 和 `.md.tmp`，`fsync` 后 rename。
- 目标最终文件存在则失败，不覆盖。
- Markdown 只展示检查 ID、状态、脱敏消息、产物相对/绝对路径和校验和。

- [ ] **Step 5: 提取 CLI 参数解析**

`cli/arguments.ts` 导出：

```ts
interface ParsedCommand {
  command: 'migrate' | 'preflight' | 'backup' | 'validate' | 'rehearse' | 'release-readiness';
  values: ReadonlyMap<string, string>;
  execute: boolean;
}

function parseCommandLine(argv: string[]): ParsedCommand;
```

规则：首个非选项为 command；`--execute` 是布尔值；其他选项必须有值；未知 command 或重复选项失败；保留无 command 时兼容旧 `migrate --source ...` 的行为。

- [ ] **Step 6: 改造 CLI 入口但保持旧迁移兼容**

`cli.ts` 只做 command dispatch、标准输出 JSON、标准错误人类摘要和退出码转换。此任务仅接通 `migrate`；其他命令先返回明确的 `COMMAND_NOT_IMPLEMENTED` 非零错误，后续任务逐个替换。

- [ ] **Step 7: 运行报告测试与类型检查**

```powershell
pnpm.cmd run test:migration
pnpm.cmd --filter @ai-presenter/db-migrator run check
```

Expected: PASS。

- [ ] **Step 8: 提交当前任务**

```powershell
git add packages/db-migrator/src/reporting packages/db-migrator/src/cli packages/db-migrator/src/cli.ts tests/migration/readinessReport.test.ts tests/migration/runMigrationTests.cjs
git commit -m "feat: add readiness report foundation"
```

---

### Task 3: 实现只读生产预检命令

**Files:**

- Create: `packages/db-migrator/src/commands/preflight.ts`
- Modify: `packages/db-migrator/src/cli.ts`
- Create: `tests/postgres/preflightCommand.test.ts`
- Modify: `tests/postgres/runPostgresTests.cjs`

**Responsibility:** 在任何备份或 schema 创建前确认源 SQLite、PostgreSQL 版本/空目标、TLS 配置、容量和必要参数；默认执行只读检查。

- [ ] **Step 1: 写预检失败测试**

在 `tests/postgres/preflightCommand.test.ts` 使用临时 SQLite fixture 和 `withTestSchema` 覆盖：

- 源文件缺失：`SOURCE_NOT_FOUND`。
- 源文件不可读或 `PRAGMA integrity_check` 非 `ok`：`SOURCE_INTEGRITY_FAILED`。
- PostgreSQL major version 不是 16：`POSTGRES_VERSION_UNSUPPORTED`（通过注入 executor 模拟，不修改真实服务器）。
- 目标业务表非空：`TARGET_NOT_EMPTY`。
- `requireTls=true` 且连接配置未启用证书验证：`TLS_REQUIRED`。
- 输出目录所在卷可用空间小于 `source + wal + shm + resource directories` 的 2 倍：`INSUFFICIENT_DISK_SPACE`（注入容量探针）。
- 成功时所有检查均 passed，且数据库和文件系统没有新增对象。

- [ ] **Step 2: 将测试加入 PostgreSQL runner，确认失败**

在 `tests/postgres/runPostgresTests.cjs` 加入 `preflightCommand.test.ts`。

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:55432/consensus_test'
pnpm.cmd run test:postgres
```

Expected: FAIL，preflight 模块不存在。

- [ ] **Step 3: 实现可注入预检依赖**

`preflight.ts` 导出：

```ts
interface PreflightOptions {
  runId: string;
  sourcePath: string;
  targetUrl: string;
  targetSchema: string;
  outputDirectory: string;
  resourceDirectories: string[];
  requireTls: boolean;
}

interface PreflightDependencies {
  createSqlite(path: string): Database.Database;
  createPostgres(url: string, schema: string): DbExecutor;
  availableBytes(path: string): Promise<number>;
}

async function runPreflight(
  options: PreflightOptions,
  dependencies?: Partial<PreflightDependencies>,
): Promise<ReadinessReport>;
```

检查顺序固定为：参数安全 → 源存在/可读 → SQLite integrity → 资源目录可读 → 磁盘容量 → PostgreSQL 连接/版本 → schema 存在 → 目标业务表为空 → TLS/pool/timeout 配置。所有已开始的检查都写入报告；强制检查失败后停止后续变更，但仍安全关闭句柄。

- [ ] **Step 4: 明确 dry-run 与目标空库定义**

- `preflight` 不需要 `--execute`，因为它不创建目录或 schema。
- 目标为空指 `IMPORT_TABLES` 全部为 0；允许 `schema_migrations` 和空业务表存在。
- schema 不存在时将 `target.schema-is-fresh` 记为 passed；schema 已存在时检查 `IMPORT_TABLES` 全部为空。两种情况都不自动创建或修改 schema。
- target URL 只在内存使用，报告仅记录 host、port、database、schema，不记录 user/password/query 参数。

- [ ] **Step 5: 接入 CLI**

支持：

```powershell
pnpm.cmd --filter @ai-presenter/db-migrator run migrate -- preflight --source <sqlite> --target <url> --schema <schema> --output <dir> --resources <dir1,dir2> --require-tls <true|false>
```

命令打印单行 JSON report；任何 required check failed 时退出码 1。

- [ ] **Step 6: 运行测试**

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:55432/consensus_test'
pnpm.cmd run test:postgres
pnpm.cmd --filter @ai-presenter/db-migrator run check
```

Expected: PASS。

- [ ] **Step 7: 提交当前任务**

```powershell
git add packages/db-migrator/src/commands/preflight.ts packages/db-migrator/src/cli.ts tests/postgres/preflightCommand.test.ts tests/postgres/runPostgresTests.cjs
git commit -m "feat: add read-only PostgreSQL preflight"
```

---

### Task 4: 实现 SQLite、WAL 与资源一致性备份

**Files:**

- Create: `packages/db-migrator/src/commands/backup.ts`
- Create: `packages/db-migrator/src/backup/manifest.ts`
- Modify: `packages/db-migrator/src/cli.ts`
- Create: `tests/migration/backupCommand.test.ts`
- Modify: `tests/migration/runMigrationTests.cjs`

**Responsibility:** 生成可恢复、可校验、不可静默覆盖的输入快照；SQLite 一致性副本用于导入，原始 DB/WAL/SHM 和资源副本用于审计与回滚演练。

- [ ] **Step 1: 写备份失败测试**

测试 fixture 必须使用 WAL mode 写入已提交数据并保持一个连接打开，覆盖：

- 未传 `--execute` 时只生成 dry-run 报告，不创建目录或文件。
- 传 `--execute` 后，SQLite backup API 生成 `sqlite-consistent.sqlite`，其 `PRAGMA integrity_check` 为 `ok` 且包含 WAL 中已提交行。
- 原始 `source.sqlite`、存在的 `source.sqlite-wal`、`source.sqlite-shm` 被逐文件归档；不存在的 sidecar 记为 skipped，不伪造空文件。
- 资源目录递归复制，保留相对路径；拒绝 symlink/junction 逃逸到资源根目录外。
- manifest 中每个文件都有相对路径、字节数、SHA-256；重新计算完全一致。
- 目标 run 目录已存在时失败，不覆盖。
- 任一复制/校验失败时 report failed，保留 `.failed` 现场，但不发布完整 manifest。
- 源数据库 mtime、journal mode 和 `wal_checkpoint` 统计在执行前后不因工具发生写入。

- [ ] **Step 2: 将测试加入 migration runner，确认失败**

```powershell
pnpm.cmd run test:migration
```

Expected: FAIL，backup 模块不存在。

- [ ] **Step 3: 实现 manifest 模块**

`backup/manifest.ts` 导出：

```ts
interface ManifestEntry {
  path: string;
  sizeBytes: number;
  sha256: string;
}

interface BackupManifest {
  version: 1;
  runId: string;
  createdAt: string;
  sourceDatabaseSha256: string;
  consistentDatabaseSha256: string;
  entries: ManifestEntry[];
}

async function hashFile(path: string): Promise<string>;
async function buildManifest(root: string, runId: string): Promise<BackupManifest>;
async function verifyManifest(root: string, manifest: BackupManifest): Promise<void>;
```

entries 按路径排序，路径统一 `/`，manifest 自身不列入 entries。

- [ ] **Step 4: 实现备份命令**

`backup.ts` 导出：

```ts
interface BackupOptions {
  runId: string;
  sourcePath: string;
  outputDirectory: string;
  resourceDirectories: string[];
  execute: boolean;
}

async function runBackup(options: BackupOptions): Promise<ReadinessReport>;
```

执行顺序：验证 runId/路径 → 计算容量 → dry-run 结束或创建唯一 staging 目录 → `sqlite.backup()` → 只读打开一致性副本并 integrity check → 复制 raw DB/sidecars/resources → hash → 校验 → 原子发布 run 目录和 manifest → 写报告。

- [ ] **Step 5: 接入 CLI**

命令：

```powershell
pnpm.cmd --filter @ai-presenter/db-migrator run migrate -- backup --source <sqlite> --output <dir> --resources <dir1,dir2> --run-id <id> --execute
```

`--execute` 缺失时 status 可以 passed，但所有变更项为 skipped，message 明确 `dry-run; no files created`，该报告不能被最终 readiness 当作有效备份。

- [ ] **Step 6: 运行测试与类型检查**

```powershell
pnpm.cmd run test:migration
pnpm.cmd --filter @ai-presenter/db-migrator run check
```

Expected: PASS。

- [ ] **Step 7: 提交当前任务**

```powershell
git add packages/db-migrator/src/commands/backup.ts packages/db-migrator/src/backup/manifest.ts packages/db-migrator/src/cli.ts tests/migration/backupCommand.test.ts tests/migration/runMigrationTests.cjs
git commit -m "feat: add consistent SQLite backup command"
```

---

### Task 5: 实现迁移后数据验收命令

**Files:**

- Create: `packages/db-migrator/src/commands/validate.ts`
- Create: `packages/db-migrator/src/validation/queries.ts`
- Modify: `packages/db-migrator/src/cli.ts`
- Create: `tests/postgres/validateMigration.test.ts`
- Modify: `tests/postgres/runPostgresTests.cjs`

**Responsibility:** 独立于 importer 再次验证源/目标计数、外键、JSON、时间、identity sequence、核心业务抽样和明确跳过表，防止“导入成功”被误当成“数据可信”。

- [ ] **Step 1: 写验收失败测试**

用 SQLite fixture + 临时 PostgreSQL schema 覆盖：

- `IMPORT_TABLES` 每表 source/import/target 行数一致时通过。
- 删除一行目标数据时 `ROW_COUNT_MISMATCH`。
- 临时禁用约束插入孤儿记录后 `ORPHAN_FOREIGN_KEY`。
- 注入非对象 JSON 或非法时间语义后相应检查失败。
- identity sequence 的下一值不大于 `MAX(id)` 时 `IDENTITY_SEQUENCE_INVALID`。
- 管理员、配置、玩家、游戏、回放和长期记忆以确定性主键抽样，字段归一化后一致。
- workflow 和 observability 表只记录为 `skipped`，且 message 为 `intentionally not migrated`。
- manifest hash 与实际 consistent SQLite 不一致时 `SOURCE_HASH_MISMATCH`。

- [ ] **Step 2: 将测试加入 PostgreSQL runner，确认失败**

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:55432/consensus_test'
pnpm.cmd run test:postgres
```

Expected: FAIL，validate 模块不存在。

- [ ] **Step 3: 实现只读 validation queries**

`validation/queries.ts` 只放 SQL 与结果类型，导出：

```ts
interface TableCount { table: string; count: number }
interface ForeignKeyViolation { constraint: string; table: string; key: string }
interface IdentityState { table: string; maxId: number | null; lastValue: number; isCalled: boolean }

async function countImportedTables(db: DbExecutor): Promise<TableCount[]>;
async function findForeignKeyViolations(db: DbExecutor): Promise<ForeignKeyViolation[]>;
async function readIdentityStates(db: DbExecutor): Promise<IdentityState[]>;
```

只查询 `IMPORT_TABLES` 和 migration 定义的明确 FK，不使用不受控动态 identifier；表名来自常量白名单。

- [ ] **Step 4: 实现 validate 命令**

`validate.ts` 导出：

```ts
interface ValidateOptions {
  runId: string;
  sourceSnapshotPath: string;
  sourceManifestPath: string;
  migrationReportPath: string;
  targetUrl: string;
  targetSchema: string;
  outputDirectory: string;
}

async function runValidation(options: ValidateOptions): Promise<ReadinessReport>;
```

源 SQLite 以 readonly/fileMustExist 打开；目标 executor 只执行 SELECT；任何检查失败都汇总进 checks/errors 后返回 failed，不修改数据。

- [ ] **Step 5: 接入 CLI 并验证报告产物**

命令：

```powershell
pnpm.cmd --filter @ai-presenter/db-migrator run migrate -- validate --source-snapshot <sqlite> --manifest <json> --migration-report <json> --target <url> --schema <schema> --output <dir> --run-id <id>
```

成功报告的 artifacts 必须包含 validation report 路径和 SHA-256。

- [ ] **Step 6: 运行测试与类型检查**

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:55432/consensus_test'
pnpm.cmd run test:postgres
pnpm.cmd --filter @ai-presenter/db-migrator run check
```

Expected: PASS。

- [ ] **Step 7: 提交当前任务**

```powershell
git add packages/db-migrator/src/commands/validate.ts packages/db-migrator/src/validation/queries.ts packages/db-migrator/src/cli.ts tests/postgres/validateMigration.test.ts tests/postgres/runPostgresTests.cjs
git commit -m "feat: validate migrated PostgreSQL data"
```

---

### Task 6: 实现全新 schema 的可重复迁移演练

**Files:**

- Create: `packages/db-migrator/src/commands/rehearse.ts`
- Create: `packages/db-migrator/src/postgres/rehearsalSchema.ts`
- Modify: `packages/db-migrator/src/importer.ts`
- Modify: `packages/db-migrator/src/types.ts`
- Modify: `packages/db-migrator/src/cli.ts`
- Create: `tests/postgres/rehearsalCommand.test.ts`
- Modify: `tests/postgres/runPostgresTests.cjs`

**Responsibility:** 为每次 run 创建唯一的新 schema，应用正式 migration，调用现有 importer，再执行 Task 5 验收；失败现场保留且不会被下一次复用。

- [ ] **Step 1: 写演练失败测试**

覆盖：

- 未传 `--execute` 不创建 schema，只报告将使用的安全 schema 名。
- schema 名严格为 `consensus_rehearsal_<UTC timestamp>_<short run hash>`，只含小写字母、数字、下划线。
- `--execute` 创建新 schema，运行 `migratePostgres` 后导入与 validation 全部 passed。
- 复用 runId 或 schema 已存在时 `REHEARSAL_TARGET_EXISTS`，不 drop、不 truncate。
- 目标 database 名不以 `_test` 或 `_rehearsal` 结尾时默认拒绝；只有后续真实切换专用命令才可放宽，本计划不提供该放宽。
- importer 失败时 rollback 导入事务，schema 和失败报告保留。
- 第二次 run 不读取或修改第一次 schema。
- 两次 run 使用不同 schema、不同 runId，但报告 source snapshot SHA-256 相同。

- [ ] **Step 2: 将测试加入 PostgreSQL runner，确认失败**

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:55432/consensus_test'
pnpm.cmd run test:postgres
```

Expected: FAIL，rehearse 模块不存在。

- [ ] **Step 3: 实现 schema 生命周期模块**

`rehearsalSchema.ts` 导出：

```ts
function buildRehearsalSchema(runId: string, now: Date): string;
function assertRehearsalDatabase(targetUrl: string): void;
async function createRehearsalSchema(targetUrl: string, schema: string): Promise<void>;
async function rehearsalSchemaExists(targetUrl: string, schema: string): Promise<boolean>;
```

不导出 drop API。创建前检查 database suffix、identifier 和 schema 不存在；创建后直接复用：

```ts
import { createPostgresExecutor } from '../../../server/db/postgres';
import { migratePostgres } from '../../../server/db/postgres/migrate';
```

用 `createPostgresExecutor` + `migratePostgres` 应用正式 DDL。该相对依赖只存在于离线 db-migrator；禁止 server 导入 db-migrator，禁止复制 migration SQL 或另写第二套 runner。

- [ ] **Step 4: 让 importer 接收已准备 executor 或连接配置**

避免第二套迁移 SQL。将 `MigrationOptions` 扩展为可选 executor factory，但保持现有 CLI 用法兼容：

```ts
interface MigrationDependencies {
  createClient(options: MigrationOptions): Promise<MigrationClient>;
}

async function migrateSqliteToPostgres(
  options: MigrationOptions,
  dependencies?: Partial<MigrationDependencies>,
): Promise<MigrationReport>;
```

生产默认仍用 `pg.Client`；测试可注入。连接 `search_path` 必须显式设置到 rehearsal schema，不能依赖默认 schema。

- [ ] **Step 5: 实现 rehearsal 编排**

`rehearse.ts` 导出：

```ts
interface RehearsalOptions {
  runId: string;
  sourceSnapshotPath: string;
  sourceManifestPath: string;
  targetUrl: string;
  outputDirectory: string;
  execute: boolean;
}

interface RehearsalResult {
  schema: string;
  report: ReadinessReport;
  migrationReportPath?: string;
  validationReportPath?: string;
}

async function runRehearsal(options: RehearsalOptions): Promise<RehearsalResult>;
```

阶段顺序固定：manifest verify → database safety → schema uniqueness → dry-run stop 或 create schema → migrate DDL → import → persist migration report → validate → persist rehearsal summary。

- [ ] **Step 6: 接入 CLI**

```powershell
pnpm.cmd --filter @ai-presenter/db-migrator run migrate -- rehearse --source-snapshot <sqlite> --manifest <json> --target <url> --output <dir> --run-id <id> --execute
```

失败退出码 1；输出必须包含保留的 schema 名，便于排障，但不输出密码。

- [ ] **Step 7: 运行测试**

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:55432/consensus_test'
pnpm.cmd run test:postgres
pnpm.cmd run test:migration
pnpm.cmd --filter @ai-presenter/db-migrator run check
```

Expected: PASS。

- [ ] **Step 8: 提交当前任务**

```powershell
git add packages/db-migrator/src/commands/rehearse.ts packages/db-migrator/src/postgres/rehearsalSchema.ts packages/db-migrator/src/importer.ts packages/db-migrator/src/types.ts packages/db-migrator/src/cli.ts tests/postgres/rehearsalCommand.test.ts tests/postgres/runPostgresTests.cjs
git commit -m "feat: orchestrate isolated migration rehearsals"
```

---

### Task 7: 清零 PostgreSQL 迁移遗留的 24 个关键 skip

**Files:**

- Modify: `tests/unit/authFirstPasswordChange.test.ts`
- Modify: `tests/unit/authLoginRateLimit.test.ts`
- Modify: `tests/unit/gameSocketSession.test.ts`
- Modify: `tests/unit/playerModelFallback.test.ts`
- Modify: `tests/unit/undercoverGameRunner.test.ts`
- Modify: `tests/unit/werewolfActionEngineBridge.test.ts`
- Modify: `tests/unit/werewolfActionSpeech.test.ts`
- Modify: `tests/unit/werewolfPromptContext.test.ts`
- Modify: `tests/postgres/authIntegration.test.ts`
- Modify: `tests/postgres/llmQuotaIntegration.test.ts`
- Create: `tests/postgres/gameApplicationIntegration.test.ts`
- Modify: `tests/postgres/runPostgresTests.cjs`
- Modify: `tests/unit/releaseGateConfig.test.ts`

**Responsibility:** 让测试的执行位置与依赖边界一致：数据库语义在临时 PostgreSQL schema 中验证，纯游戏/工作流逻辑恢复为快速单元测试；不保留“已被覆盖”但实际上未执行的 skip。

- [ ] **Step 1: 建立逐条去向清单并先运行当前基线**

严格按以下映射处理：

| 当前 skip | 数量 | 去向 |
|---|---:|---|
| first password change | 3 | `tests/postgres/authIntegration.test.ts` |
| login rate limit | 2 | `tests/postgres/authIntegration.test.ts` |
| player model quota/fallback | 8 | `tests/postgres/llmQuotaIntegration.test.ts` |
| Undercover stored replay | 1 | `tests/postgres/gameApplicationIntegration.test.ts` |
| Undercover debug runner | 1 | 恢复原 unit；显式 fake model 并断言零调用 |
| Werewolf action bridge | 7 | 恢复原 unit；await async bridge |
| Werewolf action speech | 1 | 恢复原 unit |
| Werewolf prompt context | 1 | 恢复原 unit |

Run:

```powershell
pnpm.cmd run test:unit
```

Expected baseline: PASS with 24 skipped；记录总数，但不把该结果当发布通过。

- [ ] **Step 2: 迁移认证 5 个用例到 PostgreSQL integration**

在 `authIntegration.test.ts` 复用 `withTestSchema`、正式 migrations、admin repository/service，验证：

- forced-change admin 被管理 API 拒绝。
- 改密原子更新 hash 与 `must_change_password=false`。
- login response 返回真实 flag。
- 同一 normalized username + client 第 6 次失败被阻断。
- 6 个并发坏密码请求中恰有一个达到阻断阈值，计数无丢失。

随后删除 unit 中对应 5 个 skip 用例；若仍有纯 helper 断言，改成普通 `test`。

- [ ] **Step 3: 迁移模型额度 8 个用例到 PostgreSQL integration**

在 `llmQuotaIntegration.test.ts` 使用真实 model repository 与 fake provider，逐条覆盖：余额耗尽禁用、普通 429 不禁用、队列前重查、fallback 也耗尽、非额度错误、人工重启、连接测试探测、空内容拒绝。每个测试使用独立 schema 或事务清理，不能共享 quota 状态。

随后删除 `playerModelFallback.test.ts` 中 8 个 skip；保留不依赖数据库的 fallback 单元测试。

- [ ] **Step 4: 恢复 10 个纯逻辑单元测试**

- `werewolfActionEngineBridge.test.ts` 的 7 个用例改回 `test`，调用处 `await runWerewolfActionEngineBridge(...)`。
- `werewolfActionSpeech.test.ts`、`werewolfPromptContext.test.ts` 改回普通 `test`，通过内存依赖注入而不是数据库。
- `undercoverGameRunner.test.ts` 改回普通 `test`，fake player model 的调用函数直接抛错，并断言 debug first speech 完成。

Run:

```powershell
pnpm.cmd run test:unit -- werewolfActionEngineBridge.test.ts
pnpm.cmd run test:unit -- werewolfActionSpeech.test.ts
pnpm.cmd run test:unit -- werewolfPromptContext.test.ts
pnpm.cmd run test:unit -- undercoverGameRunner.test.ts
```

Expected: PASS，0 skipped。

- [ ] **Step 5: 新增游戏应用 PostgreSQL integration**

`gameApplicationIntegration.test.ts` 使用临时 schema 和正式 repository/service，覆盖：

- 创建 debug Undercover 对局。
- 写入 host/display playback events。
- 历史读取按 `(sequence, created_at, id)` 稳定顺序返回。
- 对局完成后可读取详情和回放。

将 `gameSocketSession.test.ts` 中原 skip 删除；若该文件仍保留 socket 映射单元断言，则改成普通 test 并注入内存 repository。

- [ ] **Step 6: 将新 integration 文件加入 runner**

在 `tests/postgres/runPostgresTests.cjs` 加 `gameApplicationIntegration.test.ts`。

- [ ] **Step 7: 加入 skip guard 并让它全量通过**

在 `tests/unit/releaseGateConfig.test.ts` 增加关键路径扫描；只匹配 `test.skip(`、`it.skip(`、`describe.skip(`，失败消息必须列出文件和行号：

```ts
test('critical database paths contain no skipped tests', () => {
  const criticalFiles = [
    'tests/postgres',
    'tests/unit/authFirstPasswordChange.test.ts',
    'tests/unit/authLoginRateLimit.test.ts',
    'tests/unit/gameSocketSession.test.ts',
    'tests/unit/playerModelFallback.test.ts',
    'tests/unit/undercoverGameRunner.test.ts',
    'tests/unit/werewolfActionEngineBridge.test.ts',
    'tests/unit/werewolfActionSpeech.test.ts',
    'tests/unit/werewolfPromptContext.test.ts',
  ];
  assert.equal(scanForSkippedTests(criticalFiles), 0);
});
```

```powershell
pnpm.cmd run test:unit
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:55432/consensus_test'
pnpm.cmd run test:postgres
```

Expected: 两组 PASS；发布关键路径 `test.skip/it.skip/describe.skip` 为 0。若存在平台限定的非关键 skip，必须不在 guard 目录且带机器可识别 reason；本任务列出的 24 个不允许保留。

- [ ] **Step 8: 提交当前任务**

```powershell
git add tests/unit/authFirstPasswordChange.test.ts tests/unit/authLoginRateLimit.test.ts tests/unit/gameSocketSession.test.ts tests/unit/playerModelFallback.test.ts tests/unit/undercoverGameRunner.test.ts tests/unit/werewolfActionEngineBridge.test.ts tests/unit/werewolfActionSpeech.test.ts tests/unit/werewolfPromptContext.test.ts tests/unit/releaseGateConfig.test.ts tests/postgres/authIntegration.test.ts tests/postgres/llmQuotaIntegration.test.ts tests/postgres/gameApplicationIntegration.test.ts tests/postgres/runPostgresTests.cjs
git commit -m "test: restore PostgreSQL migration coverage"
```

---

### Task 8: 增加临时应用实例端到端冒烟

**Files:**

- Create: `packages/db-migrator/src/smoke/applicationSmoke.ts`
- Modify: `packages/db-migrator/src/commands/rehearse.ts`
- Create: `tests/postgres/applicationSmoke.test.ts`
- Create: `tests/postgres/smokeHarness.ts`
- Modify: `tests/postgres/runPostgresTests.cjs`
- Modify: `packages/server/modules/game-socket/service.ts`

**Responsibility:** 验证真实 PostgreSQL + 真实 Express 路由 + 真实 repository/service 的用户可见关键路径，并把同一 smoke runner 接到每次演练的已导入 schema；外部 LLM/TTS 必须使用明确测试替身，不能产生费用。

- [ ] **Step 1: 写失败的 smoke 测试骨架**

`packages/db-migrator/src/smoke/applicationSmoke.ts` 提供可被演练和测试共同调用的接口：

```ts
interface ApplicationSmokeOptions {
  runId: string;
  targetUrl: string;
  targetSchema: string;
  outputDirectory: string;
}

interface ApplicationSmokeDependencies {
  runSessionDependencies: RunSessionDependencies;
}

async function runApplicationSmoke(
  options: ApplicationSmokeOptions,
  dependencies: ApplicationSmokeDependencies,
): Promise<ReadinessReport>;
```

测试侧 `smokeHarness.ts` 提供：

```ts
interface SmokeApplication {
  baseUrl: string;
  database: DbExecutor;
  schema: string;
  close(): Promise<void>;
}

async function startSmokeApplication(): Promise<SmokeApplication>;
```

它必须：创建临时 schema → migrate → 设置测试 executor → `await createApp()` → 监听 `127.0.0.1` 随机端口 → teardown 时关闭 HTTP server、恢复全局 executor、drop schema。

- [ ] **Step 2: 写完整冒烟场景，确认失败**

`applicationSmoke.test.ts` 通过 harness 调用正式 `runApplicationSmoke`，串行验证：

1. `/api/toc/health` 返回健康且断开 database 后变为非健康。
2. 初始管理员登录和首次改密。
3. 管理配置 CRUD：皮肤、供应商、模型、语音、玩家、狼人角色/模式至少各读取一次；选一个低风险配置执行 create/update/delete。
4. 通过 debug/test 替身创建并完成一局 Undercover，不调用付费模型或 TTS。
5. 历史详情与回放事件顺序正确。
6. `player_game_memories` 已创建/更新。
7. 为终态对局创建关联 workflow/observability fixture，然后调用正式删除 API。
8. game、players、selections、playback、workflow、observability 关联行被清理，跨局 memory 仍存在。

Run:

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:55432/consensus_test'
pnpm.cmd run test:postgres
```

Expected: FAIL，harness 或必要注入 seam 尚不存在。

- [ ] **Step 3: 实现共享 smoke runner 与最小测试 harness**

`applicationSmoke.ts` 以离线工具依赖生产 server 的单向边界，直接复用 `packages/server/app.ts`、`packages/server/db/postgres.ts` 和 `setDbExecutorForTests`；server 不得反向导入 db-migrator。由于现有 debug mode 明确不保存游戏，不能用它证明持久化链。改为给 `runSession` 增加独立于客户端消息的第六个 typed dependency 参数：

```ts
interface RunSessionDependencies {
  resolveRunner: typeof resolveGameRunner;
  getRequestConfig: typeof getRequestConfig;
}

const defaultRunSessionDependencies: RunSessionDependencies = {
  resolveRunner: resolveGameRunner,
  getRequestConfig,
};
```

`attachGameSocket` 不传该参数，生产路径保持原行为。smoke 直接调用导出的 `runSession(..., fakeDependencies)`：fake config 返回 `debugMode: false` 以覆盖真实 `saveGameRecord` 分支，fake runner 返回确定对局并记录调用次数，因此不触发 LLM/TTS。该参数不得加入 WebSocket 请求类型，客户端不能控制依赖或绕过真实模型。
同时从 `service.ts` 导出 `RunSessionDependencies` 类型，供 db-migrator smoke runner 类型安全地构造替身；不导出或暴露默认依赖中的密钥与运行时状态。

- [ ] **Step 4: 将 smoke 接入 rehearsal 的已导入 schema**

修改 `packages/db-migrator/src/commands/rehearse.ts`：validation passed 后调用 `runApplicationSmoke`，传入本次 schema；smoke failed 时 rehearsal 总报告 failed，但保留 schema、migration、validation 和 smoke reports。不得为 smoke 另建 schema，否则不能证明已导入目标可启动。

- [ ] **Step 5: 实现 smoke 报告输出**

共享 runner 将每个业务步骤映射成 `ReadinessCheck`，写入 `smoke-report`。失败时也写 report，并确认 HTTP server/database 在 `finally` 中关闭。报告 artifacts 回填到 rehearsal 总报告。

- [ ] **Step 6: 运行针对性和回归测试**

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:55432/consensus_test'
pnpm.cmd run test:postgres
pnpm.cmd run test:workflow
pnpm.cmd run test:unit
pnpm.cmd run check
```

Expected: PASS，0 critical skips，0 paid external calls。

- [ ] **Step 7: 提交当前任务**

```powershell
git add packages/db-migrator/src/smoke/applicationSmoke.ts packages/db-migrator/src/commands/rehearse.ts packages/server/modules/game-socket/service.ts tests/postgres/applicationSmoke.test.ts tests/postgres/smokeHarness.ts tests/postgres/runPostgresTests.cjs
git commit -m "test: add PostgreSQL application smoke gate"
```

---

### Task 9: 实现最终 readiness 聚合器和薄 PowerShell 运维入口

**Files:**

- Create: `packages/db-migrator/src/commands/release-readiness.ts`
- Modify: `packages/db-migrator/src/cli.ts`
- Modify: `packages/db-migrator/package.json`
- Create: `scripts/ops/postgres/preflight.ps1`
- Create: `scripts/ops/postgres/backup.ps1`
- Create: `scripts/ops/postgres/rehearse.ps1`
- Create: `scripts/ops/postgres/validate.ps1`
- Create: `scripts/ops/postgres/release-readiness.ps1`
- Create: `tests/migration/releaseReadiness.test.ts`
- Create: `tests/unit/postgresOpsScripts.test.ts`
- Modify: `tests/migration/runMigrationTests.cjs`
- Modify: `tests/unit/runUnitTests.cjs`

**Responsibility:** 从不可变报告计算最终 PASS/FAIL；为 Windows 运维人员提供一致、可复制的入口，但不在 PowerShell 重复数据库规则。

- [ ] **Step 1: 写 readiness 聚合失败测试**

`releaseReadiness.test.ts` 使用 fixture reports 覆盖：

- 缺任一 required artifact/report → FAIL。
- 任一输入 report failed → FAIL。
- 两次 rehearsal 的 source hash 不同 → FAIL。
- schema/runId 相同 → FAIL。
- backup dry-run 而非 executed → FAIL。
- restore drill、runtime image、TLS、least privilege、pool/timeouts、smoke、docs truth、operator signoff 任一未通过 → FAIL。
- 所有条件通过 → PASS，且总维护窗口为 `2 * max(rehearsal1.durationMs, rehearsal2.durationMs)`，向上取整到分钟。
- 任一输入报告文件 hash 与 manifest 不一致 → FAIL。

- [ ] **Step 2: 写 PowerShell 薄入口测试**

`postgresOpsScripts.test.ts` 断言每个脚本：

- 声明强类型 `param(...)`。
- 使用 `$PSScriptRoot` 解析仓库位置。
- 只调用 `pnpm.cmd --filter @ai-presenter/db-migrator ...`。
- 原样传递子进程退出码。
- 不包含 SQL、`psql`、`DROP SCHEMA`、`VACUUM`、checkpoint、连接串默认值或密码。

- [ ] **Step 3: 将两个测试加入 runner，确认失败**

```powershell
pnpm.cmd run test:migration
pnpm.cmd run test:unit -- postgresOpsScripts.test.ts
```

Expected: FAIL，模块/脚本不存在。

- [ ] **Step 4: 实现 release readiness 聚合**

`release-readiness.ts` 导出：

```ts
interface ReleaseReadinessOptions {
  runId: string;
  reportPaths: string[];
  outputDirectory: string;
  operatorSignoffPath: string;
}

async function runReleaseReadiness(options: ReleaseReadinessOptions): Promise<ReadinessReport>;
```

required check IDs 固定为：

```ts
const REQUIRED_RELEASE_CHECKS = [
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
```

聚合器只读取报告与签字 JSON，不自行连接数据库或执行外部命令。

- [ ] **Step 5: 实现五个 PowerShell 入口**

统一模式：

```powershell
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Output,
  [switch]$Execute
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../../..')
$arguments = @('--filter', '@ai-presenter/db-migrator', 'run', 'migrate', '--', '<command>', '--source', $Source, '--output', $Output)
if ($Execute) { $arguments += '--execute' }
& pnpm.cmd @arguments
exit $LASTEXITCODE
```

每个文件只声明自己需要的参数，不从脚本内读取/拼接密码。`release-readiness.ps1` 不接受 `-Execute`，因为只读输入并写报告；其输出目录必须显式传入。

- [ ] **Step 6: 增加清晰 package scripts**

在 `packages/db-migrator/package.json` 增加 `preflight`、`backup`、`validate`、`rehearse`、`release-readiness`，都复用同一 `tsx src/cli.ts <command>` 入口。

- [ ] **Step 7: 运行测试**

```powershell
pnpm.cmd run test:migration
pnpm.cmd run test:unit -- postgresOpsScripts.test.ts
pnpm.cmd --filter @ai-presenter/db-migrator run check
```

Expected: PASS。

- [ ] **Step 8: 提交当前任务**

```powershell
git add packages/db-migrator/src/commands/release-readiness.ts packages/db-migrator/src/cli.ts packages/db-migrator/package.json scripts/ops/postgres tests/migration/releaseReadiness.test.ts tests/migration/runMigrationTests.cjs tests/unit/postgresOpsScripts.test.ts tests/unit/runUnitTests.cjs
git commit -m "feat: add PostgreSQL readiness operations"
```

---

### Task 10: 修正文档运行真相并写可执行上线手册

**Files:**

- Modify: `docs/README.md`
- Modify: `docs/project-summary.md`
- Modify: `docs/project-server.md`
- Modify: `docs/project-workflow.md`
- Modify: `docs/postgresql-deployment.md`
- Create: `docs/runbooks/postgresql-production-readiness.md`
- Create: `docs/runbooks/postgresql-rollback.md`
- Create: `docs/runbooks/postgresql-operator-signoff.example.json`
- Create: `tests/unit/postgresqlDocsTruth.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Responsibility:** 删除仍把 SQLite/JSON fallback 描述为生产路径的陈旧内容，提供预检、备份、两次演练、恢复演练、最终验收和独立真实切换审批的明确操作顺序。

- [ ] **Step 1: 写文档真相失败测试**

`postgresqlDocsTruth.test.ts` 读取上述项目文档，断言：

- 生产唯一业务数据库写为 PostgreSQL 16。
- `better-sqlite3` 只允许出现在一次性 db-migrator 说明中。
- 不存在把 `DATABASE_PATH`、JSON fallback、SQLite volume 描述为当前生产运行路径的段落。
- 文档包含 `DATABASE_URL`、`DATABASE_SCHEMA`、TLS、CA、pool、connection timeout、statement timeout。
- runbook 包含 dry-run、`--execute`、同源 hash、两个新 schema、restore drill、2x maintenance window、失败现场保留、独立真实切换授权。
- rollback 文档明确恢复同一时间点 SQLite/WAL/SHM 与资源备份，不允许把失败 PostgreSQL 作为下次导入目标。

- [ ] **Step 2: 将测试加入 unit runner，确认失败**

```powershell
pnpm.cmd run test:unit -- postgresqlDocsTruth.test.ts
```

Expected: FAIL，现有 summary/deployment 文档仍有陈旧 SQLite 描述或 runbook 不存在。

- [ ] **Step 3: 更新项目地图文档**

- `docs/README.md`：加入生产 readiness 与 rollback runbook 索引。
- `docs/project-summary.md`：修正依赖、目录树、数据库图、部署 volume 与生产持久化描述。
- `docs/project-server.md`：记录 DbExecutor、启动 migration、health、配置/TLS/pool/timeout 和 db-migrator 隔离边界。
- `docs/project-workflow.md`：记录 PostgreSQL transaction/row lock/SKIP LOCKED，以及终态删除和跨局 memory 保留边界。
- `docs/postgresql-deployment.md`：作为环境准备说明，写最小权限角色、TLS、备份/WAL 归档、连接池预算和监控检查。

- [ ] **Step 4: 写 production readiness runbook**

必须按以下不可交换顺序给出可复制 PowerShell 命令：

1. 获取并只读保存生产 SQLite/WAL/SHM 与资源目录信息。
2. preflight dry-run。
3. backup `--execute`。
4. manifest 二次校验。
5. rehearsal 1 到全新 schema。
6. validation + smoke 1。
7. rehearsal 2 到另一个全新 schema。
8. validation + smoke 2。
9. SQLite/WAL/SHM/资源 restore drill 到隔离目录。
10. 收集 CI/runtime/TLS/least privilege/pool/timeouts/signoff 证据。
11. release-readiness 聚合。
12. PASS 后申请独立真实切换授权；不得在本 runbook 自动切流。

每一步列出输入、预期输出、成功条件、失败后的停止点和保存证据路径。

- [ ] **Step 5: 写 rollback runbook 与签字 schema 示例**

签字示例固定为：

```json
{
  "releaseCandidate": "<git-sha>",
  "readinessRunId": "<run-id>",
  "goLiveOwner": { "name": "", "approvedAt": "" },
  "rollbackOwner": { "name": "", "approvedAt": "" },
  "maintenanceWindowMinutes": 0,
  "status": "approved"
}
```

示例只能包含空值/占位结构，不能提交真实姓名、密码或连接信息。

- [ ] **Step 6: 运行文档与全量静态检查**

```powershell
pnpm.cmd run test:unit -- postgresqlDocsTruth.test.ts
pnpm.cmd run check
```

Expected: PASS。

- [ ] **Step 7: 提交当前任务**

```powershell
git add docs/README.md docs/project-summary.md docs/project-server.md docs/project-workflow.md docs/postgresql-deployment.md docs/runbooks/postgresql-production-readiness.md docs/runbooks/postgresql-rollback.md docs/runbooks/postgresql-operator-signoff.example.json tests/unit/postgresqlDocsTruth.test.ts tests/unit/runUnitTests.cjs
git commit -m "docs: add PostgreSQL production runbooks"
```

---

### Task 11: 执行两次生产副本演练、恢复演练与最终发布候选验收

**Files:**

- Generated, ignored: `artifacts/postgres-readiness/<run-id>/...`
- Modify only if evidence exposes a defect: the owning implementation/test/doc file from Tasks 1–10
- Do not commit: SQLite copies、WAL/SHM、资源副本、含环境信息的原始报告、operator signoff

**Responsibility:** 用同一生产 SQLite 只读副本完成两次独立演练，证明工具链和数据结论可重复；验证备份可恢复；最后跑完整门禁并生成脱敏 readiness summary。该任务仍不执行真实生产切换。

- [ ] **Step 1: 固定发布候选与演练输入**

记录：当前 Git SHA、源 SQLite 绝对路径、资源目录列表、测试 PostgreSQL URL 的秘密存储位置、输出目录、runId 1/2。确认工作区无本计划未提交代码；无关用户改动不影响 SHA 记录但必须继续保持未暂存。

- [ ] **Step 2: 启动隔离 PostgreSQL 16 演练环境**

```powershell
docker compose -f docker-compose.postgres-test.yml up -d
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:55432/consensus_test'
```

确认数据库名以 `_test` 结尾。不要使用生产 PostgreSQL URL。

- [ ] **Step 3: 运行 preflight dry-run**

```powershell
./scripts/ops/postgres/preflight.ps1 -Source '<production-sqlite-path>' -Target $env:TEST_DATABASE_URL -Schema 'consensus' -Output 'artifacts/postgres-readiness/preflight' -Resources '<resource-dir-list>' -RequireTls:$false
```

Expected: PASS；无新备份、schema 或源文件 mtime 变化。

- [ ] **Step 4: 生成一次一致性备份并锁定 source hash**

```powershell
./scripts/ops/postgres/backup.ps1 -Source '<production-sqlite-path>' -Output 'artifacts/postgres-readiness/source-backup' -Resources '<resource-dir-list>' -RunId '<backup-run-id>' -Execute
```

独立运行 manifest verify。记录 `sqlite-consistent.sqlite` SHA-256；后续两次 rehearsal 都只用这一文件，不再读取在线源路径。

- [ ] **Step 5: 执行 rehearsal 1**

```powershell
./scripts/ops/postgres/rehearse.ps1 -SourceSnapshot '<consistent-snapshot>' -Manifest '<manifest>' -Target $env:TEST_DATABASE_URL -Output 'artifacts/postgres-readiness/rehearsal-1' -RunId '<run-id-1>' -Execute
```

Expected: 新 schema A；migration、validation、smoke 全部 passed；报告记录源 hash、表计数、跳过表、各阶段耗时。

- [ ] **Step 6: 执行 rehearsal 2**

```powershell
./scripts/ops/postgres/rehearse.ps1 -SourceSnapshot '<same-consistent-snapshot>' -Manifest '<same-manifest>' -Target $env:TEST_DATABASE_URL -Output 'artifacts/postgres-readiness/rehearsal-2' -RunId '<run-id-2>' -Execute
```

Expected: 新 schema B，且 A != B；source hash 与第一次完全相同；表计数、抽样结论、skip 列表完全相同。不得删除或修改 schema A。

- [ ] **Step 7: 执行隔离恢复演练**

恢复到全新仓库外临时目录：raw SQLite、WAL、SHM、资源目录。只读打开恢复后的 SQLite，执行 integrity check 和关键表计数；校验所有 manifest hashes。恢复演练不得覆盖原路径，也不得启动真实应用或切流。

生成一个 stage=`backup` 的补充报告，检查 ID 必须为 `backup.restore-drill`，包含恢复目录、hash 结论和耗时，不包含源数据内容。

- [ ] **Step 8: 收集环境与镜像证据**

```powershell
pnpm.cmd run verify:release
docker build -t consensus-runtime-readiness:<git-sha> .
docker run --rm consensus-runtime-readiness:<git-sha> node -e "try { require.resolve('better-sqlite3'); process.exit(1) } catch { process.exit(0) }"
```

另行验证测试 PostgreSQL 连接使用最小权限演练账号、TLS 配置（本地演练可记录 skipped，但最终 production-ready 报告必须使用目标生产配置的只读证据并 passed）、pool 和 timeout 配置。任何真实生产连接证据只保存脱敏版本。

- [ ] **Step 9: 计算维护窗口**

取两次 rehearsal 的总耗时较大值，乘 2 后向上取整到分钟。将结果写入 operator signoff；用户已接受数小时至数天，因此不引入双写/CDC，只报告保守窗口和容量余量。

- [ ] **Step 10: 生成最终 readiness report**

```powershell
./scripts/ops/postgres/release-readiness.ps1 -Reports '<comma-separated-report-paths>' -OperatorSignoff '<signoff-json>' -Output 'artifacts/postgres-readiness/release' -RunId '<release-run-id>'
```

Expected: 所有 required checks 有证据时 PASS；任何缺失、failed、hash 不一致或签字缺失时 FAIL。不得手工编辑 failed 为 passed。

- [ ] **Step 11: 最终静态与工作区审计**

```powershell
pnpm.cmd run verify:release
git diff --check
git status --short
```

再扫描生产运行路径，确认不存在：

- `getDb().prepare`
- `INSERT OR REPLACE` / `INSERT OR IGNORE`
- `DATABASE_PATH`
- JSON database fallback
- production Compose SQLite volume
- server/runtime dependency on `better-sqlite3`

Expected: 所有门禁 PASS；只有用户原有未提交文件或明确的修复文件出现在 status；演练产物被忽略。

- [ ] **Step 12: 缺陷处理规则**

如果演练发现缺陷：停止聚合，不清理失败 schema/报告；在 owning module 添加先失败测试，完成最小修复，重跑 Tasks 1–10 的相关门禁，然后用两个全新 runId/schema 从 Step 5 重新完成两次演练。旧失败现场只用于排障，不作为重试目标。

- [ ] **Step 13: 提交必要修复与脱敏文档结论**

只有确实产生代码/测试/文档修复时才提交；每个修复独立提交。不要提交演练数据或真实 signoff。最终可以在 `docs/runbooks/` 增加不含敏感信息的演练结论模板实例，并单独提交：

```powershell
git add <exact-fixed-files>
git commit -m "fix: address PostgreSQL rehearsal finding"
```

---

## Final Acceptance Checklist

- [ ] PR 与 master 使用相同 `verify` job，deploy 只在 master 且 verify 通过后运行。
- [ ] `pnpm.cmd run verify:release` 全部通过。
- [ ] PostgreSQL 16 集成测试通过，关键路径 skip 为 0。
- [ ] 生产 runtime image 无 `better-sqlite3` 可解析依赖。
- [ ] preflight 默认只读，所有变更命令需要 `--execute`。
- [ ] 一致性 SQLite backup、raw DB/WAL/SHM、资源目录和 SHA-256 manifest 完整。
- [ ] 两次演练使用同一 source hash、不同 runId、不同全新 schema，结果一致。
- [ ] 管理员、配置、玩家、游戏历史、回放、长期记忆抽样一致。
- [ ] 旧 workflow 与旧观测数据明确 skipped，未被意外迁移。
- [ ] 真实应用 health/auth/CRUD/game/replay/memory/delete smoke 通过且无付费外部调用。
- [ ] SQLite/WAL/SHM/资源恢复演练通过。
- [ ] TLS、最小权限、pool、timeout 与备份/WAL 归档证据通过。
- [ ] 文档不再把 SQLite/JSON fallback 描述为生产路径。
- [ ] 最终 readiness report 为 PASS，并由上线负责人和回滚负责人书面确认。
- [ ] 真实生产切换仍处于未执行状态，等待独立授权和维护窗口。
