# PostgreSQL 16 切换失败回滚 Runbook

本手册只用于首次 PostgreSQL 切换验收失败后的数据一致性回滚。目标是恢复旧镜像，以及切换前同一时间点的 SQLite/WAL/SHM 与资源备份；不得把 PostgreSQL 切换后的写入合并回旧系统，也不得让两套应用同时接收真实写流量。

## 触发条件与权限

- 仅 go-live owner 宣布验收失败、rollback owner 接管并获得当次回滚授权后执行。
- 使用正式切换前最后一份已验证 backup manifest；SQLite、`-wal`、`-shm`（存在时）和资源必须来自同一时间点、同一 runId。
- 失败 PostgreSQL database/schema 立即隔离，只读保留用于排障；不得 drop、覆盖，也不得作为下次或后续导入目标。下一次尝试必须使用全新空库/schema。

## 1. 冻结写入并停止 PostgreSQL 应用版本

**输入**：当次变更单、失败版本镜像标识、负载均衡和应用控制权限。

**命令**：

```powershell
$ErrorActionPreference = 'Stop'
$RollbackRoot = 'REPLACE_WITH_NEW_ROLLBACK_EVIDENCE_DIRECTORY'
New-Item -ItemType Directory -Path $RollbackRoot | Out-Null
'Stop accepting traffic, stop the PostgreSQL application, preserve logs.' |
  Set-Content -LiteralPath (Join-Path $RollbackRoot '01-freeze-and-stop.txt')
```

**预期输出**：入口不再向失败版本分配请求，应用完全停止，数据库不再产生应用写入。

**成功条件**：活跃请求归零、应用实例停止、流量仍未恢复。

**失败停止点**：无法证明写入已冻结时不得恢复旧版本。

**证据路径**：`$RollbackRoot\01-freeze-and-stop.txt`、平台审计日志。

## 2. 隔离并保留失败 PostgreSQL 现场

**输入**：失败 database/schema 标识和 DBA 事件单。

**命令**：

```powershell
$FailedTargetId = 'REPLACE_WITH_FAILED_DATABASE_AND_SCHEMA_ID'
[ordered]@{
  target = $FailedTargetId
  disposition = 'diagnostics-only-do-not-reuse'
  capturedAt = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RollbackRoot '02-failed-postgres-quarantine.json')
```

**预期输出**：失败 PostgreSQL 被标记为仅排障，不执行 drop/truncate/二次导入。

**成功条件**：DBA 与变更单均记录“禁止作为下次目标”。

**失败停止点**：隔离状态不清楚时停止；不得继续导入或覆盖它。

**证据路径**：`$RollbackRoot\02-failed-postgres-quarantine.json`、DBA 审计记录。

## 3. 锁定同一时间点备份与旧镜像

**输入**：切换前 backup 根、manifest、旧镜像不可变 digest。

**命令**：

```powershell
$BackupRoot = 'REPLACE_WITH_CUTOVER_BACKUP_RUN_DIRECTORY'
$ManifestPath = Join-Path $BackupRoot 'manifest.json'
$OldImageDigest = 'REPLACE_WITH_PRE_CUTOVER_IMAGE_DIGEST'
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($manifest.version -ne 1 -or -not $manifest.runId) { throw 'Invalid cutover manifest.' }
if ($OldImageDigest -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Pinned old image digest required.' }
```

**预期输出**：明确唯一 backup runId、manifest 和旧镜像 digest。

**成功条件**：不得混用另一 run 的数据库、sidecar 或资源。

**失败停止点**：任一标识不明确或备份不是切换前最后恢复点即停止。

**证据路径**：原 manifest、变更单中的旧镜像 digest。

## 4. 再次验证备份 manifest

**输入**：只读 backup 根和 manifest。

**命令**：

```powershell
foreach ($entry in $manifest.entries) {
  $candidate = Join-Path $BackupRoot ($entry.path.Replace('/', '\'))
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Missing backup file: $($entry.path)" }
  $item = Get-Item -LiteralPath $candidate
  $hash = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($item.Length -ne $entry.sizeBytes -or $hash -cne $entry.sha256) { throw "Backup mismatch: $($entry.path)" }
}
'rollback manifest verified' | Set-Content -LiteralPath (Join-Path $RollbackRoot '04-manifest-verified.txt')
```

**预期输出**：所有数据库、WAL/SHM（若存在）和资源条目字节一致。

**成功条件**：完整 manifest 复验无异常。

**失败停止点**：任何 hash/size/path 不一致停止；不得用“最接近”的备份替代。

**证据路径**：`$RollbackRoot\04-manifest-verified.txt`。

## 5. 恢复同一时间点 SQLite/WAL/SHM 与资源

**输入**：经验证的 `sqlite-raw` 与 `resources`，全新空恢复目录。

**命令**：

