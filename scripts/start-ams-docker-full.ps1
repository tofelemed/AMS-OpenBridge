#Requires -Version 5.1
<#
.SYNOPSIS
  Build and run the full AMS stack in Docker for local user experience.

.EXAMPLE
  .\scripts\start-ams-docker-full.ps1
  .\scripts\start-ams-docker-full.ps1 -InjectLabEvents
#>
param(
    [switch]$InjectLabEvents,
    [switch]$ResetKafkaTopics,
    [switch]$ResetKafkaVolumes,
    [switch]$SkipBuild,
    [switch]$RemoveOrphans,
    [switch]$GoldenVerify,
    [switch]$SkipGoldenVerify,
    [switch]$RunFullE2EOnVerify,
    # Optional compose overlays (e.g. docker-compose.sims.yml for the process-value
    # simulator). Only overlays whose file actually exists are applied.
    [ValidateSet("docker-compose.lab.yml", "docker-compose.sims.yml")]
    [string[]]$ApplyOverlay = @()
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$root = Split-Path -Parent $PSScriptRoot
$composeDir = Join-Path $root "infra\docker"
$envFile = Join-Path $composeDir ".env"

function Write-Step([string]$msg) {
    Write-Host "`n>> $msg" -ForegroundColor Cyan
}

function Get-ComposeFileArgs {
    # Base compose file plus any requested overlays that actually exist on disk.
    # docker-compose.lab.yml does not exist in this repo today; a hardcoded -f for it
    # made every compose call fail, so the -f list is built from real files only.
    $fileArgs = @("-f", "docker-compose.yml")
    foreach ($overlay in $ApplyOverlay) {
        if (Test-Path (Join-Path $composeDir $overlay)) {
            $fileArgs += @("-f", $overlay)
        }
        else {
            Write-Host "  [WARN] Overlay $overlay not found in $composeDir - skipping" -ForegroundColor Yellow
        }
    }
    return $fileArgs
}

function Invoke-Compose {
    param([string[]]$ExtraArgs)
    $files = Get-ComposeFileArgs
    $args = @("compose") + $files + @("--env-file", ".env") + $ExtraArgs
    Push-Location $composeDir
    try {
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & docker @args
        $code = $LASTEXITCODE
        $ErrorActionPreference = $prevEap
        if ($code -ne 0) { throw "docker compose exited with code $code" }
    }
    finally { Pop-Location }
}

function Get-ContainerHealthStatus {
    param([string]$Name)
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    # Safe template: containers without healthcheck return "none" instead of template error
    $status = docker inspect -f "{{if .State.Health}}{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}{{else}}none{{end}}" $Name 2>$null
    $ErrorActionPreference = $prevEap
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($status)) { return $null }
    return $status.Trim()
}

function Test-ContainerRunning {
    param([string]$Name)
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    $running = docker inspect -f "{{.State.Running}}" $Name 2>$null
    $ErrorActionPreference = $prevEap
    return ($LASTEXITCODE -eq 0 -and $running -eq "true")
}

function Wait-Healthy {
    param([string[]]$Names, [int]$TimeoutSec = 300)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    foreach ($name in $Names) {
        Write-Host "  Waiting for $name..." -ForegroundColor DarkGray
        $ready = $false
        while ((Get-Date) -lt $deadline) {
            $health = Get-ContainerHealthStatus -Name $name
            if ($health -eq "healthy") {
                $ready = $true
                break
            }
            if ($health -eq "none" -and (Test-ContainerRunning -Name $name)) {
                Write-Host "    $name running (no healthcheck)" -ForegroundColor DarkGray
                $ready = $true
                break
            }
            if (-not $health -and (Test-ContainerRunning -Name $name)) {
                # Container exists but health not reported yet
                Start-Sleep -Seconds 4
                continue
            }
            Start-Sleep -Seconds 4
        }
        if (-not $ready) {
            Write-Host "  [WARN] Timed out waiting for $name (continuing)" -ForegroundColor Yellow
        }
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " AMS Full Docker Stack" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Step "Prerequisites"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is not on PATH. Start Docker Desktop first."
}

if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $composeDir ".env.example") $envFile
    Write-Host "  Created .env from .env.example" -ForegroundColor Yellow
}



