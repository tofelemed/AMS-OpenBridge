<#
.SYNOPSIS
    Imports plant tags (devices + measurements) and their OT aliases into the
    UNS asset model from a handoff CSV, through the API gateway.

.DESCRIPTION
    Scripted counterpart of Administration -> Plant Model -> Import CSV, for
    volume loads and repeatable runs. Columns (docs/plant-model/README.md):
      site,area,unit,device,measurement,name,description,engineering_unit,
      range_lo,range_hi,device_template,ot_tag

    Rules (origin-spec 5.2, same as the UI importer):
      - the existing path set is loaded ONCE (POST /assets/by-paths), never per row
      - hierarchy (site/area/unit) is NEVER created unless -CreateMissingHierarchy
      - parents are derived server-side from the path, so row order is irrelevant
      - re-runs are idempotent: existing paths report "already exists" and are skipped
      - ot_tag cells become alias_mapping rows (source_system 'ot-gateway')

.EXAMPLE
    .\scripts\import-plant-tags.ps1 -CsvPath tags.csv -DryRun
    .\scripts\import-plant-tags.ps1 -CsvPath tags.csv -CreateMissingHierarchy
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$CsvPath,
    [string]$GatewayUrl = "http://localhost:8081",
    [string]$Username = "admin",
    [string]$Password = "ChangeMe123!",
    [switch]$CreateMissingHierarchy,
    [switch]$NoAliases,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# Slug convention (MIGRATION_LOG #17): lowercase, non-alnum -> '_', collapsed,
# 'u' prefix on a leading digit (IoTDB path nodes must not start with one).
function Get-Slug([string]$Name) {
    $s = ($Name.ToLowerInvariant() -replace '[^a-z0-9]+', '_') -replace '_+', '_'
    $s = $s.Trim('_')
    if ($s -match '^[0-9]') { $s = "u$s" }
    return $s
}
$SegmentRx = '^[A-Za-z0-9_-]+$'

function Invoke-Api([string]$Method, [string]$Path, $Body) {
    $args = @{ Method = $Method; Uri = "$GatewayUrl$Path"; Headers = @{ Authorization = "Bearer $script:Token" } }
    if ($null -ne $Body) {
        $args.ContentType = 'application/json'
        $args.Body = ConvertTo-Json -InputObject $Body -Depth 10 -Compress
    }
    return Invoke-RestMethod @args
}

