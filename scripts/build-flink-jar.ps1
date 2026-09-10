# Builds ams-flink JAR using Maven inside Docker (no local Maven required).
# -RunTests additionally runs the unit suite (incl. the CPLM golden-loop gate,
# Cplm*Test) inside the same container before packaging.
param(
    [switch]$RunTests
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$flinkDir = Join-Path $root "src\flink"
$jarOut = Join-Path $flinkDir "target\ams-flink-1.0-SNAPSHOT.jar"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is not on PATH. This build runs Maven in a container (maven:3.9-eclipse-temurin-11); start Docker Desktop first."
}

# If the compose stack was ever started before the jar existed, Docker created a
# DIRECTORY at the bind-mount path. Maven cannot overwrite it and every Flink
# submit then fails silently - remove it before building.
if (Test-Path $jarOut -PathType Container) {
    Write-Host "[Flink] Removing stray directory at $jarOut (created by a pre-build compose up)" -ForegroundColor Yellow
    Remove-Item -Recurse -Force $jarOut
}

# -Dmaven.test.skip=true, NOT -DskipTests: the latter still COMPILES the tests, and the
# pre-existing CplmLoopDynamicsAwareTest compile failure then fails the build after
# `clean` has already deleted the previous jar (changes_tracker CHG-008 §2).
$mvnGoals = if ($RunTests) { @("mvn", "-q", "package") } else { @("mvn", "-q", "package", "-Dmaven.test.skip=true") }
Write-Host "[Flink] Building JAR via maven:3.9-eclipse-temurin-11 ($(if ($RunTests) { 'with tests' } else { 'tests skipped' }))..." -ForegroundColor Cyan
docker run --rm `
    -v "${flinkDir}:/build" `
    -w /build `
    maven:3.9-eclipse-temurin-11 `
    @mvnGoals
if ($LASTEXITCODE -ne 0) {
    throw "Maven build failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $jarOut -PathType Leaf)) {
    throw "Build failed - JAR not found at $jarOut"
}
Write-Host "[Flink] Built: $jarOut" -ForegroundColor Green
