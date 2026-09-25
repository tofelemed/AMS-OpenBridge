#Requires -Version 5.1
<#
.SYNOPSIS
  Nightly reclaim of the lab Docker Desktop data disk:
  graceful stop -> fsck -> fstrim -> detach -> Optimize-VHD -> start -> verify.

.DESCRIPTION
  CHG-032. docker_data.vhdx is a dynamically expanding VHDX. The Docker VM never
  trims it and Docker Desktop's own shutdown compaction is skipped since
  4.91 / WSL 2.7.14 ("The disk failed to detach"), so the file only grows:
  on 2026-09-20 it went 75 GB -> 166 GB in 9 h with 57 GB of live data and took
  C: to zero twice. Optimize-VHD only reclaims blocks the guest has TRIMmed, so
  a trim inside the VM must precede compaction (untrimmed run: 25 MB reclaimed;
  trimmed run: 103 GB reclaimed).

  Never deletes images, containers or volumes. Refuses to compact while the
  disk is attached. Requires Windows administrator (Optimize-VHD) and the
  Hyper-V PowerShell module. Meant to run from the scheduled task registered by
  scripts/install-lab-disk-guard.ps1 (RunLevel Highest, no UAC prompt).

.EXAMPLE
  .\scripts\reclaim-lab-docker-disk.ps1                  # full cycle
  .\scripts\reclaim-lab-docker-disk.ps1 -NoStart         # leave Docker stopped
  .\scripts\reclaim-lab-docker-disk.ps1 -SkipVerify
