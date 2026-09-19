<#
.SYNOPSIS
  Reclaim host disk space from Docker Desktop's WSL2 data disk (docker_data.vhdx).

.DESCRIPTION
  The WSL2 VHDX is sparse-grow-only: `docker system prune` frees space *inside* the VM but the
  host file never shrinks until it is compacted. This script:
    1. (optional, -Prune) prunes build cache + dangling images/volumes inside Docker
    2. runs `fstrim` inside the engine VM. The data disk is mounted WITHOUT `discard`, so blocks
       freed inside the VM are never reported to the hypervisor and Optimize-VHD reclaims nothing
       (observed 2026-09-19: 74 GB used inside, 177 GB VHDX, compaction freed 0.1 GB until trimmed).
    3. stops Docker Desktop and shuts down the WSL VM
    4. compacts the VHDX with Optimize-VHD (falls back to diskpart if Hyper-V cmdlets are absent)
    5. restarts Docker Desktop (unless -NoRestart)

  Requires an ELEVATED PowerShell. Takes the whole lab stack down for 5-10 min; containers come
  back with `.\run-all.ps1 -SkipBuild` (or Docker Desktop's restore-on-start).

.EXAMPLE
  .\scripts\compact-docker-vhdx.ps1            # compact only
  .\scripts\compact-docker-vhdx.ps1 -NoRestart # compact; caller relaunches Docker Desktop non-elevated
  .\scripts\compact-docker-vhdx.ps1 -Prune     # prune build cache + dangling first, then compact
#>
[CmdletBinding()]
param(
    [switch]$Prune,
    # Skip relaunching Docker Desktop. Prefer this when calling from a non-elevated shell that will
    # relaunch it itself: a Docker Desktop started by this (elevated) script inherits elevation, and
    # a later non-elevated `Stop-Process` on it then fails with "Access is denied".
    [switch]$NoRestart,
    [string]$VhdxPath = "$env:USERPROFILE\DockerDesktopWSL\disk\docker_data.vhdx"
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw "Run this from an elevated (Administrator) PowerShell." }
if (-not (Test-Path $VhdxPath)) { throw "VHDX not found: $VhdxPath" }

function Show-Space([string]$label) {
    $d = Get-PSDrive C
    $v = (Get-Item $VhdxPath).Length
    "{0,-14} C: free {1,7:N1} GB | vhdx {2,7:N1} GB" -f $label, ($d.Free/1GB), ($v/1GB)
}

Show-Space 'before'

if ($Prune) {
    Write-Host "Pruning build cache + dangling images/volumes..."
    docker builder prune -a -f | Select-Object -Last 1
    docker image prune -f      | Select-Object -Last 1
    docker volume prune -f     | Select-Object -Last 1
}

Write-Host "Trimming freed blocks inside the engine VM (fstrim)..."
try {
    docker run --rm --privileged --pid=host alpine nsenter -t 1 -m -u -n -i fstrim -v /var/lib
} catch {
    Write-Warning "fstrim failed ($($_.Exception.Message)) - compaction may reclaim little. Continuing."
}

Write-Host "Stopping Docker Desktop..."
Get-Process 'Docker Desktop','com.docker.backend','com.docker.build' -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5
wsl --shutdown
Start-Sleep -Seconds 5

Write-Host "Compacting $VhdxPath ..."
if (Get-Command Optimize-VHD -ErrorAction SilentlyContinue) {
    Optimize-VHD -Path $VhdxPath -Mode Full
} else {
    $dp = @"
select vdisk file="$VhdxPath"
attach vdisk readonly
compact vdisk
detach vdisk
exit
"@
    $tmp = Join-Path $env:TEMP 'compact-vhdx.txt'
    Set-Content $tmp $dp -Encoding ascii
    diskpart /s $tmp
    Remove-Item $tmp -Force
}

Show-Space 'after'

if ($NoRestart) {
    Write-Host "-NoRestart: start Docker Desktop yourself from a normal (non-elevated) shell."
} else {
    Write-Host "Restarting Docker Desktop..."
    $dd = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dd) { Start-Process $dd } else { Write-Warning "Docker Desktop.exe not found at $dd - start it manually." }
}
Write-Host "Done. Bring the stack back with: .\run-all.ps1 -SkipBuild"
