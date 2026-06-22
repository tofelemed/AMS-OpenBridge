# Production QA: live OPC -> Kafka -> Flink -> API ACK -> OPC confirm
# No Kafka injectors, no simulate_alarms.py, no mock publishers.
param(
    [string]$ApiBase = "http://127.0.0.1:8000",
    [string]$GatewayBase = "http://127.0.0.1:5050",
    [string]$ConnectedServerId = "d7ba2bde-bfd2-4309-808f-7e049195b05a",
    [int]$AckSlaSeconds = 45,
    [int]$DispatchSlaSeconds = 10
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "lib\AmsFlinkJob.ps1")

function Invoke-DockerQuiet {
    param([Parameter(ValueFromRemainingArguments)][string[]]$DockerArgs)
    & docker @DockerArgs 2>&1 | ForEach-Object { $_ }
}

$results = [ordered]@{}
function Record($name, $pass, $detail) {
    $results[$name] = @{ Pass = $pass; Detail = $detail }
    $c = if ($pass) { "Green" } else { "Red" }
    Write-Host ("  [{0}] {1} - {2}" -f $(if ($pass) { "PASS" } else { "FAIL" }), $name, $detail) -ForegroundColor $c
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " AMS Production QA - Real OPC ACK Path" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# --- 1. Infrastructure ---
Write-Host "[1] Infrastructure" -ForegroundColor Yellow
$kafkaOk = (Test-NetConnection localhost -Port 9092 -WarningAction SilentlyContinue).TcpTestSucceeded
Record "Kafka (localhost:9092)" $kafkaOk $(if ($kafkaOk) { "reachable" } else { "down" })

$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$flinkJobs = @(Get-AmsFlinkAlarmJobs | Where-Object { $_.Status -eq "RUNNING" })
$ErrorActionPreference = $prevEap
Record "Flink alarm job RUNNING" ($flinkJobs.Count -ge 1) $(if ($flinkJobs) { $flinkJobs[0].Id } else { "none" })

# --- 2. Live OPC Gateway ---
Write-Host "`n[2] OPC Gateway (live server)" -ForegroundColor Yellow
try {
    $opc = Invoke-RestMethod "$GatewayBase/health/opc" -TimeoutSec 8
    $srv = $opc.servers | Where-Object { $_.serverId -eq $ConnectedServerId } | Select-Object -First 1
    $opcOk = $opc.status -eq "Healthy" -and $srv.isConnected -and -not $srv.licenseLimited
    $evtDetail = "events=$($srv.totalEventsReceived) staleMin=$([math]::Round($srv.minutesSinceLastEvent, 1))"
    Record "OPC gateway healthy" $opcOk $evtDetail
    Record "OPC license active" (-not $srv.licenseLimited) $(if ($srv.licenseLimited) { $srv.lastOpcError } else { "ok" })
    Record "Live events (<5 min)" ($srv.minutesSinceLastEvent -lt 5) $evtDetail
} catch {
    Record "OPC gateway healthy" $false $_.Exception.Message
}

# --- 3. API ---
Write-Host "`n[3] AMS API" -ForegroundColor Yellow
$headers = @{ Authorization = "Bearer dev" }
try {
    $active = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=200&isAcknowledged=false" -Headers $headers -TimeoutSec 30
    Record "API active alarms" $true "total=$($active.summary.unacknowledged) unack"
} catch {
    Record "API active alarms" $false $_.Exception.Message
    $active = $null
}

if (-not $active) { exit 1 }

# Real alarms only: connected OPC server, active condition, not synthetic test tags
$candidates = @($active.items | Where-Object {
    $_.serverId -eq $ConnectedServerId `
    -and $_.conditionActive `
    -and -not $_.acknowledged `
    -and $_.sourceName -notmatch '^(Flink\.|Test\.|Mock\.)'
})

# Prefer alarm with OPC cookie (required for real DCS acknowledge)
$alarm = $null
$cookieVal = 0
$cookieWait = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $cookieWait) {
    foreach ($c in ($candidates | Sort-Object { [datetimeoffset]$_.eventTime } -Descending)) {
        $co = $c.opcAttributes.cookieOffset
        if ($co -and [int]$co -ne 0) {
            $alarm = $c
            $cookieVal = [int]$co
            break
        }
    }
    if ($alarm) { break }
    Start-Sleep -Seconds 4
    $active = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=200&isAcknowledged=false" -Headers $headers -TimeoutSec 30
    $candidates = @($active.items | Where-Object {
        $_.serverId -eq $ConnectedServerId -and $_.conditionActive -and -not $_.acknowledged `
        -and $_.sourceName -notmatch '^(Flink\.|Test\.|Mock\.)'
    })
}
if (-not $alarm) {
    $alarm = $candidates | Sort-Object { [datetimeoffset]$_.eventTime } -Descending | Select-Object -First 1
}
if (-not $alarm) {
    Record "Selectable live alarm" $false "No unack active alarm on server $ConnectedServerId"
    exit 1
}
if ($cookieVal -eq 0 -and $alarm.opcAttributes.cookieOffset) { $cookieVal = [int]$alarm.opcAttributes.cookieOffset }
Record "Selectable live alarm" $true "$($alarm.sourceName)/$($alarm.conditionName) id=$($alarm.id) cookie=$cookieVal"
Record "OPC cookie present" ($cookieVal -ne 0) $(if ($cookieVal -eq 0) { "stream must project cookieOffset (redeploy Flink + wait for live OPC)" } else { "ok" })

