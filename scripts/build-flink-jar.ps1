# Builds ams-flink JAR using Maven inside Docker (no local Maven required).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$flinkDir = Join-Path $root "src\flink"
$jarOut = Join-Path $flinkDir "target\ams-flink-1.0-SNAPSHOT.jar"

Write-Host "[Flink] Building JAR via maven:3.9-eclipse-temurin-11..." -ForegroundColor Cyan
docker run --rm `
    -v "${flinkDir}:/build" `
    -w /build `
    maven:3.9-eclipse-temurin-11 `
    mvn -q package -DskipTests

if (-not (Test-Path $jarOut)) {
    throw "Build failed - JAR not found at $jarOut"
}
Write-Host "[Flink] Built: $jarOut" -ForegroundColor Green
