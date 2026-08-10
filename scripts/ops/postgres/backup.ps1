[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Output,
  [Parameter(Mandatory = $true)][string]$Resources,
  [Parameter(Mandatory = $true)][string]$RunId,
  [switch]$Execute
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../../..')
$arguments = @(
  '--filter', '@ai-presenter/db-migrator', 'run', 'backup', '--',
  '--source', $Source, '--output', $Output, '--resources', $Resources, '--run-id', $RunId
)
if ($Execute) { $arguments += '--execute' }
Push-Location $repoRoot
try { & pnpm.cmd @arguments; $exitCode = $LASTEXITCODE }
finally { Pop-Location }
exit $exitCode
