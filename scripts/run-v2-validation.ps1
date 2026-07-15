<#
.SYNOPSIS
  Validate the V2 pipeline (Phases 5-7) end-to-end against a running AMS/Traverse stack.

.DESCRIPTION
  Starts the live-data simulator (ams-sim) as a container, optionally (re)submits the Flink jobs
  (including the Phase-7 AnalysisExecutionJob), then runs the containerized V2 validation suite
  (governance + calculation compute loop + data fidelity + asset-scoped authz).

  Prerequisites:
    - The main stack is already up (e.g. .\run-all.ps1). This includes the NEW audit-service and,
      for the compute loop, the Flink JAR must be built WITH the Phase-7 job:
          .\scripts\build-flink-jar.ps1
    - An admin user is seeded in auth-service (compose bootstraps admin / ChangeMe123! by default).

.PARAMETER EnsureFlink
  Submit any missing Flink jobs (runs scripts/ensure_flink_jobs.py) before validating — needed the
  first time so the AnalysisExecutionJob is running.

.PARAMETER SkipSim
  Do not (re)build/start ams-sim (use if the simulator is already running).

.PARAMETER Down
  Stop and remove the ams-sim container, then exit.

.EXAMPLE
  .\scripts\run-v2-validation.ps1 -EnsureFlink
.EXAMPLE
  .\scripts\run-v2-validation.ps1 -Down
#>
[CmdletBinding()]
param(
  [switch]$EnsureFlink,
  [switch]$SkipSim,
  [switch]$Down
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$composeArgs = @('-f', 'infra/docker/docker-compose.yml', '-f', 'infra/docker/docker-compose.sims.yml')

function Compose { param([Parameter(ValueFromRemainingArguments = $true)]$a) & docker compose @composeArgs @a }

if ($Down) {
  Write-Host 'Stopping ams-sim...' -ForegroundColor Yellow
  Compose stop ams-sim
  Compose rm -f ams-sim
  Write-Host 'ams-sim removed.' -ForegroundColor Green
  return
}

if (-not $SkipSim) {
  Write-Host 'Building + starting live-data simulator (ams-sim)...' -ForegroundColor Cyan
  Compose up -d --build ams-sim
  if (-not $?) { throw 'Failed to start ams-sim' }
  Write-Host 'Waiting 15s for live snapshots to populate...' -ForegroundColor Cyan
  Start-Sleep -Seconds 15
}

if ($EnsureFlink) {
  Write-Host 'Ensuring Flink jobs are running (incl. AnalysisExecutionJob)...' -ForegroundColor Cyan
  python scripts/ensure_flink_jobs.py
  if (-not $?) { Write-Host 'WARN: ensure_flink_jobs.py reported an issue — the compute loop test may skip/fail.' -ForegroundColor Yellow }
}

Write-Host 'Running V2 validation suite...' -ForegroundColor Cyan
Compose build v2-validator
Compose run --rm v2-validator
$code = $LASTEXITCODE

Write-Host ''
if ($code -eq 0) {
  Write-Host 'V2 VALIDATION PASSED' -ForegroundColor Green
} else {
  Write-Host "V2 VALIDATION had failures (exit $code) — see the SUMMARY above." -ForegroundColor Red
}
Write-Host 'The simulator (ams-sim) is still running so you can re-test. Stop it with: .\scripts\run-v2-validation.ps1 -Down' -ForegroundColor DarkGray
exit $code
