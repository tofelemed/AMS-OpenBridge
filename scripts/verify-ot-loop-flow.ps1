# Stage-by-stage verification of the OT loop pipeline while a feed is running
# (start one with .\scripts\start-ot-loop-soak.ps1). Read-only - safe to re-run.
#
# Stages: MQTT->subscriber | Kafka tuples | Flink jobs | Flink outputs |
#         IoTDB history | Postgres results | UI APIs (live + historical).
#
#   .\scripts\verify-ot-loop-flow.ps1
#   .\scripts\verify-ot-loop-flow.ps1 -TargetLoop PIC00521
param(
    [string]$GatewayBase = 'http://127.0.0.1:8081',
    [string]$AdminUser = 'admin',
    [string]$AdminPassword = '',
    [string]$TargetLoop = 'FIC10301',   # first loop of the default soak set
    [string]$LoopSamplesTopic = 'traverse.cpa.loop.samples.v1',
    [string]$FlinkRest = 'http://127.0.0.1:8082',
    [string]$IotDbRest = 'http://localhost:8181',
    [string]$IotDbUser = 'root',
    [string]$IotDbPassword = 'root'
)

$ErrorActionPreference = 'Stop'
$script:failed = 0; $script:passed = 0; $script:warned = 0

function Step([string]$name, [scriptblock]$body) {
    try { & $body; $script:passed++; Write-Host "  PASS  $name" -ForegroundColor Green }
    catch {
        $script:failed++
        Write-Host "  FAIL  $name" -ForegroundColor Red
        Write-Host "        $($_.Exception.Message)" -ForegroundColor Red
    }
}
function Warn([string]$name, [string]$detail) {
    $script:warned++
    Write-Host "  WARN  $name" -ForegroundColor Yellow
    Write-Host "        $detail" -ForegroundColor Yellow
}
function Assert([bool]$condition, [string]$message) { if (-not $condition) { throw $message } }

function Get-TopicEndOffsetSum([string]$topic) {
    $lines = @(cmd /c "docker exec ams-kafka kafka-run-class kafka.tools.GetOffsetShell --broker-list localhost:9092 --topic $topic 2>nul")
    $sum = 0L
    foreach ($l in $lines) { $parts = $l.Split(':'); if ($parts.Count -eq 3) { $sum += [long]$parts[2] } }
    return $sum
}

if (-not $AdminPassword) {
    $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'infra\docker\.env'
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^AUTH_BOOTSTRAP_PASSWORD=' } | Select-Object -First 1
        if ($line) { $AdminPassword = $line.Split('=', 2)[1] }
    }
    if (-not $AdminPassword) { $AdminPassword = 'ChangeMe123!' }
}
$login = Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/auth/login" -ContentType 'application/json' `
    -Body (@{ username = $AdminUser; password = $AdminPassword } | ConvertTo-Json)
$H = @{ Authorization = "Bearer $($login.token)" }

Write-Host "`n=== OT loop pipeline flow check (target loop: $TargetLoop) ===" -ForegroundColor Cyan

# ── 1. MQTT -> subscriber ────────────────────────────────────────────────────
Step '1. subscriber connected and receiving (10 s window)' {
    # NB: enumerate with foreach - the stats payload is a JSON array and PS 5.1's
    # pipeline does not reliably unroll it from Invoke-RestMethod.
    function Get-BusiestSubscriber {
        $best = $null
        foreach ($s in (Invoke-RestMethod -Uri "$GatewayBase/api/ingestion/stats" -Headers $H)) {
            if ($s.connected -and ($null -eq $best -or $s.messagesReceived -gt $best.messagesReceived)) { $best = $s }
        }
        return $best
    }
    $s1 = Get-BusiestSubscriber
    Assert ($null -ne $s1) 'no connected subscriber - start the soak first (.\scripts\start-ot-loop-soak.ps1)'
    Start-Sleep -Seconds 10
    $s2 = Get-BusiestSubscriber
    Assert ($s2.messagesReceived -gt $s1.messagesReceived) "messagesReceived not growing ($($s1.messagesReceived) -> $($s2.messagesReceived)) - is the sim running?"
    Assert ($s2.tuplesEmitted -gt $s1.tuplesEmitted) "tuples not emitted ($($s1.tuplesEmitted) -> $($s2.tuplesEmitted)) - check Kafka publish failures ($($s2.kafkaFailures))"
    Write-Host "        subscriber '$($s2.name)': +$($s2.messagesReceived - $s1.messagesReceived) msgs, +$($s2.tuplesEmitted - $s1.tuplesEmitted) tuples, joiner holds $($s2.activeLoops) loops, registry $($s2.registryLoops)"
}

