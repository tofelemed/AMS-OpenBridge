# Production ACK validation matrix (Flink-authoritative, no SQL/optimistic ACK).
param(
    [string]$ApiBase = "http://127.0.0.1:8000",
    [string]$GatewayBase = "http://127.0.0.1:5050",
    [string]$ConnectedServerId = "7ce5ecbf-70c9-498d-b899-5c8bb7add383",
    [switch]$Production,
    [int]$CookieWaitSec = 90,
    [int]$AckSlaSec = 120,
    [int]$LifecyclePollMs = 5000
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "lib\AmsFlinkJob.ps1")

$matrix = [ordered]@{}

function Record($phase, $pass, $detail) {
    $matrix[$phase] = @{ Pass = [bool]$pass; Detail = $detail }
    $c = if ($pass) { "Green" } else { "Red" }
    Write-Host ("  [{0}] {1} - {2}" -f $(if ($pass) { "PASS" } else { "FAIL" }), $phase, $detail) -ForegroundColor $c
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " AMS Production ACK Validation Matrix" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Phase 1 — Live OPC ingest
Write-Host "[Phase 1] Live OPC event flow" -ForegroundColor Yellow
try {
    $gw = Invoke-RestMethod "$GatewayBase/health/opc" -TimeoutSec 10
    $srv = $gw.servers | Where-Object { $_.id -eq $ConnectedServerId } | Select-Object -First 1
    Record "OPC Gateway connected" ($srv.isConnected) $ConnectedServerId
    Record "Gateway telemetry publish" ($gw.telemetryPublish -eq $true) "mode=$($gw.mode)"
} catch {
    Record "OPC Gateway connected" $false $_.Exception.Message
}

$raw = $null
$rawSample = docker exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 `
    --topic raw-opc-events --timeout-ms 12000 2>&1 | Where-Object { $_ -match 'cookieOffset' } | Select-Object -First 1
if ($rawSample) { $raw = $rawSample }
if (-not $raw) {
    $offsets = docker exec ams-kafka kafka-run-class kafka.tools.GetOffsetShell `
        --broker-list localhost:9092 --topic raw-opc-events 2>&1 |
        Where-Object { $_ -match '^raw-opc-events:\d+:\d+$' }
    $total = 0
    foreach ($line in $offsets) {
        if ($line -match ':(\d+)$') { $total += [int64]$Matches[1] }
    }
    if ($total -gt 0) {
        $raw = docker exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 `
            --topic raw-opc-events --partition 0 --offset earliest --max-messages 50 --timeout-ms 10000 2>&1 |
            Where-Object { $_ -match '"cookieOffset":\s*[1-9]' } | Select-Object -First 1
    }
}
Record "raw-opc-events with cookieOffset" ($null -ne $raw) $(if ($raw) { "topic has cookie-bearing events" } else { "no cookie in live sample or tail" })

# Phase 2 — Cookie in API
Write-Host "`n[Phase 2] Cookie propagation (API)" -ForegroundColor Yellow
$headers = @{ Authorization = "Bearer dev" }
$alarm = $null
$deadline = (Get-Date).AddSeconds($CookieWaitSec)
while ((Get-Date) -lt $deadline -and -not $alarm) {
    try {
        $active = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=200&isAcknowledged=false" -Headers $headers -TimeoutSec 30
        foreach ($a in $active.items) {
            if ($a.serverId -ne $ConnectedServerId) { continue }
            if (-not $Production -and $a.sourceName -notmatch '^FIC') { continue }
            if (-not ($a.conditionName)) { continue }
            $co = $a.opcAttributes.cookieOffset
            if ($co -and [int]$co -gt 0) { $alarm = $a; break }
        }
    } catch {}
    if (-not $alarm) { Start-Sleep -Seconds 5 }
}

if ($alarm) {
    Record 'API cookieOffset > 0' $true "$($alarm.sourceName) cookie=$($alarm.opcAttributes.cookieOffset)"
} else {
    $hint = if ($Production) { "No Honeywell alarm with cookie after ${CookieWaitSec}s - check DCS events and OPC subscription" } else { "No FIC alarm with cookie after ${CookieWaitSec}s" }
    Record 'API cookieOffset > 0' $false $hint
}

# Phase 3 — Flink
Write-Host "`n[Phase 3] Flink stability" -ForegroundColor Yellow
$flink = @(Get-AmsFlinkAlarmJobs | Where-Object { $_.Status -eq "RUNNING" })
Record "Flink job RUNNING" ($flink.Count -ge 1) $(if ($flink) { $flink[0].Id } else { "none" })
if ($flink) {
    $ex = docker exec ams-flink-jobmanager curl -s "http://localhost:8081/jobs/$($flink[0].Id)/exceptions" 2>&1 | Out-String
    $flinkHealthy = ($ex -match '"root-exception":null') -or ($ex -notmatch '"root-exception":"')
    Record "Flink no root exception" $flinkHealthy "checked JobManager API"
}

# Phase 4 — ACK pipeline (only if cookie alarm found)
if ($alarm) {
    Write-Host "`n[Phase 4] ACK pipeline" -ForegroundColor Yellow
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $body = @{
        alarmIds        = @($alarm.id)
        comment         = "Production validation $(Get-Date -Format 'HH:mm:ss')"
        operatorStation = "QA-CONSOLE"
    } | ConvertTo-Json
    try {
        $ack = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/v1/alarms/acknowledge/batch" `
            -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 60
        Record "ACK dispatch (API)" $true $ack.message
    } catch {
        Record "ACK dispatch (API)" $false $_.Exception.Message
    }

    $states = @{}
    $ackDeadline = (Get-Date).AddSeconds($AckSlaSec)
    while ((Get-Date) -lt $ackDeadline) {
        Start-Sleep -Milliseconds $LifecyclePollMs
        $lines = docker exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 `
            --topic traverse.alarm.lifecycle-events --timeout-ms 8000 2>&1
        foreach ($line in $lines) {
            if ($line -notmatch $alarm.id) { continue }
            try {
                $j = ($line -replace '^[^\{]*', '').Trim() | ConvertFrom-Json
                $st = $j.lifecycleState; if (-not $st) { $st = $j.LifecycleState }
                if ($st) { $states[$st] = $true }
            } catch {}
        }
        if ($states.ContainsKey("ACK_CONFIRMED") -or $states.ContainsKey("ACK_FAILED")) { break }
    }
    $sw.Stop()

    Record "Lifecycle ACK_DISPATCHED" $states.ContainsKey("ACK_DISPATCHED") ""
    Record "Lifecycle ACK_CONFIRMED" $states.ContainsKey("ACK_CONFIRMED") ("{0}ms" -f $sw.ElapsedMilliseconds)
    if ($states.ContainsKey("ACK_FAILED")) {
        Record "ACK_FAILED (explicit)" $true "OPC rejected or missing cookie - expected failure path"
    }

    Start-Sleep -Seconds 3
    $post = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=500" -Headers $headers -TimeoutSec 20
    $upd = $post.items | Where-Object { $_.id -eq $alarm.id } | Select-Object -First 1
    if ($upd) {
        Record "PostgreSQL/API ack state" ([bool]$upd.acknowledged) "ack=$($upd.acknowledged)"
    } else {
        Record "PostgreSQL/API ack state" $true "cleared from active"
    }
}

# Summary matrix
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " VALIDATION MATRIX" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
foreach ($k in $matrix.Keys) {
    $icon = if ($matrix[$k].Pass) { "[PASS]" } else { "[FAIL]" }
    Write-Host " $icon $k - $($matrix[$k].Detail)"
}
$failed = @($matrix.Values | Where-Object { -not $_.Pass })
Write-Host "`nResult: $($matrix.Count - $failed.Count)/$($matrix.Count) passed" -ForegroundColor $(if ($failed.Count -eq 0) { "Green" } else { "Yellow" })
if ($failed.Count -gt 0) { exit 1 }
exit 0
