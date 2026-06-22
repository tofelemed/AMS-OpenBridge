#Requires -Version 5.1
<#
.SYNOPSIS
  Start the full AMS architecture in Docker (infra + Flink job + API + frontend).

.DESCRIPTION
  1. Postgres, Zookeeper, Kafka, Flink JM/TM via docker compose
  2. Kafka topics (optional -FirstRun)
  3. Flink JAR build + job submit
  4. API + frontend via docker run (avoids compose network tear-down)

  OPC Gateway runs on the Windows HOST at :5050 (not in this script).
  HTTP feed: http://192.168.1.51:8010/api/current-alarms (optional dual-source)

.EXAMPLE
  .\scripts\run-ams-docker-stack.ps1

.EXAMPLE
  .\scripts\run-ams-docker-stack.ps1 -FirstRun -SkipBuild
#>
param(
    [switch]$FirstRun,
    [switch]$SkipBuild,
    [switch]$SkipFlink,
    [string]$PostgresPassword = "supersecurepassword123",
    [string]$HttpFeedUrl = "http://192.168.1.51:8010/api/current-alarms",
    [switch]$DisableHttpFeed
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$root = Split-Path -Parent $PSScriptRoot
$composeDir = Join-Path $root "infra\docker"
$network = "docker_ams-backend"

function Write-Step([string]$msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }

function Wait-Healthy([string[]]$Names, [int]$TimeoutSec = 180) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    foreach ($name in $Names) {
        while ((Get-Date) -lt $deadline) {
            $h = docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" $name 2>$null
            if ($h -eq "healthy") { break }
            if (-not $h -or $h -eq "none") {
                $r = docker inspect -f "{{.State.Running}}" $name 2>$null
                if ($r -eq "true") { break }
            }
            Start-Sleep -Seconds 3
        }
    }
}

Push-Location $composeDir
try {
    if (-not (Test-Path ".env")) {
        Write-Host "Copy .env.example to .env and set POSTGRES_PASSWORD" -ForegroundColor Yellow
    }

    Write-Step "Starting infrastructure (postgres, zookeeper, kafka, flink)"
    docker compose up -d postgres zookeeper kafka flink-jobmanager flink-taskmanager
    Wait-Healthy @("ams-postgres", "ams-kafka", "ams-zookeeper", "ams-flink-jobmanager") -TimeoutSec 240

    if ($FirstRun) {
        Write-Step "Creating Kafka topics (first run)"
        & (Join-Path $root "scripts\kafka-reset-lab-topics.ps1") -Force
    }

    if (-not $SkipFlink) {
        Write-Step "Building Flink JAR and submitting job"
        if ($SkipBuild) {
            & (Join-Path $root "scripts\stabilize-ams-e2e.ps1") -SkipValidation -SkipBuild
        } else {
            & (Join-Path $root "scripts\stabilize-ams-e2e.ps1") -SkipValidation
        }
    }

    if (-not $SkipBuild) {
        Write-Step "Building API and frontend images"
        docker compose build ams-api ams-frontend
    }

    Write-Step "Deploying API and frontend (docker run - stable network)"
    docker stop ams-api ams-frontend 2>$null | Out-Null
    docker rm ams-api ams-frontend 2>$null | Out-Null

    if ($DisableHttpFeed) { $httpEnabled = "false" } else { $httpEnabled = "true" }
    $dbConn = "Host=postgres;Port=5432;Database=ams;Username=ams_user;Password=$PostgresPassword"

    docker run -d --name ams-api --network $network --restart unless-stopped `
        -p 8000:8000 `
        -e ASPNETCORE_ENVIRONMENT=Development `
        -e ASPNETCORE_URLS=http://0.0.0.0:8000 `
        -e "ConnectionStrings__AmsDb=$dbConn" `
        -e Kafka__BootstrapServers=kafka:9092 `
        -e Kafka__IngestAuthority=gateway `
        -e Flink__JobManagerUrl=http://flink-jobmanager:8081 `
        -e LabAckSimulator__Enabled=false `
        -e OpcGateway__BaseUrl=http://host.docker.internal:5050 `
        -e OpcGateway__EnableRawEventIngest=false `
        -e OpcGateway__DefaultServerId=7ce5ecbf-70c9-498d-b899-5c8bb7add383 `
        -e "OpcHttpIngest__Enabled=$httpEnabled" `
        -e "OpcHttpIngest__FeedUrl=$HttpFeedUrl" `
        -e OpcHttpIngest__PollIntervalMs=500 `
        -e OpcHttpIngest__ServerId=f0af9a6d-85f6-4c9f-a8ad-6de277d1d110 `
        -e "OpcHttpIngest__ServerName=Current Alarms Feed" `
        docker-ams-api:latest | Out-Null

    docker run -d --name ams-frontend --network $network --restart unless-stopped `
        -p 3000:80 `
        docker-ams-frontend:latest | Out-Null

    Wait-Healthy @("ams-api", "ams-frontend") -TimeoutSec 120

    Write-Host "`n=== AMS Docker stack is up ===" -ForegroundColor Green
    Write-Host "  UI:        http://127.0.0.1:3000/alarms"
    Write-Host "  API:       http://127.0.0.1:8000/health"
    Write-Host "  Flink UI:  http://127.0.0.1:8082"
    Write-Host "  Postgres:  localhost:5433 (user ams_user)"
    Write-Host "`n  Next: start OPC Gateway on host:"
    Write-Host "    cd `"$root\scripts`""
    Write-Host "    .\start-opc-gateway-lab.ps1"
    Write-Host "  Validate:  .\scripts\production-validation-report.ps1"
}
finally {
    Pop-Location
}
