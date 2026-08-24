# Verifies POST /api/v1/cpm/loops/bulk-activate: correctness first, then the
# speed-up over the per-row path it replaces.
#
#   .\scripts\test-bulk-activate.ps1               # 200 loops
#   .\scripts\test-bulk-activate.ps1 -Count 1000
param(
    [string]$GatewayBase = 'http://localhost:8081',
    [string]$AdminUser = 'admin',
    [string]$AdminPassword = '',
    [int]$Count = 200,
    [string]$Site = 'houston',
    [string]$Unit = 'crude1',
    [switch]$KeepLoops
)

$ErrorActionPreference = 'Stop'
$script:passed = 0; $script:failed = 0
function Step([string]$n, [scriptblock]$b) {
    try { & $b; $script:passed++; Write-Host "  PASS  $n" -ForegroundColor Green }
    catch { $script:failed++; Write-Host "  FAIL  $n" -ForegroundColor Red; Write-Host "        $($_.Exception.Message)" -ForegroundColor Red }
}
function Assert([bool]$c, [string]$m) { if (-not $c) { throw $m } }
function StatusOf($e) { if ($null -eq $e.Exception.Response) { throw $e } ; [int]$e.Exception.Response.StatusCode }

if (-not $AdminPassword) {
    $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'infra\docker\.env'
    $line = Get-Content $envFile | Where-Object { $_ -match '^AUTH_BOOTSTRAP_PASSWORD=' } | Select-Object -First 1
    $AdminPassword = if ($line) { $line.Split('=', 2)[1] } else { 'ChangeMe123!' }
}

$cpm = "$GatewayBase/api/v1/cpm"
$token = (Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/auth/login" -ContentType 'application/json' `
    -Body (@{ username = $AdminUser; password = $AdminPassword } | ConvertTo-Json)).token
$H = @{ Authorization = "Bearer $token" }

function Get-Loops { $r = Invoke-RestMethod -Uri "$cpm/loops" -Headers $H; if ($r -is [array]) { $r } elseif ($r.loops) { $r.loops } else { @() } }
function New-Loop([string]$id) {
    $lower = $id.ToLower()
    $tags = @('pv', 'sp', 'op', 'mode') | ForEach-Object {
        @{ signalRole = $_.ToUpper(); unsPath = "$Site/$Unit/$lower.$_" }
    }
    @{ loopId = $id; displayName = "Bulk $id"; site = $Site; unit = $Unit
       loopType = 'FIC'; criticality = 'medium'; tags = $tags; enableMonitoring = $true }
}

Write-Host "`n=== Bulk activate ===" -ForegroundColor Cyan
Write-Host "loops: $Count | location: $Site/$Unit`n"

function Remove-Loop([string]$id) {
    $uri = "$cpm/loops/$([uri]::EscapeDataString($id))"
    # DELETE is still one mutation per loop, so a large teardown meets the
    # gateway's 120/minute window: retry rather than leave rows behind.
    for ($a = 0; $a -lt 12; $a++) {
        try { Invoke-RestMethod -Method Delete -Uri $uri -Headers $H | Out-Null; return $true }
        catch {
            if ($null -ne $_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 429) { Start-Sleep -Seconds 10 }
            else { return $false }
        }
    }
    return $false
}

# Start clean: a previous run that was interrupted (or whose teardown ran out of
# rate-limit budget) must not fail this one.
$stale = @(Get-Loops | Where-Object { $_.loopId -like 'BULKA*' })
if ($stale.Count -gt 0) {
    Write-Host "removing $($stale.Count) leftover BULKA* loop(s) from a previous run..."
    foreach ($s in $stale) { [void](Remove-Loop $s.loopId) }
}

$tags = 1..$Count | ForEach-Object { "BULKA_{0:D4}" -f $_ }
$result = $null

