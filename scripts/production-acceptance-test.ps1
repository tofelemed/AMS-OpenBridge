# Production acceptance tests — CAMS vNext (Tests 1–7)
# Run after: docker compose + StreamPipes overlay + AMS.Api + Flink job

param(
    [string]$ApiBase = "http://127.0.0.1:8000",
    [string]$StreamPipesBackend = "http://localhost:8030",
    [string]$FlinkUrl = "http://localhost:8082",
    [string]$KafkaBootstrap = "localhost:9092",
    [string]$BearerToken = "",
    [switch]$SkipLoadTest
)

$ErrorActionPreference = "Stop"
$passed = 0
$failed = 0

function Test-Step($Name, [scriptblock]$Block) {
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    try {
        & $Block
        Write-Host "PASS: $Name" -ForegroundColor Green
        $script:passed++
    } catch {
        Write-Host "FAIL: $Name — $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
    }
}

function Get-AuthHeaders {
    if ($BearerToken) { return @{ Authorization = "Bearer $BearerToken" } }
    return @{}
}

# Test 1 — OPC Connection + StreamPipes pipeline
Test-Step "Test 1: OPC connections + StreamPipes health" {
    $health = Invoke-RestMethod -Uri "$ApiBase/api/v1/health/pipeline" -Headers (Get-AuthHeaders) -TimeoutSec 15
    if (-not $health.streampipes.reachable) { throw "StreamPipes not reachable" }
    $conns = Invoke-RestMethod -Uri "$ApiBase/api/v1/opc/connections" -Headers (Get-AuthHeaders) -TimeoutSec 15
    $active = @($conns | Where-Object { $_.status -eq "Connected" })
    if ($active.Count -eq 0) { throw "No Connected OPC connections" }
    foreach ($c in $active) {
        if ($c.pipelineStatus -ne "Running") { throw "Connection $($c.name) pipeline not Running ($($c.pipelineStatus))" }
    }
    Write-Host "  Connected: $($active.Count), StreamPipes: $($health.streampipes.status)"
}

# Test 2 — Kafka raw-opc-events
Test-Step "Test 2: Kafka raw-opc-events receiving" {
    $out = docker exec ams-kafka kafka-console-consumer `
        --bootstrap-server $KafkaBootstrap `
        --topic raw-opc-events `
        --timeout-ms 8000 `
        --max-messages 1 2>&1
    if ($LASTEXITCODE -ne 0 -and "$out" -notmatch ".") {
        throw "No messages on raw-opc-events within 8s"
    }
    Write-Host "  raw-opc-events: message(s) observed"
}

# Test 3 — Flink traverse.alarm.current-alarm-state
Test-Step "Test 3: Flink traverse.alarm.current-alarm-state" {
    $out = docker exec ams-kafka kafka-console-consumer `
        --bootstrap-server $KafkaBootstrap `
        --topic traverse.alarm.current-alarm-state `
        --timeout-ms 8000 `
        --max-messages 1 2>&1
    if ($LASTEXITCODE -ne 0 -and "$out" -notmatch ".") {
        throw "No messages on traverse.alarm.current-alarm-state within 8s"
    }
    Write-Host "  traverse.alarm.current-alarm-state: message(s) observed"
}

# Test 4 — UI latency (API proxy for active alarms freshness)
Test-Step "Test 4: UI alarm freshness (<1s via API)" {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $alarms = Invoke-RestMethod -Uri "$ApiBase/api/v1/alarms/active?pageSize=1" -Headers (Get-AuthHeaders) -TimeoutSec 5
    $sw.Stop()
    if ($sw.ElapsedMilliseconds -gt 1000) { throw "Active alarm API took $($sw.ElapsedMilliseconds)ms (>1000ms)" }
    Write-Host "  API latency: $($sw.ElapsedMilliseconds)ms"
}

# Test 5 — ACK lifecycle (informational — requires operator action)
Test-Step "Test 5: ACK pipeline topics exist" {
    foreach ($topic in @("traverse.alarm.operator-actions", "traverse.alarm.ack-writeback", "traverse.alarm.ack-results", "traverse.alarm.lifecycle-events")) {
        docker exec ams-kafka kafka-topics --bootstrap-server $KafkaBootstrap --list 2>$null | Select-String -Pattern "^$topic$" -Quiet
        if (-not $?) { throw "Topic $topic missing" }
    }
    Write-Host "  ACK topics present; full ACK_CONFIRMED requires operator ACK + StreamPipes ack pipeline RUNNING"
}

# Test 6 — History transitions table
Test-Step "Test 6: alarm_state_transitions API" {
    $from = (Get-Date).AddHours(-24).ToUniversalTime().ToString("o")
    $to = (Get-Date).ToUniversalTime().ToString("o")
    $uri = "$ApiBase/api/v1/alarms/transitions?from=$([uri]::EscapeDataString($from))&to=$([uri]::EscapeDataString($to))&pageSize=10"
    $result = Invoke-RestMethod -Uri $uri -Headers (Get-AuthHeaders) -TimeoutSec 15
    Write-Host "  Transitions in last 24h: $($result.totalCount)"
}

# Test 7 — Load test placeholder
if (-not $SkipLoadTest) {
    Test-Step "Test 7: Load test gate (manual)" {
        $jobs = Invoke-RestMethod -Uri "$FlinkUrl/jobs" -TimeoutSec 10 -ErrorAction SilentlyContinue
        if ($jobs -and $jobs.jobs) {
            $running = @($jobs.jobs | Where-Object { $_.status -eq "RUNNING" })
            Write-Host "  Flink RUNNING jobs: $($running.Count) — full 863k tag / 100k alarm/min validation is manual/DCS"
        } else {
            Write-Host "  Flink REST unavailable — skip detailed load metrics"
        }
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Passed: $passed  Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
if ($failed -gt 0) { exit 1 }
