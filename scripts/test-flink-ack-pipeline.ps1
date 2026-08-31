# Tests Flink ACK orchestration: traverse.alarm.operator-actions -> traverse.alarm.ack-writeback (+ lifecycle)
param(
    [string]$Bootstrap = "localhost:9092",
    [int]$TimeoutSec = 45
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "lib\AmsFlinkJob.ps1")

Write-Host "=== AMS Flink ACK pipeline test ===" -ForegroundColor Cyan

# 1. Build Flink JAR
Write-Host "`n[1] Building Flink job JAR..." -ForegroundColor Yellow
docker run --rm -v "${root}/src/flink:/build" -w /build maven:3.9-eclipse-temurin-11 mvn -q package -DskipTests
if ($LASTEXITCODE -ne 0) { throw "Maven build failed" }
$jar = Get-ChildItem -Path "$root\src\flink\target" -Filter "ams-flink-*-SNAPSHOT.jar" | Where-Object { $_.Name -notlike "*-sources.jar" } | Select-Object -First 1
Write-Host "    JAR: $($jar.FullName)" -ForegroundColor Green

# 2. Kafka topics
Write-Host "`n[2] Ensuring Kafka topics exist..." -ForegroundColor Yellow
$topics = @("traverse.alarm.operator-actions", "traverse.alarm.ack-writeback", "traverse.alarm.lifecycle-events", "traverse.alarm.current-alarm-state", "traverse.alarm.ack-results", "raw-opc-events")
foreach ($t in $topics) {
    docker exec ams-kafka kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic $t --partitions 3 --replication-factor 1 2>$null
}

# 3. Submit job if Flink JM reachable
$flinkUrl = "http://localhost:8082"
try {
    $overview = Invoke-RestMethod -Uri "$flinkUrl/v1/overview" -TimeoutSec 3
    Write-Host "`n[3] Flink cluster detected (v$($overview.flinkVersion))" -ForegroundColor Green

    $jarName = $jar.Name
    $containerJar = "/opt/flink/usrlib/$jarName"
    Ensure-AmsFlinkAlarmJob -JarHostPath $jar.FullName -JarContainerPath $containerJar | Out-Null
} catch {
    Write-Host "`n[3] Flink not reachable at $flinkUrl - run job manually or start docker compose" -ForegroundColor Yellow
    Write-Host "    docker compose -f infra/docker/docker-compose.yml up -d flink-jobmanager flink-taskmanager kafka" -ForegroundColor DarkGray
}

# 4. Produce test operator-action
$commandId = [guid]::NewGuid().ToString()
$correlationId = [guid]::NewGuid().ToString()
$alarmId = [guid]::NewGuid().ToString()
$serverId = "d7ba2bde-bfd2-4309-808f-7e049195b05a"
$payload = @{
    schemaVersion = 1
    eventType = "OPERATOR_ACK_COMMAND"
    commandId = $commandId
    correlationId = $correlationId
    alarmId = $alarmId
    actionType = "ACKNOWLEDGE"
    userId = [guid]::NewGuid().ToString()
    username = "test-operator"
    comment = "Flink pipeline integration test"
    actionTimeEpochMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    serverId = $serverId
    sourceName = "IntegrationObjects.TestTag"
    conditionName = "HI"
    activeTimeEpochMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    cookieOffset = 0
} | ConvertTo-Json -Compress

Write-Host "`n[4] Publishing operator-action (commandId=$commandId)..." -ForegroundColor Yellow
$payload | docker exec -i ams-kafka kafka-console-producer --bootstrap-server localhost:9092 --topic traverse.alarm.operator-actions 2>$null

# 5. Consume traverse.alarm.ack-writeback
Write-Host "`n[5] Waiting for traverse.alarm.ack-writeback on topic (timeout ${TimeoutSec}s)..." -ForegroundColor Yellow
$found = $false
$consumer = Start-Job -ScriptBlock {
    param($b, $t)
    docker exec ams-kafka kafka-console-consumer --bootstrap-server $b --topic $t --from-beginning --max-messages 20 --timeout-ms 40000 2>$null
} -ArgumentList "localhost:9092", "traverse.alarm.ack-writeback"

$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline -and -not $found) {
    Start-Sleep -Seconds 2
    $out = Receive-Job $consumer -ErrorAction SilentlyContinue
    if ($out -match $commandId) {
        $found = $true
        Write-Host "    PASS: traverse.alarm.ack-writeback contains commandId" -ForegroundColor Green
        $out | Where-Object { $_ -match $commandId } | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    }
}
Stop-Job $consumer -ErrorAction SilentlyContinue
Remove-Job $consumer -Force -ErrorAction SilentlyContinue

if (-not $found) {
    Write-Host "    FAIL: No traverse.alarm.ack-writeback received for commandId=$commandId" -ForegroundColor Red
    Write-Host "    Ensure Flink job is running and consuming operator-actions." -ForegroundColor Yellow
    exit 1
}

Write-Host "`n=== Flink ACK pipeline test PASSED ===" -ForegroundColor Green