# ── 2. Kafka: enriched tuples ────────────────────────────────────────────────
Step "2. enriched tuples on $LoopSamplesTopic" {
    $lines = @(cmd /c "docker exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic $LoopSamplesTopic --property print.key=true --timeout-ms 15000 --max-messages 30 2>nul")
    $found = $lines | Where-Object { $_ -match "^$TargetLoop\s" } | Select-Object -First 1
    if (-not $found) { $found = $lines | Where-Object { $_ -match "`t" } | Select-Object -First 1 }
    Assert ($null -ne $found) 'no tuples readable on the samples topic'
    $j = ($found -split "`t", 2)[1] | ConvertFrom-Json
    Assert ($null -ne $j.pv -and $null -ne $j.sp -and $null -ne $j.op) 'tuple missing pv/sp/op'
    Assert ($null -ne $j.loop_type -and $null -ne $j.site) 'tuple missing enrichment (loop_type/site)'
    Write-Host "        $($j.loop_id): pv=$([math]::Round($j.pv,2)) sp=$([math]::Round($j.sp,2)) op=$([math]::Round($j.op,2)) mode=$($j.mode) q=$($j.quality) [$($j.loop_type)] $($j.site)/$($j.area) fcs=$($j.source_fcs)"
}

# ── 3. Flink: CPLM jobs running ──────────────────────────────────────────────
Step '3. Flink CPLM jobs RUNNING' {
    $jobs = (Invoke-RestMethod -Uri "$FlinkRest/jobs/overview" -TimeoutSec 15).jobs
    foreach ($want in @('CPLM Short', 'CPLM Long', 'Loop Live RBE')) {
        $j = @($jobs | Where-Object { $_.name -match $want -and $_.state -eq 'RUNNING' })
        Assert ($j.Count -ge 1) "no RUNNING job matching '$want'"
    }
    $fusion = @($jobs | Where-Object { $_.name -match 'Fusion' -and $_.state -eq 'RUNNING' })
    Write-Host "        $(@($jobs | Where-Object { $_.state -eq 'RUNNING' }).Count) jobs RUNNING (gate fusion: $(if ($fusion.Count) { 'yes' } else { 'not running' }))"
}

# ── 4. Flink consuming the samples topic ─────────────────────────────────────
# Flink commits group offsets only on checkpoint completion (CPLM jobs checkpoint
# every 180-300 s), so "committed offsets ever advanced" is the honest signal here;
# stage 5 proves live consumption through the OUTPUT topics instead.
Step '4. Flink short-feature group attached with committed progress' {
    $lines = @(cmd /c "docker exec ams-kafka kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group traverse-cpa-flink-cplm-short 2>nul")
    $sum = 0L; $attached = $false
    foreach ($l in $lines) {
        $cols = ($l -split '\s+') | Where-Object { $_ }
        if ($cols.Count -ge 4 -and $cols[1] -eq $LoopSamplesTopic) {
            $attached = $true
            if ($cols[3] -match '^\d+$') { $sum += [long]$cols[3] }
        }
    }
    Assert $attached "group traverse-cpa-flink-cplm-short is not attached to $LoopSamplesTopic"
    Assert ($sum -gt 0) 'no committed offsets yet - wait one checkpoint interval (~3-5 min) and re-run'
    Write-Host "        committed $sum records (advances every checkpoint, ~3-5 min)"
}

# ── 5. Flink producing (live metrics fast; features after ~2 min) ────────────
Step '5. Flink outputs: live loop metrics growing' {
    $l1 = Get-TopicEndOffsetSum 'traverse.cpa.live.loop.metrics'; Start-Sleep -Seconds 10
    $l2 = Get-TopicEndOffsetSum 'traverse.cpa.live.loop.metrics'
    Assert ($l2 -gt $l1) "live.loop.metrics not growing ($l1 -> $l2)"
    Write-Host "        traverse.cpa.live.loop.metrics +$($l2 - $l1) records (feeds UI live badges via edge-node)"
}
$short = Get-TopicEndOffsetSum 'traverse.cpa.clpm.feature.short.v1'
if ($short -gt 0) { Write-Host "  PASS  5b. short-feature windows emitted ($short records)" -ForegroundColor Green; $script:passed++ }
else { Warn '5b. no short-feature records yet' 'windows close after ~1-2 min of samples - re-run shortly' }

