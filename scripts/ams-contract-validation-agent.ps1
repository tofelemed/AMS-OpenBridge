#Requires -Version 5.1
<#
.SYNOPSIS
  AMS contract validation agent — health + contract violation detection (E2E plan §10).

.DESCRIPTION
  Verifies Kafka lag, Flink checkpoint health, DLQ size, SignalR health,
  and flags contract violations (missing eventTime, client commandIds, etc.).

.EXAMPLE
  .\scripts\ams-contract-validation-agent.ps1 -ReportPath .\validation\agent_report.json
#>
param(
    [string]$ApiBase = "http://127.0.0.1:8000",
    [string]$KafkaBootstrap = "localhost:9092",
    [string]$FlinkUrl = "http://localhost:8082",
    [string]$BearerToken = "dev",
    [int]$MaxKafkaLag = 5000,
    [int]$MaxDlqMessages = 1000,
    [string]$ReportPath = ""
)

$ErrorActionPreference = "Continue"
$Root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot "lib\AmsFlinkJob.ps1")
. (Join-Path $PSScriptRoot "lib\AmsContractChecks.ps1")

if (-not $ReportPath) {
    $ReportPath = Join-Path $PSScriptRoot "validation\agent_report_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
}

$results = @{}
$headers = Get-AmsAuthHeaders -BearerToken $BearerToken
$violations = @()

Write-Host "`n=== AMS Contract Validation Agent ===" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'u')`n" -ForegroundColor DarkGray

# ── Health checks ─────────────────────────────────────────────
Write-Host "[Health]" -ForegroundColor Yellow
$metrics = Get-AmsPipelineMetrics -ApiBase $ApiBase -Headers $headers

Write-E2eCheck -Name "API pipeline health" -Pass $metrics.ApiOk `
    -Detail $(if ($metrics.ApiOk) { "reachable" } else { "unreachable" }) -Results $results

Write-E2eCheck -Name "Kafka consumer lag" -Pass ($metrics.KafkaLag -ge 0 -and $metrics.KafkaLag -le $MaxKafkaLag) `
    -Detail "lag=$($metrics.KafkaLag) threshold=$MaxKafkaLag" -Results $results
if ($metrics.KafkaLag -gt $MaxKafkaLag) { $violations += "KAFKA_LAG_HIGH:$($metrics.KafkaLag)" }

Write-E2eCheck -Name "Flink job RUNNING" -Pass ($metrics.FlinkRunning -ge 1) `
    -Detail "running=$($metrics.FlinkRunning)" -Results $results

