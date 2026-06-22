#Requires -Version 5.1
<#
.SYNOPSIS
  Copies OPC Core x86 DLLs from SysWOW64 into the repo bundle for production deployment.
#>
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$bundleX86 = Join-Path $repoRoot 'third-party\opc-core-redist\x86'
$sysWow = Join-Path $env:SystemRoot 'SysWOW64'
$required = @('opcaeps.dll', 'opccomn_ps.dll', 'opcproxy.dll')

New-Item -ItemType Directory -Force -Path $bundleX86 | Out-Null

$missing = @()
foreach ($name in $required) {
    $src = Join-Path $sysWow $name
    if (-not (Test-Path $src)) { $missing += $name; continue }
    Copy-Item -Path $src -Destination (Join-Path $bundleX86 $name) -Force
    Write-Host "Captured $name"
}

if ($missing.Count -gt 0) {
    Write-Host "Missing on this machine: $($missing -join ', ')" -ForegroundColor Yellow
    Write-Host "Install OPC Foundation Core Components first, then re-run this script."
    exit 2
}

Write-Host "Bundle ready: $bundleX86"
Write-Host "Ship with gateway; run install-opc-core-redist.ps1 on each production Windows edge host."
