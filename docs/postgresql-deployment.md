# PostgreSQL 16 环境与部署基线

本文只定义 PostgreSQL 16 的生产环境基线。正式切换前的 12 步证据流程见 `docs/runbooks/postgresql-production-readiness.md`；切换验收失败见 `docs/runbooks/postgresql-rollback.md`。这些文档和脚本都不会自动连接真实生产或切换流量，真实切换必须另行获得独立授权。

## 运行边界

- 生产唯一业务数据库为 Compose 私网内的 PostgreSQL 16；不发布宿主端口，数据只写入命名 volume `consensus-postgres-data`。
- 服务启动在监听端口前执行带 advisory lock 与校验和的 migration 和幂等 seed；失败即停止启动。
- `/api/toc/health` 执行真实 PostgreSQL 查询，数据库不可用时返回 HTTP 503。
- 上传图片、头像和生成音频仍位于文件系统资源目录，必须与数据库恢复点配套备份。
- 旧数据只通过 `packages/db-migrator` 一次性只读导入全新空目标；旧 workflow 和旧观测数据不迁移。

## 必需环境变量

| 变量 | 生产要求 |
| --- | --- |
| `DATABASE_URL` | Compose 中不由宿主配置；app/migrator wrapper 从各自密码 secret 在子进程环境内构造固定 host/database/role URL，不得进入命令行、日志或报告 |
| `DATABASE_SCHEMA` | 默认 `consensus`；仅允许小写 PostgreSQL identifier |
| `DATABASE_SSL` | 生产仅允许 `verify-full`，同时校验证书链和主机名 |
| `DATABASE_CA_PATH` | 挂载的可信 CA 文件路径；文件只读且权限最小化 |
| `DATABASE_POOL_MAX` | 单实例默认 10；总连接预算为实例数乘该值，再加迁移、备份和监控保留量 |
| `DATABASE_CONNECTION_TIMEOUT_MS` | 默认 5000，必须为正整数 |
| `DATABASE_STATEMENT_TIMEOUT_MS` | 默认 30000，必须为正整数 |

`require` 仅用于运行时代码兼容旧环境；它不验证主机名，不满足生产签署基线，不能作为生产选项。

## 最小权限角色

推荐区分迁移角色和应用角色。迁移角色在受控发布阶段拥有目标 schema 的 DDL 权限；应用角色只拥有连接、schema usage、业务表 DML、sequence 使用以及读取 migration 状态所需权限。完成 migration 后撤销应用角色不需要的 schema/database create 权限。

Compose 新 PGDATA 由 `init-production-roles.sh` 仅创建角色和 database grants，不创建 `consensus` schema。`consensus_migrator` 获得 database `CREATE`，并为其将来创建的 schema/table/sequence 设置 app 的 default privileges；`consensus_app` 只有 database `CONNECT`，schema 出现后自动获得 `USAGE`、表 DML 和 sequence 使用权。授权后使用隔离环境的应用角色执行以下只读验证；连接信息必须由 secret manager 注入，不要写入仓库：

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

首次部署必须先启动 `postgres`，再通过 `docker compose --profile ops run --rm migrator <受批准的迁移/导入命令>` 创建 `consensus` schema 并应用当前 migration，最后才启动 app/nginx。后续包含 DDL 的版本重复“migrator 先行、app 后启”流程；app 使用 DML 角色，启动 migration 阶段只允许已应用版本的校验/no-op，不可临时换用 migrator 凭据。migrator 是一次性 `run --rm` 运维入口，不通过普通 `docker compose up` 常驻。

## TLS 与证书校验

- 生产连接必须使用 `verify-full` 校验证书链和主机名；leaf SAN 必须包含 Compose DNS 名 `postgres`。app/migrator 只挂载 CA，PostgreSQL 才挂载 server cert/key 源目录。
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

导入后校验使用独立的 PostgreSQL 类型解析契约，不继承 server 进程对 `pg` 的全局解析器。业务样本比较把 SQLite JSON 当作序列化文本、PostgreSQL JSON 当作已解析值；时间保留毫秒；只有表级清单明确声明的 `bigint` 列会规范化为十进制字符串。JSON 形状必须与应用读取契约一致：`skins.terms_json` 与 `games.event_json` 均为对象，数组或 JSON `null` 都会使对应语义检查失败。

