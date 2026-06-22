# Shared helpers: one AMS alarm state-machine job on the Flink cluster at a time.
$script:AmsFlinkJobName = "AMS - Alarm State Machine"
$script:AmsFlinkJobManager = "ams-flink-jobmanager"
$script:AmsFlinkJobLinePattern = ':\s+([a-f0-9]+)\s+:\s+AMS - (?:Simplified |Event-Sourced |)Alarm State Machine \((\w+)\)'

function Get-AmsFlinkAlarmJobs {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = docker exec $script:AmsFlinkJobManager flink list 2>&1 | Out-String
    $ErrorActionPreference = $prevEap
    $jobs = @()
    foreach ($line in $raw -split "`n") {
        if ($line -match $script:AmsFlinkJobLinePattern) {
            $jobs += [pscustomobject]@{ Id = $Matches[1]; Status = $Matches[2] }
        }
    }
    return $jobs
}

function Stop-AmsFlinkAlarmJob {
    param([Parameter(Mandatory)][string]$JobId)
    Write-Host "[Flink] Cancelling job $JobId..." -ForegroundColor Yellow
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker exec $script:AmsFlinkJobManager flink cancel $JobId 2>&1 | Out-Host
    $ErrorActionPreference = $prevEap
}

<#
.SYNOPSIS
Cancels duplicate/stale AMS Flink jobs; submits only when no RUNNING instance exists.
#>
function Test-AmsFlinkJobHealthy {
    param([Parameter(Mandatory)][string]$JobId)
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $ex = docker exec $script:AmsFlinkJobManager curl -s "http://localhost:8081/jobs/$JobId/exceptions" 2>&1 | Out-String
    $ErrorActionPreference = $prevEap
    if ($ex -match '"root-exception":null' -or $ex -notmatch '"root-exception":"') { return $true }
    return $false
}

function Ensure-AmsFlinkAlarmJob {
    param(
        [string]$JarHostPath,
        [string]$JarContainerPath = "/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar",
        [string]$EntryClass = "com.ams.flink.OpcEventStreamJob",
        [ValidateSet("latest", "earliest")]
        [string]$RawAlarmsStartingOffsets = "earliest",
        [switch]$ForceResubmit,
        [string[]]$ProgramArgs
    )

    if (-not $ProgramArgs) {
        $ProgramArgs = @(
            "--bootstrap.servers", "kafka:9092",
            "--raw-alarms.starting-offsets", $RawAlarmsStartingOffsets,
            "--parallelism.raw-ingest", "2",
            "--parallelism.validation", "2",
            "--parallelism.dedup", "2",
            "--parallelism.normalization", "2",
            "--parallelism.soe", "2",
            "--parallelism.lifecycle", "2",
            "--parallelism.correlation", "2",
            "--parallelism.flood", "1",
            "--parallelism.kpi", "1",
            "--parallelism.projection", "2",
            "--parallelism.ack", "2"
        )
    }

    $jobs = @(Get-AmsFlinkAlarmJobs)
    $running = @($jobs | Where-Object { $_.Status -eq "RUNNING" })

    foreach ($job in $jobs) {
        if ($job.Status -ne "RUNNING") {
            Stop-AmsFlinkAlarmJob -JobId $job.Id
        }
    }

    if ($running.Count -gt 1) {
        foreach ($job in $running | Select-Object -Skip 1) {
            Stop-AmsFlinkAlarmJob -JobId $job.Id
        }
    }

    if ($running.Count -ge 1 -and -not $ForceResubmit) {
        $healthy = Test-AmsFlinkJobHealthy -JobId $running[0].Id
        if ($healthy) {
            Write-Host "[Flink] Job already RUNNING ($($running[0].Id)); skipping submit." -ForegroundColor Green
            return $running[0].Id
        }
        Write-Host "[Flink] RUNNING job $($running[0].Id) has root exception - cancelling for resubmit." -ForegroundColor Yellow
        Stop-AmsFlinkAlarmJob -JobId $running[0].Id
        Start-Sleep -Seconds 5
    } elseif ($running.Count -ge 1 -and $ForceResubmit) {
        Stop-AmsFlinkAlarmJob -JobId $running[0].Id
        Start-Sleep -Seconds 5
    }

    if (-not $JarHostPath -or -not (Test-Path -LiteralPath $JarHostPath)) {
        throw "Flink JAR not found: $JarHostPath"
    }

    Write-Host "[Flink] Submitting $script:AmsFlinkJobName..." -ForegroundColor Yellow
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker exec $script:AmsFlinkJobManager mkdir -p /opt/flink/usrlib 2>$null
    try {
        docker cp $JarHostPath "${script:AmsFlinkJobManager}:$JarContainerPath" 2>&1 | Out-Null
    } catch {
        Write-Host "  [INFO] docker cp skipped (jar already volume-mounted or container busy)" -ForegroundColor Gray
    }

    $runArgs = @("exec", $script:AmsFlinkJobManager, "flink", "run", "-d", "-c", $EntryClass, $JarContainerPath) + $ProgramArgs
    $ErrorActionPreference = 'Continue'
    docker @runArgs 2>&1 | ForEach-Object {
        if ($_ -match 'WARNING: Unknown module') { return }
        Write-Host $_
    }
    $ErrorActionPreference = $prevEap
    Start-Sleep -Seconds 15

    $after = @(Get-AmsFlinkAlarmJobs | Where-Object { $_.Status -eq "RUNNING" })
    if ($after.Count -lt 1) {
        throw "Flink job submit did not reach RUNNING state. Check JobManager logs and UI."
    }
    return $after[0].Id
}

