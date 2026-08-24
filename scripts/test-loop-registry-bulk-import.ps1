# End-to-end test for the CPM loop registry bulk CSV import.
#
# Mirrors exactly what the Loop Registry UI sends after the location-picker work:
# signal paths are DERIVED from site/[area/]unit + loop tag as
# `site/[area/]unit/<loopid>.<role>` (lowercased) when the CSV leaves them blank,
# and are sent verbatim when given. Verifies the whole chain that follows —
# registry rows, the signal-asset projection into the UNS, and that the derived
# paths actually RESOLVE against the asset model (provenance "asset-model", the
# thing a typo silently breaks).
#
#   .\scripts\test-loop-registry-bulk-import.ps1
#   .\scripts\test-loop-registry-bulk-import.ps1 -Site houston -Unit crude1 -KeepLoops
#
# Requires the docker stack up (gateway :8081) and an Admin login.
param(
    [string]$GatewayBase = 'http://localhost:8081',
    [string]$AdminUser = 'admin',
    [string]$AdminPassword = '',
    [string]$Site = 'houston',
    [string]$Area = '',
    [string]$Unit = 'crude1',
    [switch]$KeepLoops
)

$ErrorActionPreference = 'Stop'
$script:passed = 0
$script:failed = 0

function Step([string]$name, [scriptblock]$body) {
    try { & $body; $script:passed++; Write-Host "  PASS  $name" -ForegroundColor Green }
    catch { $script:failed++; Write-Host "  FAIL  $name" -ForegroundColor Red; Write-Host "        $($_.Exception.Message)" -ForegroundColor Red }
}
function Assert([bool]$cond, [string]$msg) { if (-not $cond) { throw $msg } }
function StatusOf($err) { if ($null -eq $err.Exception.Response) { throw $err } ; [int]$err.Exception.Response.StatusCode }

# ── the UI's derivation rule, mirrored ───────────────────────────────────────
function Get-DerivedPath([string]$site, [string]$area, [string]$unit, [string]$tag, [string]$role) {
    $segs = @($site, $area, $unit) | Where-Object { $_ -and $_.Trim() }
    if (-not $segs -or -not $tag) { return '' }
    return (($segs -join '/') + '/' + $tag + '.' + $role).ToLower()
}

if (-not $AdminPassword) {
    $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'infra\docker\.env'
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^AUTH_BOOTSTRAP_PASSWORD=' } | Select-Object -First 1
        if ($line) { $AdminPassword = $line.Split('=', 2)[1] }
    }
    if (-not $AdminPassword) { $AdminPassword = 'ChangeMe123!' }
}

$cpm = "$GatewayBase/api/v1/cpm"
Write-Host "`n=== Loop registry bulk-import E2E ===" -ForegroundColor Cyan
Write-Host "location under test: $((@($Site,$Area,$Unit) | Where-Object {$_}) -join '/')`n"

# ── login ────────────────────────────────────────────────────────────────────
$token = $null
Step 'login as Admin' {
    $r = Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/auth/login" -ContentType 'application/json' `
        -Body (@{ username = $AdminUser; password = $AdminPassword } | ConvertTo-Json)
    Assert ($null -ne $r.token) 'no token in login response'
    $script:token = $r.token
}
if (-not $script:token) { Write-Host "`nCannot continue without a token."; exit 1 }
$H = @{ Authorization = "Bearer $($script:token)" }

# ── the CSV under test (the shipped template's shape) ────────────────────────
# Row 1+2: signal columns BLANK  → paths derived from the location.
# Row 3:   signal columns GIVEN  → sent verbatim.
$csv = @"
tag,service,site,area,unit,loop_type,criticality,pv_tag,sp_tag,op_tag,mode_tag,vp_tag,profile
E2EBULK_FIC001,Bulk import flow loop,$Site,$Area,$Unit,FIC,high,,,,,,
E2EBULK_TIC002,"Bulk import temp loop, with comma",$Site,$Area,$Unit,TIC,medium,,,,,,
E2EBULK_LIC003,Bulk import level loop,$Site,$Area,$Unit,LIC,low,$(Get-DerivedPath $Site $Area $Unit 'e2ebulk_lic003' 'pv'),$(Get-DerivedPath $Site $Area $Unit 'e2ebulk_lic003' 'sp'),$(Get-DerivedPath $Site $Area $Unit 'e2ebulk_lic003' 'op'),$(Get-DerivedPath $Site $Area $Unit 'e2ebulk_lic003' 'mode'),$(Get-DerivedPath $Site $Area $Unit 'e2ebulk_lic003' 'vp'),
"@