Write-Step "Stopping conflicting host processes (ports 8000, 3000)"
Get-Process -Name "AMS.Api" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
foreach ($port in @(8000, 3000)) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Write-Step "Building and starting all Docker services"
Write-Host "  Compose: docker compose $((Get-ComposeFileArgs) -join ' ') --env-file .env up -d$(if (-not $SkipBuild) { ' --build' })" -ForegroundColor DarkGray
if ($ResetKafkaVolumes) {
    Write-Host "  Resetting Kafka/Zookeeper volumes (fixes cluster ID mismatch)..." -ForegroundColor Yellow
    Invoke-Compose -ExtraArgs @("down", "-v")
    foreach ($vol in @("docker_kafka-data", "docker_zookeeper-data", "docker_kafka_0_data", "docker_zookeeper_data")) {
        docker volume rm $vol 2>&1 | Out-Null
    }
}
$upArgs = @("up", "-d")
if (-not $SkipBuild) { $upArgs += "--build" }
if ($RemoveOrphans) { $upArgs += "--remove-orphans" }
Invoke-Compose -ExtraArgs $upArgs

Write-Step "Waiting for core services"
Wait-Healthy @(
    "ams-postgres", "ams-redis", "ams-kafka", "ams-flink-jobmanager",
    "ams-flink-taskmanager", "ams-api", "ams-frontend"
) -TimeoutSec 420

if ($ResetKafkaTopics) {
    Write-Step "Resetting Kafka topics"
    & (Join-Path $PSScriptRoot "kafka-reset-lab-topics.ps1") -Force
}

Write-Step "Deploying Flink alarm job"
$stabArgs = @{ ForceResubmit = $true; SkipValidation = $true }
if ($SkipBuild) { $stabArgs.SkipBuild = $true }
& (Join-Path $PSScriptRoot "stabilize-ams-e2e.ps1") @stabArgs

Write-Step "Waiting for API health"
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
    try {
        Invoke-RestMethod "http://127.0.0.1:8000/health" -TimeoutSec 5 | Out-Null
        break
    }
    catch { Start-Sleep -Seconds 3 }
}

if ($InjectLabEvents) {
    Write-Step "Injecting lab alarm events"
    . (Join-Path $PSScriptRoot "lib\AmsContractChecks.ps1")
    try {
        $inj = Invoke-AmsLabEventInject -Count 5
        Write-Host "  Lab events injected: $($inj.detail)" -ForegroundColor Green
    }
    catch {
        Write-Host "  [WARN] Lab inject: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Step "Pipeline health"
try {
    $h = Invoke-RestMethod "http://127.0.0.1:3000/api/v1/health/pipeline" -Headers @{ Authorization = "Bearer dev" } -TimeoutSec 15
    Write-Host "  Kafka:       $($h.kafka.brokerHealth)" -ForegroundColor Green
    Write-Host "  Flink:       restarts=$($h.flink.restartCount)" -ForegroundColor Green
    if ($h.readiness) {
        Write-Host "  Readiness:   $($h.readiness.overallScore)/100  gate=$($h.readiness.gateStatus)" -ForegroundColor Cyan
    }
}
catch {
    Write-Host "  [WARN] Pipeline health: $($_.Exception.Message)" -ForegroundColor Yellow
}

$doGolden = $GoldenVerify -or (-not $SkipGoldenVerify)
if ($doGolden) {
    Write-Step "Golden startup verification (readiness >= 85)"
    $verifyArgs = @{
        ApiBase     = "http://127.0.0.1:3000"
        BearerToken = "dev"
        MinScore    = 85
    }
    if ($RunFullE2EOnVerify) { $verifyArgs.RunFullE2E = $true }
    & (Join-Path $PSScriptRoot "Invoke-AmsGoldenStartupVerify.ps1") @verifyArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [WARN] Golden verify did not pass - stack is up but not cutover-ready" -ForegroundColor Yellow
    }
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host " AMS Docker stack is ready" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Alarm Console:   http://localhost:3000" -ForegroundColor White
Write-Host "  API / Swagger:   http://localhost:8000/swagger" -ForegroundColor White
Write-Host "  Flink UI:        http://localhost:8082" -ForegroundColor White
Write-Host "  Grafana:         http://localhost:3001  (profile: observability)" -ForegroundColor DarkGray
Write-Host "`nStop: docker compose -f docker-compose.yml down  (run from infra\docker)" -ForegroundColor DarkGray

try {
    Start-Process "http://localhost:3000"
}
catch {
    # Browser launch optional
}