$script:LoopKpiFlinkJobName = "AMS - Loop KPI Engine"
$script:LoopKpiFlinkJobLinePattern = ':\s+([a-f0-9]+)\s+:\s+AMS - Loop KPI Engine\s+\((\w+)\)'

function Get-LoopKpiFlinkJobs {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = docker exec $script:AmsFlinkJobManager flink list 2>&1 | Out-String
    $ErrorActionPreference = $prevEap
    $jobs = @()
    foreach ($line in $raw -split "`n") {
        if ($line -match $script:LoopKpiFlinkJobLinePattern) {
            $jobs += [pscustomobject]@{ Id = $Matches[1]; Status = $Matches[2] }
        }
    }
    return $jobs
}

function Stop-LoopKpiFlinkJob {
    param([Parameter(Mandatory)][string]$JobId)
    Write-Host "[Flink] Cancelling Loop KPI job $JobId..." -ForegroundColor Yellow
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker exec $script:AmsFlinkJobManager flink cancel $JobId 2>&1 | Out-Host
    $ErrorActionPreference = $prevEap
}

function Ensure-LoopKpiFlinkJob {
    param(
        [string]$JarHostPath,
        [string]$JarContainerPath = "/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar",
        [string]$EntryClass = "com.ams.flink.LoopKpiStreamJob",
        [switch]$ForceResubmit
    )

    $jobs = @(Get-LoopKpiFlinkJobs)
    $running = @($jobs | Where-Object { $_.Status -eq "RUNNING" })

    foreach ($job in $jobs) {
        if ($job.Status -ne "RUNNING") {
            Stop-LoopKpiFlinkJob -JobId $job.Id
        }
    }

    if ($running.Count -gt 1) {
        foreach ($job in $running | Select-Object -Skip 1) {
            Stop-LoopKpiFlinkJob -JobId $job.Id
        }
    }

    if ($running.Count -ge 1 -and -not $ForceResubmit) {
        $healthy = Test-AmsFlinkJobHealthy -JobId $running[0].Id
        if ($healthy) {
            Write-Host "[Flink] Loop KPI Job already RUNNING ($($running[0].Id)); skipping submit." -ForegroundColor Green
            return $running[0].Id
        }
        Write-Host "[Flink] RUNNING Loop KPI job $($running[0].Id) has root exception - cancelling for resubmit." -ForegroundColor Yellow
        Stop-LoopKpiFlinkJob -JobId $running[0].Id
        Start-Sleep -Seconds 5
    } elseif ($running.Count -ge 1 -and $ForceResubmit) {
        Stop-LoopKpiFlinkJob -JobId $running[0].Id
        Start-Sleep -Seconds 5
    }

    if (-not $JarHostPath -or -not (Test-Path -LiteralPath $JarHostPath)) {
        throw "Flink JAR not found: $JarHostPath"
    }

    Write-Host "[Flink] Submitting $script:LoopKpiFlinkJobName..." -ForegroundColor Yellow
    
    # We pass the same Kafka broker arg as the alarm job uses if any
    $ProgramArgs = @("--bootstrap.servers", "kafka:9092")

    $runArgs = @("exec", $script:AmsFlinkJobManager, "flink", "run", "-d", "-c", $EntryClass, $JarContainerPath) + $ProgramArgs
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker @runArgs 2>&1 | ForEach-Object {
        if ($_ -match 'WARNING: Unknown module') { return }
        Write-Host $_
    }
    $ErrorActionPreference = $prevEap
    Start-Sleep -Seconds 10

    $after = @(Get-LoopKpiFlinkJobs | Where-Object { $_.Status -eq "RUNNING" })
    if ($after.Count -lt 1) {
        throw "Flink Loop KPI job submit did not reach RUNNING state. Check JobManager logs and UI."
    }
    return $after[0].Id
}

