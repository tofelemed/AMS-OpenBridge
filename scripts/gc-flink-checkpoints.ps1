#Requires -Version 5.1
<#
.SYNOPSIS
  Removes MinIO checkpoint directories left behind by Flink jobs that no
  longer exist (externalized-checkpoint-retention RETAIN_ON_CANCELLATION never
  cleans them). Dry-run by default.

.DESCRIPTION
  CHG-032. On 2026-09-20 s3://ams-flink/checkpoints held 167 job directories
  (2 GB) for ~13 live jobs, the oldest from 2026-08-09. Each cancelled or
  crash-looped job leaves its last retained checkpoint forever, and the
  60 s checkpoint cadence keeps touching the disk under those directories.

  A job directory is deleted only when ALL of these hold:
    - its job id is not in Flink's REST job list in a non-terminal state
      (RUNNING, RESTARTING, CREATED, INITIALIZING, RECONCILING, CANCELLING,
      FAILING, SUSPENDED),
    - its newest object is older than -MaxAgeDays (default 7), so a job
      cancelled today can still be restored from its retained checkpoint.
  Savepoints (s3://ams-flink/savepoints) are never touched.

.EXAMPLE
  .\scripts\gc-flink-checkpoints.ps1              # report only
  .\scripts\gc-flink-checkpoints.ps1 -Apply       # delete
  .\scripts\gc-flink-checkpoints.ps1 -MaxAgeDays 2 -Apply
#>
param(
    [string]$FlinkRest = 'http://localhost:8082',
    [string]$MinioContainer = 'ams-minio',
    [string]$Bucket = 'ams-flink',
    [int]$MaxAgeDays = 7,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$live = @('RUNNING', 'RESTARTING', 'CREATED', 'INITIALIZING', 'RECONCILING', 'CANCELLING', 'FAILING', 'SUSPENDED')

# 1. Live job ids from Flink. Abort if Flink cannot be asked: a recovering JM
#    would make every directory look orphaned.
try {
    $jobs = (Invoke-RestMethod "$FlinkRest/jobs/overview" -TimeoutSec 30).jobs
} catch {
    throw "Flink REST ($FlinkRest) not answering; not deleting anything. $($_.Exception.Message)"
}
$liveIds = @($jobs | Where-Object { $live -contains $_.state } | ForEach-Object { $_.jid })
Write-Output ("Flink: {0} jobs listed, {1} live" -f @($jobs).Count, $liveIds.Count)

# 2. Checkpoint job directories in MinIO. The image's built-in 'local' alias has no
#    credentials (Access Denied), so register one from the container's root env.
& docker exec $MinioContainer sh -c 'mc alias set gc http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD >/dev/null 2>&1' | Out-Null
$prefix = "gc/$Bucket/checkpoints/"
$dirs = & docker exec $MinioContainer mc ls --json $prefix 2>&1 |
    ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } |
    Where-Object { $_ -and $_.type -eq 'folder' } |
    ForEach-Object { $_.key.TrimEnd('/') }
Write-Output ("MinIO: {0} checkpoint job directories under s3://{1}/checkpoints" -f @($dirs).Count, $Bucket)

$cutoff = (Get-Date).ToUniversalTime().AddDays(-$MaxAgeDays)
$toDelete = @(); $kept = 0; $bytes = 0L
foreach ($d in $dirs) {
    if ($liveIds -contains $d) { $kept++; continue }
    $objs = & docker exec $MinioContainer mc ls -r --json "$prefix$d/" 2>&1 |
        ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } | Where-Object { $_ -and $_.type -eq 'file' }
    $newest = ($objs | ForEach-Object { [datetime]$_.lastModified } | Sort-Object -Descending | Select-Object -First 1)
    $size = ($objs | Measure-Object -Property size -Sum).Sum
    if (-not $newest) { $newest = [datetime]'2000-01-01' }
    if ($newest.ToUniversalTime() -lt $cutoff) {
        $toDelete += [pscustomobject]@{ Job = $d; Newest = $newest.ToString('yyyy-MM-dd HH:mm'); MB = [math]::Round($size / 1MB, 1) }
        $bytes += $size
    } else { $kept++ }
}
Write-Output ("Keep: {0}   Delete candidates: {1} ({2:N1} MB)" -f $kept, $toDelete.Count, ($bytes / 1MB))
$toDelete | Sort-Object Newest | Format-Table -AutoSize | Out-String -Width 120 | Write-Output

if (-not $Apply) { Write-Output 'Dry run. Re-run with -Apply to delete.'; exit 0 }
$failed = 0
foreach ($t in $toDelete) {
    $r = & docker exec $MinioContainer mc rm -r --force "$prefix$($t.Job)/" 2>&1
    if ($LASTEXITCODE -ne 0) { $failed++; Write-Output "FAILED $($t.Job): $r" } else { Write-Output "deleted $($t.Job) ($($t.MB) MB, newest $($t.Newest))" }
}
Write-Output ("Deleted {0} of {1} directories; {2} failed." -f ($toDelete.Count - $failed), $toDelete.Count, $failed)
exit $(if ($failed) { 1 } else { 0 })
