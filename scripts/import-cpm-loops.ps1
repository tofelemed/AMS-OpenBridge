<#
.SYNOPSIS
    Bulk-onboards control loops into the CPM registry from a loop worksheet,
    through the API gateway (POST /api/v1/cpm/loops/bulk-activate).

.DESCRIPTION
    Scripted counterpart of CPM -> Loop Registry -> Import CSV — and the ONLY
    route that sets the fields the UI wizard cannot: sourceTag (the DCS tag
    names, the future ingestion joiner's key) and the OP engineering range.
    Worksheet columns (docs/plant-model/README.md):
      loop_id,display_name,site,area,unit,loop_type,criticality,
      pv_ot_tag,sp_ot_tag,op_ot_tag,mode_ot_tag,vp_ot_tag,
      op_min,op_max,pv_min,pv_max,enable_monitoring,profile

    UNS signal paths are derived by convention: {site}/[{area}/]{unit}/{loop_id_lower}.{role}
    (mirrors the UI's deriveSignalPath). Activation validates the location
    against the asset model (422 LOCATION_NOT_IN_UNS) and auto-creates the
    loop's Device node + signal assets under its Unit.

.EXAMPLE
    .\scripts\import-cpm-loops.ps1 -CsvPath loops.csv -DryRun
    .\scripts\import-cpm-loops.ps1 -CsvPath loops.csv -WriteSignalAliases
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$CsvPath,
    [string]$GatewayUrl = "http://localhost:8081",
    [string]$Username = "admin",
    [string]$Password = "ChangeMe123!",
    # Also write alias rows (pv_ot_tag -> derived signal path, source 'ot-gateway')
    # so loop signals resolve through the same OT->UNS story as plain telemetry
    # (docs/ot-data-integration/07 §2.2 step 5 — optional but uniform).
    [switch]$WriteSignalAliases,
    # Explicit override for locations not in the asset model (G-07). Off = safe refusal.
    [switch]$AllowUnmodelledLocation,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Invoke-Api([string]$Method, [string]$Path, $Body) {
    $args = @{ Method = $Method; Uri = "$GatewayUrl$Path"; Headers = @{ Authorization = "Bearer $script:Token" } }
    if ($null -ne $Body) {
        $args.ContentType = 'application/json'
        $args.Body = ConvertTo-Json -InputObject $Body -Depth 10 -Compress
    }
    return Invoke-RestMethod @args
}

$login = Invoke-RestMethod -Method Post -Uri "$GatewayUrl/api/auth/login" -ContentType 'application/json' `
    -Body (ConvertTo-Json @{ username = $Username; password = $Password })
$script:Token = $login.token
if (-not $script:Token) { throw "Login failed for '$Username'" }

$rows = @(Import-Csv -Path $CsvPath)
if ($rows.Count -eq 0) { throw "No rows in $CsvPath" }
Write-Host "Read $($rows.Count) loop row(s) from $CsvPath"

$RoleColumns = @{ PV = 'pv_ot_tag'; SP = 'sp_ot_tag'; OP = 'op_ot_tag'; MODE = 'mode_ot_tag'; VP = 'vp_ot_tag' }

$loops = @(); $aliases = @(); $rowErrors = @(); $line = 1
foreach ($r in $rows) {
    $line++
    $loopId = ("$($r.loop_id)").Trim()
    $site = ("$($r.site)").Trim(); $area = ("$($r.area)").Trim(); $unit = ("$($r.unit)").Trim()
    if (-not $loopId) { $rowErrors += "line ${line}: loop_id is required"; continue }
    if (-not $site -or -not $unit) { $rowErrors += "line ${line} ($loopId): site and unit are required"; continue }

    $prefixParts = @($site); if ($area) { $prefixParts += $area }; $prefixParts += $unit
    $prefix = ($prefixParts -join '/').ToLowerInvariant()

    $tags = @()
    foreach ($role in 'PV', 'SP', 'OP', 'MODE', 'VP') {
        $ot = ("$($r.($RoleColumns[$role]))").Trim()
        # VP is opt-in: only mapped when the worksheet names its DCS tag.
        if ($role -eq 'VP' -and -not $ot) { continue }
        $path = "$prefix/$($loopId.ToLowerInvariant()).$($role.ToLowerInvariant())"
        $tag = @{ signalRole = $role; unsPath = $path; sourceSystem = 'ot-gateway' }
        if ($ot) {
            $tag.sourceTag = $ot
            if ($WriteSignalAliases) {
                $aliases += @{ legacyPath = $ot; canonicalPath = $path; sourceSystem = 'ot-gateway' }
            }
        }
        $tags += $tag
    }

    $monitor = $true
    $em = ("$($r.enable_monitoring)").Trim().ToLowerInvariant()
    if ($em -eq 'false' -or $em -eq '0' -or $em -eq 'no') { $monitor = $false }

    $loop = @{
        loopId                  = $loopId
        displayName             = ("$($r.display_name)").Trim()
        site                    = $site
        loopType                = ("$($r.loop_type)").Trim().ToUpperInvariant()
        criticality             = ("$($r.criticality)").Trim().ToLowerInvariant()
        tags                    = $tags
        enableMonitoring        = $monitor
        allowUnmodelledLocation = [bool]$AllowUnmodelledLocation
    }
    if ($area) { $loop.area = $area }
    if ($unit) { $loop.unit = $unit }
    if (("$($r.profile)").Trim()) { $loop.thresholdProfileId = ("$($r.profile)").Trim() }
    # Engineering ranges. Only a bound the sheet actually declares is sent: an
    # omitted one must stay omitted, because the API defaults the missing half
    # (0 / 100) and would invent a span nobody wrote down.
    #   op_min/op_max -> normalizeOp, rescales OP before G2r/G4/G9/G10
    #   pv_min/pv_max -> goodErrorBand = 0.5% of span, drives G3 and OCE
    $eng = @{}
    foreach ($m in @(
        @{ col = 'op_min'; key = 'opMin' }, @{ col = 'op_max'; key = 'opMax' },
        @{ col = 'pv_min'; key = 'pvMin' }, @{ col = 'pv_max'; key = 'pvMax' })) {
        $raw = "$($r.($m.col))".Trim()
        if (-not $raw) { continue }
        $val = 0.0
        if ([double]::TryParse($raw, [ref]$val)) { $eng[$m.key] = $val }
        else { $rowErrors += "line ${line} ($loopId): $($m.col) is not a number ('$raw')" }
    }
    foreach ($pair in @(@('pvMin','pvMax','PV'), @('opMin','opMax','OP'))) {
        if ($eng.ContainsKey($pair[0]) -ne $eng.ContainsKey($pair[1])) {
            Write-Warning "${loopId}: $($pair[2]) range is half-declared - the API defaults the missing bound (min 0, max 100), inventing a span. Give both or neither."
        }
    }
    if ($eng.Count -gt 0) { $loop.engineering = $eng }

    $loops += $loop
}

Write-Host "Plan: $($loops.Count) loop(s) to activate, $($aliases.Count) signal alias(es), $($rowErrors.Count) row error(s)"
foreach ($e in $rowErrors) { Write-Warning $e }
if ($DryRun) {
    foreach ($l in $loops) {
        $roles = @($l.tags | ForEach-Object { $_.signalRole }) -join '/'
        Write-Host ("  {0,-14} {1,-4} {2} [{3}]" -f $l.loopId, $l.loopType, ($l.tags[0].unsPath -replace '\.[a-z]+$', ''), $roles)
    }
    Write-Host "DryRun - nothing written."
    if ($rowErrors.Count -gt 0) { exit 1 } else { exit 0 }
}

# ── activate (one request per <=500 loops; server ceiling is 5000) ───────────
$activated = 0; $failed = @()
for ($i = 0; $i -lt $loops.Count; $i += 500) {
    $chunk = $loops[$i..([Math]::Min($i + 499, $loops.Count - 1))]
    $res = Invoke-Api 'Post' '/api/v1/cpm/loops/bulk-activate' @{ loops = @($chunk) }
    $activated += $res.activated
    foreach ($item in @($res.results)) {
        if (-not $item.ok) { $failed += "$($item.loopId): [$($item.code)] $($item.error)" }
    }
    if ($res.warning) { Write-Warning $res.warning }
}

$aliasCount = 0; $aliasErrors = @()
if ($aliases.Count -gt 0) {
    $res = Invoke-Api 'Post' '/api/aliases/bulk' @{ creates = @($aliases) }
    $aliasCount = $res.created
    foreach ($e in @($res.errors)) {
        if ("$($e.error)" -notlike '*already exists*') { $aliasErrors += "alias $($e.legacyPath): $($e.error)" }
    }
}

Write-Host ""
Write-Host "Done: $activated loop(s) activated, $aliasCount signal alias(es) written."
foreach ($f in $failed) { Write-Warning $f }
foreach ($e in $aliasErrors) { Write-Warning $e }
if (($rowErrors.Count + $failed.Count + $aliasErrors.Count) -gt 0) { exit 1 }
exit 0