#>
param(
    [string]$DiskPath = 'C:\Users\Admin\DockerDesktopWSL\disk\docker_data.vhdx',
    [string]$LogDir = 'D:\DockerSupport',
    [string]$Distro = 'docker-desktop',
    [int]$ExpectedFlinkJobs = 13,
    [int]$VerifyTimeoutSec = 420,
    [switch]$SkipVerify,
    [switch]$NoStart
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$logPath = Join-Path $LogDir ("reclaim-docker-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

function Write-Log([string]$Msg, [string]$Level = 'INFO') {
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Msg
    Add-Content -LiteralPath $logPath -Value $line
    Write-Host $line
}
function Get-GB([long]$Bytes) { [math]::Round($Bytes / 1GB, 2) }
function Get-Sizes() {
    "VHDX={0} GB  C:free={1} GB" -f (Get-GB (Get-Item -LiteralPath $DiskPath).Length), (Get-GB (Get-PSDrive C).Free)
}
function Test-Detached() {
    try { $fs = [IO.File]::Open($DiskPath, 'Open', 'Read', 'None'); $fs.Close(); return $true } catch { return $false }
}
function Invoke-Wsl([string[]]$Wsl) {
    # wsl.exe prints UTF-16 (strip NULs). Guest tools such as resize2fs print their
    # banner on stderr; with $ErrorActionPreference = 'Stop' that would become a
    # terminating error and kill the pipeline mid-operation, so treat stderr as text.
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        $out = & wsl.exe @Wsl 2>&1 | ForEach-Object {
            if ($_ -is [System.Management.Automation.ErrorRecord]) { "$($_.Exception.Message)" } else { "$_" }
        } | ForEach-Object { $_ -replace "`0", '' } | Where-Object { $_ -ne '' }
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $prev }
    return @{ Code = $code; Out = @($out) }
}

function Stop-DockerDesktop() {
    if (Get-Process -Name 'com.docker.backend' -ErrorAction SilentlyContinue) {
        Write-Log "docker desktop stop (graceful: containers get their stop signal)"
        $prevEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        $deadline = (Get-Date).AddMinutes(4)
        while ((Get-Date) -lt $deadline -and (Get-Process -Name 'com.docker.backend' -ErrorAction SilentlyContinue)) {
            Start-Sleep -Seconds 5
        }
        if (Get-Process -Name 'com.docker.backend' -ErrorAction SilentlyContinue) {
            Write-Log "backend still running after 4 min; stopping process" 'WARN'
            Get-Process -Name 'com.docker.backend', 'Docker Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force
            Start-Sleep -Seconds 5
        }
    } else {
        Write-Log "Docker Desktop is not running"
    }
    # Docker Desktop cannot detach the disk itself (WSL 2.7.14); a VM shutdown releases it.
    Write-Log "wsl --shutdown"
    Invoke-Wsl @('--shutdown') | Out-Null
    Start-Sleep -Seconds 5
    if (-not (Test-Detached)) { throw "VHDX still locked after wsl --shutdown" }
}

function Invoke-GuestMaintenance() {
    # Attach the disk to the (started) distro, fsck it, trim free space, detach.
    $vhd = Get-VHD -Path $DiskPath
    if ($vhd.Attached) { throw "Disk is attached before maintenance; refusing" }
    $sectors = [long]($vhd.Size / 512)
    Write-Log ("virtual size {0} GB ({1} sectors)" -f (Get-GB $vhd.Size), $sectors)

    $guest = Join-Path $LogDir 'guest-maint.sh'
    @'
#!/bin/sh
# $1 = sector count of the data disk. Picks the unmounted sd* with that size.
set -u
dev=""
for d in /sys/block/sd*; do
  n=$(basename "$d")
  if [ "$(cat "$d/size")" = "$1" ] && ! mount | grep -q "^/dev/$n "; then dev="/dev/$n"; fi
done
[ -n "$dev" ] || { echo "GUEST: data disk not found"; exit 10; }
echo "GUEST: device $dev"
e2fsck -f -p "$dev" 2>&1; rc=$?
echo "GUEST: e2fsck exit $rc"
if [ "$rc" -ge 4 ]; then echo "GUEST: fsck needs manual attention (e2fsck -f -y); skipping trim"; exit 11; fi
mkdir -p /tmp/dd && mount "$dev" /tmp/dd 2>&1 || { echo "GUEST: mount failed"; exit 12; }
df -B1 /tmp/dd | tail -1 | awk '{printf "GUEST: used=%.1fG avail=%.1fG\n", $3/1e9, $4/1e9}'
fstrim -v /tmp/dd 2>&1; rc=$?
echo "GUEST: fstrim exit $rc"
sync; umount /tmp/dd && echo "GUEST: unmounted"
exit 0
'@ | Set-Content -LiteralPath $guest -Encoding ASCII -NoNewline
    # LF endings for busybox sh
    [IO.File]::WriteAllText($guest, ([IO.File]::ReadAllText($guest) -replace "`r`n", "`n"))

    Write-Log "starting distro $Distro (before attaching, so it does not auto-mount the disk)"
    $r = Invoke-Wsl @('-d', $Distro, '-e', 'true'); if ($r.Code -ne 0) { throw "distro start failed: $($r.Out)" }
    Write-Log "wsl --mount --bare --vhd"
    $r = Invoke-Wsl @('--mount', '--bare', '--vhd', $DiskPath); if ($r.Code -ne 0) { throw "attach failed: $($r.Out)" }
    try {
        $guestPath = '/mnt/host/' + $guest.Substring(0, 1).ToLower() + ($guest.Substring(2) -replace '\\', '/')
        $r = Invoke-Wsl @('-d', $Distro, '-e', 'sh', $guestPath, "$sectors")
        $r.Out | ForEach-Object { Write-Log "  $_" }
        if ($r.Code -ne 0) { Write-Log "guest maintenance exit $($r.Code)" 'WARN' }
    } finally {
        $r = Invoke-Wsl @('--unmount', $DiskPath)
        if ($r.Code -ne 0) { Write-Log "wsl --unmount failed ($($r.Out)); falling back to wsl --shutdown" 'WARN' }
        Invoke-Wsl @('--shutdown') | Out-Null
        Start-Sleep -Seconds 5
    }
    if (-not (Test-Detached)) { throw "VHDX still locked after guest maintenance" }
}

function Invoke-Compaction() {
    $vhd = Get-VHD -Path $DiskPath
    if ($vhd.Attached) { throw "Disk is attached; refusing compaction" }
    if ($vhd.VhdType -ne 'Dynamic') { throw "Expected a dynamic VHDX, got $($vhd.VhdType)" }
    $before = (Get-Item -LiteralPath $DiskPath).Length
    Write-Log "Optimize-VHD -Mode Full (before: $(Get-GB $before) GB)"
    Optimize-VHD -Path $DiskPath -Mode Full
    $after = (Get-Item -LiteralPath $DiskPath).Length
    Write-Log ("compaction done: {0} GB -> {1} GB, reclaimed {2} GB" -f (Get-GB $before), (Get-GB $after), (Get-GB ($before - $after)))
}

function Start-DockerDesktop() {
    $starter = Join-Path $PSScriptRoot 'start-lab-docker.ps1'
    Write-Log "starting Docker Desktop via $starter"
    $prevEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $deadline = (Get-Date).AddMinutes(4)
    while ((Get-Date) -lt $deadline) {
        $v = & docker version --format '{{.Server.Version}}' 2>$null
        if ($v) { Write-Log "engine up: $v"; return }
        Start-Sleep -Seconds 5
    }
    throw "engine did not come up within 4 min"
}

function Test-StackHealthy() {
    $deadline = (Get-Date).AddSeconds($VerifyTimeoutSec)
    $last = ''
    while ((Get-Date) -lt $deadline) {
        $bad = @(& docker ps -a --filter 'status=restarting' --filter 'health=unhealthy' --format '{{.Names}}' 2>$null)
        $healthy = @(& docker ps --filter 'health=healthy' --format '{{.Names}}' 2>$null).Count
        $running = 0; $gw = 0
        try { $running = @((Invoke-RestMethod 'http://localhost:8082/jobs/overview' -TimeoutSec 20).jobs | Where-Object { $_.state -eq 'RUNNING' }).Count } catch {}
        try { $gw = (Invoke-WebRequest 'http://localhost:8081/gw/health' -TimeoutSec 20 -UseBasicParsing).StatusCode } catch {}
        $last = "healthy=$healthy bad=[$($bad -join ',')] flinkRunning=$running/$ExpectedFlinkJobs gateway=$gw"
        if ($bad.Count -eq 0 -and $running -ge $ExpectedFlinkJobs -and $gw -eq 200) {
            Write-Log "verify OK: $last"; return $true
        }
        Start-Sleep -Seconds 15
    }
    Write-Log "verify FAILED after $VerifyTimeoutSec s: $last" 'ERROR'
    return $false
}

# ---------------------------------------------------------------- main
try {
    $identity = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Windows administrator elevation is required (Optimize-VHD).' }
    if (-not (Get-Command Optimize-VHD -ErrorAction SilentlyContinue)) { throw 'Hyper-V PowerShell module (Optimize-VHD) not available.' }
    if ((Resolve-Path -LiteralPath $DiskPath).ProviderPath -ne $DiskPath) { throw 'Unexpected disk path.' }

    Write-Log "START  $(Get-Sizes)"
    Stop-DockerDesktop
    Invoke-GuestMaintenance
    Invoke-Compaction
    Write-Log "AFTER  $(Get-Sizes)"
    if ($NoStart) { Write-Log "NoStart: leaving Docker Desktop stopped"; exit 0 }
    Start-DockerDesktop
    if (-not $SkipVerify) { if (-not (Test-StackHealthy)) { exit 2 } }
    Write-Log "DONE   $(Get-Sizes)"
    exit 0
} catch {
    Write-Log "FAILED: $($_.Exception.Message)" 'ERROR'
    if (-not $NoStart -and -not (Get-Process -Name 'com.docker.backend' -ErrorAction SilentlyContinue)) {
        Write-Log "attempting to start Docker Desktop after failure"
        try { Start-DockerDesktop } catch { Write-Log "start failed: $($_.Exception.Message)" 'ERROR' }
    }
    exit 1
}
