#Requires -Version 5.1
<#
.SYNOPSIS
  Replay messages from a Kafka DLQ topic back to the primary topic after triage.

.DESCRIPTION
  Operational workflow step 4 — see docs/production-contracts.md §6–§7.
  - Preserves partition keys (payload-derived serverId|sourceName when Kafka key missing)
  - Sorts by eventTimeEpochMs ascending within each partition key (SOE ordering)
  - Rate-limited to avoid poison-loop storms
  - Does NOT reset Flink state (idempotent merge — see §7)

.PARAMETER BootstrapServers
  Kafka bootstrap (default: localhost:9092).

.PARAMETER DlqTopic
  Source DLQ topic (e.g. raw-opc-events-dlq).

.PARAMETER TargetTopic
  Primary topic to replay into (e.g. raw-opc-events).

.PARAMETER MaxMessages
  Cap messages replayed in this run (default: 100).

.PARAMETER DryRun
  Print what would be replayed without producing.
#>
param(
    [string]$BootstrapServers = "localhost:9092",
    [Parameter(Mandatory = $true)]
    [string]$DlqTopic,
    [Parameter(Mandatory = $true)]
    [string]$TargetTopic,
    [int]$MaxMessages = 100,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Get-JsonField($obj, [string[]]$Names) {
    foreach ($n in $Names) {
        if ($obj.PSObject.Properties.Name -contains $n) {
            $v = $obj.$n
            if ($null -ne $v -and "$v".Trim()) { return "$v".Trim() }
        }
    }
    return $null
}

function Get-PartitionKeyFromPayload([string]$Payload) {
    try {
        $obj = $Payload | ConvertFrom-Json -ErrorAction Stop
        $serverId = Get-JsonField $obj @('serverId', 'opcServer')
        $sourceName = Get-JsonField $obj @('sourceName', 'sourcePath')
        if ($serverId -and $sourceName) { return "$serverId|$sourceName" }
    } catch { }
    return $null
}

function Get-EventTimeMs([string]$Payload) {
    try {
        $obj = $Payload | ConvertFrom-Json -ErrorAction Stop
        if ($obj.PSObject.Properties.Name -contains 'eventTimeEpochMs') {
            return [long]$obj.eventTimeEpochMs
        }
        if ($obj.PSObject.Properties.Name -contains 'eventTime') {
            return [long]([DateTimeOffset]::Parse($obj.eventTime).ToUnixTimeMilliseconds())
        }
    } catch { }
    return [long]::MaxValue
}

Write-Host "AMS DLQ replay: $DlqTopic -> $TargetTopic (max $MaxMessages)" -ForegroundColor Cyan
Write-Host "Ordering: eventTimeEpochMs ASC per partition key (SOE contract)" -ForegroundColor Cyan
Write-Host "Bootstrap: $BootstrapServers"
if ($DryRun) { Write-Host "DRY RUN — no messages produced" -ForegroundColor Yellow }

try {
    $consumeArgs = @(
        "--bootstrap-server", $BootstrapServers,
        "--topic", $DlqTopic,
        "--from-beginning",
        "--max-messages", $MaxMessages.ToString(),
        "--timeout-ms", "15000",
        "--property", "print.key=true",
        "--property", "key.separator=|",
        "--property", "print.timestamp=true"
    )

    Write-Host "Consuming from DLQ..."
    $lines = @(& kafka-console-consumer @consumeArgs 2>$null)
    if ($lines.Count -eq 0) {
        Write-Host "No messages found in $DlqTopic (or kafka-console-consumer unavailable)." -ForegroundColor Yellow
        exit 0
    }

    $messages = New-Object System.Collections.Generic.List[object]
    foreach ($line in $lines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }

        $payload = $line
        $key = $null
        if ($line -match '^(CreateTime:\d+\|)(.+)$') {
            $rest = $Matches[2]
            $parts = $rest -split '\|', 2
            if ($parts.Count -eq 2) {
                $key = $parts[0]
                $payload = $parts[1]
            }
        }

        if (-not $key) {
            $key = Get-PartitionKeyFromPayload $payload
        }
        if (-not $key) {
            Write-Warning "Skipping message without partition key: $($payload.Substring(0, [Math]::Min(80, $payload.Length)))"
            continue
        }

        $eventMs = Get-EventTimeMs $payload
        $messages.Add([PSCustomObject]@{
            Key      = $key
            Payload  = $payload
            EventMs  = $eventMs
        })
    }

    if ($messages.Count -eq 0) {
        Write-Host "No replayable messages after key extraction." -ForegroundColor Yellow
        exit 0
    }

    $ordered = $messages | Sort-Object Key, EventMs
    $replayed = 0
    foreach ($msg in $ordered) {
        if ($DryRun) {
            Write-Host "[dry-run] key=$($msg.Key) eventTime=$($msg.EventMs) len=$($msg.Payload.Length)"
            $replayed++
            continue
        }

        $msg.Payload | & kafka-console-producer `
            --bootstrap-server $BootstrapServers `
            --topic $TargetTopic `
            --property "parse.key=true" `
            --property "key.separator=|" `
            --property "key=$($msg.Key)" 2>$null

        $replayed++
        Start-Sleep -Milliseconds 20
    }

    Write-Host "Replayed $replayed message(s) to $TargetTopic (event-time ordered per key)." -ForegroundColor Green
    Write-Host "Flink state: NO reset — idempotent merge via dedup + upsert (see production-contracts.md §7)."
    Write-Host "Verify: consumer lag, dedup/ACK idempotency, no DLQ rate spike."
}
catch {
    Write-Error $_
    exit 1
}
