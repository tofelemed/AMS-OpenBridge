#Requires -Version 5.1
<#
.SYNOPSIS
  Lab disk guard: logs C: free space and the Docker data VHDX size, warns when
  free space is low, and stops Docker Desktop gracefully before C: hits zero.

.DESCRIPTION
  CHG-032. When C: reached 0 on 2026-09-20 the Docker VM got I/O errors, ext4
  went read-only, dockerd died, and Docker Desktop crash-looped; a graceful
  stop at 20 GB free turns that into a clean outage with intact data.
  Runs every 10 minutes from the task registered by install-lab-disk-guard.ps1.
  Appends one CSV row per run to D:\DockerSupport\disk-watch.csv so growth
  can be plotted (GB/h is logged too).

.EXAMPLE
  .\scripts\watch-lab-disk.ps1                 # one sample
  .\scripts\watch-lab-disk.ps1 -StopGB 30
#>
param(
    [string]$DiskPath = 'C:\Users\Admin\DockerDesktopWSL\disk\docker_data.vhdx',
    [string]$LogDir = 'D:\DockerSupport',
    [double]$WarnGB = 40,
    [double]$StopGB = 20
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$csv = Join-Path $LogDir 'disk-watch.csv'
$log = Join-Path $LogDir 'disk-watch.log'

function Write-Log([string]$Msg, [string]$Level = 'INFO') {
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Msg
    Add-Content -LiteralPath $log -Value $line
    Write-Host $line
    if ($Level -ne 'INFO') {
        try { Write-EventLog -LogName Application -Source 'AMS Lab Disk Guard' -EntryType $(if ($Level -eq 'ERROR') { 'Error' } else { 'Warning' }) -EventId 4210 -Message $Msg } catch {}
    }
}

$now = Get-Date
$free = [math]::Round((Get-PSDrive C).Free / 1GB, 2)
$vhdx = if (Test-Path -LiteralPath $DiskPath) { [math]::Round((Get-Item -LiteralPath $DiskPath).Length / 1GB, 2) } else { 0 }
$dockerUp = [bool](Get-Process -Name 'com.docker.backend' -ErrorAction SilentlyContinue)

# growth since the previous sample
$rate = ''
if (Test-Path -LiteralPath $csv) {
    $prev = Get-Content -LiteralPath $csv -Tail 1
    if ($prev -and $prev -notmatch '^timestamp') {
        $p = $prev -split ','
        try {
            $dt = ($now - [datetime]::ParseExact($p[0], 'yyyy-MM-dd HH:mm:ss', $null)).TotalHours
            if ($dt -gt 0.05) { $rate = [math]::Round(($vhdx - [double]$p[2]) / $dt, 2) }
        } catch {}
    }
} else {
    Set-Content -LiteralPath $csv -Value 'timestamp,c_free_gb,vhdx_gb,docker_up,vhdx_gb_per_hour'
}
Add-Content -LiteralPath $csv -Value ("{0},{1},{2},{3},{4}" -f $now.ToString('yyyy-MM-dd HH:mm:ss'), $free, $vhdx, $dockerUp, $rate)

$summary = "C: free $free GB, VHDX $vhdx GB, docker=$dockerUp" + $(if ($rate -ne '') { ", growth $rate GB/h" } else { '' })
if ($free -lt $StopGB) {
    if ($dockerUp) {
        Write-Log "C: below $StopGB GB ($summary). Stopping Docker Desktop gracefully to protect the data disk. Run scripts\reclaim-lab-docker-disk.ps1 (admin) to reclaim and restart." 'ERROR'
        & docker desktop stop 2>&1 | ForEach-Object { Write-Log "  $_" }
    } else {
        Write-Log "C: below $StopGB GB and Docker already stopped ($summary)" 'ERROR'
    }
} elseif ($free -lt $WarnGB) {
    Write-Log "C: below $WarnGB GB ($summary)" 'WARN'
} else {
    Write-Log $summary
}
