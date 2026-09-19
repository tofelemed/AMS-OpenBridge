# Run as Administrator after Docker Desktop and WSL have stopped.
# Reclaims unused physical blocks; does not resize the filesystem or virtual disk.
# This deliberately targets only this lab's verified Docker Desktop data disk.
$ErrorActionPreference = 'Stop'
$diskPath = 'C:\Users\Admin\DockerDesktopWSL\disk\docker_data.vhdx'
$reportPath = 'D:\DockerSupport\compact-docker-20260920.log'
try {
    "Started $(Get-Date -Format o)" | Out-File -LiteralPath $reportPath
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Windows administrator elevation is required.'
    }
    if ((Get-Process -Name 'com.docker.backend' -ErrorAction SilentlyContinue)) {
        throw 'Docker Desktop is still running. Stop it and WSL first.'
    }
    $resolvedPath = (Resolve-Path -LiteralPath $diskPath).ProviderPath
    if ($resolvedPath -ne $diskPath) { throw 'Unexpected disk path.' }
    $vhd = Get-VHD -Path $resolvedPath
    if ($vhd.Attached) { throw 'Disk is attached; refusing compaction.' }
    if ($vhd.VhdType -ne 'Dynamic') { throw 'Expected a dynamic VHDX.' }
    $before = (Get-Item -LiteralPath $resolvedPath).Length
    "BeforeBytes=$before" | Add-Content -LiteralPath $reportPath
    Optimize-VHD -Path $resolvedPath -Mode Full
    $after = (Get-Item -LiteralPath $resolvedPath).Length
    "AfterBytes=$after ReclaimedBytes=$($before-$after)" | Add-Content -LiteralPath $reportPath
    "CFreeBytes=$((Get-PSDrive -Name C).Free)" | Add-Content -LiteralPath $reportPath
    'SUCCESS' | Add-Content -LiteralPath $reportPath
} catch {
    "FAILED: $($_.Exception.Message)" | Add-Content -LiteralPath $reportPath
    exit 1
}