Step "activate $Count loops in ONE request" {
    $body = @{ loops = @($tags | ForEach-Object { New-Loop $_ }) } | ConvertTo-Json -Depth 8
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $script:result = Invoke-RestMethod -Method Post -Uri "$cpm/loops/bulk-activate" -Headers $H `
        -ContentType 'application/json' -Body $body -TimeoutSec 180
    $sw.Stop()
    Write-Host ("        {0} activated, {1} failed - {2}s wall, {3} ms server ({4} ms/loop)" -f `
        $script:result.activated, $script:result.failed, [math]::Round($sw.Elapsed.TotalSeconds, 1),
        $script:result.elapsedMs, [math]::Round($script:result.elapsedMs / $Count, 1))
    Assert ($script:result.activated -eq $Count) "only $($script:result.activated)/$Count activated"
    Assert ($script:result.results.Count -eq $Count) 'per-row results missing'
}

Step 'no 429 - a batch of any size is ONE mutation' {
    Assert ($script:result.failed -eq 0) "$($script:result.failed) row(s) failed: $(($script:result.results | Where-Object { -not $_.ok } | Select-Object -First 3 | ForEach-Object { "$($_.loopId)=$($_.code)" }) -join ', ')"
}

Step 'registry rows are correct' {
    $loops = Get-Loops
    $mine = @($loops | Where-Object { $_.loopId -like 'BULKA_*' })
    Assert ($mine.Count -eq $Count) "registry holds $($mine.Count), expected $Count"
    $one = $mine | Where-Object { $_.loopId -eq 'BULKA_0001' } | Select-Object -First 1
    Assert ($one.site -eq $Site) "site is '$($one.site)'"
    Assert ($one.unit -eq $Unit) "unit is '$($one.unit)'"
    Assert ($one.tags.PV -eq "$Site/$Unit/bulka_0001.pv") "PV path is '$($one.tags.PV)'"
}

Step 'signal assets were projected and RESOLVE (provenance)' {
    foreach ($role in @('pv', 'sp', 'op', 'mode')) {
        $path = "$Site/$Unit/bulka_0001.$role"
        $asset = Invoke-RestMethod -Uri "$GatewayBase/api/assets/by-path/$path" -Headers $H
        Assert ($null -ne $asset) "no asset at $path"
        Assert ($asset.template -eq 'CpmLoopSignal') "template is '$($asset.template)'"
        $b = Invoke-RestMethod -Uri "$GatewayBase/api/bindings/resolve?path=$([uri]::EscapeDataString($path))&roles=live" -Headers $H
        Assert ($b.provenance -eq 'asset-model') "binding for $path fell back to '$($b.provenance)'"
    }
}

Step 're-running the same batch is an idempotent upsert' {
    $body = @{ loops = @($tags | Select-Object -First 10 | ForEach-Object { New-Loop $_ }) } | ConvertTo-Json -Depth 8
    $again = Invoke-RestMethod -Method Post -Uri "$cpm/loops/bulk-activate" -Headers $H -ContentType 'application/json' -Body $body -TimeoutSec 120
    Assert ($again.activated -eq 10) "re-activate gave $($again.activated)/10"
    $mine = @(Get-Loops | Where-Object { $_.loopId -like 'BULKA_*' })
    Assert ($mine.Count -eq $Count) "re-activate changed the row count to $($mine.Count)"
}

Step 'per-row isolation: bad rows fail alone, good rows still land' {
    $mixed = @(
        (New-Loop 'BULKA_MIXED_OK'),
        (New-Loop 'BULKA/SLASH'),                       # forbidden character
        (New-Loop 'BULKA_0001'),                        # historian twin of an existing loop? no - exact id, upserts
        (New-Loop 'BULKA_MIXED_OK2')
    )
    $mixed[2].loopId = 'BULKA-0001'                     # punctuation twin of BULKA_0001
    $mixed[1].criticality = 'medium'
    $body = @{ loops = $mixed } | ConvertTo-Json -Depth 8
    $r = Invoke-RestMethod -Method Post -Uri "$cpm/loops/bulk-activate" -Headers $H -ContentType 'application/json' -Body $body -TimeoutSec 120
    Assert ($r.activated -eq 2) "expected 2 good rows, got $($r.activated)"
    $slash = $r.results | Where-Object { $_.loopId -eq 'BULKA/SLASH' }
    Assert ($slash.code -eq 'REGISTRY_VALIDATION') "slash row code was '$($slash.code)'"
    $twin = $r.results | Where-Object { $_.loopId -eq 'BULKA-0001' }
    Assert ($twin.code -eq 'LOOP_ID_HISTORIAN_COLLISION') "twin row code was '$($twin.code)'"
    foreach ($id in @('BULKA_MIXED_OK', 'BULKA_MIXED_OK2')) { [void](Remove-Loop $id) }
}