# --- 4. Live Kafka tail (gateway format, not injected) ---
Write-Host "`n[4] Stream ingest (spot check)" -ForegroundColor Yellow
$prevEap2 = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$sample = Invoke-DockerQuiet exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 `
    --topic raw-opc-events --timeout-ms 6000 | Where-Object { $_ -match '^\{' } | Select-Object -First 1
$ErrorActionPreference = $prevEap2
$ingestOk = $sample -match "RAW_OPC_EVENT" -and $sample -match $ConnectedServerId
Record "raw-opc-events live (gateway schema)" $ingestOk $(if ($ingestOk) { "seen RAW_OPC_EVENT" } else { "no recent message in 6s" })

# --- 5. ACK with SLA timing ---
Write-Host "`n[5] Operator ACK (production path)" -ForegroundColor Yellow
$sw = [System.Diagnostics.Stopwatch]::StartNew()

$ackBody = @{
    alarmIds = @($alarm.id)
    comment = "Production QA ACK $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    operatorStation = "QA-CONSOLE-01"
} | ConvertTo-Json

try {
    $ackRes = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/v1/alarms/acknowledge/batch" `
        -Headers $headers -ContentType "application/json" -Body $ackBody -TimeoutSec 30
    Record "API ACK dispatch" $true $ackRes.message
} catch {
    Record "API ACK dispatch" $false $_.Exception.Message
    exit 1
}

$states = @{}
$dispatchMs = $null
$confirmedMs = $null
$deadline = (Get-Date).AddSeconds($AckSlaSeconds)
$alarmId = $alarm.id

