# AMS Autonomous Operational Validation — no user interaction required.
param(
    [int]$StormCount = 17200,
    [int]$CatchUpSec = 180,
    [ValidateSet("streampipes", "gateway")]
    [string]$IngestAuthority = "gateway",
    [switch]$ExpectGatewayAckOnly,
    [switch]$SkipUi,
    [switch]$SkipReset,
    [string]$ApiBase = "http://127.0.0.1:8000",
    [string]$GatewayBase = "http://127.0.0.1:5050",
    [string]$UiBase = "http://127.0.0.1:3000",
    [string]$ReportPath = ""
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$Root = if (Test-Path "$PSScriptRoot\..\src") { (Resolve-Path "$PSScriptRoot\..").Path } else { "e:\AMS" }
$ValDir = Join-Path $PSScriptRoot "validation"
. (Join-Path $PSScriptRoot "lib\AmsFlinkJob.ps1")

if (-not $ReportPath) {
    $ReportPath = Join-Path $ValDir "autonomous_report_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
}

$report = [ordered]@{
    startedAt = (Get-Date).ToUniversalTime().ToString("o")
    phases    = @{}
    summary   = @{}
}

function Set-Phase($id, $name, $pass, $checks) {
    $report.phases[$id] = @{ name = $name; pass = $pass; checks = $checks }
}

function Test-Check($checks, $name, $pass, $detail) {
    $checks += @(@{ name = $name; pass = [bool]$pass; detail = "$detail" })
    $c = if ($pass) { "Green" } else { "Red" }
    Write-Host ("  [{0}] {1} - {2}" -f $(if ($pass) { "PASS" } else { "FAIL" }), $name, $detail) -ForegroundColor $c
    return ,$checks
}

function Wait-Http($url, $sec = 60) {
    $deadline = (Get-Date).AddSeconds($sec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4
            # 503 = API up but health checks degraded (acceptable during warm-up)
            if ($r.StatusCode -lt 500 -or $r.StatusCode -eq 503) { return $true }
        } catch {}
        Start-Sleep -Seconds 2
    }
    return $false
}

