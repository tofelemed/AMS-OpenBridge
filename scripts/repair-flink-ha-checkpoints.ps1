#Requires -Version 5.1
<#
.SYNOPSIS
  Finds Flink HA checkpoint references in ZooKeeper whose handle object is
  missing from MinIO and, with -Apply, removes only those references so the
  JobManager can recover each job from its newest intact checkpoint.

.DESCRIPTION
  CHG-032. After the 2026-09-20 disk-full incident the JobManager crash-looped
  (19 fatal errors in 10 min): ZooKeeper listed checkpoint 12805 of
  'AMS - Alarm State Machine' but its s3://ams-flink/ha/ams-lab/completedCheckpoint*
  handle was never persisted (write lost when ext4 went read-only). Flink HA
  treats an unreadable latest checkpoint as fatal for the whole JobManager, and
  every restart makes the TaskManager re-restore all RocksDB state (~60 GB/h of
  disk churn). Removing the one broken reference lets the job resume from the
  previous checkpoint; the transactional Kafka sinks re-process the gap.

  Never removes a job's last remaining reference (reported instead), never
  touches job graphs, savepoints or checkpoint data. Stop the JobManager first
  (docker stop ams-flink-jobmanager) so it cannot race the edit.

.EXAMPLE
  .\scripts\repair-flink-ha-checkpoints.ps1            # report only
  .\scripts\repair-flink-ha-checkpoints.ps1 -Apply     # delete broken references
#>
param(
    [string]$ZkContainer = 'ams-zookeeper',
    [string]$MinioContainer = 'ams-minio',
    [string]$ZkRoot = '/flink-ams/ams-lab',
    [string]$HaPrefix = 'ams-flink/ha/ams-lab',
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'

function Invoke-Zk([string[]]$ZkArgs) {
    # zookeeper-shell prints connection chatter and raw (binary) znode data.
    $raw = & docker exec $ZkContainer zookeeper-shell localhost:2181 @ZkArgs 2>&1 | ForEach-Object { "$_" }
    return $raw | Where-Object { $_ -notmatch '^(Connecting|Welcome|JLine|WATCHER|WatchedEvent|\[\d{4}-\d\d-\d\d [\d:,]+\] (INFO|WARN))' -and $_ -ne '' }
}
function Get-ZkChildren([string]$Path) {
    $line = Invoke-Zk @('ls', $Path) | Where-Object { $_ -match '^\[' } | Select-Object -Last 1
    if (-not $line) { return @() }
    return @(($line.Trim('[', ']') -split ',\s*') | Where-Object { $_ -ne '' })
}
function Test-MinioObject([string]$Key) {
    & docker exec $MinioContainer sh -c "mc alias set rp http://localhost:9000 `$MINIO_ROOT_USER `$MINIO_ROOT_PASSWORD >/dev/null 2>&1; mc stat rp/$Key >/dev/null 2>&1" 2>$null
    return ($LASTEXITCODE -eq 0)
}

if ($Apply -and (& docker ps --filter 'name=ams-flink-jobmanager' --filter 'status=running' -q)) {
    throw 'Stop the JobManager first: docker stop ams-flink-jobmanager'
}

$jobs = Get-ZkChildren "$ZkRoot/jobs"
Write-Output ("{0} jobs in HA store {1}" -f $jobs.Count, $ZkRoot)
$broken = @(); $rows = @()
foreach ($j in $jobs) {
    $nodes = Get-ZkChildren "$ZkRoot/jobs/$j/checkpoints"
    $missingForJob = @()
    foreach ($n in $nodes) {
        $data = (Invoke-Zk @('get', "$ZkRoot/jobs/$j/checkpoints/$n")) -join ' '
        $h = if ($data -match 'completedCheckpoint[0-9a-f]{12}') { $matches[0] } else { '' }
        $state = if (-not $h) { 'NOHANDLE' } elseif (Test-MinioObject "$HaPrefix/$h") { 'ok' } else { 'MISSING' }
        $rows += [pscustomobject]@{ Job = $j; Checkpoint = $n; Handle = $h; State = $state }
        if ($state -eq 'MISSING') { $missingForJob += $n }
    }
    if ($missingForJob.Count -gt 0) {
        if ($missingForJob.Count -ge $nodes.Count) {
            Write-Output "!! job $j : all $($nodes.Count) checkpoint handles missing; left untouched (needs a manual decision)"
        } else {
            foreach ($n in $missingForJob) { $broken += [pscustomobject]@{ Job = $j; Checkpoint = $n } }
        }
    }
}
$rows | Where-Object { $_.State -ne 'ok' } | Format-Table -AutoSize | Out-String -Width 140 | Write-Output
Write-Output ("checked {0} references; {1} ok; {2} removable broken" -f $rows.Count, @($rows | Where-Object State -eq 'ok').Count, $broken.Count)

if ($broken.Count -eq 0) { exit 0 }
if (-not $Apply) { Write-Output 'Dry run. Stop the JobManager and re-run with -Apply to remove the broken references.'; exit 0 }
foreach ($b in $broken) {
    $path = "$ZkRoot/jobs/$($b.Job)/checkpoints/$($b.Checkpoint)"
    Invoke-Zk @('deleteall', $path) | Out-Null
    $left = Get-ZkChildren "$ZkRoot/jobs/$($b.Job)/checkpoints"
    Write-Output ("removed {0}  (job {1} now has {2} references: {3})" -f $path, $b.Job, $left.Count, ($left -join ', '))
}
Write-Output 'Done. Start the JobManager: docker start ams-flink-jobmanager'
