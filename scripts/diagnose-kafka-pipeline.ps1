#Requires -Version 5.1
<#
.SYNOPSIS
  Diagnose Kafka ingestion health and identify the active ingest path on the dev server.

.EXAMPLE
  .\scripts\diagnose-kafka-pipeline.ps1
  .\scripts\diagnose-kafka-pipeline.ps1 -Stabilize
#>
param(
    [switch]$Stabilize
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot

function Write-Section([string]$title) {
    Write-Host "`n=== $title ===" -ForegroundColor Cyan
}

function Test-KafkaTopicOffsets([string]$Topic) {
    $out = docker exec ams-kafka kafka-run-class kafka.tools.GetOffsetShell `
        --broker-list localhost:9092 --topic $Topic 2>&1
    if ($LASTEXITCODE -ne 0) {
        return @{ Topic = $Topic; Error = ($out -join " ") }
    }
    $total = 0
    foreach ($line in ($out -split "`n")) {
        if ($line -match ':(\d+)$') { $total += [int64]$Matches[1] }
    }
    return @{ Topic = $Topic; TotalOffset = $total; Raw = $out }
}

Write-Section "Prerequisites"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "  [FAIL] Docker is not on PATH. Start Docker Desktop before running AMS." -ForegroundColor Red
    exit 1
}

$kafkaStatus = docker inspect -f "{{.State.Health.Status}}" ams-kafka 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] ams-kafka container not found. Run: .\scripts\start-ams-lab.ps1" -ForegroundColor Red
    exit 1
}
Write-Host "  Kafka container health: $kafkaStatus" -ForegroundColor $(if ($kafkaStatus -eq 'healthy') { 'Green' } else { 'Yellow' })

Write-Section "Pipeline health API"
try {
    $h = Invoke-RestMethod "http://127.0.0.1:8000/api/v1/health/pipeline" -TimeoutSec 10
    Write-Host "  Broker:     $($h.kafka.brokerHealth)" -ForegroundColor Green
    Write-Host "  Lag:        $($h.kafka.lag)" -ForegroundColor Green
    Write-Host "  Throughput: $([math]::Round($h.kafka.throughput, 1))/s" -ForegroundColor Green
    Write-Host "  Telemetry:  $($h.telemetryIngest.state)" -ForegroundColor $(if ($h.telemetryIngest.state -eq 'Healthy') { 'Green' } else { 'Yellow' })
    Write-Host "  Flink CP:   $([math]::Round($h.flink.checkpointLatencyMs/1000, 1))s  restarts=$($h.flink.restartCount)" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] API not reachable at :8000 - start AMS.Api or check firewall." -ForegroundColor Yellow
    Write-Host "         $_" -ForegroundColor DarkGray
}

Write-Section "Active ingest path"
$raw = Test-KafkaTopicOffsets "raw-opc-events"
$curr = Test-KafkaTopicOffsets "current-alarm-state"
$created = Test-KafkaTopicOffsets "alarm-created"

foreach ($t in @($raw, $curr, $created)) {
    if ($t.Error) {
        Write-Host "  $($t.Topic): ERROR - $($t.Error)" -ForegroundColor Red
    } else {
        Write-Host "  $($t.Topic): total offset sum = $($t.TotalOffset)" -ForegroundColor $(if ($t.TotalOffset -gt 0) { 'Green' } else { 'Yellow' })
    }
}

$rawTotal = if ($raw.TotalOffset) { $raw.TotalOffset } else { 0 }
$currTotal = if ($curr.TotalOffset) { $curr.TotalOffset } else { 0 }
$createdTotal = if ($created.TotalOffset) { $created.TotalOffset } else { 0 }

if ($rawTotal -gt 0 -and $currTotal -gt 0) {
    Write-Host "`n  => Production path active: raw-opc-events -> Flink -> current-alarm-state" -ForegroundColor Green
    Write-Host "     NormalizedAlarmConsumerService should project to PostgreSQL." -ForegroundColor DarkGray
} elseif ($createdTotal -gt 0) {
    Write-Host "`n  => Lab path active: alarm-* topics (OpcHttpIngestor)" -ForegroundColor Yellow
    Write-Host "     UI may update via SimpleKafkaSignalRBridge; verify DB projection separately." -ForegroundColor DarkGray
} else {
    Write-Host "`n  => No ingest detected. Likely causes:" -ForegroundColor Red
    Write-Host "     - Kafka broker unhealthy (restart kafka)" -ForegroundColor DarkGray
    Write-Host "     - OPC simulator/gateway down (production path)" -ForegroundColor DarkGray
    Write-Host "     - OpcHttpIngest.FeedUrl unreachable (lab HTTP path)" -ForegroundColor DarkGray
    Write-Host "     - AlarmIngestion:FeedUrl unreachable (ams-api polls the OPC feed into raw-alarms)" -ForegroundColor DarkGray
}

Write-Section "Recommended actions"
if ($kafkaStatus -ne 'healthy') {
    Write-Host "  1. docker compose -f infra/docker/docker-compose.yml restart kafka" -ForegroundColor White
    Write-Host "  2. Wait 30-60s, re-run this script" -ForegroundColor White
}
if ($rawTotal -eq 0 -and $createdTotal -eq 0) {
    Write-Host "  3. Start mock ingest: docker compose -f infra/docker/docker-compose.sims.yml up -d ams-sim" -ForegroundColor White
    Write-Host "  4. Or set OpcHttpIngest:FeedUrl in appsettings.Development.json" -ForegroundColor White
    Write-Host "  5. Lab ACK without vendor OPC: LabAckSimulator.Enabled=true in appsettings.Development.json" -ForegroundColor White
}
if ($Stabilize -or ($kafkaStatus -ne 'healthy')) {
    Write-Section "Running stabilization"
    & (Join-Path $PSScriptRoot "kafka-reset-lab-topics.ps1") -Force
    & (Join-Path $PSScriptRoot "stabilize-ams-e2e.ps1") -ForceResubmit -SkipValidation
    Write-Host "  Stabilization complete. Re-run this script to verify." -ForegroundColor Green
} else {
    Write-Host "  Run with -Stabilize to reset topics and redeploy Flink." -ForegroundColor DarkGray
}

Write-Host ""
