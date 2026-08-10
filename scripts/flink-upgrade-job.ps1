<#
.SYNOPSIS
  Savepoint-based upgrade for a standing Flink job (GAP STR-11).

.DESCRIPTION
  Every submit path in this repo is a plain `flink run -d` with no -s restore, so
  redeploying a job restarts it with EMPTY keyed state: RBE fingerprints reset and
  the CPLM long job loses up to 24 h of rolling diagnostics buffer. This script
  performs the drain → savepoint → redeploy → restore cycle instead.

  Requires STR-02 (durable savepoint storage). state.savepoints.dir is
  s3://ams-flink/savepoints in infra/docker/docker-compose.yml, so the savepoint
  survives the container being replaced.

  Requires STR-11's operator UIDs — without stable .uid() values Flink derives
  operator IDs from the job graph and the restore fails after any topology change.

.PARAMETER JobName
  Display name of the running job, e.g. "AMS - CPLM Long Diagnostics Engine".

.PARAMETER EntryClass
  Fully-qualified entry class to resubmit, e.g. com.ams.flink.cplm.CplmLongDiagnosticsStreamJob

.PARAMETER JobArgs
  Arguments passed to the resubmitted job. Must match what the supervisor uses,
  otherwise the job comes back configured differently than it went down.

.PARAMETER SkipSupervisorPause
  By default the supervisor is stopped for the duration: it polls every 60 s and
  would otherwise resubmit a FRESH copy of the job the moment this script stops it,
  which both loses the state and creates a duplicate.

.EXAMPLE
  .\scripts\flink-upgrade-job.ps1 -JobName "AMS - Live State RBE" `
      -EntryClass com.ams.flink.LiveStateJob `
      -JobArgs @('--bootstrap.servers','kafka:9092')
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]   $JobName,
    [Parameter(Mandatory = $true)][string]   $EntryClass,
    [string[]] $JobArgs = @(),
    [string]   $JobManagerContainer = 'ams-flink-jobmanager',
    [string]   $SupervisorContainer = 'ams-flink-job-supervisor',
    [string]   $Jar = '/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar',
    [switch]   $SkipSupervisorPause
)

$ErrorActionPreference = 'Stop'
$flink = '/opt/flink/bin/flink'

function Invoke-Flink {
    param([string[]] $FlinkArgs)
    # MSYS_NO_PATHCONV stops Git Bash rewriting /opt/... into a Windows path.
    $env:MSYS_NO_PATHCONV = '1'
    & docker exec $JobManagerContainer $flink @FlinkArgs 2>&1
}

Write-Host "== Flink savepoint upgrade: $JobName ==" -ForegroundColor Cyan

# ── 1. Locate the running job ────────────────────────────────────────────────
$listing = Invoke-Flink @('list')
$match   = $listing | Select-String -SimpleMatch $JobName | Select-String -SimpleMatch '(RUNNING)'

if (-not $match) {
    $listingText = $listing -join [Environment]::NewLine
    throw ("No RUNNING job named '{0}'. Nothing to upgrade. Current jobs:{1}{2}" -f $JobName, [Environment]::NewLine, $listingText)
}
if ($match.Count -gt 1) {
    throw ("Found {0} RUNNING copies of '{1}'. Cancel the duplicates first - they share a consumer group and clobber offsets." -f $match.Count, $JobName)
}

# `flink list` lines look like: <timestamp> : <jobId> : <name> (RUNNING)
$jobId = ([regex]'([0-9a-f]{32})').Match($match[0].Line).Value
if (-not $jobId) { throw "Could not parse a job id from: $($match[0].Line)" }
Write-Host "  job id: $jobId"

# ── 2. Stop the supervisor so it cannot resubmit a stateless copy mid-upgrade ─
$supervisorPaused = $false
if (-not $SkipSupervisorPause) {
    $running = (& docker ps --filter "name=$SupervisorContainer" --format '{{.Names}}')
    if ($running) {
        Write-Host "  pausing supervisor ($SupervisorContainer)"
        & docker stop $SupervisorContainer | Out-Null
        $supervisorPaused = $true
    }
}

try {
    # ── 3. Drain + savepoint ─────────────────────────────────────────────────
    # `flink stop` drains in-flight records and takes a savepoint atomically.
    # Path comes from state.savepoints.dir, so it lands in MinIO.
    Write-Host "  stopping with savepoint..."
    $stopOut = Invoke-Flink @('stop', $jobId)
    $stopOut | ForEach-Object { Write-Host "    $_" }

    $stopText  = $stopOut -join [Environment]::NewLine
    $savepoint = ([regex]'(s3[a-z]?://\S+|file:/\S+)').Match($stopText).Value
    if (-not $savepoint) {
        throw 'Savepoint path not found in stop output - NOT redeploying. The job is stopped; restart it manually or restart the supervisor.'
    }
    $savepoint = $savepoint.TrimEnd('.', ',')
    Write-Host "  savepoint: $savepoint" -ForegroundColor Green

    # ── 4. Resubmit restoring from the savepoint ─────────────────────────────
    Write-Host "  resubmitting from savepoint..."
    $runArgs = @('run', '-d', '-s', $savepoint, '-c', $EntryClass, $Jar) + $JobArgs
    $runOut  = Invoke-Flink $runArgs
    $runOut | ForEach-Object { Write-Host "    $_" }

    $runText = $runOut -join [Environment]::NewLine
    if ($runText -notmatch 'Job has been submitted') {
        $argText = $JobArgs -join ' '
        throw ("Resubmit failed. The savepoint is retained at {0} - restore manually with:{1}  flink run -d -s {0} -c {2} {3} {4}" -f `
               $savepoint, [Environment]::NewLine, $EntryClass, $Jar, $argText)
    }

    # ── 5. Verify it is actually RUNNING ─────────────────────────────────────
    Start-Sleep -Seconds 10
    $after = Invoke-Flink @('list') | Select-String -SimpleMatch $JobName | Select-String -SimpleMatch '(RUNNING)'
    if (-not $after) {
        throw "Job '$JobName' is not RUNNING after resubmit. Savepoint retained at $savepoint"
    }

    Write-Host "== Upgrade complete: '$JobName' restored from $savepoint ==" -ForegroundColor Green
    Write-Host "   Verify checkpointing resumes and consumer lag recovers before considering this done."
}
finally {
    if ($supervisorPaused) {
        Write-Host "  resuming supervisor"
        & docker start $SupervisorContainer | Out-Null
    }
}