$tags = @('E2EBULK_FIC001', 'E2EBULK_TIC002', 'E2EBULK_LIC003')
# Registered by the punctuation tests below, plus the ids the negative tests use:
# a negative test that unexpectedly SUCCEEDS must not leave residue behind.
$extraTags = @('E2EBULK-45FIC-109', 'E2EBULK_45FIC_109', 'E2EBULK_CASE', 'E2EBULK_TYPE')
$roles = @('pv', 'sp', 'op', 'mode')

# ── preflight: the location should exist in the asset model ──────────────────
Step 'plant location exists in the asset model' {
    $sites = Invoke-RestMethod -Method Get -Uri "$GatewayBase/api/assets?type=1&take=1000" -Headers $H
    $names = @($sites.assets | ForEach-Object { $_.contextualPath })
    Assert ($names -contains $Site) "site '$Site' not in the asset model (have: $($names -join ', '))"
    if ($Unit) {
        $units = Invoke-RestMethod -Method Get -Uri "$GatewayBase/api/assets?type=3&take=1000" -Headers $H
        $unitPaths = @($units.assets | ForEach-Object { $_.contextualPath })
        $want = (@($Site, $Area, $Unit) | Where-Object { $_ }) -join '/'
        Assert ($unitPaths -contains $want) "unit '$want' not in the asset model (have: $($unitPaths -join ', '))"
    }
}

# ── import: one activate call per CSV row, as the UI does ────────────────────
Step 'import 3 rows (2 derived, 1 explicit)' {
    $lines = $csv -split "`n" | Where-Object { $_.Trim() }
    Assert ($lines.Count -eq 4) "expected header + 3 rows, got $($lines.Count) lines"
    foreach ($tag in $tags) {
        $lower = $tag.ToLower()
        $tagList = @()
        foreach ($role in $roles) {
            $tagList += @{ signalRole = $role.ToUpper(); unsPath = (Get-DerivedPath $Site $Area $Unit $lower $role) }
        }
        if ($tag -eq 'E2EBULK_LIC003') {
            $tagList += @{ signalRole = 'VP'; unsPath = (Get-DerivedPath $Site $Area $Unit $lower 'vp') }
        }
        $body = @{
            loopId = $tag; displayName = "Bulk import $tag"
            site = $Site; area = $(if ($Area) { $Area } else { $null }); unit = $(if ($Unit) { $Unit } else { $null })
            loopType = $(if ($tag -match 'FIC') { 'FIC' } elseif ($tag -match 'TIC') { 'TIC' } else { 'LIC' })
            criticality = 'high'; tags = $tagList; enableMonitoring = $true
        } | ConvertTo-Json -Depth 6
        Invoke-RestMethod -Method Post -Uri "$cpm/loops/activate" -Headers $H -ContentType 'application/json' -Body $body | Out-Null
    }
}

# ── verify the registry rows ─────────────────────────────────────────────────
Step 'registry rows carry site / area / unit and the derived paths' {
    $all = Invoke-RestMethod -Method Get -Uri "$cpm/loops" -Headers $H
    $loops = if ($all -is [array]) { $all } elseif ($all.loops) { $all.loops } else { $all.items }
    foreach ($tag in $tags) {
        $loop = $loops | Where-Object { $_.loopId -eq $tag } | Select-Object -First 1
        Assert ($null -ne $loop) "loop $tag missing from the registry"
        Assert ($loop.site -eq $Site) "$tag site is '$($loop.site)', expected '$Site'"
        Assert ($loop.unit -eq $Unit) "$tag unit is '$($loop.unit)', expected '$Unit'"
        foreach ($role in $roles) {
            $want = Get-DerivedPath $Site $Area $Unit $tag.ToLower() $role
            $got = $loop.tags.$($role.ToUpper())
            Assert ($got -eq $want) "$tag $($role.ToUpper()) path is '$got', expected '$want'"
        }
    }
    # The explicit-path row must map VP; the derived rows must not (VP is opt-in).
    $lic = $loops | Where-Object { $_.loopId -eq 'E2EBULK_LIC003' } | Select-Object -First 1
    Assert ($null -ne $lic.tags.VP) 'explicit row should have mapped VP'
    $fic = $loops | Where-Object { $_.loopId -eq 'E2EBULK_FIC001' } | Select-Object -First 1
    Assert ($null -eq $fic.tags.VP) 'derived row should NOT have auto-mapped VP'
}

