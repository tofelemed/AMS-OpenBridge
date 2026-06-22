# Docker helpers for AMS production scripts.

function Get-AmsDockerComposeDir {
    $root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
    return Join-Path $root "infra\docker"
}

function Test-AmsContainerRunning {
    param([Parameter(Mandatory)][string]$Name)
    $state = docker inspect -f "{{.State.Running}}" $Name 2>$null
    return $state -eq "true"
}

function Wait-AmsContainerHealthy {
    param(
        [Parameter(Mandatory)][string]$Name,
        [int]$TimeoutSeconds = 300,
        [int]$PollSeconds = 5
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-AmsContainerRunning -Name $Name)) {
            Write-Host "  waiting for $Name to start..." -ForegroundColor Gray
            Start-Sleep -Seconds $PollSeconds
            continue
        }
        $health = docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" $Name 2>$null
        if ($health -eq "healthy" -or $health -eq "none") {
            return $true
        }
        Write-Host "  $Name health=$health..." -ForegroundColor Gray
        Start-Sleep -Seconds $PollSeconds
    }
    throw "Container '$Name' did not become healthy within ${TimeoutSeconds}s."
}

function Invoke-AmsDockerCompose {
    param([Parameter(Mandatory)][string[]]$Args)
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & docker @Args
        if ($LASTEXITCODE -ne 0) {
            throw "docker $($Args -join ' ') failed (exit $LASTEXITCODE)."
        }
    }
    finally {
        $ErrorActionPreference = $prevEap
    }
}

function Remove-AmsStaleContainers {
    $names = @(
        "ams-api", "ams-frontend", "ams-kafka", "ams-zookeeper", "ams-postgres",
        "ams-flink-jobmanager", "ams-flink-taskmanager",
        "docker-flink-taskmanager-1", "docker-flink-taskmanager-2"
    )
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    foreach ($name in $names) {
        $exists = docker inspect -f "{{.Name}}" $name 2>$null
        if (-not $exists) { continue }
        if (Test-AmsContainerRunning -Name $name) {
            Write-Host "  Stopping stale container $name..." -ForegroundColor Gray
            docker stop $name 2>&1 | Out-Null
        }
        Write-Host "  Removing stale container $name..." -ForegroundColor Gray
        docker rm -f $name 2>&1 | Out-Null
    }
    $ErrorActionPreference = $prevEap
}

function Reset-AmsKafkaVolumes {
    $volumes = @("docker_kafka_0_data", "docker_zookeeper_data")
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    foreach ($vol in $volumes) {
        $exists = docker volume inspect $vol 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Removing volume $vol (fixes Kafka cluster ID mismatch)..." -ForegroundColor Yellow
            docker volume rm $vol 2>&1 | Out-Null
        }
    }
    $ErrorActionPreference = $prevEap
}

function Start-AmsDockerStack {
    param([switch]$Rebuild, [switch]$ResetKafkaVolumes)
    $composeDir = Get-AmsDockerComposeDir
    Push-Location $composeDir
    try {
        Write-Host "  Stopping stale stack (remove orphans)..." -ForegroundColor Gray
        Remove-AmsStaleContainers
        Invoke-AmsDockerCompose -Args @("compose", "down", "--remove-orphans")
        if ($ResetKafkaVolumes) { Reset-AmsKafkaVolumes }
        $upArgs = @("compose", "up", "-d")
        if ($Rebuild) { $upArgs += "--build" }
        Invoke-AmsDockerCompose -Args $upArgs
    }
    finally {
        Pop-Location
    }

    Write-Host "  Waiting for core services..." -ForegroundColor Gray
    Wait-AmsContainerHealthy -Name "ams-zookeeper" -TimeoutSeconds 240 | Out-Null
    Wait-AmsContainerHealthy -Name "ams-kafka" -TimeoutSeconds 300 | Out-Null
    Wait-AmsContainerHealthy -Name "ams-postgres" -TimeoutSeconds 240 | Out-Null
    Wait-AmsContainerHealthy -Name "ams-flink-jobmanager" -TimeoutSeconds 180 | Out-Null
    Wait-AmsContainerHealthy -Name "ams-api" -TimeoutSeconds 300 | Out-Null
    Write-Host "  Docker stack ready." -ForegroundColor Green
}

function Invoke-AmsKafkaExec {
    param(
        [Parameter(Mandatory)][string[]]$Args,
        [switch]$AllowFailure
    )
    if (-not (Test-AmsContainerRunning -Name "ams-kafka")) {
        throw "ams-kafka is not running. Run scripts\start-ams-production.ps1 first."
    }
    & docker exec ams-kafka @Args
    if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) {
        throw "docker exec ams-kafka failed (exit $LASTEXITCODE): $($Args -join ' ')"
    }
    return $LASTEXITCODE
}
