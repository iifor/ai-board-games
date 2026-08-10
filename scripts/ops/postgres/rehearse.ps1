[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SourceSnapshot,
  [Parameter(Mandatory = $true)][string]$Manifest,
  [Parameter(Mandatory = $true)][string]$Output,
  [Parameter(Mandatory = $true)][string]$RunId,
  [switch]$Execute
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../../..')
$arguments = @(
  '--filter', '@ai-presenter/db-migrator', 'run', 'rehearse', '--',
  '--source-snapshot', $SourceSnapshot, '--manifest', $Manifest, '--output', $Output, '--run-id', $RunId
)
if ($Execute) { $arguments += '--execute' }
Push-Location $repoRoot
try { & pnpm.cmd @arguments; $exitCode = $LASTEXITCODE }
finally { Pop-Location }
exit $exitCode
