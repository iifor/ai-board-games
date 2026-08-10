# PostgreSQL 16 生产上线准备 Runbook

本手册只完成上线准备、证据闭包和独立真实切换授权申请，不执行真实生产导入、应用切换或流量恢复。不得自动切流或连接真实生产。以下 12 步不可交换；任何一步失败都立即停止。失败 schema、报告和现场必须保留，禁止清理后继续，也禁止把失败 PostgreSQL 目标用于下一次尝试。

## 执行前提

- 在同一个受控 PowerShell 会话执行全部步骤，仓库当前提交固定且工作树干净。
- `$env:TEST_DATABASE_URL` 指向名称以 `_test` 或 `_rehearsal` 结尾的专用 PostgreSQL 16 数据库，并带 `sslmode=verify-full`；它不是生产数据库。
- TLS/最小权限检查只使用已继承的 `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD/PGSSLMODE/PGSSLROOTCERT`；签署门禁拒绝任何非空 `PGSERVICE`，`psql` 命令行不得出现数据库 URL 或密码。
- 生产源仅以只读路径提供；本手册不会启动或停止生产应用，也不会连接真实生产 PostgreSQL。
- `Source`、资源目录和证据根目录路径不得包含逗号；release-readiness 使用逗号分隔报告路径。

先设置一次会话变量和无 BOM JSON 写入函数；所有 `REPLACE_*` 都必须替换成受控路径，不能提交生成的证据目录：

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path '.').Path
$Source = 'REPLACE_WITH_READ_ONLY_SQLITE_PATH'
$Resources = @('REPLACE_WITH_RESOURCES_DIRECTORY')
$EvidenceRoot = 'REPLACE_WITH_NEW_EVIDENCE_DIRECTORY'
$PreflightRunId = 'preflight-REPLACE_WITH_UTC_ID'
$BackupRunId = 'backup-REPLACE_WITH_UTC_ID'
$Rehearsal1RunId = 'rehearsal-1-REPLACE_WITH_UTC_ID'
$Rehearsal2RunId = 'rehearsal-2-REPLACE_WITH_UTC_ID'
$RestoreRunId = 'restore-drill-REPLACE_WITH_UTC_ID'
$ReadinessRunId = 'readiness-REPLACE_WITH_UTC_ID'
$RuntimeImage = 'consensus-readiness:REPLACE_WITH_GIT_SHA'
$AppSchema = if ($env:DATABASE_SCHEMA) { $env:DATABASE_SCHEMA } else { 'consensus' }

