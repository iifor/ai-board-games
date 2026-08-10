# PostgreSQL 16 环境与部署基线

本文只定义 PostgreSQL 16 的生产环境基线。正式切换前的 12 步证据流程见 `docs/runbooks/postgresql-production-readiness.md`；切换验收失败见 `docs/runbooks/postgresql-rollback.md`。这些文档和脚本都不会自动连接真实生产或切换流量，真实切换必须另行获得独立授权。

## 运行边界

- 生产唯一业务数据库为独立部署的 PostgreSQL 16；应用 Compose 不创建数据库服务。
- 服务启动在监听端口前执行带 advisory lock 与校验和的 migration 和幂等 seed；失败即停止启动。
- `/api/toc/health` 执行真实 PostgreSQL 查询，数据库不可用时返回 HTTP 503。
- 上传图片、头像和生成音频仍位于文件系统资源目录，必须与数据库恢复点配套备份。
- 旧数据只通过 `packages/db-migrator` 一次性只读导入全新空目标；旧 workflow 和旧观测数据不迁移。

## 必需环境变量

| 变量 | 生产要求 |
| --- | --- |
| `DATABASE_URL` | 最小权限应用角色连接串；只放在 secret manager/受控 `.env`，不得进入命令行、日志或报告 |
| `DATABASE_SCHEMA` | 默认 `consensus`；仅允许小写 PostgreSQL identifier |
| `DATABASE_SSL` | 生产仅允许 `verify-full`，同时校验证书链和主机名 |
| `DATABASE_CA_PATH` | 挂载的可信 CA 文件路径；文件只读且权限最小化 |
| `DATABASE_POOL_MAX` | 单实例默认 10；总连接预算为实例数乘该值，再加迁移、备份和监控保留量 |
| `DATABASE_CONNECTION_TIMEOUT_MS` | 默认 5000，必须为正整数 |
| `DATABASE_STATEMENT_TIMEOUT_MS` | 默认 30000，必须为正整数 |

`require` 仅用于运行时代码兼容旧环境；它不验证主机名，不满足生产签署基线，不能作为生产选项。

## 最小权限角色

推荐区分迁移角色和应用角色。迁移角色在受控发布阶段拥有目标 schema 的 DDL 权限；应用角色只拥有连接、schema usage、业务表 DML、sequence 使用以及读取 migration 状态所需权限。完成 migration 后撤销应用角色不需要的 schema/database create 权限。

权限授予必须由受审 IaC 或 DBA 变更执行，仓库不提供自动授权 SQL。授权后使用隔离环境的应用角色执行以下只读验证；连接信息必须由 secret manager 注入，不要写入仓库：

```powershell
$AppSchema = if ($env:DATABASE_SCHEMA) { $env:DATABASE_SCHEMA } else { 'consensus' }
if ($null -ne $env:PGSERVICE -and $env:PGSERVICE.Length -gt 0) {
  throw 'PGSERVICE is forbidden in the signed readiness gate.'
}
foreach ($name in @('PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE','PGSSLROOTCERT')) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { throw "$name is required." }
}
if ($env:PGSSLMODE -cne 'verify-full') { throw 'PGSSLMODE must be exactly verify-full.' }
$pgRootCert = (Resolve-Path -LiteralPath $env:PGSSLROOTCERT).Path
$databaseCaPath = (Resolve-Path -LiteralPath $env:DATABASE_CA_PATH).Path
if ($pgRootCert -cne $databaseCaPath) { throw 'PGSSLROOTCERT and DATABASE_CA_PATH must resolve to the same file.' }
$sessionSsl = (& psql -X -tA -v ON_ERROR_STOP=1 -c `
  'SELECT ssl::text FROM pg_stat_ssl WHERE pid = pg_backend_pid();').Trim()
if ($LASTEXITCODE -ne 0 -or $sessionSsl -cne 'true') { throw 'Current backend session is not using TLS.' }
$state = (& psql -X -tA -v ON_ERROR_STOP=1 `
  --set=app_schema=$AppSchema -c `
  "SELECT has_database_privilege(current_user,current_database(),'CONNECT')::text || '|' || has_database_privilege(current_user,current_database(),'CREATE')::text || '|' || has_schema_privilege(current_user, :'app_schema','USAGE')::text;").Trim()
