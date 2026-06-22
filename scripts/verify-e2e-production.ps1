# Build, start (optional), inject sample alarms, verify Kafka/Flink/PostgreSQL E2E.
# Production ingest remains live API polling when 192.168.1.51:8010 is reachable.
param(
    [switch]$FullStartup,
    [switch]$SkipInject,
    [switch]$ForceResubmit
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

Write-Host "=== AMS E2E Production Verification ===" -ForegroundColor Cyan

if ($FullStartup) {
    $startupArgs = @()
    if ($ForceResubmit) { $startupArgs += "-ForceResubmit" }
    & (Join-Path $PSScriptRoot "start-ams-production.ps1") @startupArgs
}

if (-not $SkipInject) {
    & (Join-Path $PSScriptRoot "inject-sample-alarms-e2e.ps1") -WaitSeconds 30
}

& (Join-Path $PSScriptRoot "api-pipeline-validation.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nProduction live feed URL (unchanged):" -ForegroundColor Cyan
Write-Host "  http://192.168.1.51:8010/api/current-alarms" -ForegroundColor Gray
Write-Host "When reachable, AlarmIngestionService polls every 2s automatically." -ForegroundColor Gray
