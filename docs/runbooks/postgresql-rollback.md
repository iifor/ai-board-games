# PostgreSQL 16 切换失败回滚 Runbook

本手册只用于首次 PostgreSQL 切换验收失败后的数据一致性回滚。目标是恢复旧镜像，以及切换前同一时间点的 SQLite/WAL/SHM 与所有资源根；不得合并 PostgreSQL 切换后的写入，也不得让两套应用同时接收真实写流量。平台未知时，本手册要求平台执行者提供不可变 JSON 审计回执，不用 `Set-Content` 伪造“已停止/已隔离/已恢复”。

## 触发条件与回执契约

- go-live owner 宣布验收失败、rollback owner 接管，并取得当次回滚授权。
- 使用正式切换前最后一份已验证 backup manifest；SQLite、WAL/SHM 和资源来自同一 runId。
- 平台回执必须是普通 JSON 文件，至少包含 `action/status/target/occurredAt/ticketId`；本手册只验证并记录其 SHA-256，不生成平台成功回执。
- 失败 PostgreSQL database/schema 只读保留用于排障，禁止 drop、覆盖和二次导入；下次使用全新空库/schema。

## 1. 冻结写入并停止 PostgreSQL 应用版本

**输入**：平台已执行流量冻结和应用停止后导出的 `$TrafficStopReceiptPath`，以及全新证据目录。

