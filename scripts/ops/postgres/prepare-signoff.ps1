[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Reports,
  [Parameter(Mandatory = $true)][string]$ReleaseCandidate,
  [Parameter(Mandatory = $true)][string]$GoLiveOwner,
  [Parameter(Mandatory = $true)][string]$RollbackOwner,
  [Parameter(Mandatory = $true)][string]$Output,
  [Parameter(Mandatory = $true)][string]$RunId
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../../..')
$arguments = @(
  '--filter', '@ai-presenter/db-migrator', 'run', 'prepare-signoff', '--',
  '--reports', $Reports, '--release-candidate', $ReleaseCandidate,
  '--go-live-owner', $GoLiveOwner, '--rollback-owner', $RollbackOwner,
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
