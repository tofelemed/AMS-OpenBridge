# Copies the machine-readable contracts of record (contracts/) into the services that embed them.
#
# Each service builds from its OWN Docker context (docker-compose sets `context: ../../src/services/<svc>`),
# so a file outside that context cannot be embedded in the image. The copies are therefore duplicated on
# purpose — run this after editing a contract so the copies cannot drift.
#
#   .\scripts\sync-contracts.ps1            # copy
#   .\scripts\sync-contracts.ps1 -Check     # fail if any copy is stale (use in CI)

param([switch]$Check)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pairs = @(
    @{ Source = 'contracts\instrumental-health\v1'; Targets = @('src\services\ingestion-service\Contracts\instrumental-health\v1') }
)
$stale = @()
foreach ($pair in $pairs) {
    $srcDir = Join-Path $root $pair.Source
    foreach ($file in Get-ChildItem $srcDir -Filter *.json) {
        $srcHash = (Get-FileHash $file.FullName -Algorithm SHA256).Hash
        foreach ($t in $pair.Targets) {
            $dest = Join-Path (Join-Path $root $t) $file.Name
            if ($Check) {
                if (-not (Test-Path $dest) -or (Get-FileHash $dest -Algorithm SHA256).Hash -ne $srcHash) { $stale += $dest }
            } else {
                New-Item -ItemType Directory -Force (Split-Path -Parent $dest) | Out-Null
                Copy-Item $file.FullName $dest -Force
                Write-Host "synced $dest"
            }
        }
    }
}
if ($Check) {
    if ($stale.Count -gt 0) { Write-Error "Stale contract copies:`n  $($stale -join "`n  ")"; exit 1 }
    Write-Host 'contract copies are in sync'
}
