# E2E: API (Flink orchestration) -> operator-actions -> Flink -> ack-writeback -> OPC Gateway -> ack-results -> SignalR lifecycle
param(
    [string]$ApiBase = "http://127.0.0.1:8000",
    [int]$TimeoutSec = 90
)

$ErrorActionPreference = "Stop"
function Invoke-Docker { param([string[]]$Args) & docker @Args 2>&1 | ForEach-Object { $_ } }
$ProgressPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "lib\AmsFlinkJob.ps1")

function Wait-HttpOk($url, $sec = 60) {
    $deadline = (Get-Date).AddSeconds($sec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -lt 500) { return $true }
        } catch {}
        Start-Sleep -Seconds 2
    }
    return $false
}

Write-Host "=== UI ACK E2E (Flink orchestration) ===" -ForegroundColor Cyan

# Ensure single Flink job (cancel stale RESTARTING copies; submit only if none RUNNING)
$flinkJar = "$root\src\flink\target\ams-flink-1.0-SNAPSHOT.jar"
if (-not (Test-Path -LiteralPath $flinkJar)) {
    Write-Host "[Flink] Building job JAR..." -ForegroundColor Yellow
    docker run --rm -v "${root}/src/flink:/build" -w /build maven:3.9-eclipse-temurin-11 mvn -q package -DskipTests
}
Ensure-AmsFlinkAlarmJob -JarHostPath $flinkJar | Out-Null

# Start OPC Gateway if not listening
if (-not (Wait-HttpOk "http://127.0.0.1:5050/health" 3)) {
    Write-Host "[Gateway] Starting OPC Gateway..." -ForegroundColor Yellow
    Start-Process -FilePath "dotnet" -ArgumentList "run","--project","$root\src\opc-gateway\AMS.OpcGateway\AMS.OpcGateway.csproj" `
        -WorkingDirectory "$root\src\opc-gateway\AMS.OpcGateway" -WindowStyle Hidden
    if (-not (Wait-HttpOk "http://127.0.0.1:5050/health" 45)) {
        Write-Host "    Gateway health not ready (continuing - may still work)" -ForegroundColor Yellow
    }
}

# Start API if not listening
if (-not (Wait-HttpOk "$ApiBase/health" 3)) {
    Write-Host "[API] Starting AMS.Api (UseFlinkOrchestration=true)..." -ForegroundColor Yellow
    $env:ASPNETCORE_ENVIRONMENT = "Production"
    Start-Process -FilePath "dotnet" -ArgumentList "run","--project","$root\src\backend\AMS.Api\AMS.Api.csproj","--no-build" `
        -WorkingDirectory "$root\src\backend\AMS.Api" -WindowStyle Hidden
    if (-not (Wait-HttpOk "$ApiBase/health" 90)) {
        # try build+run
        dotnet build "$root\src\backend\AMS.Api\AMS.Api.csproj" -v q
        Start-Process -FilePath "dotnet" -ArgumentList "run","--project","$root\src\backend\AMS.Api\AMS.Api.csproj" `
            -WorkingDirectory "$root\src\backend\AMS.Api" -WindowStyle Hidden
        if (-not (Wait-HttpOk "$ApiBase/health" 90)) { throw "API failed to start at $ApiBase" }
    }
}

Write-Host "[API] Ready at $ApiBase" -ForegroundColor Green

# Pick an active alarm
$headers = @{ Authorization = "Bearer dev" }
try {
    $active = Invoke-RestMethod -Uri "$ApiBase/api/v1/alarms/active?pageNumber=1&pageSize=5" -Headers $headers -TimeoutSec 30
} catch {
  throw "GET active alarms failed: $_"
}

$alarm = $active.items | Where-Object {
    -not $_.acknowledged -and $_.sourceName -notmatch '^Flink\.'
} | Select-Object -First 1
if (-not $alarm) {
    $alarm = $active.items | Where-Object { $_.sourceName -notmatch '^Flink\.' } | Select-Object -First 1
}
if (-not $alarm) {
    throw "No active alarms in database. Generate alarms in Integration Objects Simulator first."
}

$alarmId = $alarm.id
Write-Host "[Alarm] Acknowledging $alarmId ($($alarm.sourceName))" -ForegroundColor Yellow

# Background lifecycle consumer
$lifecycleJob = Start-Job -ScriptBlock {
    param($cid)
    docker exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 `
        --topic lifecycle-events --from-beginning --max-messages 100 --timeout-ms 85000 2>$null
} -ArgumentList $alarmId

# Dispatch ACK (same as UI button)
$ackBody = @{
    alarmIds = @($alarmId)
    comment = "E2E UI ACK test via API"
    operatorStation = "CONSOLE-01"
} | ConvertTo-Json

$ackRes = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/v1/alarms/acknowledge/batch" `
    -Headers $headers -ContentType "application/json" -Body $ackBody -TimeoutSec 30
Write-Host "[API] $($ackRes.message)" -ForegroundColor Green

$states = @{}
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    $lines = Receive-Job $lifecycleJob -ErrorAction SilentlyContinue
    foreach ($line in $lines) {
        if ($line -notmatch $alarmId) { continue }
        try {
            $j = $line | ConvertFrom-Json
            $st = $j.lifecycleState
            if (-not $st -and $j.LifecycleState) { $st = $j.LifecycleState }
            if ($st) { $states[$st] = $true; Write-Host "  lifecycle: $st" -ForegroundColor DarkGray }
        } catch {}
    }
    if ($states.ContainsKey("ACK_CONFIRMED")) { break }
}

Stop-Job $lifecycleJob -ErrorAction SilentlyContinue
Remove-Job $lifecycleJob -Force -ErrorAction SilentlyContinue

Write-Host "`n--- Results ---" -ForegroundColor Cyan
@("ACK_REQUESTED","ACK_QUEUED","ACK_PROCESSING","ACK_DISPATCHED","ACK_PENDING_DCS","ACK_CONFIRMED") | ForEach-Object {
    $ok = $states.ContainsKey($_)
    $color = if ($ok) { "Green" } else { "DarkGray" }
    Write-Host "  $_ : $(if ($ok) { 'YES' } else { '-' })" -ForegroundColor $color
}

if (-not $states.ContainsKey("ACK_DISPATCHED")) {
    Write-Host "`nFAIL: ACK_DISPATCHED not seen on lifecycle-events" -ForegroundColor Red
    exit 1
}
if (-not $states.ContainsKey("ACK_CONFIRMED")) {
    Write-Host "`nWARN: ACK_CONFIRMED not seen within ${TimeoutSec}s (check OPC simulator + gateway logs)" -ForegroundColor Yellow
    exit 2
}

Write-Host "`nPASS: Full ACK path confirmed (Flink -> OPC -> ACK_CONFIRMED)" -ForegroundColor Green
