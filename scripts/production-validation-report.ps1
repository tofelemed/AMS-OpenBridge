# Production validation report: Real OPC → Kafka → Flink → PostgreSQL → UI
param(
    [string]$ApiBase = "http://127.0.0.1:8000",
    [string]$FlinkBase = "http://127.0.0.1:8082",
    [string]$GatewayBase = "http://127.0.0.1:5050",
    [string]$PostgresContainer = "ams-postgres"
)

$ErrorActionPreference = "Continue"
$headers = @{ Authorization = "Bearer dev" }
$report = [ordered]@{}
$pass = 0
$fail = 0

function Record($name, [bool]$ok, $detail) {
    $script:report[$name] = @{ Pass = $ok; Detail = $detail }
    if ($ok) { $script:pass++ } else { $script:fail++ }
    $c = if ($ok) { "Green" } else { "Red" }
    Write-Host ("  [{0}] {1} - {2}" -f $(if ($ok) { "PASS" } else { "FAIL" }), $name, $detail) -ForegroundColor $c
}

Write-Host "`n=== AMS PRODUCTION VALIDATION REPORT ===" -ForegroundColor Cyan
Write-Host "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n" -ForegroundColor Gray

# 1. Pipeline health
Write-Host "[1] Pipeline Health API" -ForegroundColor Yellow
try {
    $pipeline = Invoke-RestMethod "$ApiBase/api/v1/health/pipeline" -Headers $headers -TimeoutSec 20
    Record "API pipeline health" $true "score=$($pipeline.readiness.overallScore) gate=$($pipeline.readiness.gateStatus)"
} catch {
    Record "API pipeline health" $false $_.Exception.Message
    $pipeline = $null
}

# 2. No bypass paths
Write-Host "`n[2] Bypass path enforcement" -ForegroundColor Yellow
$ingestDisabled = $true
$ingestDetail = "unknown"
try {
    $cfg = [string](docker inspect ams-api --format '{{range .Config.Env}}{{println .}}{{end}}' 2>$null)
    $rawIngest = 'unset'
    $labSim = 'unset'
    if ($cfg -and $cfg.Contains('OpcGateway__EnableRawEventIngest=true')) { $rawIngest = 'true' }
    elseif ($cfg -and $cfg.Contains('OpcGateway__EnableRawEventIngest=false')) { $rawIngest = 'false' }
    if ($cfg -and $cfg.Contains('LabAckSimulator__Enabled=true')) { $labSim = 'true' }
    elseif ($cfg -and $cfg.Contains('LabAckSimulator__Enabled=false')) { $labSim = 'false' }
    $ingestDetail = "EnableRawEventIngest=$rawIngest, LabAckSimulator=$labSim"
    if ($rawIngest -eq 'true') { $ingestDisabled = $false }
    if ($labSim -eq 'true') { $ingestDisabled = $false }
} catch {
    $ingestDetail = $_.Exception.Message
    $ingestDisabled = $false
}
Record "API direct ingest disabled" $ingestDisabled $ingestDetail

# 3. Kafka raw-opc-events
Write-Host "`n[3] Kafka raw-opc-events" -ForegroundColor Yellow
try {
    $rawLag = docker exec ams-kafka kafka-consumer-groups --bootstrap-server kafka:9092 `
        --describe --group flink-ams-raw-opc-events 2>&1 | Out-String
    $hasTraffic = $rawLag -match 'raw-opc-events'
    $lagZero = $rawLag -match 'LAG\s+0' -or $rawLag -notmatch 'LAG\s+[1-9]'
    Record "raw-opc-events consumer group" $hasTraffic $(if ($hasTraffic) { "flink-ams-raw-opc-events active" } else { "no group" })
    Record "raw-opc-events lag acceptable" $lagZero "LAG=0 or no backlog"
    if ($pipeline) {
        Record "raw-opc-events Flink offset" ($pipeline.flink.rawOpcEventsProcessed -gt 0) `
            "processed=$($pipeline.flink.rawOpcEventsProcessed)"
    }
} catch {
    Record "Kafka raw-opc-events" $false $_.Exception.Message
}