if ($LASTEXITCODE -ne 0 -or $state -cne 'true|false|true') {
  throw 'Expected CONNECT=true, CREATE DATABASE=false, schema USAGE=true.'
}
```

签署的 readiness gate 禁止 `PGSERVICE`，因为其 TLS 设置无法直接写入证据；`psql` 只读取完整的 `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD/PGSSLMODE/PGSSLROOTCERT`。`PGSSLMODE` 必须精确为 `verify-full`，root cert 必须与 `DATABASE_CA_PATH` 解析到同一文件，并通过 `pg_stat_ssl WHERE pid=pg_backend_pid()` 证明当前会话 `ssl=true`；不得把 URL 作为位置参数展开到进程列表或审计日志。

DBA 必须审核实际 grants，并保存 `\du+`、`\dn+`、schema/table/sequence grants 和拒绝 `CREATE DATABASE`/非目标 schema 写入的证据。

因为应用启动会执行 migration，发布阶段可短时使用迁移角色完成一次受控初始化；随后必须撤销该凭据并以应用角色重启。应用角色仍需读取 migration 状态，但不应长期持有 database/schema create 权限。后续版本有新 migration 时重复同一受控发布流程。

## TLS 与证书校验

- 生产连接必须使用 `verify-full` 校验证书链和主机名；CA 文件通过 `DATABASE_CA_PATH` 挂载为只读，并与 `PGSSLROOTCERT` 指向同一文件。
- 预检 URL 使用 `sslmode=verify-full`，与 `-RequireTls true` 一起形成 fail-closed 门禁。
- 证书到期时间、握手失败、CA 轮换和数据库端强制 TLS 状态纳入监控；证书轮换先在隔离环境验证。

## 连接池与超时预算

`DATABASE_POOL_MAX × 最大应用实例数 + migration/运维/监控预留` 必须小于数据库 `max_connections` 的受控预算。告警至少覆盖池等待、活跃/空闲连接、连接失败、statement timeout、长事务、死锁、锁等待和连接耗尽。扩容应用实例前先重新核算，而不是只提高数据库上限。

## 备份、WAL 归档与恢复演练

- 每日执行受控物理基础备份或 `pg_dump`，启用 WAL 归档以支持 PITR；持续监控 archive lag、最近成功备份、备份大小和校验结果。
- 资源目录单独备份，并与数据库恢复点记录同一 UTC 时间、水位和 SHA-256；备份加密、最小权限访问、异机保存并设置保留期。
- 至少每季度在隔离环境恢复基础备份、回放 WAL、核验 migration checksum、执行真实 health/smoke，并记录 RPO/RTO。
- 首次 PostgreSQL 正式切换仍需保留切换前同一时间点 SQLite、`-wal`、`-shm`（存在时）和资源快照，以支持旧镜像回滚。
- 一次性 SQLite backup 的完整 runId 只用于最终目录、报告与 manifest 审计字段；内部 staging/failed/owner 名称为固定长度摘要加排他随机后缀，避免 Windows 路径随 runId 线性膨胀。工具会在源内容复制和 SQLite recovery 打开前检查数据库主文件及 `-wal`、`-shm`、`-journal` 的实际路径，超限固定返回 `BACKUP_PATH_TOO_LONG` 且不发布部分 backup；合法 runId 不需要人为缩短。
- backup 二次校验和 restore drill 必须使用 db-migrator 的 `verify-backup` 与 `restore-drill`，不得以 PowerShell `Get-FileHash`/`Copy-Item` 或临时 `node -e` SQLite 脚本替代。正式命令支持长资源路径，复核完整 manifest 闭包与稳定文件身份，将 raw main/WAL/SHM、consistent copy 和每个资源 source index 恢复到证据根下的隔离相对目标，并以只读/query-only integrity/counts 和逐文件 hash 生成原子报告。

## 监控与发布门禁

上线前必须有数据库可用性、复制/WAL 归档、备份新鲜度、连接池、超时、锁/死锁、慢查询、autovacuum、表/索引膨胀、磁盘、证书到期和 `/api/toc/health` 告警。发布聚合器固定检查 CI、无关键 skip、执行备份、restore drill、两次独立演练、同源 hash、runtime 无旧数据库依赖、TLS、最小权限、pool/timeouts、同 schema smoke、文档真相和独立 operator signoff。

## 一次性导入与失败现场

导入目标必须是全新空 PostgreSQL database/schema，不支持增量、合并或长期双写。生产准备路径的 `preflight`、`validate` 与 `rehearse` 都只从进程环境读取 `DATABASE_URL`，命令行 `--target` 会在任何 I/O 前以脱敏错误拒绝；一次性 `migrate` 的旧 CLI 兼容入口不属于该路径。执行失败时 schema 和 migration/validation/smoke/rehearsal 报告全部保留。失败 PostgreSQL 目标仅用于排障，下一次演练或正式重试必须使用另一个全新空目标。
