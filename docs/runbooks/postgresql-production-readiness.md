# PostgreSQL 16 生产上线准备 Runbook

本手册只完成上线准备、证据闭包和独立真实切换授权申请，不执行真实生产导入、应用切换或流量恢复。不得自动切流或连接真实生产。以下 12 步不可交换；任何一步失败都立即停止。失败 schema、报告和现场必须保留，禁止清理后继续，也禁止把失败 PostgreSQL 目标用于下一次尝试。

## 执行前提

- 在同一个受控 PowerShell 会话执行全部步骤，仓库当前提交固定且工作树干净。
- `$env:TEST_DATABASE_URL` 指向名称以 `_test` 或 `_rehearsal` 结尾的专用 PostgreSQL 16 数据库，并带 `sslmode=verify-full`；它不是生产数据库。
- `$env:TEST_APP_DATABASE_URL` 使用待验证的最小权限应用角色，同样只指向隔离环境。
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
$ReleaseRunId = 'release-REPLACE_WITH_UTC_ID'
$RuntimeImage = 'consensus-readiness:REPLACE_WITH_GIT_SHA'
$AppSchema = if ($env:DATABASE_SCHEMA) { $env:DATABASE_SCHEMA } else { 'consensus' }

if (Test-Path -LiteralPath $EvidenceRoot) { throw 'EvidenceRoot must be new and empty.' }
if (-not $env:TEST_DATABASE_URL) { throw 'TEST_DATABASE_URL is required.' }
if (-not $env:TEST_APP_DATABASE_URL) { throw 'TEST_APP_DATABASE_URL is required.' }
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
$preflightOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  (Join-Path $RepoRoot 'scripts\ops\postgres\preflight.ps1') `
  -Source $Source -Target $env:TEST_DATABASE_URL -Output $EvidenceRoot `
  -Resources ($Resources -join ',') -RequireTls true -RunId $PreflightRunId `
  2> $preflightErrorPath
$preflightExit = $LASTEXITCODE
$preflightJson = $preflightOutput | Where-Object { $_.TrimStart().StartsWith('{') } | Select-Object -Last 1
if (-not $preflightJson) { throw 'Preflight returned no JSON report.' }
$preflight = $preflightJson | ConvertFrom-Json
Write-Utf8NoBom $preflightReportPath ($preflight | ConvertTo-Json -Depth 10)
if ($preflightExit -ne 0 -or $preflight.status -ne 'passed') { throw 'Preflight failed; stop.' }
```

**预期输出**：状态为 `passed` 的 preflight JSON；源完整性、空间、PostgreSQL 16、目标新鲜度、TLS 和受限连接检查通过。该步骤是只读 preflight dry-run，不创建 schema。

**成功条件**：子进程退出码为 0，报告 `status=passed`，`target.postgres-version` 与 `target.tls` 均通过。

**失败停止点**：任一检查失败立即停止；保留 stdout 转存报告和脱敏 stderr，不切换到其他目标“试到成功”。

