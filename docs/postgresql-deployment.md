# PostgreSQL 16 部署与切换

生产应用只连接独立部署的 PostgreSQL 16，不由应用 Compose 创建数据库。应用账号只需要目标 schema 的连接、读写、sequence 使用权限；迁移账号还需要创建 schema 与 DDL 权限。TLS 必须校验证书，使用 `DATABASE_SSL=require` 和 `DATABASE_CA_PATH` 指向 CA 文件。

## 首次准备

1. 创建空数据库、`consensus` schema、迁移账号和最小权限应用账号。
2. 配置 `DATABASE_URL`、`DATABASE_SCHEMA`、TLS、连接池和超时变量。
3. 启动服务时自动获取 advisory lock 并执行带校验和的 SQL migration；migration 或 seed 失败时服务不会监听端口。
4. `/api/toc/health` 会执行真实 PostgreSQL 查询；数据库不可用时返回 HTTP 503。

## 一次性 SQLite 导入

只能向业务表为空的目标 schema 导入：

```powershell
pnpm.cmd --filter @ai-presenter/db-migrator migrate -- --source C:\backup\ai-presenter.sqlite --target $env:DATABASE_URL --schema consensus
```

工具以只读方式打开 SQLite，并在一个 PostgreSQL 事务中导入配置、管理员、玩家、游戏历史、回放和跨局长期记忆。旧 workflow 运行数据和旧观测数据明确跳过。输出包含一行机器可读 JSON 和人类可读摘要；JSON、时间、外键、行数或 sequence 校验失败会整体回滚。目标非空时拒绝运行，因此重复执行也会被拒绝。

## 全新 schema 迁移演练

先构建 server adapter 与 db-migrator：

```powershell
pnpm.cmd --filter @ai-presenter/server run build
pnpm.cmd --filter @ai-presenter/db-migrator run build
```

不带 `--execute` 的 dry-run 只验证 manifest、数据库名称和参数，并报告将使用的安全 schema；它不会连接 PostgreSQL：

```powershell
pnpm.cmd --filter @ai-presenter/db-migrator run migrate -- rehearse --source-snapshot C:\backup\sqlite-consistent.sqlite --manifest C:\backup\manifest.json --target $env:TEST_DATABASE_URL --output C:\backup\rehearsal-reports --run-id rehearsal-20260810
```

确认后追加 `--execute`。命令只允许 database 名以 `_test` 或 `_rehearsal` 结尾，创建 `consensus_rehearsal_<UTC timestamp>_<run hash>` schema，依次执行正式 migration、事务导入和 migration validation。相同 runId 即使更换时间或输出目录也会因全库 run hash 门禁而拒绝；并发创建由 adapter 内 advisory lock 串行化。数据库 URL 仅经子进程 stdin 传给已编译 adapter，不出现在其 argv 或结构化输出中。

失败时 CLI 退出码为 1，并在脱敏 JSON 中返回保留的 schema 名。schema、迁移报告、validation 报告和 rehearsal summary 均保留用于排障；工具没有 drop/truncate API。后续重试必须使用新的 runId，确认不再需要失败现场后由数据库管理员在维护流程中单独处置。

## 正式切换

1. 至少用生产 SQLite 副本完成两次演练，记录耗时和逐表行数。
2. 进入维护窗口，停止新建对局并等待活动对局结束，然后停止旧应用。
3. 对 SQLite 执行 checkpoint，备份数据库、`-wal`、`-shm`（若存在）以及资源目录；记录同一时间点和校验和。
4. 向全新 PostgreSQL schema 执行导入，保存 JSON 报告。
5. 启动 PostgreSQL 版本，验证管理员登录、配置 CRUD、完整对局、历史回放、长期记忆、观测写入和终态对局删除。
6. 验收通过后恢复流量。

## 备份与恢复

- 每日执行 PostgreSQL 物理基础备份或受控的 `pg_dump`，启用 WAL 归档以支持时间点恢复（PITR）。
- 资源目录独立备份；数据库备份和资源备份必须记录同一恢复时间点。
- 每季度在隔离环境执行恢复演练：恢复基础备份、回放 WAL、运行 migration checksum 校验和冒烟测试，并记录 RPO/RTO。
- 备份文件加密、限制访问，并设置与业务要求一致的保留期。

## 回滚

若验收失败，立即停止 PostgreSQL 版本，恢复旧镜像以及切换前同一时间点的 SQLite/WAL/资源备份。失败的 PostgreSQL 数据库只保留排障，不作为下一次导入目标；下一次重试必须使用全新空库。切换期间不实施双写，因此不得在两套应用同时接收真实写流量。
