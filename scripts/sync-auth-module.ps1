# Copies src/services/_shared/TraverseAuth.cs into every service that enforces platform RBAC.
#
# Each service builds from its OWN Docker context (docker-compose sets `context: ../../src/services/<svc>`),
# so a shared .csproj reference outside that context cannot be restored inside the image. The module is
# therefore duplicated on purpose — run this after editing the shared copy so they cannot drift.
#
#   .\scripts\sync-auth-module.ps1            # copy
#   .\scripts\sync-auth-module.ps1 -Check     # fail if any copy is stale (use in CI)

param([switch]$Check)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'src\services\_shared\TraverseAuth.cs'
$services = @('asset-model', 'template-service', 'binding-resolver', 'historian-bff', 'analysis-service', 'audit-service', 'cplm-api', 'notification-service', 'display-service', 'ingestion-service')

if (-not (Test-Path $source)) { throw "Shared auth module not found: $source" }
$sourceHash = (Get-FileHash $source -Algorithm SHA256).Hash
$stale = @()

foreach ($svc in $services) {
    $dest = Join-Path $root "src\services\$svc\Auth\TraverseAuth.cs"
    $destDir = Split-Path -Parent $dest

    if ($Check) {
        if (-not (Test-Path $dest)) { $stale += "$svc (missing)"; continue }
        if ((Get-FileHash $dest -Algorithm SHA256).Hash -ne $sourceHash) { $stale += "$svc (out of date)" }
        continue
    }

    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir | Out-Null }
    Copy-Item $source $dest -Force
    Write-Host "synced $svc"
}

if ($Check) {
    if ($stale.Count -gt 0) {
        Write-Host "Auth module copies are stale:" -ForegroundColor Red
        $stale | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        Write-Host "Run .\scripts\sync-auth-module.ps1 to fix."
        exit 1
    }
    Write-Host "All auth module copies are in sync." -ForegroundColor Green
}
