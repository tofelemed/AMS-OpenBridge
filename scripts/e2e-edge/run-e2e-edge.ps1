# Edge Platform E2E — PowerShell runner
param(
    [string]$RunId = "",
    [int]$Count = 3,
    [switch]$SkipFeed,
    [switch]$AlsoCurrentState,
    [switch]$SkipPrometheus
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "`n=== AMS Edge E2E (Python) ===" -ForegroundColor Cyan

# Install deps if needed
if (-not (Test-Path ".venv")) {
    Write-Host "Creating venv…" -ForegroundColor Yellow
    python -m venv .venv
}
& .\.venv\Scripts\pip.exe install -q -r requirements.txt

$argsList = @("run_all.py", "--count", $Count)
if ($RunId) { $argsList += @("--run-id", $RunId) }
if ($SkipFeed) { $argsList += "--skip-feed" }
if ($AlsoCurrentState) { $argsList += "--also-current-state" }
if ($SkipPrometheus) { $argsList += "--skip-prometheus" }

& .\.venv\Scripts\python.exe @argsList
exit $LASTEXITCODE
