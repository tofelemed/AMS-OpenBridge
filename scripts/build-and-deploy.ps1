# ═══════════════════════════════════════════════════════════════════════════
# Build and Deploy Traverse Services
# Builds Docker images and recreates containers for all services.
# ═══════════════════════════════════════════════════════════════════════════

param(
    [switch]$NoBuild,
    [switch]$ForceRecreate,
    [string]$Services = "all"
)

$ErrorActionPreference = "Continue"

Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " BUILD AND DEPLOY TRAVERSE SERVICES" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$dockerDir = Join-Path $projectRoot "infra/docker"

Set-Location $dockerDir

# Define service groups
$traverseServices = @(
    "asset-model",
    "binding-resolver",
    "display-service",
    "template-service",
    "analysis-service"
)

$allServices = @(
    "postgres",
    "redis",
    "kafka",
    "zookeeper",
    "emqx",
    "iotdb",
    "flink-jobmanager",
    "flink-taskmanager",
    "ams-api",
    "ams-frontend",
    "historian-bff",
    "sparkplug-edge-node"
) + $traverseServices

$targetServices = if ($Services -eq "all") { $allServices } 
                  elseif ($Services -eq "traverse") { $traverseServices }
                  else { $Services -split "," }

# Step 1: Build images
if (-not $NoBuild) {
    Write-Host "Step 1: Building Docker images..." -ForegroundColor Yellow
    Write-Host "─────────────────────────────────────────────────────────────────"
    
    foreach ($service in $targetServices) {
        Write-Host "  Building: $service" -ForegroundColor Gray
        docker-compose build $service 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    [OK] $service" -ForegroundColor Green
        } else {
            Write-Host "    [SKIP] $service (no Dockerfile or already built)" -ForegroundColor Yellow
        }
    }
}

# Step 2: Stop existing containers
Write-Host "`nStep 2: Stopping existing containers..." -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────"
docker-compose stop $targetServices 2>&1 | Out-Null
Write-Host "  Containers stopped." -ForegroundColor Green

# Step 3: Remove containers if force recreate
if ($ForceRecreate) {
    Write-Host "`nStep 3: Removing containers for recreation..." -ForegroundColor Yellow
    Write-Host "─────────────────────────────────────────────────────────────────"
    docker-compose rm -f $targetServices 2>&1 | Out-Null
    Write-Host "  Containers removed." -ForegroundColor Green
}

# Step 4: Start containers
Write-Host "`nStep 4: Starting containers..." -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────"
docker-compose up -d $targetServices

# Step 5: Wait for health checks
Write-Host "`nStep 5: Waiting for services to become healthy..." -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────"

$maxWait = 120
$waited = 0
$interval = 5

while ($waited -lt $maxWait) {
    $unhealthy = docker-compose ps --format json 2>$null | ConvertFrom-Json | 
                 Where-Object { $_.Health -eq "starting" -or $_.Health -eq "unhealthy" }
    
    if ($unhealthy.Count -eq 0) {
        Write-Host "  All services healthy!" -ForegroundColor Green
        break
    }
    
    Write-Host "  Waiting... ($waited/$maxWait sec) - $($unhealthy.Count) services starting" -ForegroundColor Gray
    Start-Sleep -Seconds $interval
    $waited += $interval
}

if ($waited -ge $maxWait) {
    Write-Host "  [WARN] Timeout waiting for health checks" -ForegroundColor Yellow
}

# Step 6: Show status
Write-Host "`nStep 6: Final Status" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────"
docker-compose ps

Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " DEPLOYMENT COMPLETE" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "`nNext steps:"
Write-Host "  1. Run schemas: .\scripts\run-all-schemas.ps1"
Write-Host "  2. Validate:    .\scripts\validate-deployment.ps1"
Write-Host ""

Set-Location $projectRoot
