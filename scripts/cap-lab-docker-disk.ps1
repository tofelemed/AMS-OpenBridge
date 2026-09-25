#Requires -Version 5.1
<#
.SYNOPSIS
  One-time hard cap on the lab Docker Desktop data disk: shrinks the ext4
  inside docker_data.vhdx and the VHDX itself from 1 TB to -NewSizeGB, and
  records that size in Docker Desktop's settings so it is not grown back.

.DESCRIPTION
  CHG-032. The default 1 TB virtual disk is larger than C: (480 GB), so an
  uncapped VHDX can take the host to zero. With a cap, the worst case is
  ENOSPC inside the VM (containers stop, data intact) instead of I/O errors,
  a read-only filesystem and a Docker Desktop crash loop.

  Runs reclaim-lab-docker-disk.ps1 -NoStart first (graceful stop, fsck, trim,
  compact), then: resize2fs inside the VM -> Resize-VHD -> settings update ->
  start Docker -> verify the disk size the containers see. Aborts, changing
  nothing, if Hyper-V reports a minimum size above the target or if used
  space exceeds -MaxUsedPercent of the new filesystem.
  Requires Windows administrator and the Hyper-V PowerShell module.

.EXAMPLE
  .\scripts\cap-lab-docker-disk.ps1 -NewSizeGB 160
