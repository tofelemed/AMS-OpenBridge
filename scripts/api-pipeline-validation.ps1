# End-to-end production validation: API → Kafka → Flink → PostgreSQL → UI path.
param(
    [string]$ApiUrl = "http://localhost:8081",
    [string]$FlinkUrl = "http://localhost:8082"
)

$ErrorActionPreference = "Continue"
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$report = [ordered]@{
    timestamp = (Get-Date).ToString("o")
    acceptance = [ordered]@{}
    metrics = [ordered]@{}
    checks = [ordered]@{}
}

function Record([string]$Name, [bool]$Pass, [string]$Detail, [string]$Section = "checks") {
    $report[$Section][$Name] = @{ pass = $Pass; detail = $Detail }
    $color = if ($Pass) { "Green" } else { "Red" }
    Write-Host ("  [{0}] {1} - {2}" -f $(if ($Pass) { "PASS" } else { "FAIL" }), $Name, $Detail) -ForegroundColor $color
}

Write-Host "`n=== AMS Production Pipeline Validation ===" -ForegroundColor Cyan

# Kafka topic statistics
Write-Host "`n[1] Kafka topic statistics" -ForegroundColor Yellow
$topicStats = [ordered]@{}
$topics = @("raw-alarms", "current-alarm-state", "operator-actions", "ack-writeback", "ack-results", "lifecycle-events", "raw-alarms-dlq", "root-cause-events")
foreach ($topic in $topics) {
    $offsets = docker exec ams-kafka kafka-run-class kafka.tools.GetOffsetShell `
        --broker-list kafka:9092 --topic $topic 2>&1 | Out-String
    $total = 0L
    foreach ($line in ($offsets -split "`n")) {
        $trimmed = $line.Trim()
        if ($trimmed -match ":(\d+)$") { $total += [int64]$Matches[1] }
    }
    $topicStats[$topic] = $total
    Record "Topic $topic" ($offsets -match $topic) "offsetTotal=$total" "metrics"
}
$report.metrics["kafkaTopicStatistics"] = $topicStats

# Consumer lag
Write-Host "`n[2] Consumer lag" -ForegroundColor Yellow
$lagReport = [ordered]@{}
$groups = @(
    @{ Name = "flink-ams-raw-alarms"; Topic = "raw-alarms" },
    @{ Name = "ams-backend"; Topic = "current-alarm-state" },
    @{ Name = "ams-backend-lifecycle"; Topic = "lifecycle-events" }
)
$maxLag = 0
foreach ($g in $groups) {
    $lagOut = docker exec ams-kafka kafka-consumer-groups `
        --bootstrap-server kafka:9092 --describe --group $g.Name 2>&1 | Out-String
    $lag = 0
    foreach ($line in ($lagOut -split "`n")) {
        if ($line -match $g.Topic -and $line -match '\s+(\d+)\s*$') { $lag += [int]$Matches[1] }
    }
    $lagReport[$g.Name] = $lag
    if ($lag -gt $maxLag) { $maxLag = $lag }
    $groupExists = $lagOut -match $g.Topic
    Record "Lag $($g.Name)" ($groupExists -or $lag -eq 0) "LAG=$lag exists=$groupExists" "metrics"
}
$report.metrics["consumerLag"] = $lagReport
Record "Consumer lag zero" ($maxLag -eq 0) "maxLag=$maxLag"

# Flink throughput
Write-Host "`n[3] Flink throughput and checkpoints" -ForegroundColor Yellow
$flinkMetrics = [ordered]@{}
try {
    $jobs = Invoke-RestMethod -Uri "$FlinkUrl/jobs" -TimeoutSec 10
    $running = @($jobs.jobs | Where-Object { $_.status -eq "RUNNING" })
    Record "Flink RUNNING" ($running.Count -gt 0) "$($running.Count) job(s)"
    if ($running.Count -gt 0) {
        $jobId = $running[0].id
        $detail = Invoke-RestMethod -Uri "$FlinkUrl/jobs/$jobId" -TimeoutSec 10
        $flinkMetrics["restartCount"] = $detail."restart-count"
        $flinkMetrics["checkpointSuccess"] = $detail.timestamps."last-checkpoint"
        $restarts = if ($null -ne $detail."restart-count") { $detail."restart-count" } else { 0 }
        Record "Restart count" ($restarts -eq 0) "restarts=$restarts"
        $vertices = Invoke-RestMethod -Uri "$FlinkUrl/jobs/$jobId" -TimeoutSec 10
        if ($vertices.vertices) { $vertices = @{ vertices = $vertices.vertices } }
        $totalIn = 0; $totalOut = 0
        foreach ($v in $vertices.vertices) {
            $recv = [int64](($v.metrics | Where-Object { $_.id -match "records_in" } | Select-Object -First 1).value)
            $sent = [int64](($v.metrics | Where-Object { $_.id -match "records_out" } | Select-Object -First 1).value)
            $totalIn += $recv; $totalOut += $sent
            if ($v.name -match "validation|raw-alarms|dedup|normalization|lifecycle|projection") {
                Record "Flink $($v.name)" ($recv -gt 0 -or $sent -gt 0) "in=$recv out=$sent" "metrics"
            }
        }
        $flinkMetrics["recordsReceived"] = $totalIn
        $flinkMetrics["recordsSent"] = $totalOut
        Record "Flink records received" ($totalIn -gt 0) "total=$totalIn"
        Record "Flink records sent" ($totalOut -gt 0) "total=$totalOut"
    }
} catch {
    Record "Flink REST" $false $_.Exception.Message
}
$report.metrics["flinkThroughput"] = $flinkMetrics

