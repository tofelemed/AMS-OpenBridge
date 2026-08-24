# Measures how long a bulk loop import actually takes, at the SAME concurrency
# the Loop Registry UI uses, so the recommended batch size is a measurement and
# not a guess.
#
# Each activated loop is more than one insert: it writes the registry row + tag
# map, projects peer links, projects one signal asset per stored role into the
# asset model (an HTTP round trip each), and publishes evidence to Kafka. That
# per-loop cost is what bounds a batch.
#
#   .\scripts\measure-loop-import-throughput.ps1                  # 10, 25, 50
#   .\scripts\measure-loop-import-throughput.ps1 -Batches 25,100 -Concurrency 4
param(
    [string]$GatewayBase = 'http://localhost:8081',
    [string]$AdminUser = 'admin',
    [string]$AdminPassword = '',
    [int[]]$Batches = @(10, 25, 50),
    [int]$Concurrency = 4,      # matches CONCURRENCY in the import dialog
    [string]$Site = 'houston',
    [string]$Unit = 'crude1',
    [switch]$KeepLoops
)

$ErrorActionPreference = 'Stop'

if (-not $AdminPassword) {
    $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'infra\docker\.env'
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^AUTH_BOOTSTRAP_PASSWORD=' } | Select-Object -First 1
        if ($line) { $AdminPassword = $line.Split('=', 2)[1] }
    }
    if (-not $AdminPassword) { $AdminPassword = 'ChangeMe123!' }
}

$cpm = "$GatewayBase/api/v1/cpm"
$login = Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/auth/login" -ContentType 'application/json' `
    -Body (@{ username = $AdminUser; password = $AdminPassword } | ConvertTo-Json)
$token = $login.token
$H = @{ Authorization = "Bearer $token" }

Write-Host "`n=== Loop import throughput ===" -ForegroundColor Cyan
Write-Host "gateway: $GatewayBase | concurrency: $Concurrency | location: $Site/$Unit`n"

# Runspace pool so the calls really are concurrent, like the browser's workers.
$activateBlock = {
    param($uri, $token, $loopId, $site, $unit, $paths)
    $tags = @()
    foreach ($role in @('PV', 'SP', 'OP', 'MODE')) {
        $tags += @{ signalRole = $role; unsPath = $paths[$role] }
    }
    $body = @{
        loopId = $loopId; displayName = "Throughput probe $loopId"
        site = $site; unit = $unit; loopType = 'FIC'; criticality = 'medium'
        tags = $tags; enableMonitoring = $true
    } | ConvertTo-Json -Depth 6
    try {
        Invoke-RestMethod -Method Post -Uri $uri -Headers @{ Authorization = "Bearer $token" } `
            -ContentType 'application/json' -Body $body -TimeoutSec 120 | Out-Null
        return $true
    } catch { return $false }
}

$allTags = New-Object System.Collections.Generic.List[string]
$results = @()

foreach ($n in $Batches) {
    $pool = [runspacefactory]::CreateRunspacePool(1, $Concurrency)
    $pool.Open()
    $jobs = @()
    $prefix = "PERF$($n)_"

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    for ($i = 1; $i -le $n; $i++) {
        $loopId = "{0}{1:D4}" -f $prefix, $i
        $allTags.Add($loopId)
        $lower = $loopId.ToLower()
        $paths = @{
            PV = "$Site/$Unit/$lower.pv"; SP = "$Site/$Unit/$lower.sp"
            OP = "$Site/$Unit/$lower.op"; MODE = "$Site/$Unit/$lower.mode"
        }
        $ps = [powershell]::Create().AddScript($activateBlock).
            AddArgument("$cpm/loops/activate").AddArgument($token).AddArgument($loopId).
            AddArgument($Site).AddArgument($Unit).AddArgument($paths)
        $ps.RunspacePool = $pool
        $jobs += [pscustomobject]@{ Ps = $ps; Handle = $ps.BeginInvoke() }
    }
    $ok = 0
    foreach ($j in $jobs) {
        if ($j.Ps.EndInvoke($j.Handle)) { $ok++ }
        $j.Ps.Dispose()
    }
    $sw.Stop()
    $pool.Close(); $pool.Dispose()

    $secs = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    $perLoop = [math]::Round($sw.Elapsed.TotalMilliseconds / $n, 0)
    $rate = [math]::Round($n / $sw.Elapsed.TotalSeconds, 1)
    $results += [pscustomobject]@{
        Loops = $n; Activated = $ok; Seconds = $secs; 'ms/loop' = $perLoop; 'loops/s' = $rate
    }
    Write-Host ("  {0,4} loops -> {1,6}s  ({2} ms/loop, {3} loops/s, {4}/{0} ok)" -f $n, $secs, $perLoop, $rate, $ok)
}

Write-Host ""
$results | Format-Table -AutoSize

# Extrapolate from the largest measured batch.
$last = $results[-1]
foreach ($size in @(100, 250, 500, 1000)) {
    $est = [math]::Round($size / $last.'loops/s', 0)
    Write-Host ("  ~{0,4} loops would take ~{1}s ({2})" -f $size, $est, [TimeSpan]::FromSeconds($est).ToString('mm\:ss'))
}

if (-not $KeepLoops) {
    # DELETE is a mutation too, so a large probe run exhausts the same window the
    # activates just filled: retry on 429 or the probes are left behind.
    Write-Host "`ncleaning up $($allTags.Count) probe loops..."
    $deleted = 0
    foreach ($tag in $allTags) {
        $uri = "$cpm/loops/$([uri]::EscapeDataString($tag))"
        for ($a = 0; $a -lt 6; $a++) {
            try { Invoke-RestMethod -Method Delete -Uri $uri -Headers $H | Out-Null; $deleted++; break }
            catch {
                if ($null -ne $_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 429) {
                    Start-Sleep -Seconds 12
                } else { break }
            }
        }
    }
    Write-Host "deleted $deleted of $($allTags.Count)."
}
