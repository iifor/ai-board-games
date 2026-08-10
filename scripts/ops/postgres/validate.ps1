[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SourceSnapshot,
  [Parameter(Mandatory = $true)][string]$Manifest,
  [Parameter(Mandatory = $true)][string]$MigrationReport,
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$Schema,
  [Parameter(Mandatory = $true)][string]$Output,
  [Parameter(Mandatory = $true)][string]$RunId
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../../..')
$arguments = @(
  '--filter', '@ai-presenter/db-migrator', 'run', 'validate', '--',
  '--source-snapshot', $SourceSnapshot, '--manifest', $Manifest, '--migration-report', $MigrationReport,
  '--target', $Target, '--schema', $Schema, '--output', $Output, '--run-id', $RunId
)
Push-Location $repoRoot
try { & pnpm.cmd @arguments; $exitCode = $LASTEXITCODE }
finally { Pop-Location }
exit $exitCode
