# Full E2E: GET alarms -> UI ACK -> operator-actions -> Flink -> ack-writeback -> OPC -> ack-results -> API confirm
param(
    [string]$ApiBase = "http://127.0.0.1:8000",
    [string]$GatewayBase = "http://127.0.0.1:5050",
    [string]$ConnectedServerId = "7ce5ecbf-70c9-498d-b899-5c8bb7add383",
    [int]$TimeoutSec = 60
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "lib\AmsFlinkJob.ps1")

function Invoke-DockerQuiet {
    param([Parameter(ValueFromRemainingArguments)][string[]]$DockerArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $out = & docker @DockerArgs 2>&1
    $ErrorActionPreference = $prev
    return $out
}

$results = [ordered]@{}
function Record($name, $pass, $detail) {
    $results[$name] = @{ Pass = [bool]$pass; Detail = $detail }
    $c = if ($pass) { "Green" } else { "Red" }
    Write-Host ("  [{0}] {1} - {2}" -f $(if ($pass) { "PASS" } else { "FAIL" }), $name, $detail) -ForegroundColor $c
}

function Get-Cookie($alarm) {
    $co = $alarm.opcAttributes.cookieOffset
    if ($null -eq $co) { return 0 }
    return [int]$co
}

Write-Host "`n=== AMS FULL PIPELINE E2E TEST ===" -ForegroundColor Cyan

# [1] GET Alarms
Write-Host "`n[1] GET Alarms (API)" -ForegroundColor Yellow
$headers = @{ Authorization = "Bearer dev" }
try {
    $active = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=500&isAcknowledged=false" -Headers $headers -TimeoutSec 30
    Record "GET /api/v1/alarms/active" $true "total=$($active.summary.totalActive) unack=$($active.summary.unacknowledged)"
} catch {
    Record "GET /api/v1/alarms/active" $false $_.Exception.Message
    exit 1
}

# [2] Flink
Write-Host "`n[2] Flink Job" -ForegroundColor Yellow
$prevEapF = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$flinkJobs = @(Get-AmsFlinkAlarmJobs | Where-Object { $_.Status -eq "RUNNING" })
$ErrorActionPreference = $prevEapF
Record "Flink job RUNNING" ($flinkJobs.Count -ge 1) $(if ($flinkJobs) { $flinkJobs[0].Id } else { "none" })

# [3] OPC Gateway
Write-Host "`n[3] OPC Gateway" -ForegroundColor Yellow
try {
    $opc = Invoke-RestMethod "$GatewayBase/health/opc" -TimeoutSec 8
    $srv = $opc.servers | Where-Object { $_.id -eq $ConnectedServerId } | Select-Object -First 1
    Record "OPC Gateway connected" ($srv.isConnected) "server=$ConnectedServerId"
} catch {
    Record "OPC Gateway connected" $false $_.Exception.Message
}

# [4] Select ackable alarm
Write-Host "`n[4] Select ackable alarm (FIC + cookie)" -ForegroundColor Yellow
$candidates = @($active.items | Where-Object {
    $_.serverId -eq $ConnectedServerId -and $_.conditionActive -and -not $_.acknowledged -and $_.sourceName -match '^FIC'
})
$alarm = $null
foreach ($a in ($candidates | Sort-Object { [datetimeoffset]$_.eventTime } -Descending)) {
    if ((Get-Cookie $a) -gt 0) { $alarm = $a; break }
}
if (-not $alarm) { $alarm = $candidates | Select-Object -First 1 }
if (-not $alarm) {
    Record "Ackable alarm found" $false "No FIC unack alarm on server $ConnectedServerId"
    exit 1
}
$cookie = Get-Cookie $alarm
Record "Ackable alarm found" $true "$($alarm.sourceName)/$($alarm.conditionName) id=$($alarm.id)"
Record "OPC cookie present" ($cookie -gt 0) "cookie=$cookie"

# [5] Kafka ingest
Write-Host "`n[5] Kafka ingest (raw-opc-events)" -ForegroundColor Yellow
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$rawSample = Invoke-DockerQuiet exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 `
    --topic raw-opc-events --timeout-ms 5000 | Where-Object { $_ -match '^\{' } | Select-Object -First 1
$ErrorActionPreference = $prevEap
Record "raw-opc-events live" ($rawSample -match 'sourceName') $(if ($rawSample) { "live OPC events flowing" } else { "no msg in 5s" })

# [6] ACK dispatch (same as UI)
Write-Host "`n[6] ACK from UI/API" -ForegroundColor Yellow
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$ackBody = @{
    alarmIds        = @($alarm.id)
    comment         = "E2E pipeline test $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    operatorStation = "E2E-CONSOLE"
} | ConvertTo-Json

try {
    $ackRes = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/v1/alarms/acknowledge/batch" `
        -Headers $headers -ContentType "application/json" -Body $ackBody -TimeoutSec 30
    Record "POST acknowledge/batch" $true $ackRes.message
} catch {
    Record "POST acknowledge/batch" $false $_.Exception.Message
    exit 1
}

# [7] Monitor Kafka pipeline
Write-Host "`n[7] Kafka pipeline (Flink orchestration + OPC writeback)" -ForegroundColor Yellow
$alarmId = $alarm.id
$seen = @{
    opAction  = $false
    writeback = $false
    ackResult = $false
    lifecycle = @{}
}
$deadline = (Get-Date).AddSeconds($TimeoutSec)

function Parse-LifecycleLine($line, $id) {
    if ($line -notmatch $id) { return $null }
    $json = ($line -replace '^[^\{]*', '').Trim()
    if ($json -notmatch '^\{') { return $null }
    try {
        $j = $json | ConvertFrom-Json
        if ($j.lifecycleState) { return $j.lifecycleState }
        if ($j.LifecycleState) { return $j.LifecycleState }
    } catch {}
    return $null
}

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    foreach ($topic in @('operator-actions', 'ack-writeback', 'lifecycle-events', 'ack-results')) {
        $ErrorActionPreference = "Continue"
        $lines = Invoke-DockerQuiet exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 `
            --topic $topic --timeout-ms 2500
        $ErrorActionPreference = $prevEap
        foreach ($line in $lines) {
            if ($line -notmatch $alarmId) { continue }
            switch ($topic) {
                'operator-actions' { $seen.opAction = $true }
                'ack-writeback'    { $seen.writeback = $true }
                'ack-results'      { $seen.ackResult = $true }
                'lifecycle-events' {
                    $st = Parse-LifecycleLine $line $alarmId
                    if ($st -and -not $seen.lifecycle.ContainsKey($st)) {
                        $seen.lifecycle[$st] = $true
                        Write-Host "    + $st @ $($sw.ElapsedMilliseconds)ms" -ForegroundColor DarkGray
                    }
                }
            }
        }
    }
    if ($seen.lifecycle.ContainsKey('ACK_CONFIRMED') -or $seen.lifecycle.ContainsKey('ACK_FAILED')) { break }
}
$sw.Stop()

Record "Kafka operator-actions" $seen.opAction "API published ACK command"
Record "Flink sink ack-writeback" $seen.writeback "Flink routed to gateway"
Record "Lifecycle ACK_DISPATCHED" $seen.lifecycle.ContainsKey('ACK_DISPATCHED') $(if ($seen.lifecycle.ContainsKey('ACK_DISPATCHED')) { 'seen' } else { 'not seen' })
Record "OPC writeback ack-results" $seen.ackResult "Gateway OPC AcknowledgeCondition"
Record "Lifecycle ACK_CONFIRMED" $seen.lifecycle.ContainsKey('ACK_CONFIRMED') $(if ($seen.lifecycle.ContainsKey('ACK_CONFIRMED')) { "$($sw.ElapsedMilliseconds)ms" } elseif ($seen.lifecycle.ContainsKey('ACK_FAILED')) { 'ACK_FAILED' } else { "timeout ${TimeoutSec}s" })

# [8] Post-ACK API state
Write-Host "`n[8] Post-ACK API/DB state" -ForegroundColor Yellow
Start-Sleep -Seconds 3
try {
    $post = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=500" -Headers $headers -TimeoutSec 20
    $upd = $post.items | Where-Object { $_.id -eq $alarmId } | Select-Object -First 1
    if ($upd) {
        Record "Alarm acknowledged in API" ([bool]$upd.acknowledged) "ack=$($upd.acknowledged) lifecycle=$($upd.ackLifecycleState)"
    } else {
        Record "Alarm acknowledged in API" $true "cleared from active list"
    }
} catch {
    Record "Alarm acknowledged in API" $false $_.Exception.Message
}

# Summary
Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
$failed = @($results.Values | Where-Object { -not $_.Pass })
Write-Host " PASSED: $($results.Count - $failed.Count) / $($results.Count)" -ForegroundColor $(if ($failed.Count -eq 0) { "Green" } else { "Yellow" })
foreach ($k in $results.Keys) {
    if (-not $results[$k].Pass) { Write-Host "  FAIL: $k - $($results[$k].Detail)" -ForegroundColor Red }
}
Write-Host ""

$critical = @('POST acknowledge/batch', 'Flink sink ack-writeback', 'Lifecycle ACK_CONFIRMED', 'Alarm acknowledged in API')
$criticalFail = @($critical | Where-Object { $results.ContainsKey($_) -and -not $results[$_].Pass })
if ($criticalFail.Count -gt 0) { exit 1 }
if ($failed.Count -gt 0) { exit 2 }
exit 0
