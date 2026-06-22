#Requires -Version 5.1
<#
.SYNOPSIS
  Golden startup verification â€” readiness score gate after stack bring-up.

.EXAMPLE
  .\scripts\Invoke-AmsGoldenStartupVerify.ps1
  .\scripts\Invoke-AmsGoldenStartupVerify.ps1 -RunFullE2E -MinScore 85
#>
param(
    [string]$ApiBase = "http://127.0.0.1:8000",
    [string]$BearerToken = "dev",
    [int]$MinScore = 85,
    [switch]$RunFullE2E,
    [switch]$UseLiveScoreOnly,
    [string]$ReportPath = ""
)

$ErrorActionPreference = "Stop"

function Test-LiveReadinessScore {
    param([string]$Base, [string]$Token, [int]$Threshold)
    $headers = @{ Authorization = "Bearer $Token" }
    $h = Invoke-RestMethod -Uri "$Base/api/v1/health/pipeline" -Headers $headers -TimeoutSec 30
    if (-not $h.readiness) {
        Write-Host "  [WARN] Live readiness not exposed by API â€” falling back to agent checks" -ForegroundColor Yellow
        return $null
    }
    Write-Host ("  Live readiness: {0}/100  gate={1}" -f $h.readiness.overallScore, $h.readiness.gateStatus) -ForegroundColor Cyan
    Write-Host ("  Recommendation: {0}" -f $h.readiness.recommendation) -ForegroundColor DarkGray
    if ($h.streampipes.readinessState) {
        Write-Host ("  StreamPipes: {0} - {1}" -f $h.streampipes.readinessState, $h.streampipes.detail) -ForegroundColor DarkGray
    }
    return @{
        overallScore = [int]$h.readiness.overallScore
        gateStatus = [string]$h.readiness.gateStatus
        pass = ([int]$h.readiness.overallScore -ge $Threshold)
    }
}

Write-Host "`n=== Golden Startup Verification ===" -ForegroundColor Cyan

if ($UseLiveScoreOnly) {
    $live = Test-LiveReadinessScore -Base $ApiBase -Token $BearerToken -Threshold $MinScore
    if ($null -eq $live) { exit 1 }
    if (-not $live.pass) {
        Write-Host ('Golden verify FAIL: live score {0} < {1}' -f $live.overallScore, $MinScore) -ForegroundColor Red
        exit 1
    }
    Write-Host "Golden verify PASS (live probes)" -ForegroundColor Green
    exit 0
}

$scoreArgs = @{
    ApiBase = $ApiBase
    BearerToken = $BearerToken
}
if ($RunFullE2E) { $scoreArgs.RunFullE2E = $true }
if ($ReportPath) { $scoreArgs.ReportPath = $ReportPath }

& (Join-Path $PSScriptRoot "ams-readiness-score.ps1") @scoreArgs
$agentExit = $LASTEXITCODE

$live = Test-LiveReadinessScore -Base $ApiBase -Token $BearerToken -Threshold $MinScore
if ($null -ne $live -and -not $live.pass) {
    Write-Host ('Golden verify FAIL: live score {0} < {1}' -f $live.overallScore, $MinScore) -ForegroundColor Red
    exit 1
}

if ($agentExit -ne 0) {
    Write-Host "Golden verify FAIL: agent/E2E readiness below threshold or violations present" -ForegroundColor Red
    exit 1
}

Write-Host ('Golden verify PASS (agent + live probes >= {0})' -f $MinScore) -ForegroundColor Green
exit 0