$script:AlarmKpiFlinkJobName = "AMS - Alarm KPI Engine"
$script:AlarmKpiFlinkJobLinePattern = ':\s+([a-f0-9]+)\s+:\s+AMS - Alarm KPI Engine\s+\((\w+)\)'

function Get-AlarmKpiFlinkJobs {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = docker exec $script:AmsFlinkJobManager flink list 2>&1 | Out-String
    $ErrorActionPreference = $prevEap
    $jobs = @()
    foreach ($line in $raw -split "`n") {
        if ($line -match $script:AlarmKpiFlinkJobLinePattern) {
            $jobs += [pscustomobject]@{ Id = $Matches[1]; Status = $Matches[2] }
        }
    }
    return $jobs
}

function Stop-AlarmKpiFlinkJob {
    param([Parameter(Mandatory)][string]$JobId)
    Write-Host "[Flink] Cancelling Alarm KPI job $JobId..." -ForegroundColor Yellow
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker exec $script:AmsFlinkJobManager flink cancel $JobId 2>&1 | Out-Host
    $ErrorActionPreference = $prevEap
}

function Ensure-AlarmKpiFlinkJob {
    param(
        [string]$JarHostPath,
        [string]$JarContainerPath = "/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar",
        [string]$EntryClass = "com.ams.flink.AlarmKpiStreamJob",
        [switch]$ForceResubmit
    )

    $jobs = @(Get-AlarmKpiFlinkJobs)
    $running = @($jobs | Where-Object { $_.Status -eq "RUNNING" })

    foreach ($job in $jobs) {
        if ($job.Status -ne "RUNNING") {
            Stop-AlarmKpiFlinkJob -JobId $job.Id
        }
    }

    if ($running.Count -gt 1) {
        foreach ($job in $running | Select-Object -Skip 1) {
            Stop-AlarmKpiFlinkJob -JobId $job.Id
        }
    }

    if ($running.Count -ge 1 -and -not $ForceResubmit) {
        $healthy = Test-AmsFlinkJobHealthy -JobId $running[0].Id
        if ($healthy) {
            Write-Host "[Flink] Alarm KPI Job already RUNNING ($($running[0].Id)); skipping submit." -ForegroundColor Green
            return $running[0].Id
        }
        Write-Host "[Flink] RUNNING Alarm KPI job $($running[0].Id) has root exception - cancelling for resubmit." -ForegroundColor Yellow
        Stop-AlarmKpiFlinkJob -JobId $running[0].Id
        Start-Sleep -Seconds 5
    } elseif ($running.Count -ge 1 -and $ForceResubmit) {
        Stop-AlarmKpiFlinkJob -JobId $running[0].Id
        Start-Sleep -Seconds 5
    }

    if (-not $JarHostPath -or -not (Test-Path -LiteralPath $JarHostPath)) {
        throw "Flink JAR not found: $JarHostPath"
    }

    Write-Host "[Flink] Submitting $script:AlarmKpiFlinkJobName..." -ForegroundColor Yellow
    
    $ProgramArgs = @("--bootstrap.servers", "kafka:9092")

    $runArgs = @("exec", $script:AmsFlinkJobManager, "flink", "run", "-d", "-c", $EntryClass, $JarContainerPath) + $ProgramArgs
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker @runArgs 2>&1 | ForEach-Object {
        if ($_ -match 'WARNING: Unknown module') { return }
        Write-Host $_
    }
    $ErrorActionPreference = $prevEap
    Start-Sleep -Seconds 10

    $after = @(Get-AlarmKpiFlinkJobs | Where-Object { $_.Status -eq "RUNNING" })
    if ($after.Count -lt 1) {
        throw "Flink Alarm KPI job submit did not reach RUNNING state. Check JobManager logs and UI."
    }
    return $after[0].Id
}

