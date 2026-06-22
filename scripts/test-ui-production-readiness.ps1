#Requires -Version 5.1
<#
.SYNOPSIS
  Validates all UI-backed API modules, populates lab alarms, and verifies ACK for production readiness.

.EXAMPLE
  .\scripts\test-ui-production-readiness.ps1
  .\scripts\test-ui-production-readiness.ps1 -StartGateway -RebuildUi
#>
param(
    [string]$UiBase = "http://127.0.0.1:3000",
    [string]$ApiBase = "http://127.0.0.1:8000",
    [string]$GatewayBase = "http://127.0.0.1:5050",
    [switch]$StartGateway,
    [switch]$RebuildUi,
    [int]$AckWaitSeconds = 45
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$headers = @{ Authorization = "Bearer anonymous-token" }
$results = [ordered]@{}

function Pass([string]$m) { Write-Host "  [PASS] $m" -ForegroundColor Green }
function Fail([string]$m) { Write-Host "  [FAIL] $m" -ForegroundColor Red }
function Info([string]$m) { Write-Host "  [INFO] $m" -ForegroundColor DarkGray }
function Section([string]$t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

Section "1. Core services"
foreach ($svc in @(
    @{ Name = "UI"; Url = $UiBase },
    @{ Name = "API health"; Url = "$ApiBase/health" },
    @{ Name = "Pipeline health"; Url = "$ApiBase/api/v1/health/pipeline" }
)) {
    try {
        $r = Invoke-RestMethod $svc.Url -TimeoutSec 15
        Pass "$($svc.Name) reachable"
        $results[$svc.Name] = $true
    } catch {
        Fail "$($svc.Name): $_"
        $results[$svc.Name] = $false
    }
}

Section "2. OPC A&E localhost"
& (Join-Path $PSScriptRoot "ensure-opc-ae-lab.ps1") -StartSimulator | Out-Null
$sim = Get-Process -Name IntegrationObjectsOPCAEServerSimulator -ErrorAction SilentlyContinue
$results["OPC AE simulator"] = [bool]$sim
if ($sim) { Pass "Simulator PID $($sim.Id)" } else { Fail "Simulator not running" }

if ($StartGateway) {
    $gwProj = "E:\AMS\src\opc-gateway\AMS.OpcGateway\AMS.OpcGateway.csproj"
    if ((Test-Path $gwProj) -and -not (Get-Process -Name AMS.OpcGateway -ErrorAction SilentlyContinue)) {
        Start-Process dotnet -ArgumentList "run","--project",$gwProj,"--environment","Development" `
            -WorkingDirectory (Split-Path $gwProj) -WindowStyle Hidden
        Start-Sleep -Seconds 10
    }
}
try {
    $gw = Invoke-RestMethod "$GatewayBase/health/opc" -TimeoutSec 10
    $connected = ($gw.servers | Where-Object { $_.isConnected } | Measure-Object).Count -gt 0
    $results["OPC Gateway"] = $gw.status -eq "Healthy" -and $connected
    if ($results["OPC Gateway"]) { Pass "Gateway connected ($($gw.servers[0].host))" } else { Fail "Gateway not connected" }
} catch {
    $results["OPC Gateway"] = $false
    Fail "Gateway: $_"
}

Section "3. UI module APIs (all pages)"
$from = (Get-Date).AddDays(-1).ToUniversalTime().ToString("o")
$to = (Get-Date).ToUniversalTime().ToString("o")
$moduleTests = @(
    @{ Module = "Dashboard/AlarmConsole - active"; Url = "$ApiBase/api/v1/alarms/active?pageSize=50" },
    @{ Module = "Dashboard/AlarmConsole - stats"; Url = "$ApiBase/api/v1/alarms/active/statistics" },
    @{ Module = "Admin OPC servers"; Url = "$ApiBase/api/v1/admin/opc-servers" },
    @{ Module = "Admin OPC connections"; Url = "$ApiBase/api/v1/opc/connections" },
    @{ Module = "Analytics KPI"; Url = "$ApiBase/api/v1/analytics/kpi" },
    @{ Module = "Historical viewer"; Url = "$ApiBase/api/v1/alarms/historical?from=$from&to=$to&pageSize=10" }
)
foreach ($t in $moduleTests) {
    try {
        $null = Invoke-RestMethod $t.Url -Headers $headers -TimeoutSec 20
        Pass $t.Module
        $results[$t.Module] = $true
    } catch {
        Fail "$($t.Module): $($_.Exception.Message)"
        $results[$t.Module] = $false
    }
}

Section "4. Populate test alarm + UI ACK path"
$testSource = "UI-LAB-TEST-$(Get-Date -Format 'HHmmss')"
$event = @{
    AlarmId      = [guid]::NewGuid().ToString()
    Source       = $testSource
    Severity     = 800
    Message      = "UI production readiness test alarm"
    Condition    = "HIGH"
    SubCondition = "HI"
    EventTime    = [DateTimeOffset]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    State        = "ACTIVE"
    AckStatus    = $false
} | ConvertTo-Json -Compress

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$event | docker exec -i ams-kafka kafka-console-producer --broker-list kafka:29092 --topic alarm-created 2>&1 | Out-Null
$ErrorActionPreference = $prevEap
Pass "Published $testSource to alarm-created"
Start-Sleep -Seconds 10

$alarm = $null
for ($i = 0; $i -lt 15; $i++) {
    $active = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=200" -Headers $headers -TimeoutSec 15
    $alarm = $active.items | Where-Object { $_.sourceName -eq $testSource } | Select-Object -First 1
    if ($alarm) { break }
    Start-Sleep -Seconds 2
}
if (-not $alarm) {
    Fail "Alarm not visible in API (Alarm Console would be empty)"
    $results["Alarm visible in UI data path"] = $false
} else {
    Pass "Alarm in API: $($alarm.id) severity=$($alarm.severity)"
    $results["Alarm visible in UI data path"] = $true

    $ack = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/v1/alarms/$($alarm.id)/acknowledge" `
        -Headers $headers -ContentType "application/json" `
        -Body (@{ comment = "UI lab ACK"; operatorStation = "CONSOLE-1" } | ConvertTo-Json) -TimeoutSec 30
    Pass "ACK dispatched: $($ack.message)"

    $confirmed = $false
    for ($e = 0; $e -lt $AckWaitSeconds; $e += 3) {
        Start-Sleep -Seconds 3
        $check = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=200" -Headers $headers -TimeoutSec 15
        $row = $check.items | Where-Object { $_.id -eq $alarm.id } | Select-Object -First 1
        if ($row -and ($row.acknowledged -eq $true -or $row.ackLifecycleState -eq "ACK_CONFIRMED")) {
            Pass "ACK confirmed acknowledged=$($row.acknowledged) lifecycle=$($row.ackLifecycleState)"
            $confirmed = $true
            break
        }
    }
    $results["UI ACK path"] = $confirmed
    if (-not $confirmed) { Fail "ACK not confirmed within ${AckWaitSeconds}s" }
}

Section "5. UI static routes"
$routes = @("/", "/dashboard", "/alarms", "/historical", "/soe", "/analytics", "/admin/opc-servers")
foreach ($route in $routes) {
    try {
        $resp = Invoke-WebRequest "$UiBase$route" -TimeoutSec 10 -UseBasicParsing
        $ok = $resp.StatusCode -eq 200 -and $resp.Content -match "AMS|Alarm|Dashboard|root"
        $results["UI route $route"] = $ok
        if ($ok) { Pass "UI route $route" } else { Fail "UI route $route empty response" }
    } catch {
        $results["UI route $route"] = $false
        Fail "UI route $route : $_"
    }
}

Section "Summary"
$critical = @(
    "UI", "API health", "Pipeline health",
    "Dashboard/AlarmConsole - active", "Alarm visible in UI data path", "UI ACK path",
    "OPC AE simulator", "OPC Gateway"
)
$allCritical = $true
foreach ($kv in $results.GetEnumerator()) {
    $color = if ($kv.Value) { "Green" } else { "Yellow" }
    Write-Host "  $($kv.Key): $($kv.Value)" -ForegroundColor $color
    if ($critical -contains $kv.Key -and -not $kv.Value) { $allCritical = $false }
}

if ($allCritical) {
    Write-Host "`nUI PRODUCTION READINESS: PASS" -ForegroundColor Green
    exit 0
}
Write-Host "`nUI PRODUCTION READINESS: GAPS REMAIN" -ForegroundColor Yellow
exit 1