**命令**：

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$RollbackRoot = 'REPLACE_WITH_NEW_ROLLBACK_EVIDENCE_DIRECTORY'
$TrafficStopReceiptPath = 'REPLACE_WITH_PLATFORM_TRAFFIC_STOP_RECEIPT.json'
if (Test-Path -LiteralPath $RollbackRoot) { throw 'Rollback evidence directory must be new.' }
New-Item -ItemType Directory -Path $RollbackRoot | Out-Null
if (-not (Test-Path -LiteralPath $TrafficStopReceiptPath -PathType Leaf)) { throw 'Traffic-stop receipt is required.' }
$receiptItem = Get-Item -LiteralPath $TrafficStopReceiptPath
if (($receiptItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Receipt reparse points are forbidden.' }
$stopReceipt = Get-Content -LiteralPath $TrafficStopReceiptPath -Raw | ConvertFrom-Json
$stopOccurredAt = [DateTimeOffset]::MinValue
if ($stopReceipt.action -cne 'stop-traffic-and-postgres-app' -or $stopReceipt.status -cne 'completed' -or
    -not $stopReceipt.target -or -not $stopReceipt.ticketId -or
    -not [DateTimeOffset]::TryParse([string]$stopReceipt.occurredAt, [ref]$stopOccurredAt)) {
  throw 'Platform traffic-stop receipt is invalid.'
}
[ordered]@{
  receiptPath = (Resolve-Path -LiteralPath $TrafficStopReceiptPath).Path
  sha256 = (Get-FileHash -LiteralPath $TrafficStopReceiptPath -Algorithm SHA256).Hash.ToLowerInvariant()
  verifiedAt = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RollbackRoot '01-traffic-stop-receipt-hash.json') -Encoding utf8
```

**预期输出**：真实平台回执证明入口已冻结且 PostgreSQL 应用实例已停止；本地只保存回执路径/hash。

**成功条件**：回执来自变更平台，状态为 `completed`，活跃请求和应用实例由平台审计记录证明归零。

**失败停止点**：没有真实回执、回执字段不完整或 hash 无法计算时停止；不得恢复旧版本。

**证据路径**：原 `$TrafficStopReceiptPath`、`$RollbackRoot\01-traffic-stop-receipt-hash.json` 和平台审计日志。

## 2. 隔离并保留失败 PostgreSQL 现场

**输入**：DBA 已执行只读隔离后导出的 `$PostgresIsolationReceiptPath`，以及失败目标标识。

**命令**：

```powershell
$FailedTargetId = 'REPLACE_WITH_FAILED_DATABASE_AND_SCHEMA_ID'
$PostgresIsolationReceiptPath = 'REPLACE_WITH_DBA_ISOLATION_RECEIPT.json'
if (-not (Test-Path -LiteralPath $PostgresIsolationReceiptPath -PathType Leaf)) { throw 'DBA isolation receipt is required.' }
$isolationReceiptItem = Get-Item -LiteralPath $PostgresIsolationReceiptPath
if (($isolationReceiptItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Receipt reparse points are forbidden.' }
$isolationReceipt = Get-Content -LiteralPath $PostgresIsolationReceiptPath -Raw | ConvertFrom-Json
$isolationOccurredAt = [DateTimeOffset]::MinValue
if ($isolationReceipt.action -cne 'quarantine-postgres-target' -or $isolationReceipt.status -cne 'completed' -or
    $isolationReceipt.target -cne $FailedTargetId -or -not $isolationReceipt.ticketId -or
    -not [DateTimeOffset]::TryParse([string]$isolationReceipt.occurredAt, [ref]$isolationOccurredAt) -or
    $isolationReceipt.disposition -cne 'diagnostics-only-do-not-reuse') {
  throw 'DBA isolation receipt does not prove the required quarantine.'
}
[ordered]@{
  target = $FailedTargetId
  receiptSha256 = (Get-FileHash -LiteralPath $PostgresIsolationReceiptPath -Algorithm SHA256).Hash.ToLowerInvariant()
  disposition = $isolationReceipt.disposition
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RollbackRoot '02-postgres-isolation-receipt-hash.json') -Encoding utf8
```

**预期输出**：DBA 真实回执证明失败 PostgreSQL 仅保留排障，禁止作为下次目标。

**成功条件**：回执 target 精确匹配失败目标，disposition 为 `diagnostics-only-do-not-reuse`。

**失败停止点**：隔离回执缺失或目标不匹配时停止；不得继续导入、覆盖或清理失败现场。

**证据路径**：原 `$PostgresIsolationReceiptPath`、`$RollbackRoot\02-postgres-isolation-receipt-hash.json`。

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

**预期输出**：锁定唯一 backup runId、manifest 和旧镜像 digest。

**成功条件**：数据库、sidecar、资源和镜像均来自同一正式切换恢复点。

**失败停止点**：标识不清或备份不是切换前最终恢复点即停止。

**证据路径**：原 manifest、变更单中的旧镜像 digest。

## 4. 再次验证备份 manifest

**输入**：只读 backup 根和 manifest。

**命令**：

```powershell
$backupPrefix = [IO.Path]::GetFullPath($BackupRoot).TrimEnd('\') + '\'
foreach ($entry in $manifest.entries) {
  $relative = [string]$entry.path
  if (-not $relative -or $relative.Contains('\') -or [IO.Path]::IsPathRooted($relative) -or $relative.Split('/') -contains '..') {
    throw "Unsafe manifest path: $relative"
  }
  $candidate = [IO.Path]::GetFullPath((Join-Path $BackupRoot $relative.Replace('/', '\')))
  if (-not $candidate.StartsWith($backupPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Manifest path escape.' }
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Missing backup file: $relative" }
  $item = Get-Item -LiteralPath $candidate
  $hash = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($item.Length -ne $entry.sizeBytes -or $hash -cne $entry.sha256) { throw "Backup mismatch: $relative" }
}
[ordered]@{
  manifestSha256 = (Get-FileHash -LiteralPath $ManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
  entries = @($manifest.entries).Count
  verifiedAt = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RollbackRoot '04-manifest-verification.json') -Encoding utf8
```

**预期输出**：所有数据库、WAL/SHM 和各资源根条目逐字节验证。

**成功条件**：完整 manifest 文件集、size、SHA-256 无异常。

**失败停止点**：任何 path escape、缺文件或 hash/size 不一致即停止；不得替换为“最接近”的备份。

**证据路径**：原 manifest、`$RollbackRoot\04-manifest-verification.json`。

## 5. 按 source index 恢复 SQLite/WAL/SHM 与多个资源根

**输入**：全新 SQLite 目标目录、原数据库文件名，以及明确的 `source-index -> original destination` 映射。

**命令**：

```powershell
$LegacyDataRoot = 'REPLACE_WITH_NEW_EMPTY_LEGACY_DATA_DIRECTORY'
$LegacyDatabaseFileName = 'REPLACE_WITH_PRE_CUTOVER_DATABASE_FILENAME.sqlite'
$ResourceRestoreMap = @(
  [ordered]@{ SourceIndex = 0; Destination = 'REPLACE_WITH_NEW_EMPTY_ORIGINAL_RESOURCE_ROOT_0' },
  [ordered]@{ SourceIndex = 1; Destination = 'REPLACE_WITH_NEW_EMPTY_ORIGINAL_RESOURCE_ROOT_1' }
)
if ([IO.Path]::GetFileName($LegacyDatabaseFileName) -cne $LegacyDatabaseFileName) {
  throw 'Legacy database file name must not contain a path.'
}
if (Test-Path -LiteralPath $LegacyDataRoot) { throw 'Legacy data restore directory must not exist.' }
New-Item -ItemType Directory -Path $LegacyDataRoot | Out-Null
$legacyPrefix = [IO.Path]::GetFullPath($LegacyDataRoot).TrimEnd('\') + '\'
$sqliteRestoreMap = [ordered]@{
  'sqlite-raw/source.sqlite' = $LegacyDatabaseFileName
  'sqlite-raw/source.sqlite-wal' = "$LegacyDatabaseFileName-wal"
  'sqlite-raw/source.sqlite-shm' = "$LegacyDatabaseFileName-shm"
}
$sqliteRestoreEntries = @($manifest.entries | Where-Object { $sqliteRestoreMap.Contains([string]$_.path) })
if (@($sqliteRestoreEntries | Where-Object { $_.path -ceq 'sqlite-raw/source.sqlite' }).Count -ne 1) {
  throw 'Manifest must contain exactly one raw SQLite database.'
}
foreach ($suffixPath in @('sqlite-raw/source.sqlite-wal','sqlite-raw/source.sqlite-shm')) {
  if (@($sqliteRestoreEntries | Where-Object { $_.path -ceq $suffixPath }).Count -gt 1) { throw "Duplicate SQLite sidecar: $suffixPath" }
}
foreach ($entry in $sqliteRestoreEntries) {
  $sourceFile = [IO.Path]::GetFullPath((Join-Path $BackupRoot ([string]$entry.path).Replace('/', '\')))
  $destinationFile = [IO.Path]::GetFullPath((Join-Path $LegacyDataRoot ([string]$sqliteRestoreMap[[string]$entry.path])))
  if (-not $destinationFile.StartsWith($legacyPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'SQLite restore path escape.' }
  Copy-Item -LiteralPath $sourceFile -Destination $destinationFile
  $restored = Get-Item -LiteralPath $destinationFile
  $hash = (Get-FileHash -LiteralPath $destinationFile -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($restored.Length -ne $entry.sizeBytes -or $hash -cne $entry.sha256) { throw "Restored SQLite mismatch: $($entry.path)" }
}

$resourceEntries = @($manifest.entries | Where-Object { $_.path -like 'resources/resource-*/*' })
$sourceIndexes = @($resourceEntries | ForEach-Object {
  if ([string]$_.path -notmatch '^resources/resource-(\d{3})/(.+)$') { throw "Invalid resource archive path: $($_.path)" }
  [int]$Matches[1]
} | Sort-Object -Unique)
$mappedIndexes = @($ResourceRestoreMap | ForEach-Object { [int]$_.SourceIndex } | Sort-Object -Unique)
if (($sourceIndexes -join ',') -cne ($mappedIndexes -join ',')) { throw 'ResourceRestoreMap must exactly cover every archived source index.' }
if ($ResourceRestoreMap.Count -ne $mappedIndexes.Count) { throw 'ResourceRestoreMap contains duplicate source indexes.' }
$resolvedDestinations = @{}
foreach ($mapping in $ResourceRestoreMap) {
  $destination = [IO.Path]::GetFullPath([string]$mapping.Destination)
  if (Test-Path -LiteralPath $destination) { throw "Resource destination must be new: $destination" }
  if ($resolvedDestinations.ContainsValue($destination)) { throw 'Duplicate resource destination.' }
  New-Item -ItemType Directory -Path $destination | Out-Null
  $resolvedDestinations[[int]$mapping.SourceIndex] = $destination
}
foreach ($entry in $resourceEntries) {
  [void]([string]$entry.path -match '^resources/resource-(\d{3})/(.+)$')
  $index = [int]$Matches[1]
  $relative = [string]$Matches[2]
  if (-not $relative -or $relative.Contains('\') -or [IO.Path]::IsPathRooted($relative) -or $relative.Split('/') -contains '..') {
    throw "Resource path escape: $relative"
  }
  $destinationRoot = [string]$resolvedDestinations[$index]
  $destinationPrefix = $destinationRoot.TrimEnd('\') + '\'
  $destinationFile = [IO.Path]::GetFullPath((Join-Path $destinationRoot $relative.Replace('/', '\')))
  if (-not $destinationFile.StartsWith($destinationPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Resource path escape.' }
  $sourceFile = Join-Path $BackupRoot ([string]$entry.path).Replace('/', '\')
  New-Item -ItemType Directory -Path (Split-Path -Parent $destinationFile) -Force | Out-Null
  Copy-Item -LiteralPath $sourceFile -Destination $destinationFile
  $restored = Get-Item -LiteralPath $destinationFile
  $hash = (Get-FileHash -LiteralPath $destinationFile -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($restored.Length -ne $entry.sizeBytes -or $hash -cne $entry.sha256) { throw "Restored resource mismatch: $($entry.path)" }
}
```

**预期输出**：SQLite/WAL/SHM 映射回旧文件名；`resource-000/resource-001/...` 仅作为 source index，不会多复制一层，每个源根恢复到各自原目标根。

**成功条件**：映射精确覆盖所有 source index；目标全新；每个资源文件的相对路径、size 和 SHA-256 与 manifest 一致，支持多个资源根。

**失败停止点**：映射缺失/重复、目标已存在、路径逃逸或 hash/size 不一致立即停止。

**证据路径**：`$LegacyDataRoot`、`$ResourceRestoreMap.Destination`、原 manifest 和逐文件 hash 输出。

## 6. 执行批准的旧版本启动命令并核验平台回执

**输入**：由实际部署平台提供的可执行脚本、参数、固定旧镜像 digest、恢复目录和启动回执；不假设 Docker/Compose/Kubernetes。

**命令**：

```powershell
$RollbackStartCommand = 'REPLACE_WITH_APPROVED_PLATFORM_ROLLBACK_START_SCRIPT'
$RollbackStartArguments = @('REPLACE_WITH_PLATFORM_ARGUMENT_1','REPLACE_WITH_PLATFORM_ARGUMENT_2')
$RollbackStartReceiptPath = 'REPLACE_WITH_PLATFORM_ISOLATED_START_RECEIPT.json'
$startLog = Join-Path $RollbackRoot '06-old-version-start.log'
if (-not (Test-Path -LiteralPath $RollbackStartCommand -PathType Leaf)) { throw 'Approved rollback start command is required.' }
& $RollbackStartCommand @RollbackStartArguments *>&1 | Tee-Object -FilePath $startLog
$startExit = $LASTEXITCODE
if ($startExit -ne 0) { throw "Rollback start command failed with exit code $startExit." }
if (-not (Test-Path -LiteralPath $RollbackStartReceiptPath -PathType Leaf)) { throw 'Platform isolated-start receipt is required.' }
$startReceipt = Get-Content -LiteralPath $RollbackStartReceiptPath -Raw | ConvertFrom-Json
$startOccurredAt = [DateTimeOffset]::MinValue
$expectedResourceDestinations = @($ResourceRestoreMap | ForEach-Object { [IO.Path]::GetFullPath([string]$_.Destination) } | Sort-Object)
$actualResourceDestinations = @($startReceipt.resourceDestinations | ForEach-Object { [IO.Path]::GetFullPath([string]$_) } | Sort-Object)
if ($startReceipt.action -cne 'start-old-version-isolated' -or $startReceipt.status -cne 'completed' -or
    -not $startReceipt.target -or -not $startReceipt.ticketId -or
    -not [DateTimeOffset]::TryParse([string]$startReceipt.occurredAt, [ref]$startOccurredAt) -or
    $startReceipt.imageDigest -cne $OldImageDigest -or $startReceipt.trafficAttached -ne $false -or
    [IO.Path]::GetFullPath([string]$startReceipt.legacyDataRoot) -cne [IO.Path]::GetFullPath($LegacyDataRoot) -or
    ($expectedResourceDestinations -join "`n") -cne ($actualResourceDestinations -join "`n")) {
  throw 'Platform receipt does not prove an isolated old-version start.'
}
[ordered]@{
  commandLogSha256 = (Get-FileHash -LiteralPath $startLog -Algorithm SHA256).Hash.ToLowerInvariant()
  receiptSha256 = (Get-FileHash -LiteralPath $RollbackStartReceiptPath -Algorithm SHA256).Hash.ToLowerInvariant()
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RollbackRoot '06-start-evidence-hashes.json') -Encoding utf8
```

**预期输出**：实际平台命令启动固定旧镜像，stdout/stderr、退出码和平台 isolated-start 回执均被捕获。

**成功条件**：命令退出 0；回执证明使用固定 digest、恢复目录配置且 `trafficAttached=false`。

**失败停止点**：命令未执行、退出非零、回执缺失或仍接真实流量时保持冻结并升级事件响应。

**证据路径**：`$startLog`、原 `$RollbackStartReceiptPath`、`$RollbackRoot\06-start-evidence-hashes.json`。

## 7. 逐项执行旧版本业务 smoke，再由平台恢复流量

**输入**：平台提供的真实 smoke 执行脚本、隔离入口、受限测试凭据，以及 smoke/流量恢复回执。脚本必须分别检查 `admin-login/config-read/history-detail/replay-order/resource-file`。

**命令**：

```powershell
$LegacySmokeCommand = 'REPLACE_WITH_APPROVED_LEGACY_SMOKE_SCRIPT'
$LegacySmokeArguments = @('REPLACE_WITH_ISOLATED_BASE_URL','REPLACE_WITH_SECURE_INPUT_FILE')
$LegacySmokeEvidenceRoot = 'REPLACE_WITH_NEW_LEGACY_SMOKE_EVIDENCE_DIRECTORY'
$LegacySmokeResultPath = Join-Path $LegacySmokeEvidenceRoot 'results.json'
$TrafficRestoreReceiptPath = 'REPLACE_WITH_PLATFORM_TRAFFIC_RESTORE_RECEIPT.json'
$smokeCommandLog = Join-Path $RollbackRoot '07-legacy-smoke-command.log'
if (Test-Path -LiteralPath $LegacySmokeEvidenceRoot) { throw 'Smoke evidence root must be new.' }
& $LegacySmokeCommand @LegacySmokeArguments *>&1 | Tee-Object -FilePath $smokeCommandLog
$smokeExit = $LASTEXITCODE
if ($smokeExit -ne 0 -or -not (Test-Path -LiteralPath $LegacySmokeResultPath -PathType Leaf)) { throw 'Legacy smoke command failed.' }
$smoke = Get-Content -LiteralPath $LegacySmokeResultPath -Raw | ConvertFrom-Json
$requiredSmoke = @('admin-login','config-read','history-detail','replay-order','resource-file')
if ((@($smoke.results.id | Sort-Object) -join '|') -cne (@($requiredSmoke | Sort-Object) -join '|')) { throw 'Legacy smoke check set mismatch.' }
$smokePrefix = [IO.Path]::GetFullPath($LegacySmokeEvidenceRoot).TrimEnd('\') + '\'
foreach ($result in $smoke.results) {
  if ($result.status -cne 'passed' -or -not $result.semanticAssertion) { throw "Legacy smoke failed: $($result.id)" }
  $response = [IO.Path]::GetFullPath((Join-Path $LegacySmokeEvidenceRoot ([string]$result.responsePath)))
  if (-not $response.StartsWith($smokePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Smoke response path escape.' }
  $item = Get-Item -LiteralPath $response
  $hash = (Get-FileHash -LiteralPath $response -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($item.Length -ne $result.sizeBytes -or $hash -cne $result.sha256) { throw "Raw smoke response mismatch: $($result.id)" }
}
if (-not (Test-Path -LiteralPath $TrafficRestoreReceiptPath -PathType Leaf)) { throw 'Traffic restore requires a platform receipt.' }
$trafficReceipt = Get-Content -LiteralPath $TrafficRestoreReceiptPath -Raw | ConvertFrom-Json
$trafficOccurredAt = [DateTimeOffset]::MinValue
if ($trafficReceipt.action -cne 'restore-traffic-to-old-version' -or $trafficReceipt.status -cne 'completed' -or
    -not $trafficReceipt.target -or -not $trafficReceipt.ticketId -or
    -not [DateTimeOffset]::TryParse([string]$trafficReceipt.occurredAt, [ref]$trafficOccurredAt) -or
    $trafficReceipt.imageDigest -cne $OldImageDigest) { throw 'Traffic restore receipt is invalid.' }
[ordered]@{
  smokeCommandLogSha256 = (Get-FileHash -LiteralPath $smokeCommandLog -Algorithm SHA256).Hash.ToLowerInvariant()
  smokeResultsSha256 = (Get-FileHash -LiteralPath $LegacySmokeResultPath -Algorithm SHA256).Hash.ToLowerInvariant()
  trafficReceiptSha256 = (Get-FileHash -LiteralPath $TrafficRestoreReceiptPath -Algorithm SHA256).Hash.ToLowerInvariant()
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RollbackRoot '07-smoke-and-traffic-evidence-hashes.json') -Encoding utf8
```

**预期输出**：管理员登录、配置读取、历史详情、回放顺序和资源文件五项真实检查各自产生原始响应；逐项语义、size、SHA-256 通过后，平台才恢复流量并出具回执。

**成功条件**：五项 ID 精确、逐项 `status=passed` 且 `semanticAssertion=true`，所有原始响应 hash 一致，流量恢复回执指向固定旧镜像。

**失败停止点**：任一 endpoint/data/resource 检查失败或原始响应不匹配，均不得恢复流量；没有平台回执不得声称恢复成功。

**证据路径**：`$LegacySmokeEvidenceRoot`、`$smokeCommandLog`、原 `$TrafficRestoreReceiptPath`、`$RollbackRoot\07-smoke-and-traffic-evidence-hashes.json`。

## 8. 以真实事件关闭回执约束下一次尝试

**输入**：事件系统生成的 closure receipt、失败 PostgreSQL 隔离标识和下一次尝试约束。

**命令**：

```powershell
$IncidentClosureReceiptPath = 'REPLACE_WITH_INCIDENT_CLOSURE_RECEIPT.json'
if (-not (Test-Path -LiteralPath $IncidentClosureReceiptPath -PathType Leaf)) { throw 'Incident closure receipt is required.' }
$closure = Get-Content -LiteralPath $IncidentClosureReceiptPath -Raw | ConvertFrom-Json
$closureOccurredAt = [DateTimeOffset]::MinValue
if ($closure.action -cne 'close-rollback-incident' -or $closure.status -cne 'closed' -or
    $closure.target -cne $FailedTargetId -or -not $closure.ticketId -or
    -not [DateTimeOffset]::TryParse([string]$closure.occurredAt, [ref]$closureOccurredAt) -or
    $closure.failedPostgresDisposition -cne 'preserve-for-diagnostics-only' -or
    $closure.retryTargetRequirement -cne 'new-empty-database-or-schema' -or
    $closure.sourceRequirement -cne 'new-consistent-snapshot-and-manifest') { throw 'Incident closure constraints are incomplete.' }
[ordered]@{
  closureReceiptSha256 = (Get-FileHash -LiteralPath $IncidentClosureReceiptPath -Algorithm SHA256).Hash.ToLowerInvariant()
  verifiedAt = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RollbackRoot '08-closure-receipt-hash.json') -Encoding utf8
```

**预期输出**：真实事件回执明确失败 PostgreSQL 只保留排障，下一次必须使用新恢复点、新 runId 和全新空库/schema。

**成功条件**：closure receipt 包含事件复盘、证据归档和下次目标约束。

**失败停止点**：没有真实 closure receipt 不得关闭事件或安排下一次切换。

**证据路径**：原 `$IncidentClosureReceiptPath`、`$RollbackRoot\08-closure-receipt-hash.json` 和事件报告。
