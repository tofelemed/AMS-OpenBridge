# Deprecated: IntegrationObjects / QuickOPC path removed.
# Use: scripts/test-e2e-streampipes.ps1
Write-Host "This script is deprecated (QuickOPC / OPC Classic A&E removed)." -ForegroundColor Yellow
Write-Host "Running: scripts/test-e2e-streampipes.ps1 -InjectLabEvents`n" -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "test-e2e-streampipes.ps1") -InjectLabEvents @args
