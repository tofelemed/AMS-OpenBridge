#Requires -Version 5.1
<#
.SYNOPSIS
  Incident reconstruction — timeline for asset/family between T1 and T2.

.DESCRIPTION
  Builds structured truth traces from lifecycle transitions API + optional Kafka sample.
  Feeds incident reconstruction UI (production-contracts §12.3).

.EXAMPLE
  .\scripts\incident-reconstruct.ps1 -SourceName "E2E/Motor_01_Overload" -HoursBack 24
  .\scripts\incident-reconstruct.ps1 -LogicalAlarmFamilyId "guid|tag|cond|" -From "2026-05-30T00:00:00Z"
#>
param(
    [string]$ApiBase = "http://127.0.0.1:8000",
    [string]$BearerToken = "dev",
    [string]$SourceName = "",
    [string]$LogicalAlarmFamilyId = "",
    [string]$ServerId = "",
    [int]$HoursBack = 0,
    [datetime]$From = ([datetime]::MinValue),
    [datetime]$To = ([datetime]::UtcNow),
    [string]$OutputPath = "",
    [switch]$IncludeKafkaSample
)

function Get-PropValue {
    param($Object, [string[]]$Names)
    foreach ($n in $Names) {
        if ($Object.PSObject.Properties.Name -contains $n) {
            $v = $Object.$n
            if ($null -ne $v -and "$v" -ne "") { return $v }
        }
    }
    return $null
}

$ErrorActionPreference = "Continue"
$headers = @{ Authorization = "Bearer $BearerToken" }

if ($HoursBack -gt 0) {
    $From = [datetime]::UtcNow.AddHours(-$HoursBack)
} elseif ($From -eq [datetime]::MinValue) {
    $From = [datetime]::UtcNow.AddHours(-24)
}

if (-not $OutputPath) {
    $OutputPath = Join-Path $PSScriptRoot "validation\incident_$(Get-Date -Format 'yyyyMMdd_HHmmss').ndjson"
}

$fromIso = $From.ToUniversalTime().ToString("o")
$toIso = $To.ToUniversalTime().ToString("o")

Write-Host "`n=== Incident Reconstruction ===" -ForegroundColor Cyan
Write-Host "Window: $fromIso -> $toIso" -ForegroundColor DarkGray

$events = New-Object System.Collections.Generic.List[object]

# Transitions API (authoritative SOE trail in DB)
try {
    $uri = "$ApiBase/api/v1/alarms/transitions?from=$([uri]::EscapeDataString($fromIso))&to=$([uri]::EscapeDataString($toIso))&pageSize=500"
    if ($SourceName) { $uri += "&sourceNameContains=$([uri]::EscapeDataString($SourceName))" }
    $trans = Invoke-RestMethod -Uri $uri -Headers $headers -TimeoutSec 60
    foreach ($item in $trans.items) {
        $row = @{
            source = "transitions-api"
            timeAuthority = "eventTime"
            eventTime = Get-PropValue $item @("eventTime", "EventTime")
            alarmId = Get-PropValue $item @("alarmId", "AlarmId")
            fromState = Get-PropValue $item @("fromState", "FromState")
            toState = Get-PropValue $item @("toState", "ToState")
            sourceName = Get-PropValue $item @("sourceName", "SourceName")
            conditionName = Get-PropValue $item @("conditionName", "ConditionName")
            resolutionDomain = Get-PropValue $item @("resolutionDomain", "ResolutionDomain")
        }
        if ($LogicalAlarmFamilyId -and $row.sourceName -and $ServerId) {
            $family = "$ServerId|$($row.sourceName)|$($row.conditionName)|"
            if ($family -ne $LogicalAlarmFamilyId -and $LogicalAlarmFamilyId -notmatch [regex]::Escape($row.sourceName)) { continue }
        }
        $events.Add($row)
    }
    $total = Get-PropValue $trans @("totalCount", "TotalCount")
    Write-Host "  transitions-api: $($trans.items.Count) rows (total $total)" -ForegroundColor DarkGray
} catch {
    Write-Warning "transitions API: $($_.Exception.Message)"
}

# Optional Kafka lifecycle-events sample
if ($IncludeKafkaSample) {
    $lines = docker exec ams-kafka kafka-console-consumer `
        --bootstrap-server localhost:9092 `
        --topic lifecycle-events `
        --timeout-ms 10000 `
        --max-messages 100 2>&1
    foreach ($line in $lines) {
        $json = ($line -replace '^[^\{]*', '').Trim()
        if ($json -notmatch '^\{') { continue }
        try {
            $o = $json | ConvertFrom-Json
            $events.Add(@{
                source = "kafka:lifecycle-events"
                timeAuthority = "eventTime"
                eventTimeEpochMs = Get-PropValue $o @("timestampEpochMs", "TimestampEpochMs")
                alarmId = Get-PropValue $o @("alarmId", "AlarmId")
                lifecycleState = Get-PropValue $o @("lifecycleState", "LifecycleState")
                commandId = Get-PropValue $o @("commandId", "CommandId")
            })
        } catch {}
    }
    Write-Host "  kafka lifecycle sample appended" -ForegroundColor DarkGray
}

# Sort by event time
$sorted = $events | Sort-Object {
    if ($_.eventTime) { [datetimeoffset]::Parse($_.eventTime).UtcDateTime }
    elseif ($_.eventTimeEpochMs) { [datetimeoffset]::FromUnixTimeMilliseconds([long]$_.eventTimeEpochMs).UtcDateTime }
    else { [datetime]::MinValue }
}

$dir = Split-Path $OutputPath -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

$sorted | ForEach-Object { ($_ | ConvertTo-Json -Compress) } | Set-Content -Path $OutputPath -Encoding UTF8

Write-Host "Exported $($sorted.Count) events -> $OutputPath" -ForegroundColor Green
Write-Host "Use with readiness/E2E reports in scripts/validation/ for full forensic context.`n" -ForegroundColor DarkGray
