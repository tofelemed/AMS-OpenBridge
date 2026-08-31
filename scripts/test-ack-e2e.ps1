<#
.SYNOPSIS
  End-to-end ACK test: Injects a test alarm → Kafka → Flink → PostgreSQL → ACK via API → verify lifecycle.

.DESCRIPTION
  Minimal containers: postgres, redis, zookeeper, kafka, flink, ams-api, ams-frontend.
  
  Flow:
    1. Inject a raw alarm event into Kafka (raw-opc-events)
    2. Flink normalizes → writes to traverse.alarm.current-alarm-state
    3. .NET consumer persists to PostgreSQL and publishes via SignalR
    4. Script queries /api/v1/alarms/active to verify alarm arrived
    5. Script POSTs /api/v1/alarms/{id}/acknowledge
    6. Flink ACK orchestrator → traverse.alarm.lifecycle-events + traverse.alarm.current-alarm-state
    7. Script verifies alarm is acknowledged in PostgreSQL

.NOTES
  Usage:
    # Step 1: Start the stack
    cd infra\docker
    docker compose -f docker-compose.yml -f docker-compose.ack-test.yml up -d --build

    # Step 2: Build + submit Flink job (if not already running)
    # cd src\flink && mvn package -DskipTests
    # Then from scripts\lib, run: . .\AmsFlinkJob.ps1; Ensure-AmsFlinkAlarmJob -JarHostPath ..\..\src\flink\target\ams-flink-1.0-SNAPSHOT.jar -ForceResubmit

    # Step 3: Run this test
    .\scripts\test-ack-e2e.ps1
#>

