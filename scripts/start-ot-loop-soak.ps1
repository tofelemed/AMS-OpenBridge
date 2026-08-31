# Start (or stop) the OT loop-ingestion lab soak: a persistent data source +
# the OT gateway simulator feeding the first N registered loops live.
#
#   .\scripts\start-ot-loop-soak.ps1                    # 10 loops, every 5 s, runs until stopped
#   .\scripts\start-ot-loop-soak.ps1 -Loops 161 -IntervalSeconds 1
#   .\scripts\start-ot-loop-soak.ps1 -Stop              # stop the sim (data source stays active)
#
# Then check the pipeline stage by stage: .\scripts\verify-ot-loop-flow.ps1
param(
    [string]$GatewayBase = 'http://127.0.0.1:8081',
    [string]$AdminUser = 'admin',
    [string]$AdminPassword = '',
    [int]$Loops = 10,
    [double]$IntervalSeconds = 5,
    [string]$LoopsCsv = 'scripts\fixtures\hdpe-all-loops.csv',
    [switch]$NoUnknown,   # omit the unregistered FIC99999 parking probe
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $env:TEMP 'ot-loop-soak.pid'
$logFile = Join-Path $env:TEMP 'ot-loop-soak.log'

if ($Stop) {
    if (Test-Path $pidFile) {
        $soakPid = Get-Content $pidFile
        try { Stop-Process -Id $soakPid -Force -Confirm:$false; Write-Host "soak sim (pid $soakPid) stopped" }
        catch { Write-Host "sim pid $soakPid was not running" }
        Remove-Item $pidFile -Force -Confirm:$false
    } else { Write-Host 'no pid file - soak sim not running (or started manually)' }
    Write-Host 'data source left ACTIVE (deactivate via Administration -> Data Sources if unwanted)'
    exit 0
}

if (-not $AdminPassword) {
    $envFile = Join-Path $repoRoot 'infra\docker\.env'
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^AUTH_BOOTSTRAP_PASSWORD=' } | Select-Object -First 1
        if ($line) { $AdminPassword = $line.Split('=', 2)[1] }
    }
    if (-not $AdminPassword) { $AdminPassword = 'ChangeMe123!' }
}

# ── OT broker stand-in ───────────────────────────────────────────────────────
Write-Host 'ensuring mosquitto-test broker (docker compose --profile mqtt-test)...'
cmd /c "docker compose --profile mqtt-test -f `"$repoRoot\infra\docker\docker-compose.yml`" up -d mosquitto-test >nul 2>&1"

# ── Data source: create once, reuse forever ──────────────────────────────────
$login = Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/auth/login" -ContentType 'application/json' `
    -Body (@{ username = $AdminUser; password = $AdminPassword } | ConvertTo-Json)
$H = @{ Authorization = "Bearer $($login.token)" }
$name = 'OT Gateway (lab soak)'
$existing = @(Invoke-RestMethod -Method Get -Uri "$GatewayBase/api/ingestion/data-sources" -Headers $H) |
    Where-Object { $_.name -eq $name } | Select-Object -First 1
if (-not $existing) {
    $body = @{
        sourceType = 'MQTT'; profileType = 'MQTT_LOOP_SAMPLES'
        name = $name
        description = 'Persistent lab soak feed (start-ot-loop-soak.ps1)'
        connectionUrl = 'mqtt://mosquitto-test:1883'
        username = 'ams_ingest'; password = 'ams-ingest-test'
        timeoutSeconds = 15
        profileConfig = @{
            mqtt = @{ topics = @('OT/+/+/+/+/PIDParams/+'); qos = 1; clean_session = $false; session_expiry_seconds = 86400; keepalive_seconds = 60 }
            loop_ingest = @{ grid_seconds = 5; mode_value_map = @{ '4' = 'AUT' }; registry_refresh_seconds = 60 }
        }
    } | ConvertTo-Json -Depth 8
    $existing = Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/ingestion/data-sources" -Headers $H -ContentType 'application/json' -Body $body
    Write-Host "data source created: $($existing.configId)"
} elseif (-not $existing.isActive) {
    Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/ingestion/data-sources/$($existing.configId)/activate" -Headers $H | Out-Null
    Write-Host 'data source re-activated'
} else {
    Write-Host "data source already active: $($existing.configId)"
}
$test = Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/ingestion/data-sources/$($existing.configId)/test" -Headers $H
if (-not $test.ok) { throw "broker connection test failed: $($test.error)" }
Write-Host "broker connection test: OK ($($test.latencyMs) ms)"

# ── Simulator ────────────────────────────────────────────────────────────────
if (Test-Path $pidFile) {
    $old = Get-Content $pidFile
    if (Get-Process -Id $old -ErrorAction SilentlyContinue) {
        Write-Host "soak sim already running (pid $old) - use -Stop first to restart"; exit 0
    }
}
$sim = Join-Path $repoRoot 'ams-sims\sim_ot_gateway_mqtt.py'
$simArgs = @("`"$sim`"", '--loops-csv', "`"$(Join-Path $repoRoot $LoopsCsv)`"",
             '--limit', $Loops, '--interval', $IntervalSeconds)
if ($NoUnknown) { $simArgs += '--no-unknown' }
$proc = Start-Process -FilePath 'python' -ArgumentList $simArgs -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"
$proc.Id | Set-Content $pidFile
Start-Sleep -Seconds 3
if ($proc.HasExited) { Get-Content $logFile, "$logFile.err" | Select-Object -Last 10; throw 'simulator exited immediately' }

Write-Host ""
Write-Host "soak running: $Loops loop(s) every $IntervalSeconds s (pid $($proc.Id))" -ForegroundColor Green
Write-Host "  log:    $logFile"
Write-Host "  stop:   .\scripts\start-ot-loop-soak.ps1 -Stop"
Write-Host "  verify: .\scripts\verify-ot-loop-flow.ps1"