## Docker build-context boundary (2026-08-11)

The repository root is the production Docker build context, but operational evidence is never an image input. `.dockerignore` excludes the complete `artifacts/`, `.superpowers/`, `.worktrees/`, `backups/`, `reports/`, `logs/`, and temporary-output trees. Case-insensitive rules exclude SQLite/database, dump/backup, log, and temporary-file suffixes at any depth, plus `-wal`, `-shm`, and `-journal` sidecars for any basename. This explicitly covers the legacy `packages/data/*.sqlite*` source set in the primary checkout without deleting it.

The builder can continue to use `COPY . .` only behind that filtered boundary. Package manifests, application source, documentation, and `packages/server/resources` remain in the context; resources are required by the server image and must not be removed by a broad evidence rule. The final runtime stage copies only server/shared runtime inputs and compiled web assets. It must not contain `packages/db-migrator`, operational evidence directories, or the resolvable `better-sqlite3` module that belongs only to the one-time migration (一次性迁移) package `packages/db-migrator`.

## Production Compose PostgreSQL boundary (2026-08-11)

Production Compose runs a private `postgres:16-alpine` service with the named durable volume `consensus-postgres-data`; it publishes no PostgreSQL host port. `app` waits for the database health check and connects only as `consensus_app`; its fixed production settings are `DATABASE_SSL=verify-full`, schema `consensus`, pool maximum `10`, connection timeout `5000`, and statement timeout `30000`. The offline `migrator` is a separate image and has the `ops` profile, so ordinary `docker compose up` never starts it; it connects only as `consensus_migrator`.

All role-password files are host-provided Compose secrets and remain outside Git. Compose has safe default paths under `../consensus-secrets`, so `docker compose config --services` works without operations environment variables; startup still fails closed when a required file is absent/empty. The bootstrap account is used only to create `consensus_app` and `consensus_migrator`; bootstrap credentials are not supplied to either application image. On first PGDATA initialization the role script rejects missing or empty role-password files, creates SCRAM credentials, installs `hostnossl ... reject` plus `hostssl ... scram-sha-256` rules, and leaves `consensus` schema absent. The migration role has database `CREATE` and schema-independent default privileges; when it creates schema/tables/sequences, the app receives only usage/DML/sequence privileges and still cannot perform DDL.

TLS files are host-provided, never generated by this repository. The leaf certificate must contain `DNS:postgres` in its SAN because Compose clients use hostname `postgres` with `verify-full`. On Linux, keep `../consensus-secrets/postgres-tls` root-owned mode `0700`; `server.key` must be root:root `0600`, while `server.crt` and `ca.crt` are root:root `0644`. PostgreSQL starts as root only long enough to copy those three bind-mounted files into container-only `/run/postgres-tls` tmpfs, sets the staged key to postgres:postgres `0600`, then execs the official entrypoint. app and migrator receive only the separate CA Compose secret at `/run/secrets/postgres_ca`; they cannot see the server certificate or key. Password files remain outside Git and are mode `0600` in a root-owned `0700` directory.

Release evidence must retain the plain Docker build log so the `load build context` byte count and elapsed time are reviewable. After a successful build, run the image-level checks below before approving `runtime.no-sqlite`:

```powershell
docker compose build app
docker compose create --no-deps app
$AppImage = (docker compose images -q app).Trim()
if ([string]::IsNullOrWhiteSpace($AppImage)) { throw 'Compose app image was not created.' }
$AppCmd = (docker image inspect --format '{{json .Config.Cmd}}' $AppImage).Trim()
if ($AppCmd -cne '["node","scripts/ops/postgres/start-production-app.cjs"]') { throw "Unexpected app CMD: $AppCmd" }
docker run --rm --entrypoint node $AppImage -e "const fs=require('node:fs'); const forbidden=['/app/packages/db-migrator','/app/artifacts','/app/.superpowers','/app/.worktrees']; if(forbidden.some(fs.existsSync)) process.exit(1); try { require.resolve('better-sqlite3'); process.exit(1) } catch { process.exit(0) }" # actual Compose-built app image, 一次性迁移 dependency isolation probe
docker compose rm -f app
```
