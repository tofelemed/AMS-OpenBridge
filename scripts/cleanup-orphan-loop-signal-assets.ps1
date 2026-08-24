# Removes UNS assets that a retired CPM loop left behind.
#
# Until bulk retirement landed, DELETE /api/v1/cpm/loops/{id} removed the registry
# row (cascading its signal-asset ledger) but never released the assets the
# projection had created. Every onboard/retire cycle therefore leaked one
# `CpmLoopSignal` Measurement per signal into the UNS, where they show up in the
# designer's tag picker forever — and, worse, a later projection onto the same
# path sees them as somebody else's asset and stops managing them.
#
# This finds template='CpmLoopSignal' assets whose loop is no longer registered
# and soft-deletes them through the API (so cache invalidation still fires).
#
#   .\scripts\cleanup-orphan-loop-signal-assets.ps1 -WhatIf   # report only
#   .\scripts\cleanup-orphan-loop-signal-assets.ps1
param(
    [string]$GatewayBase = 'http://localhost:8081',
    [string]$AdminUser = 'admin',
    [string]$AdminPassword = '',
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

if (-not $AdminPassword) {
    $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'infra\docker\.env'
    $line = Get-Content $envFile | Where-Object { $_ -match '^AUTH_BOOTSTRAP_PASSWORD=' } | Select-Object -First 1
    $AdminPassword = if ($line) { $line.Split('=', 2)[1] } else { 'ChangeMe123!' }
}

$token = (Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/auth/login" -ContentType 'application/json' `
    -Body (@{ username = $AdminUser; password = $AdminPassword } | ConvertTo-Json)).token
$H = @{ Authorization = "Bearer $token" }

# Registered loops, lower-cased: a projected path ends with <loopid>.<role>.
$r = Invoke-RestMethod -Uri "$GatewayBase/api/v1/cpm/loops" -Headers $H
$loops = if ($r.loops) { $r.loops } elseif ($r -is [array]) { $r } else { @() }
$live = @{}
foreach ($l in $loops) { $live[$l.loopId.ToLower()] = $true }
Write-Host "registered loops: $($live.Count)"

# All projected signal assets (paged).
$assets = New-Object System.Collections.Generic.List[object]
$skip = 0
do {
    $page = Invoke-RestMethod -Uri "$GatewayBase/api/assets?type=5&take=1000&skip=$skip" -Headers $H
    foreach ($a in $page.assets) { if ($a.template -eq 'CpmLoopSignal') { $assets.Add($a) } }
    $skip += 1000
} while ($skip -lt $page.total)
Write-Host "projected signal assets: $($assets.Count)"

# Orphan = the loop half of "<...>/<loopid>.<role>" is not a registered loop.
$orphans = @($assets | Where-Object {
    $leaf = $_.contextualPath.Split('/')[-1]      # e.g. bulka_0001.pv
    $loopPart = $leaf.Substring(0, [Math]::Max($leaf.LastIndexOf('.'), 0))
    $loopPart -and -not $live.ContainsKey($loopPart.ToLower())
})
Write-Host "orphaned (loop no longer registered): $($orphans.Count)" -ForegroundColor $(if ($orphans.Count) { 'Yellow' } else { 'Green' })

if ($orphans.Count -eq 0) { exit 0 }
$orphans | Select-Object -First 5 | ForEach-Object { Write-Host "  e.g. $($_.contextualPath)" }
if ($WhatIf) { Write-Host "`n-WhatIf: nothing deleted."; exit 0 }

$deleted = 0
for ($i = 0; $i -lt $orphans.Count; $i += 1000) {
    $chunk = @($orphans[$i..([Math]::Min($i + 999, $orphans.Count - 1))])
    $body = @{ deletes = @($chunk | ForEach-Object { $_.id }) } | ConvertTo-Json -Depth 4
    $res = Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/assets/bulk" -Headers $H `
        -ContentType 'application/json' -Body $body -TimeoutSec 120
    $deleted += $res.deleted
    Write-Host "  removed $($res.deleted) (batch of $($chunk.Count))"
}
Write-Host "`ndeleted $deleted orphaned signal asset(s)." -ForegroundColor Green
