# Run from infra/docker — forwards to project-root scripts\start-ams-production.ps1
param(
    [switch]$SkipDocker,
    [switch]$ForceResubmit,
    [switch]$ResetKafkaVolumes
)

$rootScript = Join-Path $PSScriptRoot "..\..\scripts\start-ams-production.ps1"
if (-not (Test-Path $rootScript)) {
    throw "Startup script not found: $rootScript`nRun from AMS - HMI GRID project root: .\scripts\start-ams-production.ps1"
}

$params = @{}
if ($SkipDocker) { $params.SkipDocker = $true }
if ($ForceResubmit) { $params.ForceResubmit = $true }
if ($ResetKafkaVolumes) { $params.ResetKafkaVolumes = $true }

& $rootScript @params
