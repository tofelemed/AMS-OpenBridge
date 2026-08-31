# Stop API, refresh Kafka coordinator, start API with new consumer group replay.
param(
    [string]$ConsumerGroupId = "ams-backend-v2"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "`n=== Restart API + replay traverse.alarm.current-alarm-state ===" -ForegroundColor Cyan

Get-Process -Name "AMS.Api" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Job | Where-Object { $_.Command -match "AMS.Api" } | Remove-Job -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "[Kafka] Restarting broker (clears stuck coordinator)..." -ForegroundColor Yellow
docker restart ams-kafka | Out-Null
$deadline = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $deadline) {
    $h = docker inspect -f "{{.State.Health.Status}}" ams-kafka 2>$null
    if ($h -eq "healthy") { break }
    Start-Sleep -Seconds 3
}

Write-Host "[Build] AMS.Api..." -ForegroundColor Yellow
dotnet build (Join-Path $root "src\backend\AMS.Api\AMS.Api.csproj") -v q | Out-Null

Write-Host "[API] Starting (ConsumerGroupId=$ConsumerGroupId in appsettings.Development.json)..." -ForegroundColor Yellow
Start-Process -FilePath "dotnet" -ArgumentList "run","--environment","Development" `
    -WorkingDirectory (Join-Path $root "src\backend\AMS.Api") -WindowStyle Hidden
Start-Sleep -Seconds 40

Write-Host "[Validate] Cookie projection..." -ForegroundColor Yellow
$h = @{ Authorization = "Bearer dev" }
$withCookie = (Invoke-RestMethod "http://127.0.0.1:8000/api/v1/alarms/active?pageSize=50&isAcknowledged=false" -Headers $h -TimeoutSec 60).items |
    Where-Object { $_.opcAttributes.cookieOffset -gt 0 }
$withCookie | Select-Object -First 10 sourceName, id, @{N='cookie';E={$_.opcAttributes.cookieOffset}}

if ($withCookie.Count -gt 0) {
    Write-Host "`n[OK] Cookies in API — run validate-ams-production-ack.ps1 next." -ForegroundColor Green
} else {
    Write-Host "`n[WARN] No cookies yet — ensure simulator + gateway connected; wait 30s and re-run cookie query." -ForegroundColor Yellow
}
