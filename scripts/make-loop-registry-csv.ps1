# Generates a loop-registry bulk-import CSV for testing the /cpm/registry importer.
#
# Signal columns are left BLANK on purpose for most rows: the importer derives
# site/[area/]unit/<tag>.<role> from the location, which is the path real
# operators should use. A few rows carry explicit paths and deliberate faults so
# the preview's validation can be seen working.
#
#   .\scripts\make-loop-registry-csv.ps1                       # 50 clean rows + fault rows
#   .\scripts\make-loop-registry-csv.ps1 -Count 200 -Clean     # 200 rows, no fault rows
#   .\scripts\make-loop-registry-csv.ps1 -Count 25 -Site houston -Unit crude1 -Path .\my.csv
param(
    [int]$Count = 50,
    [string]$Site = 'houston',
    [string]$Area = '',
    [string]$Unit = 'crude1',
    [string]$Prefix = 'DEMO',
    [string]$Path = '',
    [switch]$Clean          # omit the deliberately-invalid rows
)

$ErrorActionPreference = 'Stop'

if (-not $Path) {
    $dir = Join-Path (Split-Path -Parent $PSScriptRoot) 'tests\fixtures'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $Path = Join-Path $dir "loop-registry-$Count-loops.csv"
}

$loopTypes = @('FIC', 'PIC', 'LIC', 'TIC')
$criticalities = @('low', 'medium', 'high', 'critical')
$services = @(
    'Feed flow control', 'Reflux drum level', 'Column overhead pressure',
    'Reboiler steam flow', 'Bed inlet temperature', 'Condenser outlet temperature',
    'Fuel gas pressure', 'Separator interface level', 'Recycle compressor suction pressure'
)

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('tag,service,site,area,unit,loop_type,criticality,pv_tag,sp_tag,op_tag,mode_tag,vp_tag,profile')

for ($i = 1; $i -le $Count; $i++) {
    $type = $loopTypes[($i - 1) % $loopTypes.Count]
    $crit = $criticalities[($i - 1) % $criticalities.Count]
    $svc = $services[($i - 1) % $services.Count]
    # Realistic plant tag: dashes are legal now (45FIC-109 shape).
    $tag = '{0}-{1}-{2:D3}' -f $Prefix, $type, $i

    if ($i % 10 -eq 0) {
        # Every 10th row spells the paths out explicitly, incl. VP, to prove
        # explicit paths and derived paths can be mixed in one file.
        $lower = $tag.ToLower()
        $base = ((@($Site, $Area, $Unit) | Where-Object { $_ }) -join '/') + '/' + $lower
        $lines.Add("$tag,$svc,$Site,$Area,$Unit,$type,$crit,$base.pv,$base.sp,$base.op,$base.mode,$base.vp,")
    }
    elseif ($i % 7 -eq 0) {
        # A quoted service description containing a comma - the classic CSV trap.
        $lines.Add("$tag,`"$svc, train 2`",$Site,$Area,$Unit,$type,$crit,,,,,,")
    }
    else {
        $lines.Add("$tag,$svc,$Site,$Area,$Unit,$type,$crit,,,,,,")
    }
}

if (-not $Clean) {
    $lines.Add('')
    $lines.Add("# the rows below are deliberately invalid - the preview should flag each one")
    $lines.Add("$Prefix-BAD-001,Missing loop type,$Site,$Area,$Unit,,high,,,,,,")
    $lines.Add("$Prefix/BAD/002,Slash breaks the URL path,$Site,$Area,$Unit,FIC,high,,,,,,")
    $lines.Add("$Prefix-BAD-003,Unknown loop type,$Site,$Area,$Unit,FLOW,high,,,,,,")
    $lines.Add("$Prefix-BAD-004,Unknown criticality,$Site,$Area,$Unit,FIC,urgent,,,,,,")
    $lines.Add("$Prefix-BAD-005,Dotted historian path,$Site,$Area,$Unit,FIC,high,root.$Site.$Unit.bad005.pv,,,,,")
    $lines.Add("$Prefix-BAD-006,Unmodelled location,narnia,,unit9,FIC,high,,,,,,")
    $lines.Add("$Prefix-FIC-001,Duplicate of the first row,$Site,$Area,$Unit,FIC,high,,,,,,")
    # ${Prefix}_... — underscores are legal in PowerShell variable names, so
    # "$Prefix_FIC_001" would resolve an undefined variable and emit a blank tag.
    $lines.Add("${Prefix}_FIC_001,Punctuation twin of the first row,$Site,$Area,$Unit,FIC,high,,,,,,")
}

# UTF-8 without BOM: the browser reads it as text/csv and a BOM would end up in
# the first header cell.
[System.IO.File]::WriteAllLines($Path, $lines, (New-Object System.Text.UTF8Encoding($false)))

$valid = $Count
Write-Host "wrote $Path"
Write-Host "  $valid importable row(s)$(if (-not $Clean) { ' + 8 deliberately-invalid rows' })"
Write-Host "  location: $((@($Site,$Area,$Unit) | Where-Object {$_}) -join '/')"
Write-Host "  signal paths: derived (blank) except every 10th row, which is explicit"