$script:DriftDetectionFlinkJobName = "AMS State Drift Detection Engine"
$script:DriftDetectionFlinkJobLinePattern = ':\s+([a-f0-9]+)\s+:\s+AMS State Drift Detection Engine\s+\((\w+)\)'

function Get-DriftDetectionFlinkJobs {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = docker exec $script:AmsFlinkJobManager flink list 2>&1 | Out-String
    $ErrorActionPreference = $prevEap
    $jobs = @()
    foreach ($line in $raw -split "`n") {
        if ($line -match $script:DriftDetectionFlinkJobLinePattern) {
            $jobs += [pscustomobject]@{ Id = $Matches[1]; Status = $Matches[2] }
        }
    }
    return $jobs
}

function Stop-DriftDetectionFlinkJob {
    param([Parameter(Mandatory)][string]$JobId)
    Write-Host "[Flink] Cancelling State Drift Detection job $JobId..." -ForegroundColor Yellow
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker exec $script:AmsFlinkJobManager flink cancel $JobId 2>&1 | Out-Host
    $ErrorActionPreference = $prevEap
}

function Ensure-DriftDetectionFlinkJob {
    param(
        [string]$JarHostPath,
        [string]$JarContainerPath = "/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar",
        [string]$EntryClass = "com.ams.flink.StateDriftDetectionJob",
        [switch]$ForceResubmit
    )

    $jobs = @(Get-DriftDetectionFlinkJobs)
    $running = @($jobs | Where-Object { $_.Status -eq "RUNNING" })

    foreach ($job in $jobs) {
        if ($job.Status -ne "RUNNING") {
            Stop-DriftDetectionFlinkJob -JobId $job.Id
        }
    }

    if ($running.Count -gt 1) {
        foreach ($job in $running | Select-Object -Skip 1) {
            Stop-DriftDetectionFlinkJob -JobId $job.Id
        }
    }

    if ($running.Count -ge 1 -and -not $ForceResubmit) {
        $healthy = Test-AmsFlinkJobHealthy -JobId $running[0].Id
        if ($healthy) {
            Write-Host "[Flink] State Drift Detection Job already RUNNING ($($running[0].Id)); skipping submit." -ForegroundColor Green
            return $running[0].Id
        }
        Write-Host "[Flink] RUNNING State Drift Detection job $($running[0].Id) has root exception - cancelling for resubmit." -ForegroundColor Yellow
        Stop-DriftDetectionFlinkJob -JobId $running[0].Id
        Start-Sleep -Seconds 5
    } elseif ($running.Count -ge 1 -and $ForceResubmit) {
        Stop-DriftDetectionFlinkJob -JobId $running[0].Id
        Start-Sleep -Seconds 5
    }

    if (-not $JarHostPath -or -not (Test-Path -LiteralPath $JarHostPath)) {
        throw "Flink JAR not found: $JarHostPath"
    }

    Write-Host "[Flink] Submitting $script:DriftDetectionFlinkJobName..." -ForegroundColor Yellow
    
    $ProgramArgs = @("--bootstrap.servers", "kafka:9092")

    $runArgs = @("exec", $script:AmsFlinkJobManager, "flink", "run", "-d", "-c", $EntryClass, $JarContainerPath) + $ProgramArgs
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker @runArgs 2>&1 | ForEach-Object {
        if ($_ -match 'WARNING: Unknown module') { return }
        Write-Host $_
    }
    $ErrorActionPreference = $prevEap
    Start-Sleep -Seconds 10

    $after = @(Get-DriftDetectionFlinkJobs | Where-Object { $_.Status -eq "RUNNING" })
    if ($after.Count -lt 1) {
        throw "Flink State Drift Detection job submit did not reach RUNNING state. Check JobManager logs and UI."
    }
    return $after[0].Id
}