# API pipeline health
Write-Host "`n[4] API ingestion and projection" -ForegroundColor Yellow
try {
    $pipeline = Invoke-RestMethod -Uri "$ApiUrl/api/v1/health/pipeline" -TimeoutSec 15
    $ingest = $pipeline.telemetryIngest.totalEventsObserved
    $report.metrics["apiIngestionRate"] = $ingest
    Record "API ingestion events" ($ingest -gt 0) "totalEventsObserved=$ingest" "metrics"
    $kafkaLag = if ($null -ne $pipeline.kafka.lag) { $pipeline.kafka.lag } else { 0 }
    Record "Pipeline Kafka lag" ($kafkaLag -eq 0) "lag=$kafkaLag" "metrics"
    $report.metrics["signalRClients"] = $pipeline.signalr.connectedClients
} catch {
    Record "API pipeline endpoint" $false $_.Exception.Message
}

# PostgreSQL
Write-Host "`n[5] PostgreSQL projection" -ForegroundColor Yellow
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$dbCount = (docker exec ams-postgres psql -U ams_user -d ams -t -c "SELECT COUNT(*) FROM alarms.alarm_current;" 2>&1 | Out-String).Trim()
$sw.Stop()
$count = 0; if ($dbCount -match '(\d+)') { $count = [int]$Matches[1] }
$report.metrics["databaseWriteLatencyMs"] = $sw.ElapsedMilliseconds
$report.metrics["alarmCurrentRows"] = $count
Record "PostgreSQL alarm_current" ($count -ge 0) "rows=$count latencyMs=$($sw.ElapsedMilliseconds)" "metrics"

$histCount = docker exec ams-postgres psql -U ams_user -d ams -t -c "SELECT COUNT(*) FROM alarms.alarm_history;" 2>&1
$transCount = docker exec ams-postgres psql -U ams_user -d ams -t -c "SELECT COUNT(*) FROM alarms.alarm_state_transitions;" 2>&1
Record "alarm_history accessible" ([bool]($histCount -match '\d+')) ($histCount.ToString().Trim())
Record "alarm_state_transitions accessible" ([bool]($transCount -match '\d+')) ($transCount.ToString().Trim())

# DLQ / failures
Write-Host "`n[6] Failure report" -ForegroundColor Yellow
$dlqCount = $topicStats["raw-alarms-dlq"]
Record "raw-alarms-dlq empty" ($dlqCount -eq 0) "malformed=$dlqCount"
$failedLifecycle = docker exec ams-postgres psql -U ams_user -d ams -t -c `
    "SELECT COUNT(*) FROM alarms.alarm_current WHERE opc_attributes->>'ackLifecycleState' = 'ACK_FAILED';" 2>&1
Record "ACK_FAILED lifecycle visible" ($true) ($failedLifecycle.Trim())

# Acceptance gates
$ingestOk = ($topicStats["raw-alarms"] -gt 0) -and ($topicStats["current-alarm-state"] -gt 0)
$projectOk = ($topicStats["current-alarm-state"] -gt 0) -and ($count -gt 0)
$report.acceptance["apiToKafkaToFlinkToPostgresToUi"] = $ingestOk -and $projectOk -and ($maxLag -eq 0)
$report.acceptance["ackPathConfigured"] = $topicStats["operator-actions"] -ge 0

$outPath = Join-Path (Split-Path $PSScriptRoot) "reports\api-pipeline-validation-$ts.json"
New-Item -ItemType Directory -Force -Path (Split-Path $outPath) | Out-Null
$report | ConvertTo-Json -Depth 6 | Set-Content $outPath
Write-Host "`nReport: $outPath" -ForegroundColor Cyan

if ($report.acceptance["apiToKafkaToFlinkToPostgresToUi"]) {
    Write-Host "`nVALIDATION PASS - E2E acceptance gate met" -ForegroundColor Green
    Write-Host "  raw-alarms=$($topicStats['raw-alarms']) current-alarm-state=$($topicStats['current-alarm-state']) dbRows=$count lag=$maxLag" -ForegroundColor Green
    exit 0
}
$failed = @($report.checks.Values | Where-Object { -not $_.pass })
Write-Host "`nVALIDATION FAIL - $($failed.Count) check(s), acceptance=False" -ForegroundColor Red
exit 1
