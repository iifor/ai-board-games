# Task 6 report: 隔离式 PostgreSQL 迁移排练

## 状态

- 完成；独立提交主题：`feat: orchestrate isolated migration rehearsals`
- 未连接生产环境；真实集成测试仅通过进程级 `TEST_DATABASE_URL` 指向本地 PostgreSQL 16 测试库。

## 第一性结论

排练的本质不是再实现一套迁移器，而是在一次性、可追踪、不可覆盖的隔离 schema 中按正式顺序执行现有 canonical migrations、现有 importer 与 Task 5 validation。server 因此只拥有一个已编译薄适配器，db-migrator 只通过子进程和 stdin 调用它；两者没有反向依赖、没有直接或动态加载 server TypeScript，也没有复制 SQL 或第二套 migration runner。

## 新增文件与职责

- `packages/server/db/postgres/rehearsalAdapter.ts`
  - 在 server 编译上下文调用 canonical `createPostgresExecutor` 与 `migratePostgres`。
  - 从 stdin 接收目标 URL，以固定、脱敏 JSON 输出结果；不把 URL 放入 argv、stdout 或错误消息。
  - 在同一 PostgreSQL advisory lock 内检查 runId hash、创建 schema 并迁移，原子阻止并发或跨输出目录复用同一 runId。
- `packages/server/scripts/build-rehearsal-adapter.cjs`
  - 编译适配器依赖闭包并仅同步 canonical migration SQL；不清空完整 server `dist`。
- `packages/server/tsconfig.rehearsal.json`
  - 锁定 server-owned 适配器的独立 emit 边界。
- `packages/db-migrator/src/postgres/rehearsalSchema.ts`
  - 生成并校验安全 schema 名；执行已编译适配器；实现数据库名 `_test`/`_rehearsal` 门禁和固定错误映射。
- `packages/db-migrator/src/postgres/validationExecutor.ts`
  - 为 Task 5 validation 提供本包内只读 PostgreSQL executor，避免 dist 运行时加载 server TypeScript。
- `packages/db-migrator/src/commands/rehearse.ts`
  - 编排 manifest 校验、formal migrations、import、Task 5 validation 与排练报告。
  - dry-run 完全不连接 PostgreSQL；失败保留 schema/report；不提供 drop API。
- `tests/postgres/rehearsalCommand.test.ts`
  - 覆盖安全门禁、stdin/argv、已编译适配器、真实 PostgreSQL、并发唯一性、dry-run、双 run 隔离、失败保留、CLI 脱敏、原子报告及 dist 实际执行。

## 修改文件与职责

- `packages/server/package.json`：server build 产出普通入口与 rehearsal adapter，且普通 `dist` 不被删除。
- `packages/db-migrator/src/cli.ts`：增加向后兼容的 `rehearse` 子命令与稳定结构化输出。
- `packages/db-migrator/src/commands/validate.ts`：改用本包只读 executor，移除 server 源码运行时加载。
- `packages/db-migrator/src/importer.ts`：允许注入已准备 client，并显式设置 rehearsal search path；旧 CLI 路径保持兼容。
- `packages/db-migrator/src/index.ts`、`src/types.ts`：导出排练入口及所需类型。
- `packages/db-migrator/src/reporting/reportTypes.ts`：增加 rehearsal stage/artifact 和顶层 schema 字段。
- `packages/db-migrator/src/reporting/reportWriter.ts`：共享非覆盖原子 JSON 发布；临时文件 fsync，发布或清理失败不假成功；Markdown 显示保留 schema。
- `tests/postgres/sqliteImporter.test.ts`：固定 prepared-client 与 search path 契约。
- `tests/postgres/runPostgresTests.cjs`：把 Task 6 测试纳入 PostgreSQL 全套。
- `docs/project-server.md`、`docs/project-summary.md`、`docs/postgresql-deployment.md`：记录编译边界、运行顺序、安全门禁、失败保留和操作命令。

## 关键契约

- schema 形状固定为 `consensus_rehearsal_<UTC timestamp>_<10 hex run hash>`。
- execute 只允许目标数据库名以 `_test` 或 `_rehearsal` 结尾；dry-run 不打开数据库、不创建 schema。
- 同一 runId hash 在目标数据库全局唯一，不因时间或输出目录变化而绕过；并发决定由 PostgreSQL advisory lock 原子保护。
- 两次不同 runId 的 execute 使用隔离 schema，但绑定相同 source snapshot hash。
- 执行顺序固定为 canonical migrations → importer → Task 5 validation。
- import/validation 失败保留已创建 schema 和已发布报告以供调查；没有 drop/truncate API。
- target URL 只经子进程 stdin 传递；结构化报告、CLI 输出和适配器错误均不包含 URL 或 endpoint。
- JSON artifact 使用临时文件、fsync 和非覆盖发布；清理失败返回固定可审计错误，已发布 final 不被误删。

## TDD 证据