# ── login ────────────────────────────────────────────────────────────────────
$login = Invoke-RestMethod -Method Post -Uri "$GatewayUrl/api/auth/login" -ContentType 'application/json' `
    -Body (ConvertTo-Json @{ username = $Username; password = $Password })
$script:Token = $login.token
if (-not $script:Token) { throw "Login failed for '$Username'" }

$rows = @(Import-Csv -Path $CsvPath)
if ($rows.Count -eq 0) { throw "No rows in $CsvPath" }
Write-Host "Read $($rows.Count) row(s) from $CsvPath"

# ── candidate paths -> ONE existence probe ───────────────────────────────────
$candidates = New-Object System.Collections.Generic.HashSet[string]
foreach ($r in $rows) {
    $prefixes = @('')
    foreach ($level in 'site', 'area', 'unit', 'device') {
        $cell = ("$($r.$level)").Trim()
        if (-not $cell) { if ($level -eq 'area') { continue } else { break } }
        $variants = @($cell, (Get-Slug $cell)) | Where-Object { $_ -match $SegmentRx } | Select-Object -Unique
        $next = @()
        foreach ($p in $prefixes) { foreach ($v in $variants) {
            if ($p) { $next += "$p/$v" } else { $next += $v }
        } }
        $next | ForEach-Object { [void]$candidates.Add($_) }
        $prefixes = $next
    }
    $meas = ("$($r.measurement)").Trim()
    if ($meas) {
        $variants = @($meas, (Get-Slug $meas)) | Where-Object { $_ -match $SegmentRx } | Select-Object -Unique
        foreach ($p in $prefixes) { foreach ($v in $variants) { [void]$candidates.Add("$p.$v") } }
    }
}
$known = New-Object System.Collections.Generic.HashSet[string]
$candidateList = @($candidates)
for ($i = 0; $i -lt $candidateList.Count; $i += 1000) {
    $chunk = $candidateList[$i..([Math]::Min($i + 999, $candidateList.Count - 1))]
    $hits = Invoke-Api 'Post' '/api/assets/by-paths' @{ paths = @($chunk) }
    foreach ($h in @($hits)) { [void]$known.Add($h.contextualPath) }
}
Write-Host "Existence probe: $($known.Count) of $($candidateList.Count) candidate path(s) already modelled"

# ── plan ─────────────────────────────────────────────────────────────────────
function Resolve-Level([string]$Parent, [string]$Cell, [string]$Sep) {
    $join = { param($seg) if ($Parent) { "$Parent$Sep$seg" } else { $seg } }
    if ($Cell -match $SegmentRx) {
        $p = & $join $Cell
        if ($known.Contains($p) -or $script:planned.Contains($p)) { return @{ Path = $p; Exists = $true } }
    }
    $slug = Get-Slug $Cell
    $p = & $join $slug
    if ($known.Contains($p) -or $script:planned.Contains($p)) { return @{ Path = $p; Exists = $true } }
    if (($Cell -match $SegmentRx) -and ($Cell -ceq $Cell.ToLowerInvariant())) { $p = & $join $Cell }
    return @{ Path = $p; Exists = $false }
}

$script:planned = [ordered]@{}   # path -> create object
$aliases = @()
$rowErrors = @()
$line = 1
foreach ($r in $rows) {
    $line++
    $site = ("$($r.site)").Trim()
    if (-not $site) { $rowErrors += "line ${line}: site is required"; continue }
    $area = ("$($r.area)").Trim(); $unit = ("$($r.unit)").Trim()
    $device = ("$($r.device)").Trim(); $meas = ("$($r.measurement)").Trim()
    if ($device -and -not $unit) { $rowErrors += "line ${line}: device given without a unit"; continue }
    if ($meas -and -not $device) { $rowErrors += "line ${line}: measurement given without a device"; continue }

    $chain = @(@{ Level = 'site'; Type = 1; Cell = $site })
    if ($area) { $chain += @{ Level = 'area'; Type = 2; Cell = $area } }
    if ($unit) { $chain += @{ Level = 'unit'; Type = 3; Cell = $unit } }
    if ($device) { $chain += @{ Level = 'device'; Type = 4; Cell = $device } }

    $parent = ''
    $bad = $false
    foreach ($link in $chain) {
        $res = Resolve-Level $parent $link.Cell '/'
        if (-not $res.Exists) {
            if ($link.Type -le 3 -and -not $CreateMissingHierarchy) {
                $rowErrors += "line ${line}: $($link.Level) '$($link.Cell)' is not in the asset model (use -CreateMissingHierarchy to add it)"
                $bad = $true; break
            }
            $create = @{ contextualPath = $res.Path; name = $link.Cell; type = $link.Type }
            if ($link.Type -eq 4) {
                if ("$($r.description)".Trim()) { $create.description = "$($r.description)".Trim() }
                if ("$($r.device_template)".Trim()) { $create.template = "$($r.device_template)".Trim() }
            }
            $script:planned[$res.Path] = $create
        }
        $parent = $res.Path
    }
    if ($bad) { continue }

    if ($meas) {
        $res = Resolve-Level $parent $meas '.'
        if (-not $res.Exists) {
            $create = @{ contextualPath = $res.Path; type = 5 }
            $nm = "$($r.name)".Trim(); if ($nm) { $create.name = $nm } else { $create.name = $meas }
            if ("$($r.description)".Trim()) { $create.description = "$($r.description)".Trim() }
            if ("$($r.engineering_unit)".Trim()) { $create.engineeringUnit = "$($r.engineering_unit)".Trim() }
            $lo = 0.0; $hi = 0.0
            if ([double]::TryParse("$($r.range_lo)", [ref]$lo)) { $create.loEngLimit = $lo }
            if ([double]::TryParse("$($r.range_hi)", [ref]$hi)) { $create.hiEngLimit = $hi }
            $script:planned[$res.Path] = $create
        }
        $ot = "$($r.ot_tag)".Trim()
        if ($ot -and -not $NoAliases) {
            $aliases += @{ legacyPath = $ot; canonicalPath = $res.Path; sourceSystem = 'ot-gateway' }
        }
    }
}

$creates = @($script:planned.Values)
Write-Host ""
Write-Host "Plan: $($creates.Count) asset(s) to create, $($aliases.Count) alias(es), $($rowErrors.Count) row error(s)"
foreach ($e in $rowErrors) { Write-Warning $e }
if ($DryRun) {
    foreach ($c in $creates) { Write-Host ("  {0,-12} {1}" -f @('','Site','Area','Unit','Device','Measurement')[$c.type], $c.contextualPath) }
    Write-Host "DryRun - nothing written."
    if ($rowErrors.Count -gt 0) { exit 1 } else { exit 0 }
}

# ── write ────────────────────────────────────────────────────────────────────
# "already exists" is NOT an error here: it is what an idempotent re-run of the
# same handoff file looks like. Only genuinely failed rows fail the script.
$createdCount = 0; $skipped = 0; $apiErrors = @()
for ($i = 0; $i -lt $creates.Count; $i += 2000) {
    $chunk = $creates[$i..([Math]::Min($i + 1999, $creates.Count - 1))]
    $res = Invoke-Api 'Post' '/api/assets/bulk' @{ creates = @($chunk) }
    $createdCount += @($res.created).Count
    foreach ($e in @($res.errors)) {
        if ("$($e.error)" -like '*already exists*') { $skipped++ }
        else { $apiErrors += "$($e.path): $($e.error)" }
    }
}
$aliasCount = 0
if ($aliases.Count -gt 0) {
    for ($i = 0; $i -lt $aliases.Count; $i += 2000) {
        $chunk = $aliases[$i..([Math]::Min($i + 1999, $aliases.Count - 1))]
        $res = Invoke-Api 'Post' '/api/aliases/bulk' @{ creates = @($chunk) }
        $aliasCount += $res.created
        foreach ($e in @($res.errors)) {
            if ("$($e.error)" -like '*already exists*') { $skipped++ }
            else { $apiErrors += "alias $($e.legacyPath): $($e.error)" }
        }
    }
}

Write-Host ""
Write-Host "Done: $createdCount asset(s) created, $aliasCount alias(es) written, $skipped already-existing skipped."
foreach ($e in $apiErrors) { Write-Warning $e }
if (($rowErrors.Count + $apiErrors.Count) -gt 0) { exit 1 }
exit 0
