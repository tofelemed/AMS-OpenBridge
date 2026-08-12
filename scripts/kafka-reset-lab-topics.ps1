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
    # Written by AlarmReplayEngine, consumed by ams-api ReplayResultConsumerService.
    # Was missing here (auto-create used to paper over it; Plan 09 turns auto-create off).
    @{ Name = "flink.state.alarm.replay"; Partitions = 2; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    # Phase 7 calculation loop: analysis-service -> analysis.executions -> AnalysisExecutionJob
    # -> analysis.results -> analysis-service. Also missing here until 2026-08-12 (same trap).
    @{ Name = "analysis.executions"; Partitions = 2; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "analysis.results"; Partitions = 2; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "system.state.drift.alerts"; Partitions = 2; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },

    # ── Phase 0: Edge platform live & telemetry topics ──────────────────────
    # Live state (Report-By-Exception): Flink LiveStateJob → Sparkplug Edge Node
    @{ Name = "live.metrics"; Partitions = 8; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr,compression.type=lz4" },
    @{ Name = "live.alarms";  Partitions = 4; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr,compression.type=lz4" },
    # Raw telemetry (harmonised samples – StreamPipes path, future use)
    @{ Name = "raw.telemetry.site1"; Partitions = 16; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr,compression.type=lz4" }
)

# ── Phase 2 (CPLM): ensure-only topics — NEVER deleted by this script ─────────
# clpm.gate.results.v1 is evidence data with 30 d retention and loop.samples.v1
# feeds a job holding 24 h of keyed state; wiping them on every stack start
# (start-ams-production.ps1 calls this script with -Force) would destroy replay
# margin and diagnosis history. These are created if missing and their configs
# are aligned if they already exist, but existing data is left alone.
# NB: every CPLM job also subscribes to ams.metadata.updates unconditionally.
$cplmRetention30d = "2592000000"
$ensureTopics = @(
    @{ Name = "loop.samples.v1"; Partitions = 16; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr,compression.type=lz4" },
    @{ Name = "clpm.feature.short.v1"; Partitions = 8; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "clpm.feature.long.v1"; Partitions = 8; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "clpm.gate.results.v1"; Partitions = 8; Config = "retention.ms=$cplmRetention30d,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr" },
    @{ Name = "live.loop.metrics"; Partitions = 8; Config = "retention.ms=$retentionMs,segment.ms=$segmentMs,cleanup.policy=delete,min.insync.replicas=$minIsr,compression.type=lz4" },
    @{ Name = "ams.metadata.updates"; Partitions = 3; Config = "cleanup.policy=compact,min.insync.replicas=$minIsr" },
    @{ Name = "context.parameter-set.v1"; Partitions = 3; Config = "cleanup.policy=compact,min.insync.replicas=$minIsr" }
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

# Expand "k1=v1,k2=v2" into repeated ("--config","k1=v1","--config","k2=v2") args.
# Without this the broker defaults win (24 h retention, delete policy) no matter
# what the topic table above declares.
function Get-KafkaConfigArgs {
    param([string]$Config)
    $args = @()
    foreach ($kv in ($Config -split ",")) {
        $kv = $kv.Trim()
        if ($kv) { $args += @("--config", $kv) }
    }
    return $args
}

function New-KafkaTopic {
    param([hashtable]$Topic)
    Write-Host "[Kafka] Creating $($Topic.Name) partitions=$($Topic.Partitions) config=$($Topic.Config)..." -ForegroundColor Green
    Invoke-AmsKafkaExec -AllowFailure -Args (@(
        "kafka-topics", "--bootstrap-server", "kafka:9092", "--create",
        "--topic", $Topic.Name, "--partitions", "$($Topic.Partitions)", "--replication-factor", "1"
    ) + (Get-KafkaConfigArgs -Config $Topic.Config)) | Out-Null
}

# Verify the declared config was actually applied; the create call is -AllowFailure
# so this is the only place a silent failure becomes visible.
function Test-KafkaTopicConfig {
    param([hashtable]$Topic)
    $desc = docker exec ams-kafka kafka-configs --bootstrap-server kafka:9092 --describe --entity-type topics --entity-name $Topic.Name 2>&1 | Out-String
    $bad = @()
    foreach ($kv in ($Topic.Config -split ",")) {
        $kv = $kv.Trim()
        if (-not $kv) { continue }
        $key = ($kv -split "=")[0]
        # min.insync.replicas=1 / defaults may not be listed as dynamic overrides; only
        # flag keys that ARE listed but with a different value, or retention/cleanup
        # keys missing entirely (those we always set explicitly).
        $mustBePresent = $key -in @("retention.ms", "cleanup.policy")
        if ($desc -match [regex]::Escape($key) + "=([^,\s]+)") {
            if ($Matches[1] -ne ($kv -split "=", 2)[1]) { $bad += "$kv (actual: $key=$($Matches[1]))" }
        }
        elseif ($mustBePresent) { $bad += "$kv (not set - broker default in effect)" }
    }
    if ($bad.Count -gt 0) {
        Write-Host "[Kafka] WARNING: $($Topic.Name) config mismatch: $($bad -join '; ')" -ForegroundColor Red
        return $false
    }
    return $true
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
    New-KafkaTopic -Topic $t
}

# ── Ensure-only tier (CPLM): create if missing, align config if present, never delete ──
foreach ($t in $ensureTopics) {
    if (Test-KafkaTopicExists -TopicName $t.Name) {
        Write-Host "[Kafka] Ensuring config on existing $($t.Name) (data preserved)..." -ForegroundColor Cyan
        Invoke-AmsKafkaExec -AllowFailure -Args @(
            "kafka-configs", "--bootstrap-server", "kafka:9092", "--alter",
            "--entity-type", "topics", "--entity-name", $t.Name,
            "--add-config", $t.Config
        ) | Out-Null
    }
    else {
        New-KafkaTopic -Topic $t
    }
}

# ── Verification pass — the create/alter calls above are -AllowFailure, so check ──
Write-Host ""
Write-Host "[Kafka] Verifying topic configs..." -ForegroundColor Cyan
$configFailures = 0
foreach ($t in ($allowedTopics + $ensureTopics)) {
    if (-not (Test-KafkaTopicExists -TopicName $t.Name)) {
        Write-Host "[Kafka] WARNING: $($t.Name) does not exist after create." -ForegroundColor Red
        $configFailures++
        continue
    }
    if (-not (Test-KafkaTopicConfig -Topic $t)) { $configFailures++ }
}

Write-Host ""
if ($configFailures -gt 0) {
    Write-Host "Topics ready with $configFailures config mismatch(es) - see warnings above." -ForegroundColor Yellow
    exit 1
}
Write-Host "Production topics ready (configs verified)." -ForegroundColor Cyan
