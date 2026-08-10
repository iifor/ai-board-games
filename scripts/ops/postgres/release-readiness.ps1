[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Reports,
  [Parameter(Mandatory = $true)][string]$OperatorSignoff,
  [Parameter(Mandatory = $true)][string]$ReleaseCandidate,
  [Parameter(Mandatory = $true)][string]$Output,
  [Parameter(Mandatory = $true)][string]$RunId
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../../..')
$arguments = @(
  '--filter', '@ai-presenter/db-migrator', 'run', 'release-readiness', '--',
  '--reports', $Reports, '--operator-signoff', $OperatorSignoff, '--release-candidate', $ReleaseCandidate,
  '--output', $Output, '--run-id', $RunId
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