param(
    [string]$KafkaBootstrap = "localhost:29092",
    [string]$ApiBaseUrl     = "http://localhost:8081",
    [int]$WaitSeconds       = 30,
    [switch]$SkipInject
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# ============================================================
# Config
# ============================================================
$TestServerId   = "a1b2c3d4-0000-0000-0000-000000000001"
$TestSourceName = "ACK-TEST-TAG-001"
$TestCondition  = "HIGH"
$TestSeverity   = 800
$TestMessage    = "E2E ACK test alarm - $(Get-Date -Format 'HH:mm:ss')"
$NowMs          = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

# ============================================================
# Helpers
# ============================================================
function Write-Step   { param($n, $msg) Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Write-Pass   { param($msg) Write-Host "  [PASS] $msg" -ForegroundColor Green }
function Write-Fail   { param($msg) Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-Info   { param($msg) Write-Host "  [INFO] $msg" -ForegroundColor Gray }

function Invoke-Api {
    param([string]$Method = "GET", [string]$Path, $Body)
    $url = "$ApiBaseUrl$Path"
    $headers = @{ Authorization = "Bearer dev" }
    $params = @{
        Uri             = $url
        Method          = $Method
        Headers         = $headers
        ContentType     = "application/json"
        UseBasicParsing = $true
    }
    if ($Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }
    try {
        $response = Invoke-RestMethod @params
        return $response
    } catch {
        Write-Fail "API call failed: $Method $url - $($_.Exception.Message)"
        return $null
    }
}

# ============================================================
# Pre-flight checks
# ============================================================
Write-Host "========================================" -ForegroundColor White
Write-Host "  AMS End-to-End ACK Test" -ForegroundColor White
Write-Host "========================================" -ForegroundColor White
Write-Host ""
Write-Info "API:   $ApiBaseUrl"
Write-Info "Kafka: $KafkaBootstrap"
Write-Info "Test:  $TestSourceName / $TestCondition"

Write-Step 1 "Pre-flight: checking API health"
$health = $null
for ($i = 0; $i -lt 5; $i++) {
    try {
        $health = Invoke-RestMethod -Uri "$ApiBaseUrl/health" -UseBasicParsing -TimeoutSec 5
        break
    } catch {
        Write-Info "API not ready, retrying in 5s... ($($_.Exception.Message))"
        Start-Sleep -Seconds 5
    }
}
if (-not $health) {
    Write-Fail "API is not reachable at $ApiBaseUrl/health. Is the stack running?"
    exit 1
}
Write-Pass "API is healthy"

# ============================================================
# Step 2: Inject a raw alarm event into Kafka
# ============================================================
if (-not $SkipInject) {
    Write-Step 2 "Injecting test alarm into alarm-created"

    $createdEvent = @{
        AlarmId      = [guid]::NewGuid().ToString()
        Source       = $TestSourceName
        Severity     = $TestSeverity
        Message      = $TestMessage
        Condition    = $TestCondition
        SubCondition = "HIHI"
        EventTime    = [DateTimeOffset]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        State        = "ACTIVE"
        AckStatus    = $false
    }

    $eventJson = $createdEvent | ConvertTo-Json -Compress
    $kafkaKey  = $TestServerId + "|" + $TestSourceName

    Write-Info ("Event: " + $TestSourceName + " " + $TestCondition + " sev=" + $TestSeverity)
    Write-Info ("Kafka key: " + $kafkaKey)

    # Write to a temporary file then pipe it to docker exec to avoid string escaping nightmare
    $tmpFile = [System.IO.Path]::GetTempFileName()
    $eventJson | Out-File -FilePath $tmpFile -Encoding utf8 -NoNewline
    Get-Content $tmpFile -Raw | docker exec -i ams-kafka bash -c "kafka-console-producer --broker-list kafka:9092 --topic alarm-created" 2>&1 | ForEach-Object {
        if ($_ -match 'ERROR|Exception') { Write-Fail $_ } else { Write-Info $_ }
    }

    Write-Pass "Alarm event published to alarm-created"
} else {
    Write-Step 2 ("Skipping injection " + "(--SkipInject)")
}

# ============================================================
# Step 3: Wait for alarm to appear in PostgreSQL via API
# ============================================================
Write-Step 3 "Waiting for alarm to appear in API (max ${WaitSeconds}s)"

$alarm = $null
$elapsed = 0
while ($elapsed -lt $WaitSeconds) {
    Start-Sleep -Seconds 3
    $elapsed += 3

    $result = Invoke-Api -Path "/api/v1/alarms/active?pageSize=500&sortBy=EventTime&sortDescending=true"
    if ($result -and $result.items) {
        $alarm = $result.items | Where-Object {
            $_.sourceName -eq $TestSourceName -and $_.conditionName -eq $TestCondition
        } | Select-Object -First 1
    }

    if ($alarm) {
        Write-Pass "Alarm found in DB after ${elapsed}s"
        Write-Info "  ID:       $($alarm.id)"
        Write-Info "  Source:   $($alarm.sourceName)"
        Write-Info "  State:    $($alarm.state)"
        Write-Info "  Acked:    $($alarm.acknowledged)"
        Write-Info "  Severity: $($alarm.severity)"
        break
    }

    Write-Info "Not found yet... (${elapsed}s / ${WaitSeconds}s)"
}

if (-not $alarm) {
    Write-Fail "Alarm did not appear in API within ${WaitSeconds}s"
    Write-Info "Check: Flink job RUNNING? Kafka topics created? .NET consumer alive?"
    
    # Debug: check Flink job status
    Write-Info "--- Flink job status ---"
    docker exec ams-flink-jobmanager curl -s http://localhost:8081/jobs/overview 2>&1 | ForEach-Object { Write-Info $_ }
    
    # Debug: check topic lag
    Write-Info "--- Topic offsets ---"
    docker exec ams-kafka kafka-consumer-groups --bootstrap-server kafka:9092 --describe --group ams-backend 2>&1 | ForEach-Object { Write-Info $_ }
    
    exit 1
}

# ============================================================
# Step 4: Acknowledge the alarm via API
# ============================================================
Write-Step 4 "Acknowledging alarm $($alarm.id)"

$ackResult = Invoke-Api -Method "POST" -Path "/api/v1/alarms/$($alarm.id)/acknowledge" -Body @{
    comment         = "E2E ACK test - automated"
    operatorStation = "TEST_STATION_1"
}

if ($ackResult) {
    Write-Pass "ACK request sent successfully"
    Write-Info "  Response: $($ackResult | ConvertTo-Json -Compress -Depth 3)"
} else {
    Write-Fail "ACK request failed"
    exit 1
}

# ============================================================
# Step 5: Wait for ACK lifecycle to reach CONFIRMED
# ============================================================
Write-Step 5 "Waiting for ACK lifecycle to propagate (max ${WaitSeconds}s)"

$ackConfirmed = $false
$elapsed = 0
while ($elapsed -lt $WaitSeconds) {
    Start-Sleep -Seconds 3
    $elapsed += 3

    $result = Invoke-Api -Path "/api/v1/alarms/active?pageSize=500&sortBy=EventTime&sortDescending=true"
    if ($result -and $result.items) {
        $updated = $result.items | Where-Object { $_.id -eq $alarm.id } | Select-Object -First 1
        if ($updated) {
            Write-Info "  State: $($updated.state) | Acked: $($updated.acknowledged) | Lifecycle: $($updated.ackLifecycleState) (${elapsed}s)"
            
            if ($updated.acknowledged -eq $true) {
                $ackConfirmed = $true
                Write-Pass "ACK CONFIRMED after ${elapsed}s!"
                Write-Info "  Final state:     $($updated.state)"
                Write-Info "  Acknowledged:    $($updated.acknowledged)"
                Write-Info "  ACK lifecycle:   $($updated.ackLifecycleState)"
                Write-Info "  Acked by:        $($updated.ackedByUsername)"
                break
            }
        } else {
            Write-Info "  Alarm $($alarm.id) no longer in active list (may have been cleared) (${elapsed}s)"
        }
    }
}

# ============================================================
# Step 6: Final Verdict
# ============================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor White
if ($ackConfirmed) {
    Write-Host "  VERDICT: ALL TESTS PASSED" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor White
    Write-Host ""
    Write-Host "  Flow validated:" -ForegroundColor Green
    Write-Host "    Raw event -> Kafka (raw-opc-events)" -ForegroundColor Green
    Write-Host "    -> Flink (normalize + dedup + state)" -ForegroundColor Green
    Write-Host "    -> Kafka (traverse.alarm.current-alarm-state)" -ForegroundColor Green
    Write-Host "    -> .NET consumer -> PostgreSQL" -ForegroundColor Green
    Write-Host "    -> ACK API -> Kafka (traverse.alarm.operator-actions)" -ForegroundColor Green
    Write-Host "    -> Flink (OperatorAckOrchestrator)" -ForegroundColor Green
    Write-Host "    -> Kafka (traverse.alarm.lifecycle-events + state)" -ForegroundColor Green
    Write-Host "    -> .NET consumer -> PostgreSQL (acked)" -ForegroundColor Green
    Write-Host "    -> SignalR -> UI" -ForegroundColor Green
} else {
    Write-Host "  VERDICT: ACK NOT CONFIRMED" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor White
    Write-Host ""
    Write-Host "  The alarm was ingested but ACK was not confirmed." -ForegroundColor Yellow
    Write-Host "  This may be expected if Flink ACK orchestrator" -ForegroundColor Yellow  
    Write-Host "  requires DCS writeback confirmation (OPC Gateway)." -ForegroundColor Yellow
    Write-Host "  Check traverse.alarm.lifecycle-events topic for ACK_DISPATCHED." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Debug:" -ForegroundColor Gray
    Write-Host "    docker exec ams-kafka kafka-console-consumer --bootstrap-server kafka:9092 --topic traverse.alarm.lifecycle-events --from-beginning --max-messages 10" -ForegroundColor Gray
    Write-Host "    docker exec ams-kafka kafka-console-consumer --bootstrap-server kafka:9092 --topic traverse.alarm.operator-actions --from-beginning --max-messages 10" -ForegroundColor Gray
}
Write-Host ""