try {
    $overview = Invoke-RestMethod "$FlinkUrl/jobs/overview" -TimeoutSec 8
    $chk = @($overview.jobs | Where-Object { $_.state -eq "RUNNING" } | ForEach-Object {
        try {
            $d = Invoke-RestMethod "$FlinkUrl/jobs/$($_.jid)/checkpoints" -TimeoutSec 8
            $d.latest.completed -ne $null
        } catch { $false }
    })
    $cpOk = ($chk | Where-Object { $_ }).Count -ge 1
    Write-E2eCheck -Name "Flink checkpoint completed" -Pass $cpOk `
        -Detail $(if ($cpOk) { "recent checkpoint exists" } else { "no completed checkpoint" }) -Results $results
} catch {
    Write-E2eCheck -Name "Flink checkpoint completed" -Pass $false -Detail $_.Exception.Message -Results $results
}

Write-E2eCheck -Name "SignalR health" -Pass $metrics.SignalRHealthy `
    -Detail $(if ($metrics.SignalRHealthy) { "Healthy" } else { "degraded/unavailable" }) -Results $results

Write-E2eCheck -Name "DLQ raw-opc-events size" -Pass ($metrics.DlqRawCount -le $MaxDlqMessages) `
    -Detail "messages=$($metrics.DlqRawCount) threshold=$MaxDlqMessages" -Results $results
if ($metrics.DlqRawCount -gt $MaxDlqMessages) { $violations += "DLQ_GROWTH:$($metrics.DlqRawCount)" }

# ── Contract checks on live samples ───────────────────────────
Write-Host "`n[Contract samples]" -ForegroundColor Yellow

$raw = Get-KafkaTopicSample -Topic "raw-opc-events" -TimeoutMs 10000
$rawCheck = Test-RawOpcEventContract -Event $raw
Write-E2eCheck -Name "raw-opc-events contract" -Pass $rawCheck.Pass -Detail $rawCheck.Reason -Results $results
if (-not $rawCheck.Pass) { $violations += "RAW_EVENT_CONTRACT:$($rawCheck.Reason)" }

$state = Get-KafkaTopicSample -Topic "traverse.alarm.current-alarm-state" -TimeoutMs 10000
if ($state) {
    $stMs = $state.eventTimeEpochMs
    if (-not $stMs -and $state.eventTime) {
        try { $stMs = [DateTimeOffset]::Parse($state.eventTime).ToUnixTimeMilliseconds() } catch {}
    }
    $hasEventTime = ($null -ne $stMs -and $stMs -gt 0)
    Write-E2eCheck -Name "traverse.alarm.current-alarm-state eventTime" -Pass $hasEventTime `
        -Detail $(if ($hasEventTime) { "eventTimeEpochMs=$stMs" } else { "missing eventTime" }) -Results $results
    if (-not $hasEventTime) { $violations += "MISSING_EVENT_TIME:traverse.alarm.current-alarm-state" }
} else {
    Write-E2eCheck -Name "traverse.alarm.current-alarm-state sample" -Pass $false -Detail "no message in window" -Results $results
}

try {
    $active = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=20" -Headers $headers -TimeoutSec 20
    $fieldOk = $true
    $fieldDetail = @()
    foreach ($a in $active.items) {
        $fc = Test-ApiAlarmContractFields -Alarm $a
        if (-not $fc.Pass) { $fieldOk = $false; $fieldDetail += "$($a.sourceName): $($fc.Reason)" }
    }
    Write-E2eCheck -Name "API alarm identity fields" -Pass ($fieldOk -or $active.items.Count -eq 0) `
        -Detail $(if ($fieldOk) { "checked $($active.items.Count) rows" } else { ($fieldDetail -join "; ") }) -Results $results
    if (-not $fieldOk) { $violations += "API_IDENTITY_FIELDS" }
} catch {
    Write-E2eCheck -Name "API alarm identity fields" -Pass $false -Detail $_.Exception.Message -Results $results
}

# Scan traverse.alarm.operator-actions for client commandIds (contract violation)
Write-Host "`n[ACK identity scan]" -ForegroundColor Yellow
$opLines = docker exec ams-kafka kafka-console-consumer `
    --bootstrap-server $KafkaBootstrap `
    --topic traverse.alarm.operator-actions `
    --timeout-ms 8000 `
    --max-messages 30 2>&1
$clientCmd = @($opLines | Where-Object { $_ -match '"commandId"\s*:\s*"ui-' })
Write-E2eCheck -Name "No client ui-* commandIds in traverse.alarm.operator-actions" -Pass ($clientCmd.Count -eq 0) `
    -Detail $(if ($clientCmd.Count -eq 0) { "clean sample" } else { "found $($clientCmd.Count) ui-* commandId(s)" }) -Results $results
if ($clientCmd.Count -gt 0) { $violations += "CLIENT_COMMAND_ID:traverse.alarm.operator-actions" }

# Historical API event-time sort
try {
    $from = (Get-Date).AddHours(-24).ToUniversalTime().ToString("o")
    $to = (Get-Date).ToUniversalTime().ToString("o")
    $hist = Invoke-RestMethod "$ApiBase/api/v1/alarms/historical?from=$([uri]::EscapeDataString($from))&to=$([uri]::EscapeDataString($to))&pageSize=5&sortBy=EventTime&sortDescending=true" `
        -Headers $headers -TimeoutSec 20
    Write-E2eCheck -Name "Historical API query" -Pass $true `
        -Detail "total=$($hist.totalCount)" -Results $results
} catch {
    Write-E2eCheck -Name "Historical API query" -Pass $false -Detail $_.Exception.Message -Results $results
}

# ── Summary ───────────────────────────────────────────────────
$report = Export-E2eReport -Results $results -ReportPath $ReportPath
$report | Add-Member -NotePropertyName violations -NotePropertyValue $violations -Force
$report | ConvertTo-Json -Depth 6 | Set-Content -Path $ReportPath -Encoding UTF8

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Agent: $($report.passed)/$($report.total) checks passed" -ForegroundColor $(if ($report.failed -eq 0) { "Green" } else { "Yellow" })
if ($violations.Count -gt 0) {
    Write-Host "Contract violations: $($violations -join ', ')" -ForegroundColor Red
} else {
    Write-Host "Contract violations: none in sample window" -ForegroundColor Green
}
Write-Host "Report: $ReportPath" -ForegroundColor DarkGray
Write-Host "========================================`n" -ForegroundColor Cyan

if ($report.failed -gt 0) { exit 1 }
exit 0
