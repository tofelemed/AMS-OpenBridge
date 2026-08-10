#Requires -Version 5.1
<#
.SYNOPSIS
  Brings up the full AMS stack (Docker + Gateway + API + frontend).

.DESCRIPTION
  Lab (default): Integration Objects simulator.
  Production:    .\scripts\start-ams-production.ps1  (Honeywell DCS — no simulator)

.EXAMPLE
  .\scripts\start-ams-lab.ps1

.EXAMPLE
  .\scripts\start-ams-production.ps1
#>
param(
    [switch]$Production,
    [string]$OpcHost,
    [string]$OpcProgId,
    [string]$OpcServerId,
    [string]$OpcServerName,
    [switch]$DockerFull,
    [switch]$ResetKafkaTopics,
    [switch]$SkipBuild,
    [switch]$SkipFrontend,
    [switch]$SkipValidation,
    [switch]$Validate,
    [switch]$NoSimulator,
    [switch]$RemoveOrphans,
    [switch]$GoldenVerify,
    [switch]$SkipGoldenVerify
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$root = Split-Path -Parent $PSScriptRoot
$composeDir = Join-Path $root "infra\docker"
$script:LabServerId = "7ce5ecbf-70c9-498d-b899-5c8bb7add383"

if ($Production) {
    $NoSimulator = $true
    if (-not $OpcHost -or -not $OpcProgId) {
        throw "Production mode requires OpcHost and OpcProgId (use start-ams-production.ps1)."
    }
    $script:OpcServerId = $OpcServerId
    if ([string]::IsNullOrWhiteSpace($script:OpcServerId)) {
        $script:OpcServerId = [guid]::NewGuid().ToString()
    }
    $script:OpcServerName = if ($OpcServerName) { $OpcServerName } else { "Honeywell DCS" }
    $script:OpcHost = $OpcHost.Trim()
    $script:OpcProgId = $OpcProgId.Trim().Replace("DPCAEServer", "OPCAEServer")
} else {
    $script:OpcServerId = if ($OpcServerId) { $OpcServerId } else { $LabServerId }
    $script:OpcServerName = if ($OpcServerName) { $OpcServerName } else { "Local IO Simulator" }
    $script:OpcHost = if ($OpcHost) { $OpcHost } else { "127.0.0.1" }
    $script:OpcProgId = if ($OpcProgId) { $OpcProgId } else { "IntegrationObjects.OPCAEServer.Simulator.1" }
}

$gatewayEnv = if ($Production) { "Production" } else { "Development" }

function Get-DotNetExe {
    if (Get-Command dotnet -ErrorAction SilentlyContinue) {
        return (Get-Command dotnet).Source
    }
    $dotnetExe = @(
        (Join-Path ${env:ProgramFiles} 'dotnet\dotnet.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'dotnet\dotnet.exe')
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($dotnetExe) {
        $env:PATH = "$(Split-Path $dotnetExe -Parent);$env:PATH"
        return $dotnetExe
    }
    throw @'
.NET SDK is not on PATH.
Install .NET 8 SDK on this server, then open a new PowerShell window:
  https://dotnet.microsoft.com/download/dotnet/8.0
Verify: dotnet --version
'@
}

function Ensure-DotNetOnPath {
    [void](Get-DotNetExe)
}

function Write-Step([string]$msg) {
    Write-Host "`n>> $msg" -ForegroundColor Cyan
}

function Invoke-DockerCompose {
    param([Parameter(Mandatory)][string[]]$Args)
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $lines = [System.Collections.Generic.List[string]]::new()
    try {
        foreach ($line in (& docker compose @Args 2>&1)) {
            if ($line -is [System.Management.Automation.ErrorRecord]) {
                [void]$lines.Add($line.ToString())
            } else {
                [void]$lines.Add([string]$line)
            }
        }
        if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
            $detail = ($lines -join [Environment]::NewLine).Trim()
            if ([string]::IsNullOrWhiteSpace($detail)) { $detail = "(no output)" }
            throw "docker compose exited with code $LASTEXITCODE.`n$detail"
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

function Wait-KafkaBrokerReady {
    param([int]$TimeoutSec = 120)
    Write-Host "  Waiting for Kafka broker (healthy + port 9092)..." -ForegroundColor DarkGray
    Wait-DockerHealthy @("ams-kafka") -TimeoutSec $TimeoutSec
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Get-NetTCPConnection -LocalPort 9092 -State Listen -ErrorAction SilentlyContinue) { return }
        Start-Sleep -Seconds 2
    }
    throw "Kafka broker port 9092 not listening within ${TimeoutSec}s"
}

function Get-DockerComposeUpArgs {
    $services = @(
        'postgres', 'redis', 'zookeeper', 'kafka', 'kafka-init-v2',
        'flink-jobmanager', 'flink-taskmanager'
    )
    $port8083 = Get-NetTCPConnection -LocalPort 8083 -State Listen -ErrorAction SilentlyContinue
    if (-not $port8083) { $services += 'schema-registry' }
    $args = @('up', '-d') + $services
    if ($RemoveOrphans) { $args += '--remove-orphans' }
    return $args
}

function Wait-DockerHealthy([string[]]$Names, [int]$TimeoutSec = 180) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    foreach ($name in $Names) {
        Write-Host "  Waiting for $name..." -ForegroundColor DarkGray
        while ((Get-Date) -lt $deadline) {
            $status = docker inspect -f "{{.State.Health.Status}}" $name 2>$null
            if ($status -eq "healthy") { break }
            if (-not $status -or $status -eq "none") {
                $running = docker inspect -f "{{.State.Running}}" $name 2>$null
                if ($running -eq "true") { break }
            }
            Start-Sleep -Seconds 3
        }
    }
}

function Wait-HttpOk {
    param(
        [string]$Url,
        [int]$TimeoutSec = 120,
        [string]$Label = $Url
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 | Out-Null
            return
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    if ($Label -match 'OPC Gateway') { Show-DotNetStartupDiagnostics -Label $Label }
    throw "$Label did not respond at $Url within ${TimeoutSec}s"
}

function Wait-TcpPort {
    param([int]$Port, [int]$TimeoutSec = 120, [string]$Label = "port $Port")
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { return }
        Start-Sleep -Seconds 2
    }
    throw "$Label not listening within ${TimeoutSec}s"
}

function Stop-HostProcesses {
    Get-Process -Name "AMS.Api" -ErrorAction SilentlyContinue | Stop-Process -Force
    foreach ($port in @(8000, 3000)) {
        Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    }
    Start-Sleep -Seconds 2
}

function Get-LatestGatewayLog {
    $logDir = Join-Path $root "src\opc-gateway\AMS.OpcGateway\logs"
    if (-not (Test-Path $logDir)) { return $null }
    Get-ChildItem $logDir -Filter "opc-gateway-*.txt" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

function Show-DotNetStartupDiagnostics {
    param([string]$Label = "Process")
    Write-Host "  $Label startup diagnostics:" -ForegroundColor Yellow
    if ($Label -match 'Gateway') {
        $log = Get-LatestGatewayLog
        if ($log) {
            Write-Host "  Log: $($log.FullName)" -ForegroundColor DarkGray
            Get-Content $log.FullName -Tail 20 -ErrorAction SilentlyContinue | ForEach-Object {
                Write-Host "    $_" -ForegroundColor DarkGray
            }
        } else {
            Write-Host "  No gateway log file yet (process may have failed before Serilog init)." -ForegroundColor DarkGray
        }
        $stub = Join-Path $env:SystemRoot 'SysWOW64\opcaeps.dll'
        if (-not (Test-Path $stub)) {
            Write-Host "  opcaeps.dll missing — run (elevated): $(Join-Path $PSScriptRoot 'install-opc-core-redist-elevated.cmd')" -ForegroundColor Yellow
        }
    }
    $procName = if ($Label -match 'Gateway') { 'AMS.OpcGateway' } elseif ($Label -match 'API') { 'AMS.Api' } else { $null }
    if ($procName) {
        $proc = Get-Process -Name $procName -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  $procName is running (PID $($proc.Id)) but HTTP health did not respond." -ForegroundColor Yellow
        } else {
            Write-Host "  $procName is not running." -ForegroundColor Yellow
        }
    }
}

function Start-DotNetApp {
    param(
        [Parameter(Mandatory)][string]$ProjectDir,
        [Parameter(Mandatory)][string]$Environment,
        [Parameter(Mandatory)][string]$Label
    )
    $dotnet = Get-DotNetExe
    $csproj = Get-ChildItem $ProjectDir -Filter "*.csproj" | Select-Object -First 1
    if (-not $csproj) { throw "No .csproj found in $ProjectDir" }
    & $dotnet build $csproj.FullName -v q
    if ($LASTEXITCODE -ne 0) { throw "$Label build failed (exit $LASTEXITCODE)." }
    $proc = Start-Process -FilePath $dotnet `
        -ArgumentList @("run", "--no-build", "--environment", $Environment) `
        -WorkingDirectory $ProjectDir `
        -WindowStyle Hidden `
        -PassThru
    Start-Sleep -Seconds 2
    if ($proc.HasExited) {
        Show-DotNetStartupDiagnostics -Label $Label
        throw "$Label exited immediately with code $($proc.ExitCode)."
    }
    return $proc
}

function Connect-OpcServer {
    param(
        [string]$ServerId,
        [string]$Name,
        [string]$OpcHostName,
        [string]$ProgId
    )
    $body = @{
        serverId = $ServerId
        name     = $Name
        host     = $OpcHostName
        progId   = $ProgId
    } | ConvertTo-Json
    $res = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5050/opc/servers/connect" `
        -ContentType "application/json" -Body $body -TimeoutSec 60
    if (-not $res.success) {
        throw "OPC connect failed: $($res.message)"
    }
    return $res
}

function Register-ProductionOpcServerInApi {
    param([string]$Id, [string]$Name, [string]$OpcHostName, [string]$ProgId)
    $headers = @{ Authorization = "Bearer dev" }
    $payload = @{
        id       = $Id
        name     = $Name
        host     = $OpcHostName
        progId   = $ProgId
        protocol = "OPC-AE"
        authType = "None"
        enabled  = $true
    }
    try {
        Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:8000/api/v1/admin/opc-servers/$Id" `
            -Headers $headers -ContentType "application/json" `
            -Body ($payload | ConvertTo-Json) -TimeoutSec 15 | Out-Null
    } catch {
        try {
            Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/v1/admin/opc-servers" `
                -Headers $headers -ContentType "application/json" `
                -Body ($payload | ConvertTo-Json) -TimeoutSec 15 | Out-Null
        } catch {
            Write-Host "  [WARN] Could not register OPC server in admin API: $_" -ForegroundColor Yellow
        }
    }
}

function Start-FrontendDev {
    $feDir = Join-Path $root "src\frontend"
    if (-not (Test-Path (Join-Path $feDir "node_modules"))) {
        Write-Host "  Running npm install (first time)..." -ForegroundColor Yellow
        Push-Location $feDir
        try { npm install 2>&1 | Out-Null } finally { Pop-Location }
    }
    if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "  Port 3000 already listening." -ForegroundColor DarkGray
        return
    }
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" `
        -WorkingDirectory $feDir -WindowStyle Minimized
    Wait-TcpPort -Port 3000 -TimeoutSec 90 -Label "Vite frontend"
    Wait-HttpOk -Url "http://127.0.0.1:3000" -TimeoutSec 30 -Label "Frontend"
    Write-Host "  Frontend ready: http://localhost:3000" -ForegroundColor Green
}

function Show-IngestPathSummary {
    $topics = @('raw-opc-events', 'current-alarm-state', 'alarm-created')
    foreach ($topic in $topics) {
        try {
            $out = docker exec ams-kafka kafka-run-class kafka.tools.GetOffsetShell `
                --broker-list localhost:9092 --topic $topic 2>&1
            $sum = 0
            foreach ($line in ($out -split "`n")) {
                if ($line -match ':(\d+)$') { $sum += [int64]$Matches[1] }
            }
            $color = if ($sum -gt 0) { 'Green' } else { 'DarkGray' }
            Write-Host "  Topic $topic : offset-sum=$sum" -ForegroundColor $color
        } catch {
            Write-Host "  Topic $topic : (unavailable)" -ForegroundColor DarkGray
        }
    }
    Write-Host "  Diagnose: .\scripts\diagnose-kafka-pipeline.ps1" -ForegroundColor DarkGray
}

function Show-HealthSummary {
    Write-Step "Pipeline health"
    $h = Invoke-RestMethod "http://127.0.0.1:8000/api/v1/health/pipeline" -TimeoutSec 15
    Write-Host "  Kafka:        $($h.kafka.brokerHealth)  lag=$($h.kafka.lag)" -ForegroundColor Green
    Write-Host "  Flink:        CP=$([math]::Round($h.flink.checkpointLatencyMs/1000,1))s  restarts=$($h.flink.restartCount)" -ForegroundColor Green
    Write-Host "  StreamPipes:  $($h.streampipes.status)" -ForegroundColor $(if ($h.streampipes.reachable) { 'Green' } else { 'Yellow' })
    $opc = "$($h.opcConnections.activeConnections)/$($h.opcConnections.totalEnabled) active"
    Write-Host "  OPC:          $($h.opcConnections.status) ($opc)" -ForegroundColor Green
    Write-Host "  Ingest rate:  $([math]::Round($h.kafka.throughput,1))/s" -ForegroundColor Green
    Write-Host "  Telemetry:    $($h.telemetryIngest.state)" -ForegroundColor $(if ($h.telemetryIngest.state -eq 'Healthy') { 'Green' } else { 'Yellow' })
    Show-IngestPathSummary
    if ($Production -and $h.opcConnections.activeConnections -eq 0) {
        throw 'No active OPC connections — provision StreamPipes adapters before client demo.'
    }
}

$title = if ($Production) { "AMS Production Startup (Honeywell DCS)" } else { "AMS Lab Startup" }
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " $title" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Step "Checking prerequisites"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker is not on PATH." }
Ensure-DotNetOnPath
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "Node/npm is not on PATH." }
if (-not $SkipFrontend -and -not (Test-Path (Join-Path $composeDir ".env"))) {
    Copy-Item (Join-Path $composeDir ".env.example") (Join-Path $composeDir ".env")
    Write-Host '  Created infra/docker/.env from .env.example' -ForegroundColor Yellow
}

if ($Production) {
    Write-Host "  Production uses StreamPipes for OPC connectivity (no local gateway)." -ForegroundColor DarkGray
}

Stop-HostProcesses

if ($DockerFull) {
    Write-Step "Starting full Docker stack"
    Push-Location $composeDir
    try {
        $fullArgs = @('up', '-d')
        if ($RemoveOrphans) { $fullArgs += '--remove-orphans' }
        Invoke-DockerCompose -Args $fullArgs
        Wait-DockerHealthy @("ams-postgres", "ams-redis", "ams-kafka", "ams-flink-jobmanager", "ams-flink-taskmanager", "ams-api") -TimeoutSec 300
    } finally { Pop-Location }
    $stabArgs = @{ ForceResubmit = $true; SkipValidation = $true }
    if ($SkipBuild) { $stabArgs.SkipBuild = $true }
    if ($ResetKafkaTopics) { $stabArgs.ResetKafkaTopics = $true }
    & (Join-Path $PSScriptRoot "stabilize-ams-e2e.ps1") @stabArgs
    exit 0
}

Write-Step "Starting Docker infrastructure"
Push-Location $composeDir
try { Invoke-DockerCompose -Args (Get-DockerComposeUpArgs) }
finally { Pop-Location }
Wait-DockerHealthy @("ams-postgres", "ams-redis", "ams-flink-jobmanager") -TimeoutSec 180
Wait-KafkaBrokerReady -TimeoutSec 180

if ($ResetKafkaTopics) {
    Write-Step "Resetting lab Kafka topics"
    & (Join-Path $PSScriptRoot "kafka-reset-lab-topics.ps1") -Force
}

Write-Step "Deploying Flink alarm job"
$jar = Join-Path $root "src\flink\target\ams-flink-1.0-SNAPSHOT.jar"
if (-not $SkipBuild -or -not (Test-Path $jar)) {
    $SkipBuild = $false
}
$stabArgs = @{ ForceResubmit = $true; SkipValidation = $true }
if ($SkipBuild) { $stabArgs.SkipBuild = $true }
& (Join-Path $PSScriptRoot "stabilize-ams-e2e.ps1") @stabArgs

Write-Step "Starting StreamPipes connectivity overlay"
Push-Location $composeDir
try {
    Invoke-DockerCompose -Args @('-f', 'docker-compose.yml', '-f', 'docker-compose.streampipes.yml', 'up', '-d')
} finally { Pop-Location }
Start-Sleep -Seconds 5

if (-not $SkipBuild) {
    Write-Step "Building AMS.Api"
    $dotnet = Get-DotNetExe
    & $dotnet build (Join-Path $root "src\backend\AMS.Api\AMS.Api.csproj") -v q | Out-Null
}

Write-Step "Starting AMS.Api (port 8000)"
$apiDir = Join-Path $root "src\backend\AMS.Api"
Start-DotNetApp -ProjectDir $apiDir -Environment "Development" -Label "AMS API" | Out-Null
Wait-HttpOk -Url "http://127.0.0.1:8000/health" -TimeoutSec 120 -Label "AMS API"

if ($Production) {
    Register-ProductionOpcServerInApi -Id $script:OpcServerId -Name $script:OpcServerName `
        -OpcHostName $script:OpcHost -ProgId $script:OpcProgId
}

Write-Step "Backfilling cookieOffset projection"
$bfArgs = @{}
if ($Production) { $bfArgs.ServerId = $script:OpcServerId }
& (Join-Path $PSScriptRoot "backfill-cookies-from-kafka.ps1") @bfArgs 2>&1 | Out-Null

if (-not $SkipFrontend) {
    Write-Step "Starting frontend (npm run dev)"
    Start-FrontendDev
}

Show-HealthSummary

$doGolden = $GoldenVerify
if ($doGolden) {
    Write-Step "Golden startup verification (readiness >= 85)"
    & (Join-Path $PSScriptRoot "Invoke-AmsGoldenStartupVerify.ps1") -ApiBase "http://127.0.0.1:8000" -BearerToken "dev" -MinScore 85
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [WARN] Golden verify did not pass — stack is up but not cutover-ready" -ForegroundColor Yellow
    }
}

$runValidation = $Validate -or ($Production -and -not $SkipValidation)
if ($runValidation) {
    Write-Step "Production ACK validation"
    $valArgs = @{
        ConnectedServerId = $script:OpcServerId
    }
    if ($Production) { $valArgs.Production = $true }
    & (Join-Path $PSScriptRoot "validate-ams-production-ack.ps1") @valArgs
    if ($LASTEXITCODE -ne 0 -and $Production) {
        throw 'Validation failed - resolve ACK/DCS issues before client presentation.'
    }
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host " AMS stack is up" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Alarm Console:  http://localhost:3000" -ForegroundColor White
Write-Host "  API / Swagger:  http://127.0.0.1:8000/swagger" -ForegroundColor White
Write-Host "  StreamPipes UI: http://localhost:8088" -ForegroundColor White
Write-Host "  Pipeline health: http://127.0.0.1:8000/api/v1/health/pipeline" -ForegroundColor White
Write-Host "  Flink UI:       http://localhost:8082" -ForegroundColor White
Write-Host "  OPC admin:      http://localhost:3000/admin/opc-servers" -ForegroundColor White
if ($Production) {
    Write-Host "  OPC source:     $script:OpcServerName ($script:OpcHost / $script:OpcProgId)" -ForegroundColor White
    Write-Host "  Server ID:      $script:OpcServerId" -ForegroundColor DarkGray
}
Write-Host "`nStop: .\scripts\stop-ams-lab.ps1" -ForegroundColor DarkGray
