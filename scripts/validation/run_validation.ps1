#!/usr/bin/env pwsh
<#
.SYNOPSIS
    AMS Operational Validation Master Script
.DESCRIPTION
    Orchestrates all validation phases:
      Phase 1: Infrastructure health checks
      Phase 2: Large-scale load test (863K+ tags)
      Phase 3: Fault injection & resilience
      Phase 4: Final report generation
.USAGE
    .\run_validation.ps1 [-Mode steady|flood|burst] [-Duration 120] [-Rate 5000]
#>

param(
    [ValidateSet("steady","flood","burst")]
    [string]$Mode = "steady",
    [int]$Duration = 120,
    [int]$Rate = 5000
)

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ReportFile = Join-Path $ScriptDir "validation_report_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"

function Write-Header($text) {
    $line = "=" * 80
    Write-Host "`n$line" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor White
    Write-Host "$line" -ForegroundColor Cyan
    Add-Content $ReportFile "`n$line`n  $text`n$line"
}

function Write-Check($name, $passed) {
    $icon = if ($passed) { "✅" } else { "❌" }
    $color = if ($passed) { "Green" } else { "Red" }
    Write-Host "  $icon $name" -ForegroundColor $color
    Add-Content $ReportFile "  $icon $name"
}

# ── PHASE 0: Initialization ──────────────────────────────────
Write-Header "AMS OPERATIONAL VALIDATION SUITE"
Write-Host "  Mode:     $Mode"
Write-Host "  Duration: ${Duration}s"
Write-Host "  Rate:     $Rate events/sec"
Write-Host "  Report:   $ReportFile"
Add-Content $ReportFile "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Add-Content $ReportFile "Mode: $Mode | Duration: ${Duration}s | Rate: $Rate/s"

# ── PHASE 1: Infrastructure Health ───────────────────────────
Write-Header "PHASE 1: Infrastructure Health Checks"

$containers = @("ams-kafka", "ams-zookeeper", "ams-postgres", "ams-redis",
                 "ams-flink-jobmanager", "docker-flink-taskmanager-1",
                 "docker-flink-taskmanager-2", "ams-prometheus", "ams-grafana")

$allHealthy = $true
foreach ($c in $containers) {
    $status = docker inspect --format='{{.State.Status}}' $c 2>$null
    $running = $status -eq "running"
    Write-Check "$c : $status" $running
    if (-not $running) { $allHealthy = $false }
}

# Check Kafka topics
Write-Host "`n  Kafka Topics:" -ForegroundColor Yellow
$topics = docker exec -i ams-kafka kafka-topics --bootstrap-server localhost:9092 --list 2>$null
$topicList = $topics -split "`n" | Where-Object { $_ -and $_ -notlike "__*" }
foreach ($t in $topicList) {
    Write-Check "Topic: $t" $true
}

# Check Flink jobs
Write-Host "`n  Flink Jobs:" -ForegroundColor Yellow
$flinkJobs = docker exec -i ams-flink-jobmanager flink list 2>$null
$runningJobs = ($flinkJobs | Select-String "RUNNING").Count
Write-Check "Running Flink jobs: $runningJobs" ($runningJobs -ge 1)

if (-not $allHealthy) {
    Write-Host "`n  ⚠️  Not all containers are healthy. Fix infrastructure before proceeding." -ForegroundColor Red
}

# ── PHASE 2: Large-Scale Load Test ───────────────────────────
Write-Header "PHASE 2: Large-Scale Load Test (863K+ Tags)"
Write-Host "  Launching load_test_863k.py..." -ForegroundColor Yellow

$loadTestScript = Join-Path $ScriptDir "load_test_863k.py"
python $loadTestScript --mode $Mode --duration $Duration --rate $Rate 2>&1 | Tee-Object -Append -FilePath $ReportFile

# ── PHASE 3: Fault Injection (Optional) ──────────────────────
Write-Header "PHASE 3: Fault Injection & Resilience Tests"
Write-Host "  Running fault_injection.py (checkpoint + lag tests only)..." -ForegroundColor Yellow

$faultScript = Join-Path $ScriptDir "fault_injection.py"
python $faultScript --test checkpoint 2>&1 | Tee-Object -Append -FilePath $ReportFile
python $faultScript --test consumer_lag 2>&1 | Tee-Object -Append -FilePath $ReportFile

# ── PHASE 4: Final Summary ───────────────────────────────────
Write-Header "VALIDATION COMPLETE"
Write-Host "  Full report saved to: $ReportFile" -ForegroundColor Green
Write-Host "  Review the report for P50/P95/P99 latencies, SOE violations," -ForegroundColor White
Write-Host "  duplicate counts, and fault injection results." -ForegroundColor White
Write-Host ""
