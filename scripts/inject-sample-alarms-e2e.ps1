# Inject sample live-alarm API records into traverse.alarm.raw-alarms for E2E pipeline verification.
# Production ingest remains AlarmIngestionService polling the live API.
param([int]$WaitSeconds = 30)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib\AmsDocker.ps1")

if (-not (Test-AmsContainerRunning -Name "ams-kafka")) {
    throw "ams-kafka is not running. Start the stack first."
}

$sampleAlarms = @(
    @{
        alarmId = "AG30-BL087|Tolerance High"
        sourceName = "AG30-BL087"
        sourceEventId = "704713610"
        message = "Level"
        priority = "HIGH"
        condition = "Limit Value Tolerance high"
        state = "ACTIVE"
        timestamp = "2025-03-17T17:31:31+00:00"
        acknowledged = $false
        rawPayload = @{ TagName = "AG30-BL087"; SourceEventID = "704713610"; BlockName = "Limit Value Tolerance high" }
    },
    @{
        alarmId = "HP31-BF310|Alarm high"
        sourceName = "HP31-BF310"
        sourceEventId = "671126554"
        message = "Level"
        priority = "HIGH"
        condition = "Limit Value Alarm high"
        state = "ACTIVE"
        timestamp = "2025-03-17T17:31:29+00:00"
        acknowledged = $false
        rawPayload = @{ TagName = "HP31-BF310"; SourceEventID = "671126554"; BlockName = "Limit Value Alarm high" }
    },
    @{
        alarmId = "HP31-BF310|Warning high"
        sourceName = "HP31-BF310"
        sourceEventId = "687903770"
        message = "Level"
        priority = "HIGH"
        condition = "Limit Value Warning high"
        state = "ACTIVE"
        timestamp = "2025-03-17T17:31:28+00:00"
        acknowledged = $false
        rawPayload = @{ TagName = "HP31-BF310"; SourceEventID = "687903770"; BlockName = "Limit Value Warning high" }
    },
    @{
        alarmId = "BB26-BF402|Alarm high"
        sourceName = "BB26-BF402"
        sourceEventId = "671130572"
        message = "Level"
        priority = "HIGH"
        condition = "Limit Value Alarm high"
        state = "ACTIVE"
        timestamp = "2025-03-17T17:31:07+00:00"
        acknowledged = $false
        rawPayload = @{ TagName = "BB26-BF402"; SourceEventID = "671130572"; BlockName = "Limit Value Alarm high" }
    },
    @{
        alarmId = "AP01-BL011|Tolerance High"
        sourceName = "AP01-BL011"
        sourceEventId = "704713654"
        message = "Level"
        priority = "HIGH"
        condition = "Limit Value Tolerance high"
        state = "ACTIVE"
        timestamp = "2025-03-17T17:30:27+00:00"
        acknowledged = $false
        rawPayload = @{ TagName = "AP01-BL011"; SourceEventID = "704713654"; BlockName = "Limit Value Tolerance high" }
    },
    @{
        alarmId = "BB20-BF402|Warning high"
        sourceName = "BB20-BF402"
        sourceEventId = "687907505"
        message = "Level"
        priority = "HIGH"
        condition = "Limit Value Warning high"
        state = "ACTIVE"
        timestamp = "2025-03-17T17:30:11+00:00"
        acknowledged = $false
        rawPayload = @{ TagName = "BB20-BF402"; SourceEventID = "687907505"; BlockName = "Limit Value Warning high" }
    },
    @{
        alarmId = "SG01-BL041|Tolerance High"
        sourceName = "SG01-BL041"
        sourceEventId = "704681200"
        message = "Level"
        priority = "HIGH"
        condition = "Limit Value Tolerance high"
        state = "ACTIVE"
        timestamp = "2025-03-17T17:30:05+00:00"
        acknowledged = $false
        rawPayload = @{ TagName = "SG01-BL041"; SourceEventID = "704681200"; BlockName = "Limit Value Tolerance high" }
    }
)

Write-Host "Publishing $($sampleAlarms.Count) sample alarms to raw-alarms..." -ForegroundColor Cyan
foreach ($alarm in $sampleAlarms) {
    $json = ($alarm | ConvertTo-Json -Compress -Depth 5)
    $json | docker exec -i ams-kafka kafka-console-producer `
        --broker-list kafka:9092 --topic traverse.alarm.raw-alarms 2>&1 | Out-Null
    Write-Host "  -> $($alarm.alarmId)" -ForegroundColor Gray
}

Write-Host "Waiting ${WaitSeconds}s for Flink + API projection..." -ForegroundColor Yellow
Start-Sleep -Seconds $WaitSeconds

Write-Host "`nKafka offsets:" -ForegroundColor Cyan
docker exec ams-kafka kafka-run-class kafka.tools.GetOffsetShell --broker-list kafka:9092 --topic traverse.alarm.raw-alarms 2>&1
docker exec ams-kafka kafka-run-class kafka.tools.GetOffsetShell --broker-list kafka:9092 --topic traverse.alarm.current-alarm-state 2>&1

Write-Host "`nPostgreSQL alarm_current count:" -ForegroundColor Cyan
docker exec ams-postgres psql -U ams_user -d ams -t -c "SELECT COUNT(*) FROM alarms.alarm_current;" 2>&1

Write-Host "`nRun scripts\api-pipeline-validation.ps1 for full report." -ForegroundColor Cyan