if (Test-Path -LiteralPath $EvidenceRoot) { throw 'EvidenceRoot must be new and empty.' }
if (-not $env:TEST_DATABASE_URL) { throw 'TEST_DATABASE_URL is required.' }
if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { throw 'Source SQLite file is required.' }
foreach ($resourceRoot in $Resources) {
  if (-not (Test-Path -LiteralPath $resourceRoot -PathType Container)) { throw "Resource root is required: $resourceRoot" }
}
New-Item -ItemType Directory -Path $EvidenceRoot | Out-Null
$EvidenceRoot = (Resolve-Path -LiteralPath $EvidenceRoot).Path

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText($Path, $Content, [Text.UTF8Encoding]::new($false))
}
```

### 1. 获取并只读保存生产 SQLite/WAL/SHM 与资源目录信息

**输入**：只读 `$Source`、同名 `-wal`/`-shm`（存在时）、`$Resources`。

**命令**：

```powershell
$sourceCandidates = @($Source, "$Source-wal", "$Source-shm")
$mainSource = Test-Path -LiteralPath $Source -PathType Leaf
if (-not $mainSource) { throw 'Source SQLite file is missing; WAL/SHM cannot substitute for it.' }
$sourceFiles = foreach ($candidate in $sourceCandidates) {
  if (Test-Path -LiteralPath $candidate -PathType Leaf) {
    $item = Get-Item -LiteralPath $candidate
    [ordered]@{
      name = $item.Name
      sizeBytes = $item.Length
      lastWriteTimeUtc = $item.LastWriteTimeUtc.ToString('o')
      sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
}
$resourceFiles = foreach ($root in $Resources) {
  $resolved = (Resolve-Path -LiteralPath $root).Path
  Get-ChildItem -LiteralPath $resolved -Recurse -File | ForEach-Object {
    [ordered]@{
      root = $resolved
      relativePath = $_.FullName.Substring($resolved.Length).TrimStart('\')
      sizeBytes = $_.Length
      lastWriteTimeUtc = $_.LastWriteTimeUtc.ToString('o')
      sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
}
$inventory = [ordered]@{
  capturedAt = [DateTime]::UtcNow.ToString('o')
  mode = 'read-only-inventory'
  sqlite = @($sourceFiles)
  resources = @($resourceFiles)
}
Write-Utf8NoBom (Join-Path $EvidenceRoot '01-source-inventory.json') ($inventory | ConvertTo-Json -Depth 8)
```

**预期输出**：`01-source-inventory.json`，列出实际存在的 SQLite/WAL/SHM 和全部资源元数据；不创建源端文件。

**成功条件**：主 SQLite 存在、所有输入可读、记录的 hash 为 64 位小写 SHA-256。

**失败停止点**：任一源或资源不可读、路径错误、hash 失败即停止；不得补造缺失 WAL/SHM。

**证据路径**：`$EvidenceRoot\01-source-inventory.json`。

### 2. 执行 preflight dry-run

**输入**：源路径、资源目录、隔离测试 URL、TLS 要求和新 runId。

**命令**：

```powershell
$preflightReportPath = Join-Path $EvidenceRoot "$PreflightRunId-preflight.json"
$preflightErrorPath = Join-Path $EvidenceRoot '02-preflight.stderr.log'
$previousDatabaseUrl = $env:DATABASE_URL
$env:DATABASE_URL = $env:TEST_DATABASE_URL
try {
  $preflightOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
    (Join-Path $RepoRoot 'scripts\ops\postgres\preflight.ps1') `
    -Source $Source -Output $EvidenceRoot -Resources ($Resources -join ',') `
    -RequireTls true -RunId $PreflightRunId 2> $preflightErrorPath
  $preflightExit = $LASTEXITCODE
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
}
$preflightJson = $preflightOutput | Where-Object { $_.TrimStart().StartsWith('{') } | Select-Object -Last 1
if (-not $preflightJson) { throw 'Preflight returned no JSON report.' }
$preflight = $preflightJson | ConvertFrom-Json
Write-Utf8NoBom $preflightReportPath ($preflight | ConvertTo-Json -Depth 10)
if ($preflightExit -ne 0 -or $preflight.status -ne 'passed') { throw 'Preflight failed; stop.' }
```

**预期输出**：状态为 `passed` 的 preflight JSON；源完整性、空间、PostgreSQL 16、目标新鲜度、TLS 和受限连接检查通过。该步骤是只读 preflight dry-run，不创建 schema。

预检只通过文件系统稳定复制当时存在的 SQLite main/WAL/SHM，并仅在工具私有随机父目录的 inspection 子目录中打开隔离副本；不得直接 SQLite-open `$Source`。报告中的 `source.isolated-copy`、`source.unchanged` 与 `source.temp-cleanup` 必须通过，确认源文件集、size、mtime、文件身份和 SHA-256 前后一致。清理必须验证父目录、原子隔离后的 inspection、`O_NOFOLLOW` 所有权 token 与 main/可选 WAL/SHM 固定白名单，只能逐文件 `unlink`、最后删 token，再用非递归 `rmdir` 删除两个空目录并验证无残留；不得使用递归删除。未知条目、reparse point、身份变化、静默 no-op 或部分清理必须失败并保留未删场景。Node 路径 API 仍存在同账号对手在单次检查与单文件操作之间的微小竞态，因此切换窗口必须保持主机账号隔离；该竞态不会扩展为递归目录删除。

**成功条件**：子进程退出码为 0，报告 `status=passed`，`target.postgres-version` 与 `target.tls` 均通过。

**失败停止点**：任一检查失败立即停止；保留 stdout 转存报告和脱敏 stderr，不切换到其他目标“试到成功”。

**证据路径**：`$preflightReportPath`、`$preflightErrorPath`。

`preflight.ps1` 与 `validate.ps1` 的 readiness 路径只从子进程环境读取 `DATABASE_URL`，并主动拒绝 `--target/-Target`。这样 URL 不进入进程参数或审计命令行；历史根 `migrate` 命令的兼容参数不用于本手册。

### 3. 执行 backup --execute

**输入**：与步骤 2 相同的源和资源、全新 backup runId、证据根目录。

**命令**：

```powershell
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  (Join-Path $RepoRoot 'scripts\ops\postgres\backup.ps1') `
  -Source $Source -Output $EvidenceRoot -Resources ($Resources -join ',') `
  -RunId $BackupRunId -Execute
if ($LASTEXITCODE -ne 0) { throw 'Executed backup failed; stop.' }
$BackupRoot = Join-Path $EvidenceRoot $BackupRunId
$BackupReportPath = Join-Path $EvidenceRoot "$BackupRunId-backup.json"
$ManifestPath = Join-Path $BackupRoot 'manifest.json'
if (-not (Test-Path -LiteralPath $BackupReportPath -PathType Leaf)) { throw 'Backup report missing.' }
```

**预期输出**：原始 `sqlite-raw/source.sqlite` 及实际存在的 sidecar、`sqlite-consistent.sqlite`、资源快照、`manifest.json` 和 backup 报告；发布过程中 manifest 最后落盘。

**成功条件**：命令退出 0，backup 报告 `status=passed` 且 `backup.execute`、`manifest.verified`、`backup.publish` 通过。

**失败停止点**：复制期间源变化、manifest 不一致、输出目录冲突或任何 I/O 错误即停止；保留隔离失败现场。

**证据路径**：`$BackupRoot`、`$BackupReportPath`。

### 4. 对 manifest 进行二次校验

**输入**：步骤 3 的只读 backup 根目录和 manifest。

**命令**：

```powershell
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($manifest.version -ne 1 -or $manifest.runId -ne $BackupRunId) { throw 'Manifest header mismatch.' }
$actualFiles = @(Get-ChildItem -LiteralPath $BackupRoot -Recurse -File |
  Where-Object { $_.FullName -cne $ManifestPath })
if ($actualFiles.Count -ne @($manifest.entries).Count) { throw 'Manifest file set mismatch.' }
foreach ($file in $actualFiles) {
  $relative = $file.FullName.Substring($BackupRoot.Length + 1).Replace('\', '/')
  $matches = @($manifest.entries | Where-Object { $_.path -ceq $relative })
  if ($matches.Count -ne 1) { throw "Manifest path mismatch: $relative" }
  $entry = $matches[0]
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($entry.sizeBytes -ne $file.Length -or $entry.sha256 -cne $hash) {
    throw "Manifest bytes mismatch: $relative"
  }
}
$sourceEntry = @($manifest.entries | Where-Object { $_.path -ceq 'sqlite-raw/source.sqlite' })
$consistentEntry = @($manifest.entries | Where-Object { $_.path -ceq 'sqlite-consistent.sqlite' })
if ($sourceEntry.Count -ne 1 -or $consistentEntry.Count -ne 1) { throw 'Required SQLite snapshots missing.' }
if ($sourceEntry[0].sha256 -cne $manifest.sourceDatabaseSha256) { throw 'Source hash header mismatch.' }
if ($consistentEntry[0].sha256 -cne $manifest.consistentDatabaseSha256) { throw 'Consistent hash header mismatch.' }
'manifest verified twice' | Set-Content -LiteralPath (Join-Path $EvidenceRoot '04-manifest-second-verification.txt')
```

**预期输出**：独立重算的文件集合、size 和 SHA-256 与 manifest 完全一致，并生成二次校验标记。

**成功条件**：无异常，两个必需 SQLite 条目与 manifest 顶层 hash 一致。

**失败停止点**：任何多文件、少文件、path/size/hash 不一致立即停止；不得重写 manifest。

**证据路径**：`$ManifestPath`、`$EvidenceRoot\04-manifest-second-verification.txt`。

### 5. 演练 1 到全新 schema

**输入**：`sqlite-consistent.sqlite`、已二次校验 manifest、隔离测试数据库和唯一演练 1 runId。

**命令**：

```powershell
$env:DATABASE_URL = $env:TEST_DATABASE_URL
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  (Join-Path $RepoRoot 'scripts\ops\postgres\rehearse.ps1') `
  -SourceSnapshot (Join-Path $BackupRoot 'sqlite-consistent.sqlite') `
  -Manifest $ManifestPath -Output $EvidenceRoot -RunId $Rehearsal1RunId -Execute
if ($LASTEXITCODE -ne 0) { throw 'Rehearsal 1 failed; preserve its schema and stop.' }
```

**预期输出**：演练 1 创建一个全新 schema，复用正式 migration 后完成事务导入；同一命令继续执行 validation 和 application smoke。

**成功条件**：退出 0，生成 migration、validation、smoke 和 rehearsal JSON/Markdown，rehearsal 顶层状态通过。

**失败停止点**：失败 schema、migration/validation/smoke/rehearsal 报告和日志全部保留；使用新 runId 前必须先排障。

**证据路径**：`$EvidenceRoot\$Rehearsal1RunId-*` 与报告内 `schema`。

### 6. 核验 validation + 同一 schema smoke 1

**输入**：演练 1 的 rehearsal、validation 和 smoke 报告。

**命令**：

```powershell
$Rehearsal1ReportPath = Join-Path $EvidenceRoot "$Rehearsal1RunId-rehearsal.json"
$Rehearsal1SmokePath = Join-Path $EvidenceRoot "$Rehearsal1RunId-smoke.json"
$Rehearsal1ValidationPath = Join-Path $EvidenceRoot "$Rehearsal1RunId-validation.json"
$r1 = Get-Content -LiteralPath $Rehearsal1ReportPath -Raw | ConvertFrom-Json
$s1 = Get-Content -LiteralPath $Rehearsal1SmokePath -Raw | ConvertFrom-Json
$v1 = Get-Content -LiteralPath $Rehearsal1ValidationPath -Raw | ConvertFrom-Json
if ($r1.status -ne 'passed' -or $v1.status -ne 'passed' -or $s1.status -ne 'passed') { throw 'Rehearsal 1 gate failed.' }
if ($r1.schema -cne $s1.schema -or $r1.runId -cne $s1.runId) { throw 'Smoke 1 did not use the rehearsal schema.' }
$requiredSmoke = @('health.connected','health.disconnected','auth.initial-password-change','config.read-and-crud',
  'undercover.persisted-without-external-calls','history.detail-and-replay-order','memory.created-and-updated',
  'workflow.observability-delete','teardown.observability-drained')
foreach ($id in $requiredSmoke) {
  $matches = @($s1.checks | Where-Object { $_.id -ceq $id -and $_.status -ceq 'passed' })
  if ($matches.Count -ne 1) { throw "Smoke 1 check missing: $id" }
}
```

**预期输出**：validation 与 smoke 1 都通过，且 smoke 的 `runId/schema` 与演练 1 完全相同。

**成功条件**：九个真实应用 smoke check 全部且仅有一个通过；无外部 LLM/TTS 调用。

**失败停止点**：任何报告缺失、状态失败、schema 不同或检查缺失即停止；保留演练 1 schema。

**证据路径**：`$Rehearsal1ReportPath`、`$Rehearsal1ValidationPath`、`$Rehearsal1SmokePath`。

### 7. 演练 2 到另一个全新 schema

**输入**：与演练 1 完全相同的 snapshot/manifest、不同 runId、同一隔离测试数据库。

**命令**：

```powershell
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  (Join-Path $RepoRoot 'scripts\ops\postgres\rehearse.ps1') `
  -SourceSnapshot (Join-Path $BackupRoot 'sqlite-consistent.sqlite') `
  -Manifest $ManifestPath -Output $EvidenceRoot -RunId $Rehearsal2RunId -Execute
if ($LASTEXITCODE -ne 0) { throw 'Rehearsal 2 failed; preserve its schema and stop.' }
```

**预期输出**：演练 2 使用另一个全新 schema，独立完成 migration、导入、validation 和 smoke。

**成功条件**：退出 0，第二组四类报告完整且不覆盖第一组。

**失败停止点**：失败立即停止；两个演练 schema 都保留，不 drop/truncate。

**证据路径**：`$EvidenceRoot\$Rehearsal2RunId-*` 与报告内 `schema`。

### 8. 核验 validation + 同一 schema smoke 2 与同源 hash

**输入**：两次 rehearsal 报告和演练 2 的 validation/smoke 报告。

**命令**：

```powershell
$Rehearsal2ReportPath = Join-Path $EvidenceRoot "$Rehearsal2RunId-rehearsal.json"
$Rehearsal2SmokePath = Join-Path $EvidenceRoot "$Rehearsal2RunId-smoke.json"
$Rehearsal2ValidationPath = Join-Path $EvidenceRoot "$Rehearsal2RunId-validation.json"
$r2 = Get-Content -LiteralPath $Rehearsal2ReportPath -Raw | ConvertFrom-Json
$s2 = Get-Content -LiteralPath $Rehearsal2SmokePath -Raw | ConvertFrom-Json
$v2 = Get-Content -LiteralPath $Rehearsal2ValidationPath -Raw | ConvertFrom-Json
if ($r2.status -ne 'passed' -or $v2.status -ne 'passed' -or $s2.status -ne 'passed') { throw 'Rehearsal 2 gate failed.' }
if ($r2.schema -cne $s2.schema -or $r2.runId -cne $s2.runId) { throw 'Smoke 2 did not use the rehearsal schema.' }
if ($r1.schema -ceq $r2.schema -or $r1.runId -ceq $r2.runId) { throw 'Rehearsals are not independent.' }
$h1 = @($r1.checks | Where-Object { $_.id -ceq 'source.snapshot.sha256' -and $_.status -ceq 'passed' })
$h2 = @($r2.checks | Where-Object { $_.id -ceq 'source.snapshot.sha256' -and $_.status -ceq 'passed' })
if ($h1.Count -ne 1 -or $h2.Count -ne 1) { throw 'Source hash evidence missing.' }
if ($h1[0].actual -cne $h1[0].expected -or $h2[0].actual -cne $h2[0].expected -or $h1[0].actual -cne $h2[0].actual) {
  throw 'The two rehearsals do not have the same source SHA-256 hash.'
}
foreach ($id in $requiredSmoke) {
  if (@($s2.checks | Where-Object { $_.id -ceq $id -and $_.status -ceq 'passed' }).Count -ne 1) {
    throw "Smoke 2 check missing: $id"
  }
}
```

**预期输出**：演练 2 validation/smoke 在同一 schema 通过；两个不同 schema 使用同一 source SHA-256 hash。

**成功条件**：schema 和 runId 均不同、source hash 相同、smoke 2 的九个检查全部通过。

**失败停止点**：任一独立性、同源或 smoke 断言失败即停止；失败现场保留。

**证据路径**：两组 rehearsal/validation/smoke JSON。

### 9. SQLite/WAL/SHM/资源 restore drill 到隔离目录

**输入**：步骤 3 backup 根目录和 manifest、全新隔离恢复目录。

**命令**：

```powershell
$RestoreRoot = Join-Path $EvidenceRoot 'restore-drill'
if (Test-Path -LiteralPath $RestoreRoot) { throw 'Restore drill target must be new.' }
$restoreStartedAt = [DateTime]::UtcNow
$restoreWatch = [Diagnostics.Stopwatch]::StartNew()
New-Item -ItemType Directory -Path $RestoreRoot | Out-Null
Get-ChildItem -LiteralPath $BackupRoot -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $RestoreRoot -Recurse
}
$restoreManifestPath = Join-Path $RestoreRoot 'manifest.json'
$restoreManifest = Get-Content -LiteralPath $restoreManifestPath -Raw | ConvertFrom-Json
$restorePrefix = [IO.Path]::GetFullPath($RestoreRoot).TrimEnd('\') + '\'
foreach ($entry in $restoreManifest.entries) {
  $relative = [string]$entry.path
  if (-not $relative -or $relative.Contains('\') -or [IO.Path]::IsPathRooted($relative) -or $relative.Split('/') -contains '..') {
    throw "Unsafe restored manifest path: $relative"
  }
  $candidate = [IO.Path]::GetFullPath((Join-Path $RestoreRoot ($relative.Replace('/', '\'))))
  if (-not $candidate.StartsWith($restorePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Restored path escape.' }
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Restored file missing: $($entry.path)" }
  $item = Get-Item -LiteralPath $candidate
  $hash = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($item.Length -ne $entry.sizeBytes -or $hash -cne $entry.sha256) { throw "Restored bytes mismatch: $($entry.path)" }
}
$restoredFiles = @(Get-ChildItem -LiteralPath $RestoreRoot -Recurse -File | Where-Object { $_.FullName -cne $restoreManifestPath })
if ($restoredFiles.Count -ne @($restoreManifest.entries).Count) { throw 'Restore drill file set mismatch.' }

foreach ($suffix in @('-wal','-shm')) {
  $archiveName = "sqlite-raw/source.sqlite$suffix"
  $declared = @($restoreManifest.entries | Where-Object { $_.path -ceq $archiveName }).Count
  $restored = [int](Test-Path -LiteralPath (Join-Path $RestoreRoot $archiveName.Replace('/', '\')) -PathType Leaf)
  if ($declared -ne $restored) { throw "SQLite sidecar combination changed: $archiveName" }
}

$sqliteValidationPath = Join-Path $RestoreRoot 'sqlite-readonly-validation.json'
$sqliteValidationScript = @'
const Database = require('better-sqlite3');
const file = process.argv[1];
const tables = ['admin_users','app_settings','players','games','game_playback_events','player_game_memories'];
const db = new Database(file, { readonly: true, fileMustExist: true });
try {
  db.pragma('query_only = ON');
  const integrity = db.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') throw new Error(`integrity_check=${String(integrity)}`);
  const counts = Object.fromEntries(tables.map((table) => {
    const exists = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
    return [table, exists ? Number(db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count) : 0];
  }));
  process.stdout.write(JSON.stringify({ integrityCheck: integrity, queryOnly: true, counts }));
} finally { db.close(); }
'@
$migratorRoot = Join-Path $RepoRoot 'packages\db-migrator'
Push-Location $migratorRoot
try {
  $rawValidationJson = & node -e $sqliteValidationScript -- (Join-Path $RestoreRoot 'sqlite-raw\source.sqlite')
  $rawValidationExit = $LASTEXITCODE
  if ($rawValidationExit -ne 0 -or -not $rawValidationJson) { throw 'Raw SQLite/WAL rollback-set validation failed.' }
  $consistentValidationJson = & node -e $sqliteValidationScript -- (Join-Path $RestoreRoot 'sqlite-consistent.sqlite')
  $consistentValidationExit = $LASTEXITCODE
} finally { Pop-Location }
if ($consistentValidationExit -ne 0 -or -not $consistentValidationJson) { throw 'Consistent SQLite copy validation failed.' }
$rawValidation = $rawValidationJson | ConvertFrom-Json
$consistentValidation = $consistentValidationJson | ConvertFrom-Json
if ($rawValidation.integrityCheck -cne 'ok' -or -not $rawValidation.queryOnly) { throw 'Raw rollback-set integrity check failed.' }
if ($consistentValidation.integrityCheck -cne 'ok' -or -not $consistentValidation.queryOnly) { throw 'Consistent-copy integrity check failed.' }
foreach ($table in @('admin_users','app_settings','players','games','game_playback_events','player_game_memories')) {
  if ([int64]$rawValidation.counts.$table -ne [int64]$consistentValidation.counts.$table) {
    throw "Raw rollback set and consistent copy count mismatch: $table"
  }
}
$sqliteValidation = [ordered]@{
  rawRollbackSet = $rawValidation
  consistentCopy = $consistentValidation
  countsMatch = $true
}
Write-Utf8NoBom $sqliteValidationPath ($sqliteValidation | ConvertTo-Json -Depth 6)

$restoreWatch.Stop()
$restoreFinishedAt = [DateTime]::UtcNow
$restoreRelative = $RestoreRoot.Substring($EvidenceRoot.Length).TrimStart('\').Replace('\', '/')
$restoreArtifacts = @($restoreManifest.entries | ForEach-Object {
  [ordered]@{ type = 'backup'; path = "$restoreRelative/$($_.path)"; sha256 = $_.sha256 }
})
$restoreArtifacts += [ordered]@{
  type = 'manifest'; path = "$restoreRelative/manifest.json"
  sha256 = (Get-FileHash $restoreManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
}
$restoreArtifacts += [ordered]@{
  type = 'evidence'; path = "$restoreRelative/sqlite-readonly-validation.json"
  sha256 = (Get-FileHash $sqliteValidationPath -Algorithm SHA256).Hash.ToLowerInvariant()
}
$restoreReport = [ordered]@{
  runId = $RestoreRunId; stage = 'backup'; status = 'passed'; startedAt = $restoreStartedAt.ToString('o')
  finishedAt = $restoreFinishedAt.ToString('o'); durationMs = [int64]$restoreWatch.ElapsedMilliseconds
  checks = @(
    [ordered]@{ id = 'backup.restore-drill'; status = 'passed'; message = 'Raw rollback set and consistent copy independently verified in isolation' }
    [ordered]@{ id = 'backup.restore-drill.raw-rollback-set'; status = 'passed'; message = 'Read-only integrity and key counts passed on sqlite-raw/source.sqlite with adjacent WAL/SHM' }
    [ordered]@{ id = 'backup.restore-drill.consistent-copy'; status = 'passed'; message = 'Read-only integrity and key counts passed independently on sqlite-consistent.sqlite' }
  )
  artifacts = @($restoreArtifacts)
  errors = @()
}
$RestoreReportPath = Join-Path $EvidenceRoot "$RestoreRunId-backup.json"
Write-Utf8NoBom $RestoreReportPath ($restoreReport | ConvertTo-Json -Depth 10)
```

**预期输出**：隔离目录中完整恢复同一组 SQLite/WAL/SHM（存在时）和资源；现有 db-migrator 的 `better-sqlite3` 首先在 `sqlite-raw` 原位以只读/query-only 打开真正回滚文件 `source.sqlite`，让同目录 `source.sqlite-wal/-shm` 参与恢复，再独立验证 `sqlite-consistent.sqlite`。两者都执行 `PRAGMA integrity_check`、记录关键表计数并要求计数相同；报告记录 Stopwatch 实测耗时。

**成功条件**：恢复文件集合、size、SHA-256、WAL/SHM 存在组合全部一致；raw rollback set 与 consistent copy 的完整性及 `admin_users/app_settings/players/games/game_playback_events/player_game_memories` 计数分别通过且相同；报告的 aggregate/raw/consistent 三项 checks 均为 `passed`。

**失败停止点**：不得覆盖已有恢复目录；缺文件、hash 不一致、raw rollback set 无法只读恢复、任一 integrity check 或计数对比失败立即停止。即使 consistent copy 正常，raw rollback set 损坏也必须失败并保留恢复目录排障。

**证据路径**：`$RestoreRoot`、`$sqliteValidationPath`、`$RestoreReportPath`；每一项都由报告 artifact 与签署 manifest 固定。

### 10. 收集 CI/runtime/TLS/最小权限/pool/timeout/signoff 证据

**输入**：固定 git SHA、隔离测试凭据、go-live/rollback 两位责任人、另一位独立 operator，以及前九步全部报告。

**命令**：

```powershell
$CiLog = Join-Path $EvidenceRoot '10-ci-release-gates.log'
$NoCriticalSkipLog = Join-Path $EvidenceRoot '10-tests-no-critical-skips.log'
$RuntimeBuildLog = Join-Path $EvidenceRoot '10-runtime-image-build.log'
$RuntimeNoSqliteLog = Join-Path $EvidenceRoot '10-runtime-no-sqlite.log'
$TlsSessionLog = Join-Path $EvidenceRoot '10-postgres-tls-session.log'
$TlsEvidence = Join-Path $EvidenceRoot '10-postgres-tls.json'
$PrivilegeLog = Join-Path $EvidenceRoot '10-postgres-least-privilege.log'
$PoolTimeoutEvidence = Join-Path $EvidenceRoot '10-postgres-pool-timeouts.json'
$DocsTruthLog = Join-Path $EvidenceRoot '10-docs-runtime-truth.log'
$evidenceStarted = [DateTime]::UtcNow
$evidenceWatch = [Diagnostics.Stopwatch]::StartNew()

& pnpm.cmd run verify:release *>&1 | Tee-Object -FilePath $CiLog
$ciExit = $LASTEXITCODE
if ($ciExit -ne 0) { throw 'CI release gates failed.' }
& pnpm.cmd run test:unit *>&1 | Tee-Object -FilePath $NoCriticalSkipLog
$unitExit = $LASTEXITCODE
if ($unitExit -ne 0 -or -not (Select-String -LiteralPath $NoCriticalSkipLog -Pattern '# skipped 0' -Quiet)) {
  throw 'Unit suite failed or contains skipped tests.'
}
& pnpm.cmd run test:unit -- postgresqlDocsTruth.test.ts *>&1 | Tee-Object -FilePath $DocsTruthLog
$docsExit = $LASTEXITCODE
if ($docsExit -ne 0) { throw 'Documentation runtime truth gate failed.' }

& docker build --target runtime -t $RuntimeImage -f (Join-Path $RepoRoot 'Dockerfile') $RepoRoot *>&1 |
  Tee-Object -FilePath $RuntimeBuildLog
$runtimeBuildExit = $LASTEXITCODE
if ($runtimeBuildExit -ne 0) { throw 'Runtime image build failed.' }
& docker run --rm --entrypoint node $RuntimeImage -e `
  'const fs=require("fs");const p=require("./packages/server/package.json");const d={...(p.dependencies||{}),...(p.optionalDependencies||{})};if(fs.existsSync("packages/db-migrator")||d["better-sqlite3"])process.exit(1);console.log("runtime-no-sqlite=passed");' `
  *>&1 | Tee-Object -FilePath $RuntimeNoSqliteLog
$runtimeInspectExit = $LASTEXITCODE
if ($runtimeInspectExit -ne 0) { throw 'Runtime image contains the one-time migrator or SQLite dependency.' }

if ($null -ne $env:PGSERVICE -and $env:PGSERVICE.Length -gt 0) {
  throw 'PGSERVICE is forbidden for this gate because its ssl settings are not visible in the signed evidence.'
}
$requiredPgEnvironment = @('PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE','PGSSLROOTCERT')
if (@($requiredPgEnvironment | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }).Count) {
  throw 'The complete inherited PG* environment is required; do not pass a database URL to psql.'
}
if ($env:PGSSLMODE -cne 'verify-full' -or $env:DATABASE_SSL -cne 'verify-full') {
  throw 'PGSSLMODE and DATABASE_SSL must both be exactly verify-full.'
}
$pgRootCert = (Resolve-Path -LiteralPath $env:PGSSLROOTCERT).Path
$databaseCaPath = (Resolve-Path -LiteralPath $env:DATABASE_CA_PATH).Path
if ($pgRootCert -cne $databaseCaPath) { throw 'PGSSLROOTCERT and DATABASE_CA_PATH must resolve to the same CA file.' }
$caSha256 = (Get-FileHash -LiteralPath $pgRootCert -Algorithm SHA256).Hash.ToLowerInvariant()
$tlsSessionOutput = & psql -X -tA -v ON_ERROR_STOP=1 -c `
  'SELECT ssl::text FROM pg_stat_ssl WHERE pid = pg_backend_pid();' 2>&1
$tlsSessionExit = $LASTEXITCODE
$tlsSessionOutput | Set-Content -LiteralPath $TlsSessionLog -Encoding utf8
$tlsSessionState = ([string]($tlsSessionOutput | Select-Object -Last 1)).Trim()
if ($tlsSessionExit -ne 0 -or $tlsSessionState -cne 'true') { throw 'The current PostgreSQL backend session is not using TLS.' }
$tls = [ordered]@{
  actualMode = $env:PGSSLMODE
  actualRootCert = $pgRootCert
  databaseCaPath = $databaseCaPath
  caSha256 = $caSha256
  sessionSsl = $true
}
Write-Utf8NoBom $TlsEvidence ($tls | ConvertTo-Json -Depth 4)
$privilegeOutput = & psql -X -tA -v ON_ERROR_STOP=1 --set=app_schema=$AppSchema -c `
  "SELECT has_database_privilege(current_user,current_database(),'CONNECT')::text || '|' || has_database_privilege(current_user,current_database(),'CREATE')::text || '|' || has_schema_privilege(current_user, :'app_schema','USAGE')::text;" 2>&1
$privilegeExit = $LASTEXITCODE
$privilegeOutput | Set-Content -LiteralPath $PrivilegeLog -Encoding utf8
$privilegeState = ([string]($privilegeOutput | Select-Object -Last 1)).Trim()
if ($privilegeExit -ne 0 -or $privilegeState -cne 'true|false|true') {
  throw 'Least-privilege expectation failed: CONNECT=true, CREATE DATABASE=false, schema USAGE=true.'
}

$positiveSettings = @('DATABASE_POOL_MAX','DATABASE_CONNECTION_TIMEOUT_MS','DATABASE_STATEMENT_TIMEOUT_MS')
foreach ($name in $positiveSettings) {
  $value = [Environment]::GetEnvironmentVariable($name)
  $parsed = 0
  if (-not [int]::TryParse($value, [ref]$parsed) -or $parsed -le 0) { throw "$name must be a positive integer." }
}
$poolTimeout = [ordered]@{
  databaseSsl = $env:DATABASE_SSL
  caSha256 = $caSha256
  poolMax = [int]$env:DATABASE_POOL_MAX
  connectionTimeoutMs = [int]$env:DATABASE_CONNECTION_TIMEOUT_MS
  statementTimeoutMs = [int]$env:DATABASE_STATEMENT_TIMEOUT_MS
}
Write-Utf8NoBom $PoolTimeoutEvidence ($poolTimeout | ConvertTo-Json -Depth 4)

$ReleaseCandidate = (git rev-parse HEAD).Trim().ToLowerInvariant()
if ($ReleaseCandidate -notmatch '^[a-f0-9]{40}$') { throw 'A full 40-character release candidate git SHA is required.' }
if ([string]::IsNullOrWhiteSpace($env:GO_LIVE_OWNER) -or [string]::IsNullOrWhiteSpace($env:ROLLBACK_OWNER)) {
  throw 'Go-live and rollback owner identities are required.'
}
if ($env:GO_LIVE_OWNER.Trim() -ieq $env:ROLLBACK_OWNER.Trim()) { throw 'Go-live and rollback owners must be different people.' }
$MinimumWindow = [math]::Ceiling((2 * [math]::Max([double]$r1.durationMs, [double]$r2.durationMs)) / 60000)
$SignedChecks = @('ci.release-gates','tests.no-critical-skips','backup.restore-drill','runtime.no-sqlite',
  'postgres.tls','postgres.least-privilege','postgres.pool-and-timeouts','docs.runtime-truth','operator.signoff')
$RawEvidencePaths = @($CiLog,$NoCriticalSkipLog,$RuntimeBuildLog,$RuntimeNoSqliteLog,
  $TlsSessionLog,$TlsEvidence,$PrivilegeLog,$PoolTimeoutEvidence,$DocsTruthLog)
$evidenceWatch.Stop()
$evidenceFinished = [DateTime]::UtcNow
$EnvironmentReportDraftPath = Join-Path $EvidenceRoot "$ReadinessRunId-environment.pending.json"
$EnvironmentReportPath = Join-Path $EvidenceRoot "$ReadinessRunId-environment.json"
$environmentDraft = [ordered]@{
  runId = $ReadinessRunId; stage = 'release'; status = 'failed'; startedAt = $evidenceStarted.ToString('o')
  finishedAt = $evidenceFinished.ToString('o'); durationMs = [int64]$evidenceWatch.ElapsedMilliseconds
  checks = @($SignedChecks | ForEach-Object { [ordered]@{ id = $_; status = 'failed'; message = "Pending independent verification: $_" } })
  artifacts = @($RawEvidencePaths | ForEach-Object {
    [ordered]@{
      type = 'evidence'
      path = ([IO.Path]::GetFullPath($_)).Substring($EvidenceRoot.Length).TrimStart('\').Replace('\','/')
      sha256 = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  })
  errors = @([ordered]@{ code = 'INDEPENDENT_VERIFICATION_PENDING'; message = 'Raw evidence has not been independently approved.' })
}
Write-Utf8NoBom $EnvironmentReportDraftPath ($environmentDraft | ConvertTo-Json -Depth 10)
Write-Host "Pending environment report created: $EnvironmentReportDraftPath"
Write-Host 'An independent operator must inspect every raw artifact, copy the draft to the final environment path, and only then set status/checks to passed and clear errors.'
if ((Read-Host 'Type REVIEWED_ENVIRONMENT only after the independently edited final environment report exists') -cne 'REVIEWED_ENVIRONMENT') {
  throw 'Independent environment review gate not completed.'
}
if (-not (Test-Path -LiteralPath $EnvironmentReportPath -PathType Leaf)) { throw 'Independent final environment report is missing.' }
$environmentReport = Get-Content -LiteralPath $EnvironmentReportPath -Raw | ConvertFrom-Json
if ($environmentReport.runId -cne $ReadinessRunId -or $environmentReport.stage -cne 'release' -or $environmentReport.status -cne 'passed') {
  throw 'Independent environment report identity or status is invalid.'
}
$environmentChecks = @($environmentReport.checks | Sort-Object id)
if ($environmentChecks.Count -ne $SignedChecks.Count -or @($environmentChecks | Where-Object { $_.status -cne 'passed' }).Count) {
  throw 'Independent environment report must pass all and only signed checks.'
}
if ((@($environmentChecks.id) -join '|') -cne (@($SignedChecks | Sort-Object) -join '|') -or @($environmentReport.errors).Count -ne 0) {
  throw 'Independent environment report check set or errors are invalid.'
}
$expectedEnvironmentArtifacts = @($environmentDraft.artifacts | Sort-Object path | ForEach-Object { "$($_.type)|$($_.path)|$($_.sha256)" })
$actualEnvironmentArtifacts = @($environmentReport.artifacts | Sort-Object path | ForEach-Object { "$($_.type)|$($_.path)|$($_.sha256)" })
if (($expectedEnvironmentArtifacts -join "`n") -cne ($actualEnvironmentArtifacts -join "`n")) {
  throw 'Independent environment report changed the raw evidence artifact set.'
}

$ReportPaths = @($preflightReportPath,$BackupReportPath,$RestoreReportPath,
  $Rehearsal1ReportPath,$Rehearsal1SmokePath,$Rehearsal2ReportPath,$Rehearsal2SmokePath,$EnvironmentReportPath)
$EvidencePaths = [Collections.Generic.List[string]]::new()
foreach ($reportPath in $ReportPaths) {
  $fullReport = [IO.Path]::GetFullPath($reportPath)
  $EvidencePaths.Add($fullReport)
  $report = Get-Content -LiteralPath $fullReport -Raw | ConvertFrom-Json
  if ($report.status -ne 'passed' -or @($report.errors).Count -ne 0) { throw "Input report failed: $($report.runId)" }
  foreach ($artifact in @($report.artifacts)) {
    $candidate = if ([IO.Path]::IsPathRooted([string]$artifact.path)) {
      [IO.Path]::GetFullPath([string]$artifact.path)
    } else {
      [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $fullReport) ([string]$artifact.path)))
    }
    $EvidencePaths.Add($candidate)
  }
}
$rootPrefix = $EvidenceRoot.TrimEnd('\') + '\'
$manifestEntries = foreach ($candidate in @($EvidencePaths | Sort-Object -Unique)) {
  if (-not $candidate.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Evidence escapes signoff directory.' }
  $item = Get-Item -LiteralPath $candidate
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse evidence is forbidden.' }
  [ordered]@{
    path = $candidate.Substring($rootPrefix.Length).Replace('\', '/')
    sizeBytes = $item.Length
    sha256 = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}
$SignoffDraftPath = Join-Path $EvidenceRoot 'postgresql-operator-signoff.pending.json'
$SignoffPath = Join-Path $EvidenceRoot 'postgresql-operator-signoff.json'
$signoffDraft = Get-Content -LiteralPath (Join-Path $RepoRoot 'docs\runbooks\postgresql-operator-signoff.example.json') -Raw | ConvertFrom-Json
$signoffDraft.releaseCandidate = $ReleaseCandidate
$signoffDraft.readinessRunId = $ReadinessRunId
$signoffDraft.goLiveOwner.name = $env:GO_LIVE_OWNER.Trim()
$signoffDraft.rollbackOwner.name = $env:ROLLBACK_OWNER.Trim()
$signoffDraft.maintenanceWindowMinutes = [int]$MinimumWindow
$signoffDraft.reportManifest = @($manifestEntries)
Write-Utf8NoBom $SignoffDraftPath ($signoffDraft | ConvertTo-Json -Depth 12)
Write-Host "Pending draft created: $SignoffDraftPath"
Write-Host 'A different independent operator must review every raw artifact, copy the draft to the final path, set real approval timestamps, approvedBy, status=approved, approved=true, and all signed checks=passed.'
if ((Read-Host 'Type REVIEWED only after the independently edited final signoff exists') -cne 'REVIEWED') { throw 'Independent review gate not completed.' }
if (-not (Test-Path -LiteralPath $SignoffPath -PathType Leaf)) { throw 'Independent operator final signoff is missing.' }
$signoff = Get-Content -LiteralPath $SignoffPath -Raw | ConvertFrom-Json
if ($signoff.releaseCandidate -cne $ReleaseCandidate -or $signoff.readinessRunId -cne $ReadinessRunId) { throw 'Signed candidate or readiness run mismatch.' }
if ($signoff.status -cne 'approved' -or $signoff.approved -ne $true) { throw 'Final signoff is not approved.' }
if ([int]$signoff.maintenanceWindowMinutes -ne [int]$MinimumWindow) { throw 'Signed maintenance window mismatch.' }
$ownerNames = @([string]$signoff.goLiveOwner.name,[string]$signoff.rollbackOwner.name)
if ($ownerNames[0] -cne $env:GO_LIVE_OWNER.Trim() -or $ownerNames[1] -cne $env:ROLLBACK_OWNER.Trim() -or $ownerNames[0] -ieq $ownerNames[1]) {
  throw 'Signed go-live and rollback owners are invalid.'
}
$operator = ([string]$signoff.approvedBy).Trim()
if (-not $operator -or $operator.StartsWith('REPLACE_WITH_') -or $ownerNames -icontains $operator) {
  throw 'Independent operator must be nonempty and different from go-live and rollback owners.'
}
foreach ($approval in @($signoff.goLiveOwner.approvedAt,$signoff.rollbackOwner.approvedAt,$signoff.approvedAt)) {
  $approvalTime = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParse([string]$approval, [ref]$approvalTime) -or $approvalTime -le [DateTimeOffset]::UnixEpoch) {
    throw 'Real approval timestamps after the placeholder epoch are required.'
  }
}
$actualChecks = @($signoff.checks | Sort-Object id)
if ($actualChecks.Count -ne $SignedChecks.Count -or @($actualChecks | Where-Object { $_.status -cne 'passed' }).Count) {
  throw 'All and only signed checks must be passed.'
}
if ((@($actualChecks.id) -join '|') -cne (@($SignedChecks | Sort-Object) -join '|')) { throw 'Signed check set mismatch.' }
$expectedManifest = @($manifestEntries | Sort-Object path | ForEach-Object { "$($_.path)|$($_.sizeBytes)|$($_.sha256)" })
$actualManifest = @($signoff.reportManifest | Sort-Object path | ForEach-Object { "$($_.path)|$($_.sizeBytes)|$($_.sha256)" })
if (($expectedManifest -join "`n") -cne ($actualManifest -join "`n")) { throw 'Signed reportManifest does not exactly match reports and artifacts.' }
```

**预期输出**：每项命令都有独立原始 artifact；脚本先生成 `status=failed`、checks 全为 `failed` 的 pending environment report，独立 operator 逐项核对后手工复制并改成最终报告，脚本只读验证其 check 集合与未变更的 `evidence` artifact。随后才生成 pending signoff 草稿，由不同于 go-live/rollback owner 的独立 operator 填写实际时间并签字。2x maintenance window（两次演练最大耗时的两倍并向上取整）写入签核。

**成功条件**：完整 release gates 通过；运行镜像无迁移工具；`PGSSLMODE` 与应用 `DATABASE_SSL` 均精确为 `verify-full`，`PGSSLROOTCERT` 与 `DATABASE_CA_PATH` 解析到同一 CA 且 hash 已记录，当前 `pg_backend_pid()` 在 `pg_stat_ssl` 中为 `ssl=true`；最小权限/正整数配置有效；三方身份两两不同；最终 signoff 已由独立 operator 手工签署；`reportManifest` 精确覆盖输入 reports + artifacts。

**失败停止点**：任一原始检查或责任分离失败即停止；自动化只生成 failed/pending environment 与 signoff 草稿并验证最终文件，绝不生成 all-passed 环境报告、绝不代填 `approvedBy/approvedAt`、绝不自动批准。独立 operator 只能在逐项核对真实 evidence 后把对应 check 改为 passed。

**证据路径**：`$RawEvidencePaths`、`$EnvironmentReportDraftPath`、`$EnvironmentReportPath`、`$SignoffDraftPath`、`$SignoffPath` 及其相对 manifest 条目。

### 11. 执行 release-readiness 聚合

**输入**：八份选定报告、实际 operator signoff、固定 40 位候选 SHA、与 signoff `readinessRunId` 相同的 release runId 和输出目录。

**命令**：

```powershell
$ReleaseOutput = Join-Path $EvidenceRoot 'release-output'
$ReportCsv = $ReportPaths -join ','
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  (Join-Path $RepoRoot 'scripts\ops\postgres\release-readiness.ps1') `
  -Reports $ReportCsv -OperatorSignoff $SignoffPath -ReleaseCandidate $ReleaseCandidate `
  -Output $ReleaseOutput -RunId $ReadinessRunId
if ($LASTEXITCODE -ne 0) { throw 'Release readiness failed; preserve all evidence and stop.' }
$ReleaseReportPath = Join-Path $ReleaseOutput "$ReadinessRunId-release.json"
$release = Get-Content -LiteralPath $ReleaseReportPath -Raw | ConvertFrom-Json
if ($release.status -ne 'passed' -or @($release.checks).Count -ne 16) { throw 'Release gate is not a complete PASS.' }
if ($release.maintenanceWindowMinutes -ne $MinimumWindow) { throw 'Computed maintenance window mismatch.' }
```

**预期输出**：原子、不可覆盖的 release JSON/Markdown，固定 16 项检查全部 `passed`，maintenance window 由聚合器重新计算。

**成功条件**：子进程退出 0、顶层 `status=passed`、16/16 checks 通过、计算窗口匹配。

**失败停止点**：聚合器 fail-closed；不修改原报告或签核重跑。定位原因后必须生成新证据和新 runId。

**证据路径**：`$ReleaseReportPath`、同目录 Markdown、完整 `$EvidenceRoot`。

### 12. PASS 后申请独立真实切换授权

**输入**：通过的 release report、证据根 hash、维护窗口和 go-live/rollback owner。

**命令**：

```powershell
if ($release.status -ne 'passed') { throw 'A PASS release report is required.' }
$AuthorizationRequestPath = Join-Path $EvidenceRoot '12-production-cutover-authorization-request.json'
$request = [ordered]@{
  releaseCandidate = $ReleaseCandidate
  readinessRunId = $ReadinessRunId
  releaseReportSha256 = (Get-FileHash -LiteralPath $ReleaseReportPath -Algorithm SHA256).Hash.ToLowerInvariant()
  minimumMaintenanceWindowMinutes = [int]$release.maintenanceWindowMinutes
  requestedAt = [DateTime]::UtcNow.ToString('o')
  status = 'pending-independent-production-authorization'
  automatedCutover = $false
  productionConnectionAttempted = $false
}
Write-Utf8NoBom $AuthorizationRequestPath ($request | ConvertTo-Json -Depth 6)
Write-Host "Readiness PASS. Submit $AuthorizationRequestPath to the independent change approver."
```

**预期输出**：只生成待审批请求；不连接真实生产、不导入、不启动 PostgreSQL 版本、不自动切流。

**成功条件**：审批请求引用固定 release report hash 和最小维护窗口，状态仍为 pending；后续真实切换必须在新的、明确授权的运维窗口执行。

**失败停止点**：没有独立真实切换授权即结束本手册，不得把 readiness PASS 等同于切换授权。

**证据路径**：`$AuthorizationRequestPath`；获批记录由独立变更管理系统保存。

## 签核 manifest 契约

`postgresql-operator-signoff.example.json` 是不可通过聚合器的 pending 草稿：保留计划字段，同时补齐真实聚合器要求的 `version/approved/approvedBy/approvedAt/checks/reportManifest`。独立 operator 必须先核验 failed/pending environment 草稿及每份原始 evidence，再手工产出最终 passed environment report 和 approved signoff。每个 manifest 条目必须相对于 signoff 文件目录，使用 `/`，包含精确字节数和 64 位小写 SHA-256；列表必须精确覆盖传入的 reports 及这些报告声明的全部 artifacts。示例里的 `REPLACE_*`、零 hash 和纪元时间只是安全占位，不能直接用于聚合。