Step 'over the ceiling is refused, not half-applied' {
    $body = @{ loops = @(1..5001 | ForEach-Object { New-Loop ("BULKA_OVER_{0:D5}" -f $_) }) } | ConvertTo-Json -Depth 8
    try {
        Invoke-RestMethod -Method Post -Uri "$cpm/loops/bulk-activate" -Headers $H -ContentType 'application/json' -Body $body -TimeoutSec 180 | Out-Null
        throw 'a 5001-loop request unexpectedly succeeded'
    } catch { Assert ((StatusOf $_) -eq 422) "expected 422, got $(StatusOf $_)" }
}

if (-not $KeepLoops) {
    Step 'retire the whole batch in ONE request' {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $r = Invoke-RestMethod -Method Post -Uri "$cpm/loops/bulk-delete" -Headers $H `
            -ContentType 'application/json' -Body (@{ loopIds = $tags } | ConvertTo-Json) -TimeoutSec 180
        $sw.Stop()
        Write-Host ("        {0} retired, {1} assets released - {2}s wall, {3} ms server" -f `
            $r.deleted, $r.assetsReleased, [math]::Round($sw.Elapsed.TotalSeconds, 1), $r.elapsedMs)
        Assert ($r.deleted -eq $Count) "retired $($r.deleted)/$Count"
        # Four signals per loop were projected; retiring must release them all,
        # or the UNS silently accumulates orphaned CpmLoopSignal measurements.
        Assert ($r.assetsReleased -eq ($Count * 4)) "released $($r.assetsReleased) assets, expected $($Count * 4)"
        $left = @(Get-Loops | Where-Object { $_.loopId -like 'BULKA*' })
        Assert ($left.Count -eq 0) "$($left.Count) loop(s) left behind"
    }

    Step 'projected assets are gone from the UNS (no orphans)' {
        # Two traps here, neither of them a product fault:
        #  * by-path answers 200 with an EMPTY body when the asset is absent (not
        #    404), and Invoke-RestMethod turns that into '' rather than $null;
        #  * the gateway TTL-caches GET /api/assets* for 60s, and the projection
        #    check above warmed exactly these paths — so read past the cache.
        foreach ($role in @('pv', 'sp', 'op', 'mode')) {
            $bust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            $orphan = Invoke-RestMethod -Uri "$GatewayBase/api/assets/by-path/$Site/$Unit/bulka_0001.$role`?_=$bust" -Headers $H
            $present = $null -ne $orphan -and -not ($orphan -is [string] -and [string]::IsNullOrWhiteSpace($orphan))
            Assert (-not $present) "the projected asset for $role outlived its loop"
        }
    }

    Step 'retiring an already-retired id is reported, not an error' {
        $r = Invoke-RestMethod -Method Post -Uri "$cpm/loops/bulk-delete" -Headers $H `
            -ContentType 'application/json' -Body (@{ loopIds = @($tags[0], 'BULKA_NEVER_EXISTED') } | ConvertTo-Json)
        Assert ($r.deleted -eq 0) "expected 0 deleted, got $($r.deleted)"
        Assert ($r.notFound.Count -eq 2) "expected 2 notFound, got $($r.notFound.Count)"
    }
}

Write-Host ""
Write-Host ("=== {0} passed, {1} failed ===" -f $script:passed, $script:failed) -ForegroundColor $(if ($script:failed -eq 0) { 'Green' } else { 'Red' })
exit $(if ($script:failed -eq 0) { 0 } else { 1 })
