[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Reports,
  [Parameter(Mandatory = $true)][string]$OperatorSignoff,
  [Parameter(Mandatory = $true)][string]$Output,
  [Parameter(Mandatory = $true)][string]$RunId
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../../..')
$arguments = @(
  '--filter', '@ai-presenter/db-migrator', 'run', 'release-readiness', '--',
  '--reports', $Reports, '--operator-signoff', $OperatorSignoff, '--output', $Output, '--run-id', $RunId
)
Push-Location $repoRoot
try { & pnpm.cmd @arguments; $exitCode = $LASTEXITCODE }
finally { Pop-Location }
exit $exitCode
