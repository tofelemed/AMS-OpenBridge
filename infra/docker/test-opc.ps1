$ErrorActionPreference = "SilentlyContinue"

Write-Host "Waiting for ams-api to become healthy..."
$healthy = $false
for ($i=0; $i -lt 120; $i++) {
    $status = docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}" ams-api 2>$null
    if ($status -match "healthy") {
        $healthy = $true
        break
    }
    Start-Sleep -Seconds 5
}

if (-not $healthy) {
    Write-Host "API failed to become healthy. Logs:"
    docker logs --tail 50 ams-api
    docker ps
    exit 1
}

Write-Host "API is healthy! Querying active alarms..."
Start-Sleep -Seconds 10 # Wait for pipeline to stream data
$response = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/alarms/active" -Method Get
Write-Host "Results:"
$response | ConvertTo-Json -Depth 5