#>
param(
    [int]$NewSizeGB = 160,
    [int]$MaxUsedPercent = 70,
    [string]$DiskPath = 'C:\Users\Admin\DockerDesktopWSL\disk\docker_data.vhdx',
    [string]$SettingsPath = "$env:APPDATA\Docker\settings-store.json",
    [string]$LogDir = 'D:\DockerSupport',
    [string]$Distro = 'docker-desktop'
)
$ErrorActionPreference = 'Stop'
$logPath = Join-Path $LogDir ("cap-docker-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
function Write-Log([string]$Msg, [string]$Level = 'INFO') {
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Msg
    Add-Content -LiteralPath $logPath -Value $line; Write-Host $line
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
function Test-Detached() { try { $fs = [IO.File]::Open($DiskPath, 'Open', 'Read', 'None'); $fs.Close(); $true } catch { $false } }

try {
    $identity = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run as Administrator.' }
    if (-not (Get-Command Resize-VHD -ErrorAction SilentlyContinue)) { throw 'Hyper-V PowerShell module not available.' }
    if ($NewSizeGB -lt 64) { throw 'Refusing a cap below 64 GB.' }
    $fsGiB = $NewSizeGB - 1
    $newBytes = [long]$NewSizeGB * 1GB

    Write-Log "step 1: reclaim (stop, fsck, trim, compact) and leave Docker stopped"
    & (Join-Path $PSScriptRoot 'reclaim-lab-docker-disk.ps1') -DiskPath $DiskPath -LogDir $LogDir -Distro $Distro -NoStart
    if ($LASTEXITCODE -ne 0) { throw "reclaim step failed (exit $LASTEXITCODE)" }
    if (-not (Test-Detached)) { throw 'disk still attached after reclaim' }

    $vhd = Get-VHD -Path $DiskPath
    Write-Log ("current: virtual {0} GB, file {1} GB, MinimumSize {2}" -f [math]::Round($vhd.Size / 1GB), [math]::Round($vhd.FileSize / 1GB, 1), $vhd.MinimumSize)
    if ($vhd.Size -le $newBytes) { Write-Log "already at or below $NewSizeGB GB; nothing to do"; exit 0 }
    if ($vhd.MinimumSize -and $vhd.MinimumSize -gt $newBytes) { throw "Hyper-V minimum size $([math]::Round($vhd.MinimumSize/1GB)) GB exceeds target; not shrinking" }

    # step 2: shrink the filesystem inside the VM
    $guest = Join-Path $LogDir 'guest-shrink.sh'
    @'
#!/bin/sh
# $1 = sector count, $2 = new fs size in GiB, $3 = max used percent
set -u
dev=""
for d in /sys/block/sd*; do n=$(basename "$d"); if [ "$(cat "$d/size")" = "$1" ] && ! mount | grep -q "^/dev/$n "; then dev="/dev/$n"; fi; done
[ -n "$dev" ] || { echo "GUEST: data disk not found"; exit 10; }
used=$(dumpe2fs -h "$dev" 2>/dev/null | awk -F: '/^Block count/{bc=$2} /^Free blocks/{fb=$2} END{print (bc-fb)*4096}')
limit=$(( $2 * 1024 * 1024 * 1024 * $3 / 100 ))
echo "GUEST: $dev used=$used bytes, limit=$limit bytes ($3% of ${2}GiB)"
[ "$used" -lt "$limit" ] || { echo "GUEST: used space too high for the new size"; exit 13; }
e2fsck -f -p "$dev" 2>&1; rc=$?; echo "GUEST: e2fsck exit $rc"; [ "$rc" -lt 4 ] || exit 11
resize2fs "$dev" "${2}G" 2>&1 || { echo "GUEST: resize2fs failed"; exit 14; }
e2fsck -f -p "$dev" 2>&1; rc=$?; echo "GUEST: post-resize e2fsck exit $rc"; [ "$rc" -lt 4 ] || exit 11
dumpe2fs -h "$dev" 2>/dev/null | grep -E "^Block count"
exit 0
'@ | Set-Content -LiteralPath $guest -Encoding ASCII -NoNewline
    [IO.File]::WriteAllText($guest, ([IO.File]::ReadAllText($guest) -replace "`r`n", "`n"))
    $guestPath = '/mnt/host/' + $guest.Substring(0, 1).ToLower() + ($guest.Substring(2) -replace '\\', '/')
    $sectors = [long]($vhd.Size / 512)

    Write-Log "step 2: resize2fs to ${fsGiB}G inside $Distro"
    $r = Invoke-Wsl @('-d', $Distro, '-e', 'true'); if ($r.Code -ne 0) { throw "distro start failed: $($r.Out)" }
    $r = Invoke-Wsl @('--mount', '--bare', '--vhd', $DiskPath); if ($r.Code -ne 0) { throw "attach failed: $($r.Out)" }
    try {
        $r = Invoke-Wsl @('-d', $Distro, '-e', 'sh', $guestPath, "$sectors", "$fsGiB", "$MaxUsedPercent")
        $r.Out | ForEach-Object { Write-Log "  $_" }
        if ($r.Code -ne 0) { throw "guest shrink failed (exit $($r.Code)); filesystem unchanged unless resize2fs itself failed mid-way (see log)" }
    } finally {
        $u = Invoke-Wsl @('--unmount', $DiskPath)
        if ($u.Code -ne 0) { Write-Log "wsl --unmount failed; wsl --shutdown" 'WARN' }
        Invoke-Wsl @('--shutdown') | Out-Null; Start-Sleep -Seconds 5
    }
    if (-not (Test-Detached)) { throw 'disk still attached after shrink' }

    Write-Log "step 3: Resize-VHD to $NewSizeGB GB"
    Resize-VHD -Path $DiskPath -SizeBytes $newBytes
    $vhd = Get-VHD -Path $DiskPath
    Write-Log ("now: virtual {0} GB, file {1} GB" -f [math]::Round($vhd.Size / 1GB), [math]::Round($vhd.FileSize / 1GB, 1))

    Write-Log "step 4: record DiskSizeMiB=$($NewSizeGB * 1024) in Docker Desktop settings"
    Copy-Item -LiteralPath $SettingsPath -Destination (Join-Path $LogDir ("settings-store.before-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss')))
    $s = Get-Content -LiteralPath $SettingsPath -Raw | ConvertFrom-Json
    if ($s.PSObject.Properties['DiskSizeMiB']) { $s.DiskSizeMiB = $NewSizeGB * 1024 } else { $s | Add-Member -NotePropertyName DiskSizeMiB -NotePropertyValue ($NewSizeGB * 1024) }
    [IO.File]::WriteAllText($SettingsPath, ($s | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding $false))

    Write-Log "step 5: start Docker Desktop and verify the size containers see"
    $prevEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $deadline = (Get-Date).AddMinutes(4); $up = $false
    while ((Get-Date) -lt $deadline) { if (& docker version --format '{{.Server.Version}}' 2>$null) { $up = $true; break }; Start-Sleep -Seconds 5 }
    if (-not $up) { throw 'engine did not come up' }
    $df = (& docker run --rm alpine:3.20 sh -c 'df -h / | tail -1' 2>$null | Select-Object -Last 1)
    Write-Log "container view of the data disk: $df"
    Write-Log "DONE"
    exit 0
} catch {
    Write-Log "FAILED: $($_.Exception.Message)" 'ERROR'
    if (-not (Get-Process -Name 'com.docker.backend' -ErrorAction SilentlyContinue)) {
        try { & (Join-Path $PSScriptRoot 'start-lab-docker.ps1') | Out-Null; Write-Log 'Docker Desktop start requested after failure' } catch {}
    }
    exit 1
}
