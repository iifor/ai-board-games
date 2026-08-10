[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Backup,
  [Parameter(Mandatory = $true)][string]$Manifest,
  [Parameter(Mandatory = $true)][string]$ResourceMap,
  [Parameter(Mandatory = $true)][string]$RestoreOutput,
  [Parameter(Mandatory = $true)][string]$Output,
  [Parameter(Mandatory = $true)][string]$RunId,
  [switch]$Execute
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../../..')
$arguments = @(
  '--filter', '@ai-presenter/db-migrator', 'run', 'restore-drill', '--',
  '--backup', $Backup, '--manifest', $Manifest, '--resource-map', $ResourceMap,
  '--restore-output', $RestoreOutput, '--output', $Output, '--run-id', $RunId
)
if ($Execute) { $arguments += '--execute' }
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
