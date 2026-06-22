#Requires -Version 5.1
<#
.SYNOPSIS
  Prepares the Windows lab host for Classic OPC A&E (Integration Objects simulator + AMS gateway ACK).

.DESCRIPTION
  - Verifies SysWOW64\opcaeps.dll (OPC Foundation AE proxy/stub; required for IOPCEventServer)
  - Optionally starts Integration Objects OPC A&E Server Simulator
  - Prints remediation steps when components are missing
#>
param(
    [switch]$StartSimulator
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$installScript = Join-Path $PSScriptRoot 'install-opc-core-redist.ps1'
$stub = Join-Path $env:SystemRoot 'SysWOW64\opcaeps.dll'
$sim = Join-Path ${env:ProgramFiles(x86)} "Integration Objects\Integration Objects' OPC Server Simulators\OPC A&E Server Simulator\IntegrationObjectsOPCAEServerSimulator.exe"

Write-Host 'OPC A and E lab prerequisites' -ForegroundColor Cyan
Write-Host "  opcaeps.dll (32-bit): $(if (Test-Path $stub) { 'OK' } else { 'MISSING' })"
Write-Host "  AE simulator exe:     $(if (Test-Path $sim) { 'OK' } else { 'MISSING' })"

if (-not (Test-Path $stub)) {
    Write-Host ""
    Write-Host "Attempting repo-bundled OPC Core install ..." -ForegroundColor Yellow
    & $installScript -Quiet
    if (-not (Test-Path $stub)) {
        Write-Host "Install OPC Foundation Core Components OR bundle MSI/DLLs under:" -ForegroundColor Yellow
        Write-Host "  $repoRoot\third-party\opc-core-redist\"
        Write-Host "  Then run (elevated): $installScript"
        if (-not $StartSimulator) { exit 2 }
    }
}

if ($StartSimulator -and (Test-Path $sim)) {
    $running = Get-Process -Name IntegrationObjectsOPCAEServerSimulator -ErrorAction SilentlyContinue
    if (-not $running) {
        Start-Process -FilePath $sim | Out-Null
        Start-Sleep -Seconds 3
        Write-Host 'Started OPC A and E Server Simulator.' -ForegroundColor Green
    } else {
        Write-Host "OPC A and E Server Simulator already running (PID $($running.Id -join ','))." -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Gateway must be built/run as x86 (PlatformTarget in AMS.OpcGateway.csproj)." -ForegroundColor Cyan
Write-Host "OPC-AE admin Host: use machine name ($env:COMPUTERNAME), not 127.0.0.1."
Write-Host "ProgID: IntegrationObjects.OPCAEServer.Simulator.1"
if (-not (Test-Path $stub)) { exit 2 }
exit 0