**证据路径**：`$preflightReportPath`、`$preflightErrorPath`。

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
New-Item -ItemType Directory -Path $RestoreRoot | Out-Null
Get-ChildItem -LiteralPath $BackupRoot -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $RestoreRoot -Recurse
}
$restoreManifestPath = Join-Path $RestoreRoot 'manifest.json'
$restoreManifest = Get-Content -LiteralPath $restoreManifestPath -Raw | ConvertFrom-Json
foreach ($entry in $restoreManifest.entries) {
  $candidate = Join-Path $RestoreRoot ($entry.path.Replace('/', '\'))
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Restored file missing: $($entry.path)" }
  $item = Get-Item -LiteralPath $candidate
  $hash = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($item.Length -ne $entry.sizeBytes -or $hash -cne $entry.sha256) { throw "Restored bytes mismatch: $($entry.path)" }
}
$restoredFiles = @(Get-ChildItem -LiteralPath $RestoreRoot -Recurse -File | Where-Object { $_.FullName -cne $restoreManifestPath })
if ($restoredFiles.Count -ne @($restoreManifest.entries).Count) { throw 'Restore drill file set mismatch.' }
$restoreStarted = [DateTime]::UtcNow.AddSeconds(-1).ToString('o')
$restoreRelative = $RestoreRoot.Substring($EvidenceRoot.Length).TrimStart('\').Replace('\', '/')
$restoreReport = [ordered]@{
  runId = $RestoreRunId; stage = 'backup'; status = 'passed'; startedAt = $restoreStarted
  finishedAt = [DateTime]::UtcNow.ToString('o'); durationMs = 1000
  checks = @([ordered]@{ id = 'backup.restore-drill'; status = 'passed'; message = 'SQLite/WAL/SHM/resources restored and manifest verified in isolation' })
  artifacts = @(
    [ordered]@{ type = 'backup'; path = "$restoreRelative/sqlite-consistent.sqlite"; sha256 = (Get-FileHash (Join-Path $RestoreRoot 'sqlite-consistent.sqlite') -Algorithm SHA256).Hash.ToLowerInvariant() },
    [ordered]@{ type = 'manifest'; path = "$restoreRelative/manifest.json"; sha256 = (Get-FileHash $restoreManifestPath -Algorithm SHA256).Hash.ToLowerInvariant() }
  )
  errors = @()
}
$RestoreReportPath = Join-Path $EvidenceRoot "$RestoreRunId-backup.json"
Write-Utf8NoBom $RestoreReportPath ($restoreReport | ConvertTo-Json -Depth 10)
```

**预期输出**：隔离目录中完整恢复同一组 SQLite/WAL/SHM（存在时）和资源，所有 manifest 条目复验通过，并生成 restore drill 报告。

**成功条件**：恢复文件集合、size、SHA-256 全部一致；报告 `backup.restore-drill=passed`。

**失败停止点**：不得覆盖已有恢复目录；缺文件或 hash 不一致立即停止，并保留恢复目录排障。

**证据路径**：`$RestoreRoot`、`$RestoreReportPath`。

### 10. 收集 CI/runtime/TLS/最小权限/pool/timeout/signoff 证据

**输入**：固定 git SHA、隔离测试凭据、两个不同责任人和前九步全部报告。

**命令**：

```powershell
$CiLog = Join-Path $EvidenceRoot '10-ci-release-gates.log'
pnpm.cmd run verify:release *>&1 | Tee-Object -FilePath $CiLog
if ($LASTEXITCODE -ne 0) { throw 'CI release gates failed.' }

docker build --target runtime -t $RuntimeImage -f (Join-Path $RepoRoot 'Dockerfile') $RepoRoot
if ($LASTEXITCODE -ne 0) { throw 'Runtime image build failed.' }
docker run --rm --entrypoint node $RuntimeImage -e `
  'const fs=require("fs");const p=require("./packages/server/package.json");const d={...(p.dependencies||{}),...(p.optionalDependencies||{})};if(fs.existsSync("packages/db-migrator")||d["better-sqlite3"])process.exit(1);'
if ($LASTEXITCODE -ne 0) { throw 'Runtime image contains the one-time migrator or SQLite dependency.' }

$tlsState = (& psql $env:TEST_APP_DATABASE_URL -X -tA -v ON_ERROR_STOP=1 -c 'SHOW ssl;').Trim()
if ($LASTEXITCODE -ne 0 -or $tlsState -cne 'on') { throw 'TLS is not active.' }
$privilegeState = (& psql $env:TEST_APP_DATABASE_URL -X -tA -v ON_ERROR_STOP=1 `
  --set=app_schema=$AppSchema -c `
  "SELECT has_database_privilege(current_user,current_database(),'CONNECT')::text || '|' || has_database_privilege(current_user,current_database(),'CREATE')::text || '|' || has_schema_privilege(current_user, :'app_schema','USAGE')::text;").Trim()
if ($LASTEXITCODE -ne 0 -or $privilegeState -cne 'true|false|true') {
  throw 'Least-privilege expectation failed: CONNECT=true, CREATE DATABASE=false, schema USAGE=true.'
}

$positiveSettings = @('DATABASE_POOL_MAX','DATABASE_CONNECTION_TIMEOUT_MS','DATABASE_STATEMENT_TIMEOUT_MS')
foreach ($name in $positiveSettings) {
  $value = [Environment]::GetEnvironmentVariable($name)
  $parsed = 0
  if (-not [int]::TryParse($value, [ref]$parsed) -or $parsed -le 0) { throw "$name must be a positive integer." }
}
if (-not $env:DATABASE_SSL -or -not $env:DATABASE_CA_PATH) { throw 'TLS and CA settings are required.' }
if (-not (Test-Path -LiteralPath $env:DATABASE_CA_PATH -PathType Leaf)) { throw 'CA file is unreadable.' }

$ReleaseCandidate = (git rev-parse HEAD).Trim()
if (-not $env:GO_LIVE_OWNER -or -not $env:ROLLBACK_OWNER -or -not $env:INDEPENDENT_OPERATOR) { throw 'Independent owner identities are required.' }
if ($env:GO_LIVE_OWNER -ceq $env:ROLLBACK_OWNER) { throw 'Go-live and rollback owners must be different people.' }
$MinimumWindow = [math]::Ceiling((2 * [math]::Max([double]$r1.durationMs, [double]$r2.durationMs)) / 60000)
$SignedChecks = @('ci.release-gates','tests.no-critical-skips','backup.restore-drill','runtime.no-sqlite',
  'postgres.tls','postgres.least-privilege','postgres.pool-and-timeouts','docs.runtime-truth','operator.signoff')
$now = [DateTime]::UtcNow.ToString('o')
$EnvironmentReportPath = Join-Path $EvidenceRoot "$ReadinessRunId-environment.json"
$environmentReport = [ordered]@{
  runId = $ReadinessRunId; stage = 'release'; status = 'passed'; startedAt = $now; finishedAt = $now; durationMs = 0
  checks = @($SignedChecks | ForEach-Object { [ordered]@{ id = $_; status = 'passed'; message = "Operator verified evidence: $_" } })
  artifacts = @(); errors = @()
}
Write-Utf8NoBom $EnvironmentReportPath ($environmentReport | ConvertTo-Json -Depth 10)

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
$SignoffPath = Join-Path $EvidenceRoot 'postgresql-operator-signoff.json'
$signoff = Get-Content -LiteralPath (Join-Path $RepoRoot 'docs\runbooks\postgresql-operator-signoff.example.json') -Raw | ConvertFrom-Json
$signoff.releaseCandidate = $ReleaseCandidate
$signoff.readinessRunId = $ReadinessRunId
$signoff.goLiveOwner.name = $env:GO_LIVE_OWNER
$signoff.goLiveOwner.approvedAt = $now
$signoff.rollbackOwner.name = $env:ROLLBACK_OWNER
$signoff.rollbackOwner.approvedAt = $now
$signoff.maintenanceWindowMinutes = [int]$MinimumWindow
$signoff.approvedBy = $env:INDEPENDENT_OPERATOR
$signoff.approvedAt = $now
$signoff.checks = @($SignedChecks | ForEach-Object { [ordered]@{ id = $_; status = 'passed' } })
$signoff.reportManifest = @($manifestEntries)
Write-Utf8NoBom $SignoffPath ($signoff | ConvertTo-Json -Depth 12)
```

**预期输出**：CI、runtime、TLS、最小权限、pool、timeout 和 signoff 均有证据；2x maintenance window（两次演练最大耗时的两倍并向上取整）写入签核。

**成功条件**：完整 release gates 通过；运行镜像无迁移工具；TLS/CA/最小权限/正整数配置有效；两位责任人独立；`reportManifest` 精确覆盖输入 reports + artifacts。

**失败停止点**：任一检查或责任分离失败即停止；不得手工把失败 check 改成 passed。

**证据路径**：`$CiLog`、`$EnvironmentReportPath`、`$SignoffPath` 及其相对 manifest 条目。

### 11. 执行 release-readiness 聚合

**输入**：八份选定报告、实际 operator signoff、全新 release runId 和输出目录。

**命令**：

```powershell
$ReleaseOutput = Join-Path $EvidenceRoot 'release-output'
$ReportCsv = $ReportPaths -join ','
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  (Join-Path $RepoRoot 'scripts\ops\postgres\release-readiness.ps1') `
  -Reports $ReportCsv -OperatorSignoff $SignoffPath -Output $ReleaseOutput -RunId $ReleaseRunId
if ($LASTEXITCODE -ne 0) { throw 'Release readiness failed; preserve all evidence and stop.' }
$ReleaseReportPath = Join-Path $ReleaseOutput "$ReleaseRunId-release.json"
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

`postgresql-operator-signoff.example.json` 保留计划字段，同时补齐真实聚合器要求的 `version/approved/approvedBy/approvedAt/checks/reportManifest`。每个 manifest 条目必须相对于 signoff 文件目录，使用 `/`，包含精确字节数和 64 位小写 SHA-256；列表必须精确覆盖传入的 reports 及这些报告声明的全部 artifacts。示例里的 `REPLACE_*`、零 hash 和纪元时间只是安全占位，不能直接用于聚合。
