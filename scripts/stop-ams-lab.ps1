#Requires -Version 5.1
<#
.SYNOPSIS
  Stops host AMS processes started by start-ams-lab.ps1 (does not tear down Docker).
#>
param(
    [switch]$DockerDown
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "Stopping host processes..." -ForegroundColor Yellow
Get-Process -Name "AMS.Api" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

if ($DockerDown) {
    Write-Host "Stopping Docker stack..." -ForegroundColor Yellow
    Push-Location (Join-Path $root "infra\docker")
    try { docker compose down } finally { Pop-Location }
}

Write-Host "Done." -ForegroundColor Green
