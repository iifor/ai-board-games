[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$Output,
  [Parameter(Mandatory = $true)][string]$Resources,
  [Parameter(Mandatory = $true)][ValidateSet('true', 'false')][string]$RequireTls,
  [Parameter(Mandatory = $true)][string]$RunId
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../../..')
$arguments = @(
  '--filter', '@ai-presenter/db-migrator', 'run', 'preflight', '--',
  '--source', $Source, '--target', $Target, '--output', $Output, '--resources', $Resources,
  '--require-tls', $RequireTls.ToLowerInvariant(), '--run-id', $RunId
)
Push-Location $repoRoot
try { & pnpm.cmd @arguments; $exitCode = $LASTEXITCODE }
finally { Pop-Location }
exit $exitCode