# ── verify the signal-asset projection into the UNS ──────────────────────────
Step 'signal assets projected into the asset model' {
    foreach ($role in $roles) {
        $path = Get-DerivedPath $Site $Area $Unit 'e2ebulk_fic001' $role
        $asset = Invoke-RestMethod -Method Get -Uri "$GatewayBase/api/assets/by-path/$path" -Headers $H
        Assert ($null -ne $asset) "no asset projected at $path"
        Assert ($asset.type -eq 5) "asset at $path is type $($asset.type), expected 5 (Measurement)"
        Assert ($asset.template -eq 'CpmLoopSignal') "asset at $path has template '$($asset.template)'"
    }
}

# ── the point of the whole exercise: the paths RESOLVE ───────────────────────
Step 'derived paths resolve against the asset model (provenance)' {
    foreach ($role in $roles) {
        $path = Get-DerivedPath $Site $Area $Unit 'e2ebulk_fic001' $role
        $enc = [uri]::EscapeDataString($path)
        $b = Invoke-RestMethod -Method Get -Uri "$GatewayBase/api/bindings/resolve?path=$enc&roles=live" -Headers $H
        Assert ($b.resolved -eq $true) "binding for $path did not resolve"
        Assert ($b.provenance -eq 'asset-model') "binding for $path fell back to '$($b.provenance)' — it points at nothing that publishes"
    }
}

# ── readiness: the four required signal blockers are satisfied ───────────────
Step 'readiness reports the required tag blockers as passing' {
    $r = Invoke-RestMethod -Method Get -Uri "$cpm/loops/E2EBULK_FIC001/readiness" -Headers $H
    $checks = $r.checks
    foreach ($id in @('registry_row', 'monitoring_enabled', 'tag_pv', 'tag_sp', 'tag_op', 'tag_mode')) {
        $c = $checks | Where-Object { $_.id -eq $id } | Select-Object -First 1
        Assert ($null -ne $c) "readiness check $id missing"
        Assert ($c.ok -eq $true) "readiness check $id failed: $($c.message)"
    }
    # binding_provenance is a warning, not a blocker — but derived paths should
    # satisfy it, which is the whole reason for picking the location from the UNS.
    $prov = $checks | Where-Object { $_.id -eq 'binding_provenance' } | Select-Object -First 1
    if ($prov) { Assert ($prov.ok -eq $true) "binding_provenance not satisfied: $($prov.message)" }
}

# ── negative: the rules the new client-side validation mirrors ───────────────
# Real plant tags carry punctuation (45FIC-109, B2-027PIC). They must onboard,
# and must remain addressable afterwards (the id is a URL path segment).
Step 'server accepts a real plant tag with a dash' {
    $body = @{
        loopId = 'E2EBULK-45FIC-109'; displayName = 'dashed plant tag'; site = $Site; loopType = 'FIC'
        criticality = 'high'; enableMonitoring = $false; tags = @()
    } | ConvertTo-Json -Depth 6
    Invoke-RestMethod -Method Post -Uri "$cpm/loops/activate" -Headers $H -ContentType 'application/json' -Body $body | Out-Null
    $enc = [uri]::EscapeDataString('E2EBULK-45FIC-109')
    $got = Invoke-RestMethod -Method Get -Uri "$cpm/loops/$enc" -Headers $H
    Assert ($got.loopId -eq 'E2EBULK-45FIC-109') "round-trip returned '$($got.loopId)'"
}

# ...but two ids differing only in punctuation sanitise to ONE historian device
# and would merge their PV/SP/OP. That is the hazard the charset ban used to
# approximate; it is now caught exactly.
Step 'server rejects a historian-node collision (punctuation-only difference)' {
    $body = @{
        loopId = 'E2EBULK_45FIC_109'; displayName = 'collides with the dashed one'; site = $Site
        loopType = 'FIC'; criticality = 'high'; enableMonitoring = $false; tags = @()
    } | ConvertTo-Json -Depth 6
    try {
        Invoke-RestMethod -Method Post -Uri "$cpm/loops/activate" -Headers $H -ContentType 'application/json' -Body $body | Out-Null
        throw 'activate with a colliding historian node unexpectedly succeeded'
    } catch {
        $code = StatusOf $_
        Assert ($code -eq 409) "expected 409 for a historian collision, got $code"
    }
}

