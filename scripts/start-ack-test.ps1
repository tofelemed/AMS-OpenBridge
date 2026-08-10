<#
.SYNOPSIS
  Start the minimal ACK-test Docker stack, build Flink, submit job, run E2E test.

.DESCRIPTION
  One-shot script:
    1. Starts only the essential containers (postgres, redis, zookeeper, kafka, flink, api, frontend)
    2. Waits for health
    3. Builds the Flink JAR (if -BuildFlink)
    4. Submits the Flink job
    5. Runs the E2E ACK test

.EXAMPLE
  .\scripts\start-ack-test.ps1
  .\scripts\start-ack-test.ps1 -BuildFlink
  .\scripts\start-ack-test.ps1 -SkipDocker   # only run the test (stack already up)
#>

param(
    [switch]$BuildFlink,
    [switch]$SkipDocker,
    [switch]$ForceResubmit
)

$ErrorActionPreference = 'Stop'
$DockerDir = Join-Path $PSScriptRoot "..\infra\docker"
$FlinkDir  = Join-Path $PSScriptRoot "..\src\flink"
$FlinkJar  = Join-Path $FlinkDir "target\ams-flink-1.0-SNAPSHOT.jar"

Write-Host ""
Write-Host "============================================" -ForegroundColor White
Write-Host "  AMS ACK Test — Minimal Stack Launcher" -ForegroundColor White
Write-Host "============================================" -ForegroundColor White

# ============================================================
# Step 1: Start Docker stack
# ============================================================
if (-not $SkipDocker) {
    Write-Host "`n[1/5] Starting minimal Docker stack..." -ForegroundColor Cyan

    Push-Location $DockerDir
    try {
        docker compose -f docker-compose.yml -f docker-compose.ack-test.yml up -d --build 2>&1 | ForEach-Object {
            if ($_ -match 'error|Error|ERROR') { Write-Host $_ -ForegroundColor Red }
            elseif ($_ -match 'Started|Created|Running|Healthy') { Write-Host $_ -ForegroundColor Green }
            else { Write-Host $_ -ForegroundColor Gray }
        }
    } finally {
        Pop-Location
    }

    Write-Host "[1/5] Docker compose started" -ForegroundColor Green
} else {
    Write-Host "`n[1/5] Skipping Docker start (--SkipDocker)" -ForegroundColor Yellow
}

# ============================================================
# Step 2: Wait for essential containers
# ============================================================
Write-Host "`n[2/5] Waiting for essential services..." -ForegroundColor Cyan

$essentialContainers = @("ams-postgres", "ams-redis", "kafka", "ams-flink-jobmanager")
$maxWait = 120
$elapsed = 0

foreach ($container in $essentialContainers) {
    Write-Host "  Waiting for $container..." -NoNewline
    while ($elapsed -lt $maxWait) {
        $status = docker inspect --format '{{.State.Health.Status}}' $container 2>&1
        if ($status -eq "healthy") {
            Write-Host " HEALTHY" -ForegroundColor Green
            break
        }
        $running = docker inspect --format '{{.State.Running}}' $container 2>&1
        if ($running -eq "true" -and $container -notmatch "postgres|redis") {
            # Containers without healthcheck — just check running
            $statusStr = docker inspect --format '{{.State.Status}}' $container 2>&1
            if ($statusStr -eq "running") {
                Write-Host " RUNNING" -ForegroundColor Green
                break
            }
        }
        Start-Sleep -Seconds 3
        $elapsed += 3
        Write-Host "." -NoNewline
    }
    if ($elapsed -ge $maxWait) {
        Write-Host " TIMEOUT" -ForegroundColor Red
        Write-Host "  Container $container did not become healthy in ${maxWait}s" -ForegroundColor Red
    }
}

# Wait for Kafka topics to be created
Write-Host "  Waiting for Kafka topics..." -NoNewline
Start-Sleep -Seconds 10
Write-Host " OK" -ForegroundColor Green

# Wait for API
Write-Host "  Waiting for ams-api..." -NoNewline
$apiReady = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $null = Invoke-RestMethod -Uri "http://localhost:8081/health" -UseBasicParsing -TimeoutSec 3
        $apiReady = $true
        break
    } catch {
        Start-Sleep -Seconds 5
        Write-Host "." -NoNewline
    }
}
if ($apiReady) { Write-Host " HEALTHY" -ForegroundColor Green }
else { Write-Host " NOT READY (continuing anyway)" -ForegroundColor Yellow }

# ============================================================
# Step 3: Build Flink JAR (optional)
# ============================================================
if ($BuildFlink) {
    Write-Host "`n[3/5] Building Flink JAR..." -ForegroundColor Cyan
    Push-Location $FlinkDir
    try {
        mvn package -DskipTests -q 2>&1 | ForEach-Object {
            if ($_ -match 'ERROR') { Write-Host $_ -ForegroundColor Red }
            elseif ($_ -match 'BUILD SUCCESS') { Write-Host $_ -ForegroundColor Green }
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n[3/5] Skipping Flink build (use -BuildFlink to enable)" -ForegroundColor Yellow
}

if (-not (Test-Path $FlinkJar)) {
    Write-Host "  WARNING: Flink JAR not found at $FlinkJar" -ForegroundColor Yellow
    Write-Host "  Run: cd src\flink && mvn package -DskipTests" -ForegroundColor Yellow
}

# ============================================================
# Step 4: Submit Flink job
# ============================================================
Write-Host "`n[4/5] Submitting Flink job..." -ForegroundColor Cyan

. (Join-Path $PSScriptRoot "lib\AmsFlinkJob.ps1")

try {
    $jobId = Ensure-AmsFlinkAlarmJob `
        -JarHostPath $FlinkJar `
        -ForceResubmit:$ForceResubmit `
        -RawAlarmsStartingOffsets "latest"

    Write-Host "  Flink Job ID: $jobId" -ForegroundColor Green
} catch {
    Write-Host "  Flink job submit failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Continuing — the job may already be running from a previous session." -ForegroundColor Yellow
}

# ============================================================
# Step 5: Run E2E ACK test
# ============================================================
Write-Host "`n[5/5] Running E2E ACK test..." -ForegroundColor Cyan

& (Join-Path $PSScriptRoot "test-ack-e2e.ps1")