# ── 6. IoTDB history (RawLoopIotDbConsumer) ──────────────────────────────────
Step "6. IoTDB rows growing for root.site1.cpm.$TargetLoop" {
    $auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${IotDbUser}:${IotDbPassword}"))
    $q = @{ sql = "select count(pv) from root.site1.cpm.$TargetLoop" } | ConvertTo-Json
    function PvCount($r) { if ($r.values -and $r.values.Count -gt 0 -and $null -ne $r.values[0]) { return [long]$r.values[0][0] } return 0 }
    $c1 = PvCount (Invoke-RestMethod -Method Post -Uri "$IotDbRest/rest/v2/query" -Headers @{ Authorization = $auth } -ContentType 'application/json' -Body $q)
    Start-Sleep -Seconds 15
    $c2 = PvCount (Invoke-RestMethod -Method Post -Uri "$IotDbRest/rest/v2/query" -Headers @{ Authorization = $auth } -ContentType 'application/json' -Body $q)
    Assert ($c2 -gt $c1) "count(pv) not growing ($c1 -> $c2) - RawLoopIotDbConsumer (ams-api) healthy?"
    Write-Host "        $c2 pv rows (+$($c2 - $c1) in 15 s)"
}

# ── 7. Postgres: CPLM result path ────────────────────────────────────────────
# Gate verdicts need LONG-diagnostics windows + fusion: hours of soak, not minutes.
# Young soak => gate.results topic empty => nothing for the consumers to persist;
# that is healthy. FAIL only when gate results EXIST on Kafka but Postgres is empty.
Step '7. Postgres result path (consumers caught up; rows once verdicts exist)' {
    $gateRecords = Get-TopicEndOffsetSum 'traverse.cpa.clpm.gate.results.v1'
    $rows = @(cmd /c "docker exec ams-postgres psql -U ams_user -d traverse_cplm -t -A -F'|' -c `"SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname='cpm' AND relname NOT LIKE 'loop_%' AND relname NOT IN ('threshold_profile') AND n_live_tup > 0 ORDER BY n_live_tup DESC LIMIT 6`" 2>nul") | Where-Object { $_ }
    if ($gateRecords -gt 0) {
        Assert ($rows.Count -gt 0) "gate.results has $gateRecords records but no cpm result rows - cplm-api results consumers broken?"
        foreach ($r in $rows) { Write-Host "        $r" }
    } else {
        Write-Host "        no gate verdicts on Kafka yet (long windows + fusion need hours of soak) - consumers attached and idle, as expected"
        if ($rows.Count -gt 0) { foreach ($r in $rows) { Write-Host "        $r" } }
    }
}

# ── 8. UI historical: gateway /api/hist/trend ────────────────────────────────
Step '8. UI historical trend (/api/hist/trend, last 15 min)' {
    $start = [DateTimeOffset]::UtcNow.AddMinutes(-15).ToString('o')
    $end = [DateTimeOffset]::UtcNow.ToString('o')
    $uri = "$GatewayBase/api/hist/trend?series=root.site1.cpm.$TargetLoop&measurements=pv,sp,op&start=$([uri]::EscapeDataString($start))&end=$([uri]::EscapeDataString($end))&width=200"
    $trend = Invoke-RestMethod -Uri $uri -Headers $H -TimeoutSec 30
    $json = $trend | ConvertTo-Json -Depth 6 -Compress
    Assert ($json.Length -gt 50 -and $json -match '(pv|value|series|points|timestamps)') 'trend response empty'
    Write-Host "        trend payload $([math]::Round($json.Length/1kb,1)) KB - the same call the UI trend components make"
}

# ── 9. UI readiness (per-loop rollup the CPM pages show) ─────────────────────
Step "9. readiness for $TargetLoop (samples flowing)" {
    $r = Invoke-RestMethod -Uri "$GatewayBase/api/v1/cpm/loops/$TargetLoop/readiness" -Headers $H
    foreach ($id in @('registry_row', 'tag_pv', 'tag_sp', 'tag_op', 'tag_mode')) {
        $c = @($r.checks | Where-Object { $_.id -eq $id })[0]
        Assert ($null -ne $c -and $c.ok) "readiness check '$id' not ok"
    }
    $ev = @($r.checks | Where-Object { $_.id -eq 'evidence_short' })[0]
    if ($ev -and $ev.ok) { Write-Host '        evidence_short OK - KPI pages populating' }
    else { Write-Host '        evidence_short pending (needs ~2+ min of samples; verdicts need >=12 h)' }
}

Write-Host "`n=== Result: $script:passed passed, $script:failed failed, $script:warned warning(s) ===" -ForegroundColor $(if ($script:failed -eq 0) { 'Green' } else { 'Red' })
Write-Host @'

UI spots to check by eye:
  live       : CPM -> Loops list (live badges) and any HMI display bound to a loop signal
  historical : CPM -> loop detail trend, or Designer TrendCore on root.site1.cpm.<loop>
  parking    : Administration -> Data Sources (last data received), /api/ingestion/unknown-sources
'@
exit $(if ($script:failed -eq 0) { 0 } else { 1 })
