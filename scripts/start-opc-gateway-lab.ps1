#Requires -Version 5.1
<#
.SYNOPSIS
  Starts OPC Gateway for lab with correct Kafka EXTERNAL listener (127.0.0.1:9093).
  Clears stale Kafka__BootstrapServers machine env that overrides appsettings.
.EXAMPLE
  .\scripts\start-opc-gateway-lab.ps1
#>
$ErrorActionPreference = 'Stop'
$gwDir = 'e:\AMS - HMI GRID\src\opc-gateway\AMS.OpcGateway\bin\Release\net8.0'
$exe = Join-Path $gwDir 'AMS.OpcGateway.exe'
if (-not (Test-Path $exe)) {
    Write-Host 'Building OPC Gateway...' -ForegroundColor Yellow
    Push-Location 'e:\AMS - HMI GRID\src\opc-gateway\AMS.OpcGateway'
    dotnet build -c Release
    Pop-Location
}
Get-Process AMS.OpcGateway -ErrorAction SilentlyContinue | Stop-Process -Force
$env:Kafka__BootstrapServers = '127.0.0.1:9093'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
Start-Process $exe -WorkingDirectory $gwDir
Start-Sleep -Seconds 6
$body = @{
    ServerId = '7ce5ecbf-70c9-498d-b899-5c8bb7add383'
    Name     = 'Local IO Simulator'
    Host     = $env:COMPUTERNAME
    ProgId   = 'IntegrationObjects.OPCAEServer.Simulator.1'
} | ConvertTo-Json
try {
    $r = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:5050/opc/servers/connect' -ContentType 'application/json' -Body $body -TimeoutSec 15
    Write-Host "Gateway: $($r.message)" -ForegroundColor $(if ($r.success) { 'Green' } else { 'Red' })
} catch {
    Write-Host "Gateway connect failed: $_" -ForegroundColor Red
}
Write-Host 'Kafka bootstrap for gateway: 127.0.0.1:9093 (EXTERNAL listener)' -ForegroundColor Cyan
