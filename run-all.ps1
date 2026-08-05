#Requires -Version 5.1
<#
.SYNOPSIS
  Build and run the full AMS Docker stack (all services).

.DESCRIPTION
  Wrapper for scripts/start-ams-docker-full.ps1 — builds images, starts every
  lab service (Postgres, Redis, Kafka, Flink, API, Frontend, StreamPipes),
  deploys the Flink job, and opens the UI.

.EXAMPLE
  .\run-all.ps1
  .\run-all.ps1 -InjectLabEvents
  .\run-all.ps1 -SkipGoldenVerify
#>
param(
    [switch]$InjectLabEvents,
    [switch]$ResetKafkaTopics,
    [switch]$ResetKafkaVolumes,
    [switch]$SkipBuild,
    [switch]$RemoveOrphans,
    [switch]$GoldenVerify,
    [switch]$SkipGoldenVerify,
    [switch]$RunFullE2EOnVerify,
    # Optional compose overlays, e.g. -ApplyOverlay docker-compose.sims.yml to start the
    # process-value simulator alongside the base stack.
    [ValidateSet("docker-compose.lab.yml", "docker-compose.sims.yml")]
    [string[]]$ApplyOverlay = @()
)

$script = Join-Path $PSScriptRoot "scripts\start-ams-docker-full.ps1"
if (-not (Test-Path $script)) {
    throw "Missing startup script: $script"
}

& $script @PSBoundParameters
exit $LASTEXITCODE
