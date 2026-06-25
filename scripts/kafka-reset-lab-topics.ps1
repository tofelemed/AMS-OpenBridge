# Production Kafka topics — HTTP API ingest pipeline only.
# WARNING: deletes all messages on listed topics.
param([switch]$Force)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib\AmsDocker.ps1")

$retentionMs = "604800000"
$segmentMs = "3600000"
$minIsr = "1"

$allowedTopics = @(
    @{ Name = "raw-alarms"; Partitions = 8; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr,compression.type=lz4" },
    @{ Name = "raw-alarms-dlq"; Partitions = 2; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "current-alarm-state"; Partitions = 8; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=compact,min.insync.replicas=$minIsr" },
    @{ Name = "operator-actions"; Partitions = 4; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "ack-writeback"; Partitions = 2; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "ack-results"; Partitions = 2; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "lifecycle-events"; Partitions = 4; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "root-cause-events"; Partitions = 2; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "loop-raw-data"; Partitions = 16; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "loop-kpis-5m"; Partitions = 8; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "kpi-alarm-rates"; Partitions = 4; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "kpi-bad-actors"; Partitions = 4; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "kpi-standing-snapshots"; Partitions = 2; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=compact,min.insync.replicas=$minIsr" },
    @{ Name = "kpi-health-scores"; Partitions = 2; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "alarm.events.raw"; Partitions = 8; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "alarm.state.delta"; Partitions = 4; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "alarm.state.active"; Partitions = 4; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=compact,min.insync.replicas=$minIsr" },
    @{ Name = "flink.state.alarm.delta"; Partitions = 4; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "system.state.drift.alerts"; Partitions = 2; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },

    # ── Phase 0: Edge platform live & telemetry topics ──────────────────────
    # Live state (Report-By-Exception): Flink LiveStateJob → Sparkplug Edge Node
    @{ Name = "live.metrics"; Partitions = 8; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr,compression.type=lz4" },
    @{ Name = "live.alarms";  Partitions = 4; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr,compression.type=lz4" },
    # Raw telemetry (harmonised samples – StreamPipes path, future use)
    @{ Name = "raw.telemetry.site1"; Partitions = 16; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr,compression.type=lz4" }
)

$legacyTopics = @(
    "raw-opc-events", "raw-opc-events-dlq", "current-opc-state", "opc-events", "opc-ack",
    "alarm-created", "alarm-updated", "alarm-cleared", "alarm-acknowledged"
)

if (-not $Force) {
    Write-Host "This DELETES and recreates production Kafka topics (all messages lost)." -ForegroundColor Yellow
    $confirm = Read-Host "Type YES to continue"
    if ($confirm -ne "YES") { exit 0 }
}

if (-not (Test-AmsContainerRunning -Name "ams-kafka")) {
    Write-Host "ams-kafka is not running; waiting up to 120s..." -ForegroundColor Yellow
    Wait-AmsContainerHealthy -Name "ams-kafka" -TimeoutSeconds 120 | Out-Null
}

$existingTopics = @{}
$topicList = docker exec ams-kafka kafka-topics --bootstrap-server kafka:9092 --list 2>&1 | Out-String
foreach ($line in ($topicList -split "`n")) {
    $name = $line.Trim()
    if ($name) { $existingTopics[$name] = $true }
}

foreach ($legacy in $legacyTopics) {
    if (-not $existingTopics.ContainsKey($legacy)) { continue }
    Write-Host "[Kafka] Removing legacy topic $legacy..." -ForegroundColor DarkYellow
    Invoke-AmsKafkaExec -AllowFailure -Args @(
        "kafka-topics", "--bootstrap-server", "kafka:9092", "--delete", "--topic", $legacy
    ) | Out-Null
    $existingTopics.Remove($legacy) | Out-Null
}

function Test-KafkaTopicExists {
    param([string]$TopicName)
    $list = docker exec ams-kafka kafka-topics --bootstrap-server kafka:9092 --list 2>&1 | Out-String
    foreach ($line in ($list -split "`n")) {
        if ($line.Trim() -eq $TopicName) { return $true }
    }
    return $false
}

foreach ($t in $allowedTopics) {
    if (Test-KafkaTopicExists -TopicName $t.Name) {
        Write-Host "[Kafka] Deleting $($t.Name)..." -ForegroundColor Yellow
        Invoke-AmsKafkaExec -AllowFailure -Args @(
            "kafka-topics", "--bootstrap-server", "kafka:9092", "--delete", "--topic", $t.Name
        ) | Out-Null
        $deadline = (Get-Date).AddSeconds(30)
        while ((Get-Date) -lt $deadline -and (Test-KafkaTopicExists -TopicName $t.Name)) {
            Start-Sleep -Seconds 2
        }
    }
    if (Test-KafkaTopicExists -TopicName $t.Name) {
        Write-Host "[Kafka] $($t.Name) still exists after delete; skipping create." -ForegroundColor DarkYellow
        continue
    }
    Write-Host "[Kafka] Creating $($t.Name) partitions=$($t.Partitions)..." -ForegroundColor Green
    Invoke-AmsKafkaExec -AllowFailure -Args @(
        "kafka-topics", "--bootstrap-server", "kafka:9092", "--create",
        "--topic", $t.Name, "--partitions", "$($t.Partitions)", "--replication-factor", "1"
    ) | Out-Null
}

Write-Host ""
Write-Host "Production topics ready." -ForegroundColor Cyan
