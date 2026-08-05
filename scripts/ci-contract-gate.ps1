#Requires -Version 5.1
<#
.SYNOPSIS
  CI contract gate (Windows) — static contract verification without live Kafka/Flink.

.EXAMPLE
  .\scripts\ci-contract-gate.ps1
#>
param(
    [switch]$SkipFrontendBuild
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$failed = 0

function Assert-Pass($Name, [scriptblock]$Test) {
    try {
        $ok = & $Test
        if ($ok) {
            Write-Host "  [PASS] $Name" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] $Name" -ForegroundColor Red
            $script:failed++
        }
    } catch {
        Write-Host "  [FAIL] $Name - $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
    }
}

Write-Host "`n=== AMS CI Contract Gate ===" -ForegroundColor Cyan

Write-Host "`n[Docs]" -ForegroundColor Yellow
Assert-Pass "production-contracts.md" { Test-Path "$Root\docs\production-contracts.md" }
Assert-Pass "e2e-testing-plan.md" { Test-Path "$Root\docs\e2e-testing-plan.md" }
Assert-Pass "truth domain documented" {
    (Get-Content "$Root\docs\production-contracts.md" -Raw) -match "Truth Domain Resolver Priority"
}

Write-Host "`n[Frontend static]" -ForegroundColor Yellow
$mappers = Get-Content "$Root\src\frontend\src\api\alarmMappers.ts" -Raw
Assert-Pass "no Date.now eventTime fallback" { $mappers -notmatch 'eventTimeEpochMs.*Date\.now\(\)' }
$console = Get-Content "$Root\src\frontend\src\components\AlarmConsole\AlarmConsole.tsx" -Raw
Assert-Pass "no client ui-* commandId" { $console -notmatch 'ui-\$\{' }
Assert-Pass "alarmReconciliation.ts" { Test-Path "$Root\src\frontend\src\utils\alarmReconciliation.ts" }

Write-Host "`n[Scripts]" -ForegroundColor Yellow
foreach ($s in @("e2e-full-system-test.ps1", "ams-contract-validation-agent.ps1", "ams-readiness-score.ps1")) {
    Assert-Pass "scripts/$s" { Test-Path "$Root\scripts\$s" }
}

Write-Host "`n[.NET]" -ForegroundColor Yellow
$testProj = Join-Path $Root "src\backend\AMS.Tests.Contract\AMS.Tests.Contract.csproj"
if (Test-Path $testProj) {
    dotnet test $testProj -c Release --filter "FullyQualifiedName~NormalizedAlarmEventJson" -v q
    if ($LASTEXITCODE -eq 0) { Write-Host "  [PASS] NormalizedAlarmEventJson tests" -ForegroundColor Green }
    else { Write-Host "  [FAIL] NormalizedAlarmEventJson tests" -ForegroundColor Red; $failed++ }
} else {
    Write-Host "  [SKIP] AMS.Tests.Contract.csproj not found" -ForegroundColor Yellow
}

if (-not $SkipFrontendBuild) {
    Write-Host "`n[Frontend tsc]" -ForegroundColor Yellow
    Push-Location "$Root\src\frontend"
    try {
        npx tsc --noEmit 2>$null
        if ($LASTEXITCODE -eq 0) { Write-Host "  [PASS] tsc --noEmit" -ForegroundColor Green }
        else { Write-Host "  [FAIL] tsc --noEmit" -ForegroundColor Red; $failed++ }
    } finally { Pop-Location }
}

Write-Host "`n========================================" -ForegroundColor Cyan
if ($failed -eq 0) { Write-Host "CI contract gate: PASS" -ForegroundColor Green; exit 0 }
Write-Host "CI contract gate: FAIL ($failed)" -ForegroundColor Red
exit 1