$script:AlarmStateExportJobName = "AMS Alarm State Export Engine"
$script:AlarmStateExportJobLinePattern = ':\s+([a-f0-9]+)\s+:\s+AMS Alarm State Export Engine\s+\((\w+)\)'

function Get-AlarmStateExportFlinkJobs {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = docker exec $script:AmsFlinkJobManager flink list 2>&1 | Out-String
    $ErrorActionPreference = $prevEap
    $jobs = @()
    foreach ($line in $raw -split "`n") {
        if ($line -match $script:AlarmStateExportJobLinePattern) {
            $jobs += [pscustomobject]@{ Id = $Matches[1]; Status = $Matches[2] }
        }
    }
    return $jobs
}

function Stop-AlarmStateExportFlinkJob {
    param([Parameter(Mandatory)][string]$JobId)
    Write-Host "[Flink] Cancelling Alarm State Export job $JobId..." -ForegroundColor Yellow
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker exec $script:AmsFlinkJobManager flink cancel $JobId 2>&1 | Out-Host
    $ErrorActionPreference = $prevEap
}

function Ensure-AlarmStateExportFlinkJob {
    param(
        [string]$JarHostPath,
        [string]$JarContainerPath = "/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar",
        [string]$EntryClass = "com.ams.flink.AlarmStateExportJob",
        [switch]$ForceResubmit
    )

    $jobs = @(Get-AlarmStateExportFlinkJobs)
    $running = @($jobs | Where-Object { $_.Status -eq "RUNNING" })

    foreach ($job in $jobs) {
        if ($job.Status -ne "RUNNING") {
            Stop-AlarmStateExportFlinkJob -JobId $job.Id
        }
    }

    if ($running.Count -gt 1) {
        foreach ($job in $running | Select-Object -Skip 1) {
            Stop-AlarmStateExportFlinkJob -JobId $job.Id
        }
    }

    if ($running.Count -ge 1 -and -not $ForceResubmit) {
        $healthy = Test-AmsFlinkJobHealthy -JobId $running[0].Id
        if ($healthy) {
            Write-Host "[Flink] Alarm State Export Job already RUNNING ($($running[0].Id)); skipping submit." -ForegroundColor Green
            return $running[0].Id
        }
        Write-Host "[Flink] RUNNING Alarm State Export job $($running[0].Id) has root exception - cancelling for resubmit." -ForegroundColor Yellow
        Stop-AlarmStateExportFlinkJob -JobId $running[0].Id
        Start-Sleep -Seconds 5
    } elseif ($running.Count -ge 1 -and $ForceResubmit) {
        Stop-AlarmStateExportFlinkJob -JobId $running[0].Id
        Start-Sleep -Seconds 5
    }

    if (-not $JarHostPath -or -not (Test-Path -LiteralPath $JarHostPath)) {
        throw "Flink JAR not found: $JarHostPath"
    }

    Write-Host "[Flink] Submitting $script:AlarmStateExportJobName..." -ForegroundColor Yellow
    
    $ProgramArgs = @("--bootstrap.servers", "kafka:9092")

    $runArgs = @("exec", $script:AmsFlinkJobManager, "flink", "run", "-d", "-c", $EntryClass, $JarContainerPath) + $ProgramArgs
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker @runArgs 2>&1 | ForEach-Object {
        if ($_ -match 'WARNING: Unknown module') { return }
        Write-Host $_
    }
    $ErrorActionPreference = $prevEap
    Start-Sleep -Seconds 10

    $after = @(Get-AlarmStateExportFlinkJobs | Where-Object { $_.Status -eq "RUNNING" })
    if ($after.Count -lt 1) {
        throw "Flink Alarm State Export job submit did not reach RUNNING state. Check JobManager logs and UI."
    }
    return $after[0].Id
}
