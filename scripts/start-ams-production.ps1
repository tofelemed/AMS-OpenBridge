# Production startup: Docker stack → Kafka topics → Flink JAR → Flink job.

param([switch]$SkipDocker, [switch]$ForceResubmit, [switch]$ResetKafkaVolumes)



$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent

. (Join-Path $PSScriptRoot "lib\AmsDocker.ps1")

. (Join-Path $PSScriptRoot "lib\AmsFlinkJob.ps1")



if (-not $SkipDocker) {

    Write-Host "[1/4] Starting Docker stack..." -ForegroundColor Cyan

    Start-AmsDockerStack -Rebuild -ResetKafkaVolumes:$ResetKafkaVolumes

}



Write-Host "[2/4] Resetting production Kafka topics..." -ForegroundColor Cyan

& (Join-Path $PSScriptRoot "kafka-reset-lab-topics.ps1") -Force



Write-Host "[3/4] Building Flink JAR..." -ForegroundColor Cyan

& (Join-Path $PSScriptRoot "build-flink-jar.ps1")



Write-Host "[4/4] Submitting Flink job (raw-alarms, earliest offsets)..." -ForegroundColor Cyan

$jar = Join-Path $root "src\flink\target\ams-flink-1.0-SNAPSHOT.jar"

$params = @{ JarHostPath = $jar; RawAlarmsStartingOffsets = "earliest" }

if ($ForceResubmit) { $params.ForceResubmit = $true }

$jobId = Ensure-AmsFlinkAlarmJob @params

Write-Host "Flink job RUNNING: $jobId" -ForegroundColor Green

Write-Host "Run scripts\api-pipeline-validation.ps1 after 60s to verify throughput." -ForegroundColor Cyan

