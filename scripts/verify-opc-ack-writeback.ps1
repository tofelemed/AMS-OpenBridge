# Cross-verify operator ACK: UI/API → Kafka → Flink → OPC Gateway → ack-results → DB/UI
param(
    [string]$ApiBase = "http://127.0.0.1:8000",
    [string]$GatewayBase = "http://127.0.0.1:5050",
    [string]$ConnectedServerId = "7ce5ecbf-70c9-498d-b899-5c8bb7add383",
    [int]$TimeoutSec = 90
)

$ErrorActionPreference = "Stop"
$headers = @{ Authorization = "Bearer dev" }

function Record($name, $pass, $detail) {
    $c = if ($pass) { "Green" } else { "Red" }
    Write-Host ("  [{0}] {1} - {2}" -f $(if ($pass) { "PASS" } else { "FAIL" }), $name, $detail) -ForegroundColor $c
}

Write-Host "`n=== OPC ACK WRITEBACK CROSS-VERIFY ===" -ForegroundColor Cyan

# 1. Find unacked alarm with cookie
$active = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=500&isAcknowledged=false" -Headers $headers
$alarm = $active.items | Where-Object {
    $_.serverId -eq $ConnectedServerId -and $_.conditionActive -and -not $_.acknowledged `
        -and ($_.opcAttributes.cookieOffset -gt 0)
} | Select-Object -First 1

if (-not $alarm) {
    Record "Unacked alarm with cookie" $false "No candidate — trigger a live FIC alarm in OPC simulator first"
    exit 1
}
Record "Unacked alarm with cookie" $true "$($alarm.sourceName)/$($alarm.conditionName) id=$($alarm.id)"

# 2. Operator ACK (not automatic)
$body = @{
    alarmIds        = @($alarm.id)
    comment         = "OPC writeback verify $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    operatorStation = "ACK-VERIFY"
} | ConvertTo-Json

$ackRes = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/v1/alarms/acknowledge/batch" `
    -Headers $headers -ContentType "application/json" -Body $body
Record "Operator ACK dispatched" ($ackRes.successCount -gt 0) $ackRes.message

# 3. Wait for ack-writeback + ack-results
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$seenWriteback = $false
$seenConfirmed = $false
$writebackJson = $null
$ackResultJson = $null

while ((Get-Date) -lt $deadline) {
    if (-not $seenWriteback) {
        $wb = docker exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 `
            --topic ack-writeback --timeout-ms 2000 2>$null | Select-String $alarm.id
        if ($wb) { $seenWriteback = $true; $writebackJson = $wb.Line }
    }
    if (-not $seenConfirmed) {
        $ar = docker exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 `
            --topic ack-results --timeout-ms 2000 2>$null | Select-String "ACK_CONFIRMED"
        if ($ar -and $ar.Line -match $alarm.sourceName) {
            $seenConfirmed = $true
            $ackResultJson = $ar.Line
        }
    }
    if ($seenWriteback -and $seenConfirmed) { break }
    Start-Sleep -Seconds 3
}

Record "ack-writeback published" $seenWriteback $(if ($writebackJson) { "cookie in pipeline" } else { "timeout" })
Record "ack-results ACK_CONFIRMED" $seenConfirmed $(if ($ackResultJson) { "OPC writeback confirmed" } else { "timeout" })

# 4. DB projection — operator ack only
Start-Sleep -Seconds 5
$after = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=500" -Headers $headers
$row = $after.items | Where-Object { $_.id -eq $alarm.id } | Select-Object -First 1
$dbAcked = $row -and $row.acknowledged
Record "DB/UI shows operator ACK" $dbAcked $(if ($row) { "acknowledged=$($row.acknowledged)" } else { "alarm cleared" })

# 5. Gateway health
try {
    $gw = Invoke-RestMethod "$GatewayBase/health/opc" -TimeoutSec 8
    $connected = ($gw.servers | Where-Object { $_.isConnected }).Count -gt 0
    Record "OPC gateway connected" $connected "servers=$($gw.servers.Count)"
} catch {
    Record "OPC gateway connected" $false $_.Exception.Message
}

$pass = $seenWriteback -and $seenConfirmed -and $dbAcked
Write-Host "`n  RESULT: $(if ($pass) { 'ACK WRITEBACK VERIFIED' } else { 'ACK WRITEBACK INCOMPLETE' })" `
    -ForegroundColor $(if ($pass) { "Green" } else { "Red" })
if (-not $pass) { exit 1 }
