#Requires -Version 5.1
<#
.SYNOPSIS
  Clean autonomous validation after storm — gateway ACK-only on :5050, long catch-up window.

.EXAMPLE
  # After storm already ran; skip reset, 3 min catch-up
  .\scripts\run-autonomous-validation.ps1 -SkipReset

.EXAMPLE
  # Full reset + storm + 5 min catch-up
  .\scripts\run-autonomous-validation.ps1 -CatchUpSec 300

.EXAMPLE
  # Gateway telemetry + live OPC (Honeywell / simulator)
  .\scripts\run-autonomous-validation.ps1 -IngestAuthority gateway -ExpectGatewayAckOnly:$false -CatchUpSec 120
#>
param(
    [int]$CatchUpSec = 180,
    [int]$StormCount = 17200,
    [switch]$SkipReset,
    [switch]$SkipUi,
    [switch]$FullReset
)

$valArgs = @{
    CatchUpSec           = $CatchUpSec
    StormCount           = $StormCount
    IngestAuthority      = "gateway"
    ExpectGatewayAckOnly = $true
    SkipUi               = $SkipUi
}
if ($SkipReset -or -not $FullReset) { $valArgs.SkipReset = $true }

Write-Host "Gateway: ACK-only on http://127.0.0.1:5050 (telemetry via storm -> Kafka, not gateway publish)" -ForegroundColor Cyan
Write-Host "Catch-up window: ${CatchUpSec}s`n" -ForegroundColor Cyan

& (Join-Path $PSScriptRoot "autonomous-ams-validation.ps1") @valArgs
exit $LASTEXITCODE
