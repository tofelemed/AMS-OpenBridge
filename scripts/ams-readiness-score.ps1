#Requires -Version 5.1
<#
.SYNOPSIS
  Production cutover confidence scoring — per-subsystem readiness from live verification.

.DESCRIPTION
  Runs contract validation agent checks, aggregates subsystem scores (0-100),
  and emits cutover recommendation. Structured JSON reports feed incident reconstruction.

.EXAMPLE
  .\scripts\ams-readiness-score.ps1
  .\scripts\ams-readiness-score.ps1 -RunFullE2E -InjectLabEvents
#>
param(
    [string]$ApiBase = "http://127.0.0.1:8000",
    [string]$BearerToken = "dev",
    [switch]$RunFullE2E,
    [switch]$InjectLabEvents,
    [string]$ReportPath = ""
)

$ErrorActionPreference = "Continue"
. (Join-Path $PSScriptRoot "lib\AmsFlinkJob.ps1")
. (Join-Path $PSScriptRoot "lib\AmsContractChecks.ps1")
. (Join-Path $PSScriptRoot "lib\AmsReadinessScore.ps1")

if (-not $ReportPath) {
    $ReportPath = Join-Path $PSScriptRoot "validation\readiness_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
}

$allChecks = @{}
$allViolations = @()

if ($RunFullE2E) {
    $e2eReport = Join-Path $PSScriptRoot "validation\e2e_for_readiness.json"
    & (Join-Path $PSScriptRoot "e2e-full-system-test.ps1") `
        -ApiBase $ApiBase -BearerToken $BearerToken `
        -ReportPath $e2eReport `
        -SkipFailureScenarios `
        $(if ($InjectLabEvents) { "-InjectLabEvents" } else { "" })
    if (Test-Path $e2eReport) {
        $e2e = Get-Content $e2eReport -Raw | ConvertFrom-Json
        foreach ($prop in $e2e.checks.PSObject.Properties) {
            $allChecks[$prop.Name] = @{
                Pass = $prop.Value.Pass
                Detail = $prop.Value.Detail
            }
        }
    }
} else {
    $agentReport = Join-Path $PSScriptRoot "validation\agent_for_readiness.json"
    & (Join-Path $PSScriptRoot "ams-contract-validation-agent.ps1") `
        -ApiBase $ApiBase -BearerToken $BearerToken -ReportPath $agentReport
    if (Test-Path $agentReport) {
        $agent = Get-Content $agentReport -Raw | ConvertFrom-Json
        foreach ($prop in $agent.checks.PSObject.Properties) {
            $allChecks[$prop.Name] = @{
                Pass = $prop.Value.Pass
                Detail = $prop.Value.Detail
            }
        }
        if ($agent.violations) { $allViolations = @($agent.violations) }
    }
}

$subsystemMap = Get-DefaultSubsystemMap
$readiness = Build-AmsReadinessReport -Checks $allChecks -Violations $allViolations -SubsystemChecks $subsystemMap

Write-AmsReadinessSummary -Report $readiness

$dir = Split-Path $ReportPath -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$readiness | ConvertTo-Json -Depth 8 | Set-Content -Path $ReportPath -Encoding UTF8
Write-Host "Report: $ReportPath" -ForegroundColor DarkGray

if ($readiness.overallScore -lt $readiness.cutoverThreshold -or $readiness.violationCount -gt 0) { exit 1 }
exit 0