```powershell
$LegacyDataRoot = 'REPLACE_WITH_NEW_EMPTY_LEGACY_DATA_DIRECTORY'
$LegacyResourcesRoot = 'REPLACE_WITH_NEW_EMPTY_LEGACY_RESOURCES_DIRECTORY'
$LegacyDatabaseFileName = 'REPLACE_WITH_PRE_CUTOVER_DATABASE_FILENAME.sqlite'
if (Test-Path -LiteralPath $LegacyDataRoot) { throw 'Legacy data restore directory must not exist.' }
if (Test-Path -LiteralPath $LegacyResourcesRoot) { throw 'Legacy resources restore directory must not exist.' }
New-Item -ItemType Directory -Path $LegacyDataRoot,$LegacyResourcesRoot | Out-Null
$rawRoot = Join-Path $BackupRoot 'sqlite-raw'
Copy-Item -LiteralPath (Join-Path $rawRoot 'source.sqlite') `
  -Destination (Join-Path $LegacyDataRoot $LegacyDatabaseFileName)
foreach ($suffix in @('-wal','-shm')) {
  $archived = Join-Path $rawRoot "source.sqlite$suffix"
  if (Test-Path -LiteralPath $archived -PathType Leaf) {
    Copy-Item -LiteralPath $archived -Destination (Join-Path $LegacyDataRoot "$LegacyDatabaseFileName$suffix")
  }
}
$resourceSource = Join-Path $BackupRoot 'resources'
if (Test-Path -LiteralPath $resourceSource -PathType Container) {
  Get-ChildItem -LiteralPath $resourceSource -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $LegacyResourcesRoot -Recurse
  }
}
```

**预期输出**：同一时间点主 SQLite、实际存在的 WAL、SHM 与资源恢复到两个全新目录；标准化归档名映射回旧应用切换前使用的数据库文件名，无旧内容被删除或覆盖。

**成功条件**：恢复集合与 manifest 中 `sqlite-raw/`、`resources/` 条目逐一匹配。

**失败停止点**：目标目录非空、sidecar 混用或资源不完整即停止。

**证据路径**：`$LegacyDataRoot`、`$LegacyResourcesRoot` 与原 manifest。

## 6. 以旧镜像和恢复目录启动隔离验收

**输入**：固定旧镜像 digest、恢复目录、隔离端口/网络。

**命令**：

```powershell
[ordered]@{
  image = $OldImageDigest
  dataRoot = $LegacyDataRoot
  resourcesRoot = $LegacyResourcesRoot
  mode = 'isolated-validation-before-traffic'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RollbackRoot '06-old-version-start-plan.json')
```

**预期输出**：先在隔离入口启动旧版本，不接收真实流量。

**成功条件**：旧版本从恢复目录启动，未读取失败 PostgreSQL，未执行新旧双写。

**失败停止点**：旧版本启动或数据检查失败即保持流量冻结并升级事件响应。

**证据路径**：`$RollbackRoot\06-old-version-start-plan.json`、旧版本启动日志。

## 7. 验收旧版本并恢复流量

**输入**：隔离旧版本、管理员测试账号、历史/回放/资源验收清单。

**命令**：

```powershell
$LegacyHealthUrl = 'REPLACE_WITH_ISOLATED_LEGACY_HEALTH_URL'
$health = Invoke-WebRequest -UseBasicParsing -Uri $LegacyHealthUrl
if ($health.StatusCode -ne 200) { throw 'Legacy health check failed.' }
'Admin login, configuration, history, replay and resources verified before traffic restore.' |
  Set-Content -LiteralPath (Join-Path $RollbackRoot '07-legacy-smoke.txt')
```

**预期输出**：健康、管理员登录、配置、历史、回放和资源均来自同一恢复点；随后才由 rollback owner 恢复真实流量。

**成功条件**：验收记录完整且真实流量只指向旧版本。

**失败停止点**：任何 smoke 失败都不得恢复流量。

**证据路径**：`$RollbackRoot\07-legacy-smoke.txt`、入口切换审计记录。

## 8. 关闭回滚并约束下一次尝试

**输入**：恢复成功证据、失败 PostgreSQL 隔离标识、事件编号。

**命令**：

```powershell
[ordered]@{
  rollbackCompletedAt = [DateTime]::UtcNow.ToString('o')
  failedPostgresDisposition = 'preserve-for-diagnostics-only'
  retryTargetRequirement = 'new-empty-database-or-schema'
  sourceRequirement = 'new-consistent-snapshot-and-manifest'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RollbackRoot '08-rollback-closure.json')
```

**预期输出**：回滚关闭记录明确失败 PostgreSQL 只保留排障，不得作为下次目标。

**成功条件**：下一次尝试要求全新空库/schema、新 runId、新 snapshot/manifest 和完整 12 步 readiness。

**失败停止点**：未完成事件复盘、证据归档和目标隔离前不得再次安排切换。

**证据路径**：`$RollbackRoot\08-rollback-closure.json`、事件报告和变更单。
