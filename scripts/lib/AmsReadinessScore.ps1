#Requires -Version 5.1
<#
.SYNOPSIS
  Compute production cutover readiness scores per subsystem from E2E/agent check results.
#>

function Get-AmsSubsystemWeights {
    return [ordered]@{
        ingest     = 0.15
        kafka      = 0.15
        flink      = 0.20
        ack        = 0.15
        database   = 0.10
        uiProjection = 0.15
        contracts  = 0.10
    }
}

function Get-AmsCheckScore {
    param([bool]$Pass, [int]$Partial = 0)
    if ($Pass) { return 100 }
    if ($Partial -gt 0) { return [Math]::Min(99, $Partial) }
    return 0
}

function Build-AmsReadinessReport {
    param(
        [hashtable]$Checks,
        [string[]]$Violations = @(),
        [hashtable]$SubsystemChecks
    )

    $weights = Get-AmsSubsystemWeights
    $subsystems = [ordered]@{}
    $totalWeight = 0.0
    $weightedSum = 0.0

    foreach ($name in $SubsystemChecks.Keys) {
        $keys = $SubsystemChecks[$name]
        $passed = 0
        $count = 0
        foreach ($k in $keys) {
            if (-not $Checks.ContainsKey($k)) { continue }
            $count++
            if ($Checks[$k].Pass) { $passed++ }
        }
        $score = if ($count -eq 0) { 0 } else { [int][Math]::Round(100.0 * $passed / $count) }
        $subsystems[$name] = @{
            score = $score
            checksPassed = $passed
            checksTotal = $count
            weight = $weights[$name]
        }
        if ($weights.Contains($name)) {
            $w = [double]$weights[$name]
            $totalWeight += $w
            $weightedSum += $w * $score
        }
    }

    $overall = if ($totalWeight -gt 0) { [int][Math]::Round($weightedSum / $totalWeight) } else { 0 }
    $cutoverThreshold = 85
    $recommendation = if ($overall -ge $cutoverThreshold -and $Violations.Count -eq 0) {
        "READY_FOR_CUTOVER"
    } elseif ($overall -ge 70) {
        "CONDITIONAL - resolve violations before DCS cutover"
    } else {
        "NOT_READY - subsystem scores below threshold"
    }

    return @{
        generatedAt = (Get-Date).ToUniversalTime().ToString("o")
        overallScore = $overall
        cutoverThreshold = $cutoverThreshold
        recommendation = $recommendation
        violationCount = $Violations.Count
        violations = $Violations
        subsystems = $subsystems
        characterization = "Runtime verification for a distributed event-sourced industrial control platform"
    }
}

function Write-AmsReadinessSummary {
    param([hashtable]$Report)

    Write-Host "`n=== Production Cutover Readiness ===" -ForegroundColor Cyan
    Write-Host ("Overall: {0}/100  (threshold {1})" -f $Report.overallScore, $Report.cutoverThreshold) `
        -ForegroundColor $(if ($Report.overallScore -ge $Report.cutoverThreshold) { "Green" } else { "Yellow" })
    Write-Host ("Recommendation: {0}" -f $Report.recommendation) -ForegroundColor Cyan
    if ($Report.violationCount -gt 0) {
        Write-Host ("Contract violations: {0}" -f ($Report.violations -join ", ")) -ForegroundColor Red
    }
    Write-Host "`nSubsystem scores:" -ForegroundColor DarkGray
    foreach ($name in $Report.subsystems.Keys) {
        $s = $Report.subsystems[$name]
        Write-Host ("  {0,-14} {1,3}/100  ({2}/{3} checks, weight {4:P0})" -f `
            $name, $s.score, $s.checksPassed, $s.checksTotal, $s.weight)
    }
    Write-Host ""
}

function Get-DefaultSubsystemMap {
    return @{
        ingest = @(
            "raw-opc-events contract fields", "raw-opc-events contract",
            "Instance key v1 pattern", "Lab event inject"
        )
        kafka = @(
            "Required Kafka topics", "Kafka consumer lag", "DLQ raw-opc-events size"
        )
        flink = @(
            "Flink OpcEventStreamJob RUNNING", "Flink job RUNNING",
            "Flink checkpoint completed", "traverse.alarm.current-alarm-state projection"
        )
        ack = @(
            "Full ACK pipeline E2E", "No client ui-* commandIds in traverse.alarm.operator-actions"
        )
        database = @(
            "No duplicate active identity rows"
        )
        uiProjection = @(
            "SignalR hub healthy", "SignalR health", "UI contract fields (REST)",
            "API alarm identity fields", "Historical viewer API"
        )
        contracts = @(
            "Validation agent", "FINAL ACCEPTANCE"
        )
    }
}
