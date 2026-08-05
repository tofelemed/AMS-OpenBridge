#Requires -Version 5.1
<#
.SYNOPSIS
  Installs OPC Core Components for Classic OPC A&E (opcaeps.dll in SysWOW64).

.DESCRIPTION
  1. Silent-install MSI from third-party/opc-core-redist/installers/ if present.
  2. Else copy + regsvr32 bundled x86 DLLs from third-party/opc-core-redist/x86/.
  3. Else print download instructions.

  Run elevated (Administrator) for SysWOW64 copy/register.
#>
param(
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$downloadsOpc = Join-Path $env:USERPROFILE 'Downloads\opc-core-components-redistributables-3.1.1-20260317'
$installers = Join-Path $repoRoot 'third-party\opc-core-redist\installers'
if (-not (Get-ChildItem $installers -Filter '*.msi' -ErrorAction SilentlyContinue) -and (Test-Path $downloadsOpc)) {
    New-Item -ItemType Directory -Force -Path $installers | Out-Null
    Get-ChildItem $downloadsOpc -Filter '*.msi' | Copy-Item -Destination $installers -Force -ErrorAction SilentlyContinue
}
$bundleX86 = Join-Path $repoRoot 'third-party\opc-core-redist\x86'
$sysWow = Join-Path $env:SystemRoot 'SysWOW64'
$targetStub = Join-Path $sysWow 'opcaeps.dll'
$iopcEventServerIid = '{65168851-5783-11D1-84A0-00608CB8A7E9}'
$interfaceReg = "HKLM:\SOFTWARE\WOW6432Node\Classes\Interface\$iopcEventServerIid"

function Write-Info($msg) { if (-not $Quiet) { Write-Host $msg } }

function Test-OpcAeMarshalingComplete {
    (Test-Path $targetStub) -and (Test-Path $interfaceReg)
}

if (Test-OpcAeMarshalingComplete) {
    Write-Info "OPC A&E marshaling OK (opcaeps.dll + IOPCEventServer interface registered)."
    exit 0
}

if ((Test-Path $targetStub) -and -not (Test-Path $interfaceReg)) {
    Write-Host "opcaeps.dll exists but IOPCEventServer is NOT registered — need full MSI install (regsvr32 alone is insufficient)." -ForegroundColor Yellow
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)

# Prefer x64 MSI on 64-bit Windows (includes all x86 components + proper interface registration).
$msi = Get-ChildItem -Path $installers -Filter '*x64.msi' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $msi) {
    $msi = Get-ChildItem -Path $installers -Filter '*.msi' -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($msi) {
    Write-Info "Installing OPC Core from $($msi.FullName) ..."
    if (-not $isAdmin) {
        Write-Host "Re-run as Administrator to install MSI." -ForegroundColor Yellow
        exit 3
    }
    $args = if (Test-Path $targetStub) { "/fa `"$($msi.FullName)`" /qn /norestart" } else { "/i `"$($msi.FullName)`" /qn /norestart" }
    $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList $args -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) {
        Write-Host "msiexec exit code: $($p.ExitCode)" -ForegroundColor Red
        exit $p.ExitCode
    }
    if (Test-OpcAeMarshalingComplete) {
        Write-Info "Installed. opcaeps.dll and IOPCEventServer interface are registered."
        exit 0
    }
    Write-Host "MSI completed but IOPCEventServer interface still missing. Reboot and re-run, or repair from Programs and Features." -ForegroundColor Yellow
}

function Import-OpcCoreBundleFromMsi {
    param([string]$MsiPath, [string]$BundleDir)
    $extractRoot = Join-Path $repoRoot 'third-party\opc-core-redist\extracted'
    New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
    $p = Start-Process msiexec.exe -ArgumentList "/a","`"$MsiPath`"","TARGETDIR=`"$extractRoot`"","/qn" -Wait -PassThru
    if ($p.ExitCode -ne 0) { return $false }
    $systemDir = Join-Path $extractRoot 'System'
    if (-not (Test-Path $systemDir)) { return $false }
    New-Item -ItemType Directory -Force -Path $BundleDir | Out-Null
    $ae = Join-Path $systemDir 'opc_aeps.dll'
    if (Test-Path $ae) { Copy-Item $ae (Join-Path $BundleDir 'opcaeps.dll') -Force }
    foreach ($n in @('opccomn_ps.dll', 'opcproxy.dll')) {
        $s = Join-Path $systemDir $n
        if (Test-Path $s) { Copy-Item $s (Join-Path $BundleDir $n) -Force }
    }
    return Test-Path (Join-Path $BundleDir 'opcaeps.dll')
}

# 3.1.x MSI ships opc_aeps.dll; SysWOW64 uses opcaeps.dll
$aeSrc = Join-Path $bundleX86 'opc_aeps.dll'
if ((Test-Path $aeSrc) -and -not (Test-Path (Join-Path $bundleX86 'opcaeps.dll'))) {
    Copy-Item $aeSrc (Join-Path $bundleX86 'opcaeps.dll') -Force
}

$required = @('opcaeps.dll', 'opccomn_ps.dll', 'opcproxy.dll')
$missing = $required | Where-Object { -not (Test-Path (Join-Path $bundleX86 $_)) }
if ($missing.Count -gt 0 -and $msi) {
    Write-Info "Populating bundle from MSI administrative extract ..."
    [void](Import-OpcCoreBundleFromMsi -MsiPath $msi.FullName -BundleDir $bundleX86)
    $missing = $required | Where-Object { -not (Test-Path (Join-Path $bundleX86 $_)) }
}
if ($missing.Count -eq 0) {
    Write-Info "Deploying bundled OPC Core x86 DLLs to $sysWow ..."
    if (-not $isAdmin) {
        Write-Host "Re-run as Administrator to copy/register DLLs." -ForegroundColor Yellow
        exit 3
    }
    foreach ($name in $required) {
        $src = Join-Path $bundleX86 $name
        $dst = Join-Path $sysWow $name
        Copy-Item -Path $src -Destination $dst -Force
        & regsvr32.exe /s $dst
        if ($LASTEXITCODE -ne 0) {
            Write-Host "regsvr32 failed for $name (code $($LASTEXITCODE))" -ForegroundColor Yellow
        }
    }
    if (Test-OpcAeMarshalingComplete) {
        Write-Info "Bundled OPC Core deployed."
        exit 0
    }
    Write-Host "DLLs copied but IOPCEventServer interface not registered — run the x64 MSI as Administrator." -ForegroundColor Yellow
}

Write-Host "OPC Core Components not installed." -ForegroundColor Yellow
Write-Host "  Download: https://opcfoundation.org/developer-tools/samples-and-tools-classic/core-components/"
Write-Host "  Place MSI in: $installers"
Write-Host "  Or run capture after manual install: $(Join-Path $repoRoot 'scripts\capture-opc-core-redist.ps1')"
Write-Host "  Then (elevated): $(Join-Path $repoRoot 'scripts\install-opc-core-redist-elevated.cmd')"
exit 2