Step 'server rejects a loop id containing a slash (breaks the route)' {
    $body = @{
        loopId = 'E2EBULK/BAD'; displayName = 'slash'; site = $Site; loopType = 'FIC'
        criticality = 'high'; enableMonitoring = $false; tags = @()
    } | ConvertTo-Json -Depth 6
    try {
        Invoke-RestMethod -Method Post -Uri "$cpm/loops/activate" -Headers $H -ContentType 'application/json' -Body $body | Out-Null
        throw 'activate with a slash in the loop id unexpectedly succeeded'
    } catch { Assert ((StatusOf $_) -eq 422) "expected 422, got $(StatusOf $_)" }
}
# The server lower-cases before checking, so "High" is valid and normalised —
# which is why the importer normalises too instead of rejecting it. An unknown
# value must still be refused.
Step 'server rejects an unknown criticality (422)' {
    $body = @{
        loopId = 'E2EBULK_CASE'; displayName = 'case test'; site = $Site; loopType = 'FIC'
        criticality = 'urgent'; enableMonitoring = $false; tags = @()
    } | ConvertTo-Json -Depth 6
    try {
        Invoke-RestMethod -Method Post -Uri "$cpm/loops/activate" -Headers $H -ContentType 'application/json' -Body $body | Out-Null
        throw 'activate with criticality "urgent" unexpectedly succeeded'
    } catch { Assert ((StatusOf $_) -eq 422) "expected 422, got $(StatusOf $_)" }
}
Step 'server rejects an unknown loop_type (422)' {
    $body = @{
        loopId = 'E2EBULK_TYPE'; displayName = 'type test'; site = $Site; loopType = 'FLOW'
        criticality = 'high'; enableMonitoring = $false; tags = @()
    } | ConvertTo-Json -Depth 6
    try {
        Invoke-RestMethod -Method Post -Uri "$cpm/loops/activate" -Headers $H -ContentType 'application/json' -Body $body | Out-Null
        throw 'activate with loopType "FLOW" unexpectedly succeeded'
    } catch { Assert ((StatusOf $_) -eq 422) "expected 422, got $(StatusOf $_)" }
}
Step 'a dotted historian-form path does NOT resolve (why the UI blocks it)' {
    $bad = "root.$Site.$Unit.e2ebulk_fic001.pv"
    $enc = [uri]::EscapeDataString($bad)
    try {
        $b = Invoke-RestMethod -Method Get -Uri "$GatewayBase/api/bindings/resolve?path=$enc&roles=live" -Headers $H
        Assert ($b.resolved -ne $true) "dotted path '$bad' unexpectedly resolved"
    } catch { Assert ((StatusOf $_) -eq 404) "expected an unresolved binding or 404, got $(StatusOf $_)" }
}

# ── cleanup ──────────────────────────────────────────────────────────────────
if (-not $KeepLoops) {
    Step 'retire the imported loops (removes projected assets)' {
        foreach ($tag in ($tags + $extraTags)) {
            $enc = [uri]::EscapeDataString($tag)
            try { Invoke-RestMethod -Method Delete -Uri "$cpm/loops/$enc" -Headers $H | Out-Null } catch { }
        }
        $all = Invoke-RestMethod -Method Get -Uri "$cpm/loops" -Headers $H
        $loops = if ($all -is [array]) { $all } elseif ($all.loops) { $all.loops } else { $all.items }
        $left = @($loops | Where-Object { ($tags + $extraTags) -contains $_.loopId })
        Assert ($left.Count -eq 0) "$($left.Count) test loop(s) still in the registry"
    }
} else {
    Write-Host "`n-KeepLoops: E2EBULK_* left in the registry for manual UI inspection" -ForegroundColor Yellow
}

Write-Host ""
Write-Host ("=== {0} passed, {1} failed ===" -f $script:passed, $script:failed) -ForegroundColor $(if ($script:failed -eq 0) { 'Green' } else { 'Red' })
exit $(if ($script:failed -eq 0) { 0 } else { 1 })