- RED：缺少 rehearsal schema/command/compiled adapter；随后分别以 module missing、build artifact missing 与 CLI route missing 失败。
- RED：server build 清空完整 `dist`，普通入口 sentinel 丢失；修复为仅更新适配器 migration SQL 后转绿。
- RED：close 失败覆盖前序业务异常；修复为保留 primary error、close-only 返回固定错误。
- RED：dry-run 触碰数据库、报告不是原子发布、失败 CLI 缺少 schema；逐项固定后转绿。
- RED：db-migrator dist 加载 server TypeScript；改为本包只读 validation executor 后从 dist 实际运行转绿。
- RED：同 runId 更换时间/输出目录可绕过，并发 create 存在竞态；改为数据库全局 suffix 检查与 advisory lock 后转绿。
- RED：artifact 临时清理失败被吞；修复为保留 final 并返回 `ARTIFACT_TEMP_CLEANUP_FAILED` 后转绿。

## 最终验证

- `pnpm.cmd --filter @ai-presenter/server run build`：通过。
- `pnpm.cmd --filter @ai-presenter/db-migrator run build`：通过。
- server 与 db-migrator `check`：均通过。
- `pnpm.cmd run test:migration`：60/60 通过，0 失败。
- `pnpm.cmd run test:postgres`：68/68 通过，0 失败；包含真实 PostgreSQL、并发和从两包 `dist` 实际运行。
- `git diff --check`：通过。

## 影响边界

- 前端改动：无。
- 后端改动：server 新增只供排练使用的已编译适配器；db-migrator 新增排练编排。
- API 变化：无 REST/WebSocket API 变化；新增 CLI 子命令。
- 数据库变化：无正式 migration/schema 定义变化；排练只在显式测试/排练数据库创建隔离 schema。
- 类型变化：仅 db-migrator 内部排练/report 类型扩展；无跨产品共享 API 类型变化。
- 删除文件：无。

## 风险与后续

- 失败排练刻意保留 schema，运维需按报告人工调查和清理；本任务明确不提供自动 drop API。
- advisory lock 仅序列化同 runId hash，其他 runId 可并行，这是隔离排练的预期行为。
- 完整 PostgreSQL 套件仍输出既有 LLM fallback/observability 测试日志，但 TAP 结果为 68/68；本任务未改变这些非排练路径。
- 当前无阻塞上线排练的待补测试；部署时必须先构建 server adapter 与 db-migrator，并继续只在专用 `_test`/`_rehearsal` 数据库运行。

## Fix Round 1

- 独立修复提交主题：`fix: keep rehearsal connection details out of artifacts`

### 评审核验与修复

- 父进程 argv：核验发现新 `rehearse` 命令会优先接受 `--target` 的完整连接 URL。该命令没有已部署兼容负担，现只从进程环境 `DATABASE_URL` 读取目标；任何 `--target` 在源文件、输出目录或数据库访问前固定返回 `REHEARSAL_TARGET_ARG_FORBIDDEN` / `Rehearsal target must be provided through DATABASE_URL`。preflight、validate 和旧 migrate 等其他命令保持原行为。
- importer 报告：核验发现 `migrationReport.errors` 会直接保存 PostgreSQL driver 的原始 `error.message`，失败排练随后会原样持久化 migration artifact。现 immediate caller 仍收到同一个原始 Error 对象用于诊断控制流，但附加的 `migrationReport.errors` 只包含 allowlisted `MIGRATION_IMPORT_FAILED: SQLite to PostgreSQL import failed`；原始 hostname、IP、port、URL、username 和 password 不进入任何报告。
- 文档与示例：`docs/postgresql-deployment.md` 和实施计划改为先设置 `$env:DATABASE_URL`，再运行不含 `--target` 的 rehearse；文档明确父/子 argv 与结构化输出均不承载连接 URL。

### RED → GREEN 证据

- Finding 1 RED：focused 1 项测试 0/1；现实现继续访问不存在的 manifest，而不是固定拒绝 literal `--target`。
- Finding 1 GREEN：focused 1/1；断言 source、database 和 output 均未访问，错误及 stdout/stderr 不含 URL、用户名、密码、IP 或端口。
- Finding 2 RED：focused 1 项测试 0/1；实际 `migrationReport.errors` 含 `postgresql://endpoint_user:endpoint_password@adversarial.host:6543/...`、`198.51.100.44` 和完整 driver 文本。
- Finding 2 GREEN：focused 1/1；立即 caller 保持原 Error 身份，附加报告、原子持久化 migration/rehearsal 文件及 CLI 可观察输出只含固定安全文本。组合 CLI focused 回归 3/3。

### 最终验证

- `pnpm.cmd run test:postgres`：70/70 通过，0 失败；使用进程级本地 PostgreSQL 16 测试 URL，包含从 db-migrator `dist` 以 `DATABASE_URL` 实际运行。
- `pnpm.cmd run test:migration`：60/60 通过，0 失败。
- server `check` / `build`：均通过。
- db-migrator `check` / `build`：均通过。
- `git diff --check`：通过。

### 文件与边界

- 修改：`packages/db-migrator/src/cli.ts`、`packages/db-migrator/src/importer.ts`、`tests/postgres/rehearsalCommand.test.ts`、`docs/postgresql-deployment.md`、`docs/superpowers/plans/2026-08-09-postgresql-production-readiness.md` 和本报告。
- 新增/删除：无。
- REST/WebSocket、正式 migration/schema、共享类型和前端：无变化。
- 保持原子 artifact 发布、失败 schema/report 保留、无 drop API；本轮未扩大修改其他 CLI 的 target 兼容语义。
