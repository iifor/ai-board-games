[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Output,
  [Parameter(Mandatory = $true)][string]$Resources,
  [Parameter(Mandatory = $true)][ValidateSet('true', 'false')][string]$RequireTls,
  [Parameter(Mandatory = $true)][string]$RunId
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../../..')
if (-not $env:DATABASE_URL) { throw 'DATABASE_URL is required.' }
$arguments = @(
  '--filter', '@ai-presenter/db-migrator', 'run', 'preflight', '--',
  '--source', $Source, '--output', $Output, '--resources', $Resources,
  '--require-tls', $RequireTls.ToLowerInvariant(), '--run-id', $RunId
)
Push-Location $repoRoot
try {
  $exitCode = 1
  & pnpm.cmd @arguments
  if ($null -eq $LASTEXITCODE) { throw 'db-migrator command returned no exit code' }
  $exitCode = $LASTEXITCODE
}
catch {
  [Console]::Error.WriteLine('Unable to start db-migrator command.')
  $exitCode = 1
}
finally { Pop-Location }
exit $exitCode