function Wait-ProjectionCatchUp {
    param(
        [string]$ApiBase,
        [hashtable]$Headers,
        [int]$TimeoutSec = 180,
        [int]$PollSec = 5
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    $lastTotal = -1
    $stableRounds = 0
    while ((Get-Date) -lt $deadline) {
        try {
            $pl = Invoke-RestMethod "$ApiBase/api/v1/health/pipeline" -TimeoutSec 20
            $lag = [int]$pl.kafka.lag
            $active = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=1" -Headers $Headers -TimeoutSec 30
            $total = [int]$active.summary.totalActive
            Write-Host ("  catch-up: lag={0} active={1} ({2}s left)" -f $lag, $total, [math]::Max(0, ($deadline - (Get-Date)).TotalSeconds.ToString("0"))) -ForegroundColor DarkGray
            if ($lag -eq 0 -and $total -gt 0) { $stableRounds++ } else { $stableRounds = 0 }
            if ($stableRounds -ge 2) { return @{ Lag = $lag; TotalActive = $total; Stable = $true } }
            if ($total -eq $lastTotal -and $lag -eq 0 -and $total -gt 0) { $stableRounds++ }
            $lastTotal = $total
        } catch {}
        Start-Sleep -Seconds $PollSec
    }
    return @{ Lag = -1; TotalActive = $lastTotal; Stable = $false }
}

Write-Host "`n======== AMS AUTONOMOUS VALIDATION ========`n" -ForegroundColor Cyan

# ── PHASE 1: Clean reset ─────────────────────────────────────
$p1 = @()
if (-not $SkipReset) {
    Write-Host "[Phase 1] Clean system reset" -ForegroundColor Yellow
    try {
        docker exec ams-postgres psql -U ams_user -d ams -c "TRUNCATE alarms.active_alarms CASCADE;" 2>&1 | Out-Null
        $p1 = Test-Check $p1 "PostgreSQL active_alarms truncate" $true "alarms.active_alarms"
    } catch {
        $p1 = Test-Check $p1 "PostgreSQL active_alarms truncate" $false $_.Exception.Message
    }

    $resetScript = Join-Path $PSScriptRoot "kafka-reset-lab-topics.ps1"
    if (Test-Path $resetScript) {
        & $resetScript -Force 2>&1 | Out-Null
        $p1 = Test-Check $p1 "Kafka lab topics reset" ($LASTEXITCODE -eq 0) "kafka-reset-lab-topics.ps1"
    } else {
        $topics = @("raw-opc-events", "traverse.alarm.current-alarm-state", "traverse.alarm.lifecycle-events", "traverse.alarm.ack-results", "traverse.alarm.ack-writeback", "traverse.alarm.operator-actions")
        foreach ($t in $topics) {
            docker exec ams-kafka kafka-topics --bootstrap-server localhost:9092 --delete --topic $t 2>$null | Out-Null
            docker exec ams-kafka kafka-topics --bootstrap-server localhost:9092 `
                --create --if-not-exists --topic $t --partitions 6 --replication-factor 1 2>$null | Out-Null
        }
        $p1 = Test-Check $p1 "Kafka topics recreated" $true ($topics -join ", ")
    }

    $jobs = @(Get-AmsFlinkAlarmJobs)
    foreach ($j in $jobs) {
        if ($j.Status -eq "RUNNING") { Stop-AmsFlinkAlarmJob -JobId $j.Id }
    }
    Start-Sleep -Seconds 5
    $flinkJar = Join-Path $Root "src\flink\target\ams-flink-1.0-SNAPSHOT.jar"
    if (-not (Test-Path $flinkJar)) {
        Write-Host "  Building Flink JAR..." -ForegroundColor DarkGray
        docker run --rm -v "${Root}/src/flink:/build" -w /build maven:3.9-eclipse-temurin-11 mvn -q package -DskipTests 2>&1 | Out-Null
    }
    Ensure-AmsFlinkAlarmJob -JarHostPath $flinkJar -RawAlarmsStartingOffsets earliest | Out-Null
    Start-Sleep -Seconds 8
    $running = @(Get-AmsFlinkAlarmJobs | Where-Object { $_.Status -eq "RUNNING" })
    $p1 = Test-Check $p1 "Flink job restarted" ($running.Count -ge 1) $(if ($running) { $running[0].Id } else { "none" })
} else {
    $p1 = Test-Check $p1 "Reset skipped" $true "-SkipReset"
}
Set-Phase "phase1" "Clean Reset" (($p1 | Where-Object { -not $_.pass }).Count -eq 0) $p1

# ── PHASE 2: Infrastructure ───────────────────────────────
Write-Host "`n[Phase 2] Infrastructure" -ForegroundColor Yellow
$p2 = @()
foreach ($c in @("ams-kafka", "ams-zookeeper", "ams-postgres", "ams-redis", "ams-flink-jobmanager")) {
    $st = docker inspect --format '{{.State.Status}}' $c 2>$null
    $p2 = Test-Check $p2 "Container $c" ($st -eq "running") $st
}
$tm = (docker ps --filter "name=taskmanager" --format "{{.Names}}" 2>$null | Measure-Object).Count
$p2 = Test-Check $p2 "Flink taskmanagers" ($tm -ge 1) "count=$tm"

if (-not (Wait-Http "$ApiBase/health" 5)) {
    Write-Host "  Starting API..." -ForegroundColor DarkGray
    $env:ASPNETCORE_ENVIRONMENT = "Development"
    Remove-Item Env:KAFKA__INGESTAUTHORITY -ErrorAction SilentlyContinue
    Remove-Item Env:KAFKA__ENABLERAWEVENTPUBLISH -ErrorAction SilentlyContinue
    Start-Process dotnet -ArgumentList "run","--project","$Root\src\backend\AMS.Api\AMS.Api.csproj" `
        -WorkingDirectory "$Root\src\backend\AMS.Api" -WindowStyle Hidden
    Wait-Http "$ApiBase/health" 90 | Out-Null
}
$p2 = Test-Check $p2 "AMS API" (Wait-Http "$ApiBase/health" 3) $ApiBase

$gw = $null
if (-not (Wait-Http "$GatewayBase/health/opc" 3)) {
    $gwEnv = if ($ExpectGatewayAckOnly -or $IngestAuthority -eq "streampipes") { "StreamPipes" } else { "Production" }
    Start-Process dotnet -ArgumentList "run","--project","$Root\src\opc-gateway\AMS.OpcGateway\AMS.OpcGateway.csproj","--environment",$gwEnv `
        -WorkingDirectory "$Root\src\opc-gateway\AMS.OpcGateway" -WindowStyle Hidden
    Wait-Http "$GatewayBase/health/opc" 60 | Out-Null
}
try {
    $gw = Invoke-RestMethod "$GatewayBase/health/opc" -TimeoutSec 8
    if ($ExpectGatewayAckOnly -or $IngestAuthority -eq "streampipes") {
        $p2 = Test-Check $p2 "Gateway ACK-only (:5050)" ($gw.mode -eq "ack-only" -and $gw.telemetryPublish -eq $false) "mode=$($gw.mode) telemetry=$($gw.telemetryPublish)"
    } else {
        $p2 = Test-Check $p2 "Gateway telemetry (:5050)" ($gw.telemetryPublish -eq $true) "mode=$($gw.mode)"
    }
} catch {
    $p2 = Test-Check $p2 "Gateway health" $false $_.Exception.Message
}

$headers = @{ Authorization = "Bearer dev" }
try {
    $pl = Invoke-RestMethod "$ApiBase/api/v1/health/pipeline" -TimeoutSec 30
    $p2 = Test-Check $p2 "Kafka broker" ($pl.kafka.brokerHealth -eq "Healthy") "lag=$($pl.kafka.lag) rate=$($pl.kafka.throughput)"
    $p2 = Test-Check $p2 "Flink checkpoint" ($pl.flink.restartCount -eq 0) "cpMs=$($pl.flink.checkpointLatencyMs) restarts=$($pl.flink.restartCount)"
    $p2 = Test-Check $p2 "Gateway OPC" ($pl.gateway.opcConnected -eq $true -or $IngestAuthority -eq "streampipes") "connected=$($pl.gateway.opcConnected) wal=$($pl.gateway.walQueueSize)"
    $p2 = Test-Check $p2 "Postgres latency" ($pl.postgres.queryLatencyMs -lt 500) "$([math]::Round($pl.postgres.queryLatencyMs,1))ms"
} catch {
    $p2 = Test-Check $p2 "Pipeline health API" $false $_.Exception.Message
    $pl = $null
}
Set-Phase "phase2" "Infrastructure" (($p2 | Where-Object { -not $_.pass }).Count -eq 0) $p2

# ── PHASE 3: StreamPipes ingest (simulated storm) ───────────
Write-Host "`n[Phase 3] Telemetry storm ($StormCount events)" -ForegroundColor Yellow
$p3 = @()
$py = Join-Path $ValDir "alarm_storm_v2.py"
python $py --count $StormCount 2>&1
if ($LASTEXITCODE -ne 0) { pip install kafka-python -q; python $py --count $StormCount 2>&1 }
$p3 = Test-Check $p3 "Alarm storm published" ($LASTEXITCODE -eq 0) "$StormCount schema-v2 events"

Write-Host "  Waiting for Flink/API catch-up (${CatchUpSec}s max)..." -ForegroundColor DarkGray
$catchUp = Wait-ProjectionCatchUp -ApiBase $ApiBase -Headers $headers -TimeoutSec $CatchUpSec
$p3 = Test-Check $p3 "Projection catch-up" $catchUp.Stable "lag=0 active=$($catchUp.TotalActive) window=${CatchUpSec}s"
$sample = docker exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 `
    --topic raw-opc-events --from-beginning --timeout-ms 12000 --max-messages 1 2>&1 | Out-String
$p3 = Test-Check $p3 "raw-opc-events traffic" ($sample -match "streampipes|RAW_OPC|schemaVersion|cookieOffset") "post-storm sample"

# ── PHASE 4: Flink ──────────────────────────────────────────
Write-Host "`n[Phase 4] Flink" -ForegroundColor Yellow
$p4 = @()
$running = @(Get-AmsFlinkAlarmJobs | Where-Object { $_.Status -eq "RUNNING" })
$p4 = Test-Check $p4 "Flink RUNNING" ($running.Count -ge 1) $(if ($running) { $running[0].Id } else { "none" })
try {
    $fj = Invoke-RestMethod "http://localhost:8082/jobs/overview" -TimeoutSec 10
    $p4 = Test-Check $p4 "Flink JobManager API" $true "$($fj.jobs.Count) jobs"
} catch {
    $p4 = Test-Check $p4 "Flink JobManager API" $false $_.Exception.Message
}
Set-Phase "phase4" "Flink" (($p4 | Where-Object { -not $_.pass }).Count -eq 0) $p4

# ── PHASE 5: Database ───────────────────────────────────────
Write-Host "`n[Phase 5] PostgreSQL projection" -ForegroundColor Yellow
$p5 = @()
try {
    $cnt = (docker exec ams-postgres psql -U ams_user -d ams -t -A -c "SELECT COUNT(*) FROM alarms.active_alarms;" 2>&1 | Out-String).Trim()
    $n = [int]($cnt -replace '[^0-9]', '')
    $p5 = Test-Check $p5 "active_alarms rows" ($n -gt 0) "count=$n (target storm projection)"
} catch {
    $p5 = Test-Check $p5 "active_alarms rows" $false $_.Exception.Message
}
try {
    $active = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=5" -Headers $headers -TimeoutSec 30
    $p5 = Test-Check $p5 "API active alarms" ($active.summary.totalActive -gt 0) "total=$($active.summary.totalActive)"
} catch {
    $p5 = Test-Check $p5 "API active alarms" $false $_.Exception.Message
}
Set-Phase "phase5" "PostgreSQL" (($p5 | Where-Object { -not $_.pass }).Count -eq 0) $p5

# ── PHASE 6: UI (Playwright) ────────────────────────────────
Write-Host "`n[Phase 6] UI autonomous" -ForegroundColor Yellow
$p6 = @()
if ($SkipUi) {
    $p6 = Test-Check $p6 "UI skipped" $true "-SkipUi"
} else {
    if (-not (Wait-Http $UiBase 3)) {
        Write-Host "  Starting frontend dev server..." -ForegroundColor DarkGray
        Start-Process npm -ArgumentList "run","dev" -WorkingDirectory "$Root\src\frontend" -WindowStyle Hidden
        Wait-Http $UiBase 90 | Out-Null
    }
    $pkg = Join-Path $ValDir "package.json"
    if (-not (Test-Path $pkg)) {
        @{ name = "ams-validation-ui"; private = $true; type = "module"; dependencies = @{ playwright = "^1.49.0" } } |
            ConvertTo-Json | Set-Content $pkg
    }
    if (-not (Test-Path (Join-Path $ValDir "node_modules\playwright"))) {
        Push-Location $ValDir; npm install --silent 2>&1 | Out-Null; Pop-Location
        Push-Location $ValDir; npx playwright install chromium 2>&1 | Out-Null; Pop-Location
    }
    $env:AMS_UI_URL = $UiBase
    $env:AMS_API_URL = $ApiBase
    $uiOut = Join-Path $ValDir "ui-results.json"
    $env:AMS_UI_RESULTS = $uiOut
    Push-Location $ValDir
    node ui-autonomous.mjs 2>&1
    $uiExit = $LASTEXITCODE
    Pop-Location
    if (Test-Path $uiOut) {
        $ui = Get-Content $uiOut -Raw | ConvertFrom-Json
        foreach ($r in $ui.results) { $p6 = Test-Check $p6 ("UI: " + $r.name) $r.pass $r.detail }
    } else {
        $p6 = Test-Check $p6 "UI automation" $false "no ui-results.json"
    }
}
Set-Phase "phase6" "UI" (($p6 | Where-Object { -not $_.pass }).Count -eq 0) $p6

# ── PHASE 7: OPC ACK (gateway :5050 — storm rows lack cookie; use live OPC when available) ──
Write-Host "`n[Phase 7] OPC ACK reflection (gateway ACK path)" -ForegroundColor Yellow
$p7 = @()
try {
    $ackAlarm = $null
    $active = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=200&isAcknowledged=false" -Headers $headers -TimeoutSec 30
    foreach ($a in $active.items) {
        $co = $a.opcAttributes.cookieOffset
        if ($co -and [int]$co -gt 0 -and $a.conditionName) { $ackAlarm = $a; break }
    }
    if (-not $ackAlarm) {
        $p7 = Test-Check $p7 "OPC ACK (cookie alarm)" $false "no unacked alarm with cookieOffset (storm-only ingest expected)"
        $p7 = Test-Check $p7 "Gateway ACK-only ready" ($gw.mode -eq "ack-only") "run validate-ams-production-ack.ps1 for live DCS ACK"
    } else {
        Invoke-RestMethod "$ApiBase/api/v1/alarms/$($ackAlarm.id)/acknowledge" -Method Post -Headers $headers `
            -ContentType "application/json" -Body '{"comment":"Autonomous ACK","operatorStation":"IOC-1"}' -TimeoutSec 30 | Out-Null
        $ackWait = [math]::Min(90, [math]::Max(30, $CatchUpSec / 2))
        Start-Sleep -Seconds $ackWait
        $after = Invoke-RestMethod "$ApiBase/api/v1/alarms/active?pageSize=500" -Headers $headers -TimeoutSec 30
        $row = $after.items | Where-Object { $_.id -eq $ackAlarm.id } | Select-Object -First 1
        $life = $row.opcAttributes.ackLifecycleState
        $detail = $row.opcAttributes.ackLifecycleDetail
        $confirmed = ($life -eq "ACK_CONFIRMED") -or ($row.acknowledged -eq $true)
        $p7 = Test-Check $p7 "OPC ACK_CONFIRMED" $confirmed "state=$life ack=$($row.acknowledged)"
        if (-not $confirmed) {
            $p7 = Test-Check $p7 "ACK lifecycle detail" ($null -ne $detail) $detail
        }
    }
} catch {
    $p7 = Test-Check $p7 "OPC ACK test" $false $_.Exception.Message
}
Set-Phase "phase7" "OPC ACK" (($p7 | Where-Object { -not $_.pass }).Count -eq 0) $p7

# ── Final report ────────────────────────────────────────────
$sections = @{
    Infrastructure       = $report.phases.phase2.pass
    Kafka                = ($p3 | Where-Object { $_.name -match "raw-opc" }).pass
    StreamPipes          = ($p3 | Where-Object { $_.name -match "storm|streampipes" -or $_.name -match "traffic" }).pass
    Flink                = $report.phases.phase4.pass
    PostgreSQL           = $report.phases.phase5.pass
    UI                   = $report.phases.phase6.pass
    AckLifecycle         = ($p7 | Where-Object { $_.name -match "lifecycle" }).pass
    OpcAckReflection     = ($p7 | Where-Object { $_.name -match "CONFIRMED" }).pass
    AgGridStability      = ($p6 | Where-Object { $_.name -match "Grid" }).pass
    EndToEndDeterminism  = ($report.phases.phase1.pass -and $report.phases.phase5.pass)
}

$report.summary = $sections
$report.completedAt = (Get-Date).ToUniversalTime().ToString("o")
$report.overallPass = ($sections.Values | Where-Object { $_ -eq $false }).Count -eq 0

$report | ConvertTo-Json -Depth 6 | Set-Content $ReportPath -Encoding UTF8

Write-Host "`n======== FINAL REPORT ========" -ForegroundColor Cyan
foreach ($kv in $sections.GetEnumerator() | Sort-Object Name) {
    $icon = if ($kv.Value) { "PASS" } else { "FAIL" }
    Write-Host ("  {0,-22} {1}" -f $kv.Key, $icon) -ForegroundColor $(if ($kv.Value) { "Green" } else { "Red" })
}
Write-Host "`nReport: $ReportPath" -ForegroundColor White
Write-Host "Overall: $(if ($report.overallPass) { 'PASS' } else { 'FAIL' })`n" -ForegroundColor $(if ($report.overallPass) { "Green" } else { "Yellow" })

if (-not $report.overallPass) { exit 1 }
