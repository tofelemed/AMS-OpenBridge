#Requires -Version 5.1
<#
.SYNOPSIS
  Registers (or removes) the two scheduled tasks that keep the lab PC's C:
  drive from being eaten by the Docker Desktop data disk. Run as Administrator.

.DESCRIPTION
  CHG-032. Tasks run as the current user (WSL distros and Docker Desktop are
  per-user) with RunLevel Highest so Optimize-VHD works without a UAC prompt:
    AMS Lab Docker Disk Reclaim  - daily at -ReclaimAt (default 03:30):
                                   scripts\reclaim-lab-docker-disk.ps1
    AMS Lab Disk Watch           - every 10 minutes: scripts\watch-lab-disk.ps1
  Also registers the 'AMS Lab Disk Guard' Application event-log source.

.EXAMPLE
  .\scripts\install-lab-disk-guard.ps1
  .\scripts\install-lab-disk-guard.ps1 -ReclaimAt 04:00
  .\scripts\install-lab-disk-guard.ps1 -Uninstall
#>
param(
    [string]$ReclaimAt = '03:30',
    [int]$WatchEveryMinutes = 10,
    [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run as Administrator.' }

$reclaimTask = 'AMS Lab Docker Disk Reclaim'
$watchTask = 'AMS Lab Disk Watch'
$user = "$env:USERDOMAIN\$env:USERNAME"
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$reclaim = Join-Path $PSScriptRoot 'reclaim-lab-docker-disk.ps1'
$watch = Join-Path $PSScriptRoot 'watch-lab-disk.ps1'

if ($Uninstall) {
    foreach ($t in @($reclaimTask, $watchTask)) {
        if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $t -Confirm:$false; Write-Output "removed task: $t" }
    }
    exit 0
}
foreach ($f in @($reclaim, $watch)) { if (-not (Test-Path -LiteralPath $f)) { throw "missing $f" } }

if (-not [Diagnostics.EventLog]::SourceExists('AMS Lab Disk Guard')) {
    New-EventLog -LogName Application -Source 'AMS Lab Disk Guard'
    Write-Output 'registered event source: AMS Lab Disk Guard'
}

$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 2) -StartWhenAvailable `
    -MultipleInstances IgnoreNew -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries

$a1 = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$reclaim`"" -WorkingDirectory (Split-Path $PSScriptRoot)
$t1 = New-ScheduledTaskTrigger -Daily -At $ReclaimAt
Register-ScheduledTask -TaskName $reclaimTask -Action $a1 -Trigger $t1 -Principal $principal -Settings $settings -Force `
    -Description 'Graceful Docker stop, fsck + fstrim inside the VM, Optimize-VHD, restart, health verify. Log: D:\DockerSupport\reclaim-docker-*.log' | Out-Null
Write-Output "registered task: $reclaimTask (daily $ReclaimAt, as $user, highest)"

$a2 = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$watch`"" -WorkingDirectory (Split-Path $PSScriptRoot)
$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes $WatchEveryMinutes)
$s2 = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -StartWhenAvailable -MultipleInstances IgnoreNew -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
Register-ScheduledTask -TaskName $watchTask -Action $a2 -Trigger $t2 -Principal $principal -Settings $s2 -Force `
    -Description 'Logs C: free + VHDX size to D:\DockerSupport\disk-watch.csv; stops Docker Desktop gracefully below 20 GB free.' | Out-Null
Write-Output "registered task: $watchTask (every $WatchEveryMinutes min, as $user, highest)"

Start-ScheduledTask -TaskName $watchTask
Write-Output 'started first watch sample'