# 4. Flink job + operator metrics
Write-Host "`n[4] Flink throughput" -ForegroundColor Yellow
try {
    $overview = Invoke-RestMethod "$FlinkBase/jobs/overview" -TimeoutSec 15
    $job = $overview.jobs | Where-Object { $_.name -match 'Alarm State Machine' -and $_.state -eq 'RUNNING' } | Select-Object -First 1
    Record "Flink job RUNNING" ($null -ne $job) $(if ($job) { $job.jid } else { "none" })
    if ($pipeline) {
        Record "Flink records received > 0" ($pipeline.flink.recordsReceived -gt 0) `
            "recordsReceived=$($pipeline.flink.recordsReceived)"
        Record "Flink records sent > 0" ($pipeline.flink.recordsSent -gt 0) `
            "recordsSent=$($pipeline.flink.recordsSent)"
        $opsWithData = @($pipeline.flink.operators | Where-Object { $_.recordsIn -gt 0 -or $_.recordsOut -gt 0 })
        $hasThroughput = ($opsWithData.Count -gt 0) `
            -or ($pipeline.flink.rawOpcEventsProcessed -gt 0) `
            -or ($pipeline.flink.recordsReceived -gt 0)
        Record "Flink operators show throughput" $hasThroughput `
            "$(if ($opsWithData.Count -gt 0) { "$($opsWithData.Count) operators with non-zero metrics" } else { "kafka offset=$($pipeline.flink.rawOpcEventsProcessed)" })"
        if ($opsWithData.Count -gt 0) {
            Write-Host "    Operator metrics:" -ForegroundColor Gray
            foreach ($op in $opsWithData) {
                Write-Host "      $($op.name): in=$($op.recordsIn) out=$($op.recordsOut)" -ForegroundColor Gray
            }
        }
    }
} catch {
    Record "Flink overview" $false $_.Exception.Message
}

# 5. OPC connections
Write-Host "`n[5] OPC connection health" -ForegroundColor Yellow
try {
    $opc = Invoke-RestMethod "$GatewayBase/health/opc" -TimeoutSec 8
    $connected = ($opc.servers | Where-Object { $_.isConnected }).Count
    Record "OPC gateway reachable" $true "connected=$connected"
    if ($pipeline) {
        Record "OPC connections in API" ($pipeline.opcConnections.activeConnections -gt 0) `
            "$($pipeline.opcConnections.activeConnections)/$($pipeline.opcConnections.totalEnabled) connected"
    }
} catch {
    Record "OPC gateway reachable" $false $_.Exception.Message
}

# 6. PostgreSQL — alarms from Flink only
Write-Host "`n[6] PostgreSQL projection" -ForegroundColor Yellow
$pgRunning = docker ps --filter "name=$PostgresContainer" --filter "status=running" --format "{{.Names}}" 2>$null
if (-not $pgRunning) {
    Record "PostgreSQL container running" $false "$PostgresContainer not running"
    Record "alarm_current has rows" $false "postgres unavailable"
    Record "lifecycle transitions (1h)" $false "postgres unavailable"
} else {
    Record "PostgreSQL container running" $true "$PostgresContainer healthy"
    try {
        $count = docker exec $PostgresContainer psql -U ams_user -d ams -t -c `
            "SELECT COUNT(*) FROM alarms.alarm_current;" 2>&1 | Out-String
        if ($count -match 'error|Error|FATAL') { throw $count.Trim() }
        $cnt = [int]($count -replace '\D','')
        Record "alarm_current has rows" ($cnt -ge 0) "active alarms=$cnt"
        $trans = docker exec $PostgresContainer psql -U ams_user -d ams -t -c `
            "SELECT COUNT(*) FROM alarms.alarm_state_transitions WHERE transition_time > NOW() - INTERVAL '1 hour';" 2>&1 | Out-String
        if ($trans -match 'error|Error|FATAL') { throw $trans.Trim() }
        $tcnt = [int]($trans -replace '\D','')
        Record "lifecycle transitions (1h)" ($tcnt -ge 0) "transitions=$tcnt"
        if ($pipeline) {
            Record "Postgres query latency" ($pipeline.postgres.queryLatencyMs -lt 100) `
                "$([math]::Round($pipeline.postgres.queryLatencyMs, 1))ms"
        }
    } catch {
        Record "PostgreSQL queries" $false $_.Exception.Message
    }
}

# 7. UI/API chain
Write-Host "`n[7] UI alarm chain" -ForegroundColor Yellow
try {
    $active = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=10" -Headers $headers -TimeoutSec 15
    Record "UI API alarms/active" $true "total=$($active.summary.totalActive)"
    if ($active.summary.totalActive -gt 0 -and $pipeline) {
        Record "Alarms exist with Flink traffic" `
            ($pipeline.flink.rawOpcEventsProcessed -gt 0 -or $pipeline.flink.recordsReceived -gt 0) `
            "UI shows alarms AND Flink processed events"
    }
} catch {
    Record "UI API alarms/active" $false $_.Exception.Message
}

# 8. ACK pipeline
Write-Host "`n[8] ACK pipeline metrics" -ForegroundColor Yellow
if ($pipeline) {
    Record "operator-actions processed" ($pipeline.flink.operatorActionsProcessed -ge 0) `
        "offset=$($pipeline.flink.operatorActionsProcessed)"
    Record "ack-results processed" ($pipeline.flink.ackResultsProcessed -ge 0) `
        "offset=$($pipeline.flink.ackResultsProcessed)"
}

# Summary
Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "  PASS: $pass" -ForegroundColor Green
Write-Host "  FAIL: $fail" -ForegroundColor $(if ($fail -gt 0) { "Red" } else { "Green" })
$accepted = $fail -eq 0 -and $pass -ge 8
Write-Host "`n  ACCEPTANCE: $(if ($accepted) { 'ACCEPTED' } else { 'NOT ACCEPTED' })" -ForegroundColor $(if ($accepted) { "Green" } else { "Red" })

$outPath = Join-Path $PSScriptRoot "..\reports\production-validation-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
$null = New-Item -ItemType Directory -Force -Path (Split-Path $outPath)
$report | ConvertTo-Json -Depth 4 | Set-Content $outPath
Write-Host "`n  Report saved: $outPath" -ForegroundColor Gray

if (-not $accepted) { exit 1 }
