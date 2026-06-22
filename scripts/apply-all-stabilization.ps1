# Builds and deploys all stabilization changes across Flink, Kafka, API, Gateway, and validates pipeline health.
param(
    [switch]$ResetKafkaTopics,
    [switch]$SkipBuild,
    [switch]$SkipValidation
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$root = Split-Path -Parent $PSScriptRoot

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " AMS Full Stack Stabilization Deploy" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. Stop running processes that lock DLLs
Write-Host "[1/7] Stopping API and Gateway..." -ForegroundColor Yellow
Get-Process -Name "AMS.Api" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "AMS.OpcGateway" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# 2. Ensure Docker stack is up
Write-Host "[2/7] Ensuring Docker services (Kafka, Flink)..." -ForegroundColor Yellow
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
docker compose -f (Join-Path $root "infra\docker\docker-compose.yml") up -d kafka flink-jobmanager flink-taskmanager 2>&1 | Out-Null
$ErrorActionPreference = $prevEap
$deadline = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $deadline) {
    $k = docker inspect -f "{{.State.Health.Status}}" ams-kafka 2>$null
    if ($k -eq "healthy") { break }
    Start-Sleep -Seconds 3
}

# 3. Build backend + gateway
if (-not $SkipBuild) {
    Write-Host "[3/7] Building AMS.Api..." -ForegroundColor Yellow
    dotnet build (Join-Path $root "src\backend\AMS.Api\AMS.Api.csproj") -v q | Out-Null
    Write-Host "[3/7] Building AMS.OpcGateway..." -ForegroundColor Yellow
    dotnet build (Join-Path $root "src\opc-gateway\AMS.OpcGateway\AMS.OpcGateway.csproj") -v q | Out-Null
} else {
    Write-Host "[3/7] Skipping .NET build (-SkipBuild)" -ForegroundColor DarkGray
}

# 4. Flink (build + force resubmit; validation runs after gateway/API are up)
Write-Host "[4/7] Deploying Flink job (force resubmit)..." -ForegroundColor Yellow
$stabArgs = @{
    ForceResubmit  = $true
    SkipBuild      = $SkipBuild
    SkipValidation = $true
}
if ($ResetKafkaTopics) { $stabArgs.ResetKafkaTopics = $true }
& (Join-Path $PSScriptRoot "stabilize-ams-e2e.ps1") @stabArgs

# 5. Start Gateway (before API health / OPC sync)
Write-Host "[5/7] Starting OPC Gateway..." -ForegroundColor Yellow
$gwDir = Join-Path $root "src\opc-gateway\AMS.OpcGateway"
Start-Process -FilePath "dotnet" -ArgumentList "run" -WorkingDirectory $gwDir -WindowStyle Hidden
Start-Sleep -Seconds 8

# Connect simulator if gateway health is degraded
try {
    $gwHealth = Invoke-RestMethod "http://127.0.0.1:5050/health/opc" -TimeoutSec 10
    if (-not ($gwHealth.servers | Where-Object { $_.isConnected })) {
        Write-Host "[5/7] Connecting OPC simulator..." -ForegroundColor Yellow
        $body = @{
            serverId = "7ce5ecbf-70c9-498d-b899-5c8bb7add383"
            name     = "Local IO Simulator"
            host     = "127.0.0.1"
            progId   = "IntegrationObjects.OPCAEServer.Simulator.1"
        } | ConvertTo-Json
        Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5050/opc/servers/connect" -ContentType "application/json" -Body $body -TimeoutSec 30 | Out-Null
    }
} catch {
    Write-Host "[WARN] Gateway OPC connect skipped: $_" -ForegroundColor Yellow
}

# 6. Start API
Write-Host "[6/7] Starting AMS.Api..." -ForegroundColor Yellow
Start-Process -FilePath "dotnet" -ArgumentList "run","--environment","Development" `
    -WorkingDirectory (Join-Path $root "src\backend\AMS.Api") -WindowStyle Hidden
Start-Sleep -Seconds 35

# Backfill cookies if projection lagged
Write-Host "[6/7] Ensuring cookieOffset projection..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "backfill-cookies-from-kafka.ps1") 2>&1 | Out-Null

# 7. Health summary for UI ribbon
Write-Host "[7/7] Pipeline health (UI ribbon source)..." -ForegroundColor Yellow
try {
    $h = Invoke-RestMethod "http://127.0.0.1:8000/api/v1/health/pipeline" -TimeoutSec 15
    Write-Host "  Kafka:    $($h.kafka.brokerHealth)  Lag=$($h.kafka.lag)" -ForegroundColor Green
    Write-Host "  Flink:    CP=$([math]::Round($h.flink.checkpointLatencyMs/1000,1))s  Restarts=$($h.flink.restartCount)" -ForegroundColor Green
    Write-Host "  Gateway:  $(if ($h.gateway.opcConnected) { 'Connected' } else { 'Disconnected' })  WAL=$($h.gateway.walQueueSize)" -ForegroundColor Green
    Write-Host "  OPC rate: $([math]::Round($h.kafka.throughput,0))/s" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Health endpoint not ready yet: $_" -ForegroundColor Yellow
}

if (-not $SkipValidation) {
    Write-Host "`n[Validate] Running production ACK script..." -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot "validate-ams-production-ack.ps1")
}

Write-Host "`n[DONE] Refresh browser UI - ribbon shows Kafka, Flink, Gateway, OPC rate." -ForegroundColor Cyan
Write-Host 'Frontend dev server: cd src\frontend; npm run dev' -ForegroundColor DarkGray