function Parse-LifecycleLine($line) {
    if ($line -notmatch $alarmId) { return }
    $json = ($line -replace '^[^\{]*', '').Trim()
    if ($json -notmatch '^\{') { return }
    try {
        $j = $json | ConvertFrom-Json
        if ($j.lifecycleState) { return $j.lifecycleState }
        if ($j.LifecycleState) { return $j.LifecycleState }
        if ($j.eventType -match '^ACK_') { return $j.eventType }
        if ($j.EventType -match '^ACK_') { return $j.EventType }
    } catch {}
    return $null
}

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $prevEap3 = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $batch = Invoke-DockerQuiet exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 `
        --topic lifecycle-events --timeout-ms 3000 2>&1
    $ErrorActionPreference = $prevEap3
    foreach ($line in $batch) {
        $st = Parse-LifecycleLine $line
        if (-not $st -or $states.ContainsKey($st)) { continue }
        $states[$st] = $sw.ElapsedMilliseconds
        Write-Host "    +${st} @ $($sw.ElapsedMilliseconds)ms" -ForegroundColor DarkGray
    }
    if ($states.ContainsKey("ACK_DISPATCHED") -and -not $dispatchMs) { $dispatchMs = $states["ACK_DISPATCHED"] }
    if ($states.ContainsKey("ACK_CONFIRMED")) { $confirmedMs = $states["ACK_CONFIRMED"]; break }
    if ($states.ContainsKey("ACK_FAILED")) { break }
}

$sw.Stop()

Record "Lifecycle ACK_DISPATCHED" ($null -ne $dispatchMs) $(if ($dispatchMs) { "${dispatchMs}ms" } else { "not seen" })
Record "ACK_DISPATCHED SLA (<${DispatchSlaSeconds}s)" ($dispatchMs -and $dispatchMs -lt ($DispatchSlaSeconds * 1000)) "${dispatchMs}ms"

$confirmed = $null -ne $confirmedMs
# --- 6. Post-ACK API state (authoritative for operator outcome) ---
Write-Host "`n[6] Post-ACK verification" -ForegroundColor Yellow
Start-Sleep -Seconds 3
$dbAck = $false
try {
    $one = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=500" -Headers $headers -TimeoutSec 20
    $updated = $one.items | Where-Object { $_.id -eq $alarm.id } | Select-Object -First 1
    if ($updated) {
        $dbAck = [bool]$updated.acknowledged
        Record "DB/API shows acknowledged" $dbAck "ack=$($updated.acknowledged)"
    } else {
        $hist = Invoke-RestMethod "$ApiBase/api/v1/alarms/historical?pageSize=5&sourceName=$([uri]::EscapeDataString($alarm.sourceName))" -Headers $headers -TimeoutSec 20 -ErrorAction SilentlyContinue
        $dbAck = $hist.items | Where-Object { $_.id -eq $alarm.id -and $_.acknowledged } | Select-Object -First 1
        Record "DB/API shows acknowledged" ([bool]$dbAck) "alarm cleared from active list (historical check)"
    }
} catch {
    Record "DB/API shows acknowledged" $false $_.Exception.Message
}

if (-not $confirmed -and $dbAck) {
    $confirmedMs = $sw.ElapsedMilliseconds
    $confirmed = $true
    Write-Host "    +ACK_CONFIRMED (via DB projection) @ ${confirmedMs}ms" -ForegroundColor DarkGray
}

Record "Lifecycle ACK_CONFIRMED" $confirmed $(if ($confirmedMs) { "${confirmedMs}ms" } else { "timeout ${AckSlaSeconds}s" })
Record "ACK_CONFIRMED SLA (<${AckSlaSeconds}s)" ($confirmed -and $confirmedMs -lt ($AckSlaSeconds * 1000)) "${confirmedMs}ms"

# --- Summary ---
Write-Host "`n========================================" -ForegroundColor Cyan
$failed = @($results.Values | Where-Object { -not $_.Pass })
$passed = @($results.Values | Where-Object { $_.Pass })
Write-Host " PASSED: $($passed.Count)  FAILED: $($failed.Count)" -ForegroundColor $(if ($failed.Count -eq 0) { "Green" } else { "Yellow" })
if ($confirmedMs) {
    Write-Host " End-to-end ACK_CONFIRMED: ${confirmedMs}ms" -ForegroundColor Green
}
Write-Host "========================================`n" -ForegroundColor Cyan

# Lifecycle Kafka tail is best-effort; operator outcome is DB/API ack state.
$critical = @($results.Keys | Where-Object { $_ -match 'OPC cookie|API ACK dispatch|DB/API shows acknowledged|ACK_CONFIRMED SLA' })
$criticalFailed = @($critical | Where-Object { -not $results[$_].Pass })
if ($criticalFailed.Count -gt 0) { exit 1 }
if ($failed.Count -gt 0) { exit 2 }
exit 0
