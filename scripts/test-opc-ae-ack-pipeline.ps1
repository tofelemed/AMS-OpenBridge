#Requires -Version 5.1
<#
.SYNOPSIS
  Tests localhost OPC AE prerequisites, submits Flink if needed, and validates ACK pipeline.

.EXAMPLE
  .\scripts\test-opc-ae-ack-pipeline.ps1
  .\scripts\test-opc-ae-ack-pipeline.ps1 -StartGateway
#>
param(
    [string]$ApiBase = "http://127.0.0.1:8000",
    [string]$GatewayBase = "http://127.0.0.1:5050",
    [string]$OpcHostName = $env:COMPUTERNAME,
    [string]$OpcProgId = "IntegrationObjects.OPCAEServer.Simulator.1",
    [string]$LabServerId = "7ce5ecbf-70c9-498d-b899-5c8bb7add383",
    [switch]$StartGateway,
    [switch]$SkipFlink,
    [int]$WaitSeconds = 45
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$headers = @{ Authorization = "Bearer dev" }

function Write-Section([string]$t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Pass([string]$m) { Write-Host "  [PASS] $m" -ForegroundColor Green }
function Fail([string]$m) { Write-Host "  [FAIL] $m" -ForegroundColor Red }
function Info([string]$m) { Write-Host "  [INFO] $m" -ForegroundColor DarkGray }

$results = [ordered]@{}

Write-Section "1. OPC AE localhost prerequisites"
& (Join-Path $PSScriptRoot "ensure-opc-ae-lab.ps1") -StartSimulator | Out-Host
$sim = Get-Process -Name IntegrationObjectsOPCAEServerSimulator -ErrorAction SilentlyContinue
$opcDll = Test-Path "$env:SystemRoot\SysWOW64\opcaeps.dll"
$results["OPC AE simulator running"] = [bool]$sim
$results["opcaeps.dll present"] = $opcDll
if ($sim) { Pass "Integration Objects OPC AE Simulator (PID $($sim.Id))" } else { Fail "OPC AE Simulator not running" }
if ($opcDll) { Pass "OPC Foundation opcaeps.dll OK" } else { Fail "opcaeps.dll missing" }

Write-Section "2. OPC Gateway (optional)"
$gwProj = "e:\AMS\src\opc-gateway\AMS.OpcGateway\AMS.OpcGateway.csproj"
$gwRunning = Get-Process -Name AMS.OpcGateway -ErrorAction SilentlyContinue
if ($StartGateway -and (Test-Path $gwProj)) {
    if (-not $gwRunning) {
        Info "Starting AMS.OpcGateway..."
        Start-Process dotnet -ArgumentList "run","--project",$gwProj,"--environment","Development" `
            -WorkingDirectory (Split-Path $gwProj) -WindowStyle Hidden
        Start-Sleep -Seconds 8
        $gwRunning = Get-Process -Name AMS.OpcGateway -ErrorAction SilentlyContinue
    }
} elseif (-not (Test-Path $gwProj)) {
    Info "Gateway source expected at $gwProj"
}

$gwOk = $false
if ($gwRunning) {
    try {
        $opcHealth = Invoke-RestMethod "$GatewayBase/health/opc" -TimeoutSec 10
        $gwOk = $opcHealth.status -eq "Healthy"
        Pass "OPC Gateway responding at $GatewayBase (status=$($opcHealth.status))"
        $results["OPC Gateway healthy"] = $gwOk
        if ($gwOk) {
            $body = @{
                serverId = $LabServerId
                name     = "Local IO Simulator"
                host     = $OpcHostName
                progId   = $OpcProgId
            } | ConvertTo-Json
            $conn = Invoke-RestMethod -Method Post -Uri "$GatewayBase/opc/servers/connect" `
                -ContentType "application/json" -Body $body -TimeoutSec 60
            if ($conn.success) { Pass "OPC AE connect: $($conn.message)" } else { Fail "OPC connect failed: $($conn.message)" }
        }
    } catch {
        Fail "Gateway process running but HTTP not ready: $_"
        $results["OPC Gateway healthy"] = $false
    }
} else {
    Info "OPC Gateway not running - lab ACK uses LabAckSimulator instead"
    $results["OPC Gateway healthy"] = $false
}

Write-Section "3. Flink job"
if (-not $SkipFlink) {
    . (Join-Path $PSScriptRoot "lib\AmsFlinkJob.ps1")
    $jar = Join-Path $root "src\flink\target\ams-flink-1.0-SNAPSHOT.jar"
    if (-not (Test-Path $jar)) {
        Info "Building Flink JAR via Docker Maven..."
        docker run --rm -v "${root}/src/flink:/build" -w /build maven:3.9-eclipse-temurin-11 mvn -q package -DskipTests
    }
    $jobId = Ensure-AmsFlinkAlarmJob -JarHostPath $jar -ForceResubmit
    Pass "Flink job submitted: $jobId"
    $results["Flink RUNNING"] = $true
    Start-Sleep -Seconds 10
} else {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $jobs = docker exec ams-flink-jobmanager flink list 2>&1 | Out-String
    $ErrorActionPreference = $prevEap
    $results["Flink RUNNING"] = $jobs -match "RUNNING"
    if ($results["Flink RUNNING"]) { Pass "Flink job RUNNING" } else { Fail "Flink job not RUNNING" }
}

Write-Section "4. Pipeline health"
try {
    $ph = Invoke-RestMethod "$ApiBase/api/v1/health/pipeline" -TimeoutSec 15
    Info "Flink status: $($ph.flink.status)"
    $ackDetail = ($ph.readiness.subsystemDetails | Where-Object { $_.id -eq 'ack' }).detail
    Info "ACK path: $ackDetail"
    $results["Pipeline health reachable"] = $true
} catch {
    Fail "Pipeline health API failed: $_"
    $results["Pipeline health reachable"] = $false
}

Write-Section "5. Inject test alarm and ACK"
$testSource = "OPC-AE-ACK-TEST-$(Get-Date -Format 'HHmmss')"
$alarmId = [guid]::NewGuid().ToString()
$event = @{
    AlarmId      = $alarmId
    Source       = $testSource
    Severity     = 800
    Message      = "OPC AE ACK pipeline test"
    Condition    = "HIGH"
    SubCondition = "HI"
    EventTime    = [DateTimeOffset]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    State        = "ACTIVE"
    AckStatus    = $false
} | ConvertTo-Json -Compress

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$event | docker exec -i ams-kafka kafka-console-producer --broker-list kafka:9092 --topic alarm-created 2>&1 | Out-Null
$ErrorActionPreference = $prevEap
Pass "Published test alarm to alarm-created ($testSource)"
Start-Sleep -Seconds 10

$alarm = $null
for ($i = 0; $i -lt 15; $i++) {
    try {
        $active = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=200" -Headers $headers -TimeoutSec 10
        $alarm = $active.items | Where-Object { $_.sourceName -eq $testSource } | Select-Object -First 1
        if ($alarm) { break }
    } catch {
        Info "API query retry: $_"
    }
    Start-Sleep -Seconds 2
}
if (-not $alarm) {
    Fail "Test alarm not in API after ingest"
    $results["Alarm ingested"] = $false
} else {
    Pass "Alarm in API: $($alarm.id)"
    $results["Alarm ingested"] = $true

    $ack = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/v1/alarms/$($alarm.id)/acknowledge" `
        -Headers $headers -ContentType "application/json" `
        -Body (@{ comment = "OPC AE pipeline test"; operatorStation = "LAB-1" } | ConvertTo-Json) -TimeoutSec 15
    Pass "ACK dispatched: $($ack.message)"

    $confirmed = $false
    for ($e = 0; $e -lt $WaitSeconds; $e += 3) {
        Start-Sleep -Seconds 3
        $check = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=200" -Headers $headers -TimeoutSec 10
        $row = $check.items | Where-Object { $_.id -eq $alarm.id } | Select-Object -First 1
        if ($row) {
            Info "lifecycle=$($row.ackLifecycleState) acknowledged=$($row.acknowledged)"
            if ($row.ackLifecycleState -eq "ACK_CONFIRMED" -or $row.acknowledged -eq $true) {
                $confirmed = $true
                break
            }
        }
    }
    $results["ACK_CONFIRMED"] = $confirmed
    if ($confirmed) { Pass "ACK_CONFIRMED via pipeline" } else { Fail "ACK not confirmed within ${WaitSeconds}s" }
}

Write-Section "Summary"
$allPass = $true
foreach ($kv in $results.GetEnumerator()) {
    $c = if ($kv.Value) { "Green" } else { "Yellow" }
    Write-Host "  $($kv.Key): $($kv.Value)" -ForegroundColor $c
    if ($kv.Key -in @("Alarm ingested","ACK_CONFIRMED","OPC AE simulator running") -and -not $kv.Value) { $allPass = $false }
}

if ($allPass) {
    Write-Host "`nPIPELINE TEST PASSED" -ForegroundColor Green
    exit 0
}
Write-Host "`nPIPELINE TEST INCOMPLETE" -ForegroundColor Yellow
exit 1
