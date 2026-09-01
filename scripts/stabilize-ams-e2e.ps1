# One-shot lab stabilization: rebuild Flink, reset topics (optional), deploy job, validate cookies.
param(
    [switch]$ResetKafkaTopics,
    [switch]$SkipBuild,
    [switch]$ForceResubmit,
    [switch]$SkipValidation,
    [ValidateSet("latest", "earliest")]
    [Alias("RawOpcStartingOffsets")]
    [string]$RawAlarmsStartingOffsets = "latest"
)

$ErrorActionPreference = "Stop"
# Docker/Flink write JDK warnings to stderr; do not treat as terminating errors.
$PSNativeCommandUseErrorActionPreference = $false
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "lib\AmsFlinkJob.ps1")

Write-Host "`n=== AMS E2E Stabilization ===" -ForegroundColor Cyan

if ($ResetKafkaTopics) {
    & (Join-Path $PSScriptRoot "kafka-reset-lab-topics.ps1") -Force
}

$jar = Join-Path $root "src\flink\target\ams-flink-1.0-SNAPSHOT.jar"
if (-not $SkipBuild) {
    Write-Host "[Build] Flink JAR..." -ForegroundColor Yellow
    docker run --rm -v "${root}/src/flink:/build" -w /build maven:3.9-eclipse-temurin-11 mvn -q package -DskipTests
}

Write-Host "[Flink] Ensure single RUNNING job (lab parallelism)..." -ForegroundColor Yellow
$jobId = Ensure-AmsFlinkAlarmJob -JarHostPath $jar -RawAlarmsStartingOffsets $RawAlarmsStartingOffsets -ForceResubmit:$ForceResubmit
Write-Host "[Flink] Alarm JobId: $jobId" -ForegroundColor Green

# RETIRED (audit-jobs.md Phase G, 2026-09-01): Loop KPI Engine and State Drift
# Detection Engine. Both consumed topics with NO producer (loop-raw-data /
# events.raw / state.active), so they ran healthy while processing nothing, and
# neither was in flink-job-supervisor.sh — this script was their only submitter.
# CPLM (short/long/fusion) is the real loop-KPI path. See the Retirement record
# in audit-jobs.md; the classes were removed from src/flink.

Write-Host "`n[Flink] Submitting Alarm KPI Engine..." -ForegroundColor Yellow
$alarmKpiJobId = Ensure-AlarmKpiFlinkJob -JarHostPath $jar -ForceResubmit:$ForceResubmit
Write-Host "[Flink] Alarm KPI JobId: $alarmKpiJobId" -ForegroundColor Green

Write-Host "`n[Flink] Submitting Alarm State Export Engine..." -ForegroundColor Yellow
$exportJobId = Ensure-AlarmStateExportFlinkJob -JarHostPath $jar -ForceResubmit:$ForceResubmit
Write-Host "[Flink] Alarm State Export JobId: $exportJobId" -ForegroundColor Green

Write-Host "`n[Validate] Waiting 15s for sources to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

if (-not $SkipValidation) {
    & (Join-Path $PSScriptRoot "validate-ams-production-ack.ps1")
}
