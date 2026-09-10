# End-to-end test for the OT MQTT loop ingestion pipeline (ingestion-service phase 2).
#
# Proves the full path with the real gateway hierarchy:
#   sim_ot_gateway_mqtt.py -> mosquitto-test (OT broker stand-in)
#     -> ingestion-service subscriber (parse/validate/resolve/enrich/join)
#       -> Kafka traverse.cpa.loop.samples.v1 (tuples keyed by loop_id)
#       -> Kafka traverse.ingestion.ot-dlq + unknown_sources (FIC99999 parking)
#       -> IoTDB root.site1.cpm.<loop> (via ams-api RawLoopIotDbConsumer)
#   plus: register-a-loop-mid-run -> flows without redeploy (registry refresh).
#   plus (CHG-010): valve positioner feedback (VP) rides the tuple by DEFAULT for
#   the loop that publishes it, is absent (not zero) for the loop that doesn't,
#   lands in IoTDB, clears NO_VP in the registry - and a PARTIAL param_roles
#   overlay keeps pv/sp/op/mode flowing (the config trap that used to black out
#   every loop), while un-mapping a required role is refused with 400.
#
# Prerequisites:
#   - docker stack up (run-all.ps1), ingestion-service image REBUILT with phase 2:
#       docker compose -f infra/docker/docker-compose.yml build traverse-ingestion-service
#       docker compose -f infra/docker/docker-compose.yml up -d traverse-ingestion-service
#   - loops NOT yet required: this script registers the pilot fixture itself
#     (scripts/fixtures/hdpe-pilot-loops.csv) via import-cpm-loops.ps1.
#
#   .\scripts\test-ot-loop-ingestion-e2e.ps1
#   .\scripts\test-ot-loop-ingestion-e2e.ps1 -KeepConfig -SkipCleanup
param(
    # 127.0.0.1, not localhost: localhost resolves to ::1 first and PS 5.1's
    # Invoke-RestMethod blocks on the IPv6 attempt until TimeoutSec expires, so the
    # FIRST call of a run always failed (later ones reuse the fallen-back stack).
    [string]$GatewayBase = 'http://127.0.0.1:8081',
    [string]$AdminUser = 'admin',
    [string]$AdminPassword = '',
    [string]$IotDbRest = 'http://127.0.0.1:8181',
    [string]$IotDbUser = 'root',
    [string]$IotDbPassword = 'root',
    # Must match the service's Kafka__LoopSamplesTopic (INGESTION_LOOP_SAMPLES_TOPIC
    # in .env; legacy-generation labs use loop.samples.v1).
    [string]$LoopSamplesTopic = 'traverse.cpa.loop.samples.v1',
    [switch]$KeepConfig,      # leave the data source active after the test (soak mode)
    [switch]$SkipCleanup      # leave sim/config/loops in place
)

$ErrorActionPreference = 'Stop'
$script:failed = 0
$script:passed = 0
$repoRoot = Split-Path -Parent $PSScriptRoot

function Step([string]$name, [scriptblock]$body) {
    try {
        & $body
        $script:passed++
        Write-Host "  PASS  $name" -ForegroundColor Green
    } catch {
        $script:failed++
        Write-Host "  FAIL  $name" -ForegroundColor Red
        Write-Host "        $($_.Exception.Message)" -ForegroundColor Red
    }
}
function Assert([bool]$condition, [string]$message) {
    if (-not $condition) { throw $message }
}

# ── Admin password: parameter > .env > known lab default ─────────────────────
if (-not $AdminPassword) {
    $envFile = Join-Path $repoRoot 'infra\docker\.env'
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^AUTH_BOOTSTRAP_PASSWORD=' } | Select-Object -First 1
        if ($line) { $AdminPassword = $line.Split('=', 2)[1] }
    }
    if (-not $AdminPassword) { $AdminPassword = 'ChangeMe123!' }
}

$ing = "$GatewayBase/api/ingestion"
$cpm = "$GatewayBase/api/v1/cpm"
Write-Host "`n=== OT MQTT loop ingestion E2E ===" -ForegroundColor Cyan
Write-Host "gateway: $GatewayBase`n"

# ── 0. Preconditions ─────────────────────────────────────────────────────────
Step 'gateway + ingestion-service healthy, phase-2 build deployed' {
    $h = Invoke-RestMethod -Method Get -Uri "$GatewayBase/gw/upstreams/ingestion-service/health" -TimeoutSec 15
    $body = $h | ConvertTo-Json -Depth 6
    Assert ($body -notmatch 'NotBuilt') 'ingestion-service still runs the phase-1 image (subscriber NotBuilt) - rebuild: docker compose build traverse-ingestion-service && up -d traverse-ingestion-service'
}

Step 'mosquitto-test broker up' {
    cmd /c "docker compose --profile mqtt-test -f `"$repoRoot\infra\docker\docker-compose.yml`" up -d mosquitto-test >nul 2>&1"
    $deadline = (Get-Date).AddSeconds(60)
    do {
        Start-Sleep -Seconds 2
        $state = (cmd /c "docker inspect -f {{.State.Health.Status}} ams-mosquitto-test 2>nul")
    } while ($state -ne 'healthy' -and (Get-Date) -lt $deadline)
    Assert ($state -eq 'healthy') "mosquitto-test not healthy: $state"
}

Step 'DLQ topic exists (create if missing)' {
    cmd /c "docker exec ams-kafka kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic traverse.ingestion.ot-dlq --partitions 2 --replication-factor 1 --config retention.ms=604800000 >nul 2>&1"
    $topics = @(cmd /c "docker exec ams-kafka kafka-topics --bootstrap-server localhost:9092 --list 2>nul")
    Assert (@($topics | Where-Object { $_ -eq 'traverse.ingestion.ot-dlq' }).Count -ge 1) 'traverse.ingestion.ot-dlq missing'
    Assert (@($topics | Where-Object { $_ -eq $LoopSamplesTopic }).Count -ge 1) "loop-samples topic '$LoopSamplesTopic' does not exist on this broker - pass -LoopSamplesTopic to match the lab's generation"
}

Step 'HDPE plant hierarchy seeded (script 48, idempotent)' {
    cmd /c "docker cp `"$repoRoot\database\scripts\48_hdpe_plant_hierarchy.sql`" ams-postgres:/tmp/48_hdpe.sql >nul 2>&1"
    cmd /c "docker exec ams-postgres psql -U ams_user -d postgres -q -f /tmp/48_hdpe.sql >nul 2>&1"
    $count = (cmd /c "docker exec ams-postgres psql -U ams_user -d traverse_assets -t -A -c `"SELECT COUNT(*) FROM assets.assets WHERE contextual_path LIKE 'hdpe%' AND NOT is_deleted`" 2>nul")
    Assert ([int]$count -ge 30) "HDPE tree incomplete: $count rows"
}

# ── 1. Login ─────────────────────────────────────────────────────────────────
$token = $null
Step 'login as Admin' {
    $r = Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/auth/login" `
        -ContentType 'application/json' -Body (@{ username = $AdminUser; password = $AdminPassword } | ConvertTo-Json)
    Assert ($null -ne $r.token) 'login response has no token'
    $script:token = $r.token
}
if (-not $script:token) { Write-Host "`nCannot continue without a token."; exit 1 }
$H = @{ Authorization = "Bearer $($script:token)" }

# ── 2. Register pilot loops (all EXCEPT TIC10101 — registered late in step 8) ─
$fixture = Join-Path $repoRoot 'scripts\fixtures\hdpe-pilot-loops.csv'
$earlyCsv = Join-Path $env:TEMP 'hdpe-pilot-loops-early.csv'
Step 'register 3 pilot loops via import-cpm-loops.ps1' {
    Import-Csv $fixture | Where-Object { $_.loop_id -ne 'TIC10101' } |
        Export-Csv -Path $earlyCsv -NoTypeInformation -Encoding ASCII
    & (Join-Path $PSScriptRoot 'import-cpm-loops.ps1') -CsvPath $earlyCsv `
        -GatewayUrl $GatewayBase -Username $AdminUser -Password $AdminPassword | Out-Null
    $loops = Invoke-RestMethod -Method Get -Uri "$cpm/loops" -Headers $H
    foreach ($id in @('FIC10302', 'FIC10405', 'PIC10201')) {
        Assert (@($loops.loops | Where-Object { $_.loopId -eq $id }).Count -eq 1) "loop $id not registered"
    }
}

# ── 3. Create + activate the OT data source ──────────────────────────────────
# One profile for the create AND the later overlay PUT: a PUT replaces
# profile_config wholesale, so the overlay test must resend mqtt + the mode map,
# not just param_roles.
function New-LoopProfileConfig([hashtable]$paramRoles = $null) {
    # SME-confirmed CENTUM enum (2026-09-09), runbook 10 section 2. The old
    # test map { '4' = 'AUT' } matched the wrong production config, so this
    # test passed green while every controlling loop was excluded at G1.
    $li = @{ grid_seconds = 5; registry_refresh_seconds = 30
             mode_value_map = @{ '1' = 'AUT'; '2' = 'MAN'; '3' = 'CAS'; '4' = 'IMAN' } }
    if ($null -ne $paramRoles) { $li.param_roles = $paramRoles }
    return @{
        mqtt = @{ topics = @('OT/+/+/+/+/PIDParams/+'); qos = 1; clean_session = $false; session_expiry_seconds = 86400; keepalive_seconds = 60 }
        loop_ingest = $li
    }
}

$configId = $null
Step 'create MQTT_LOOP_SAMPLES data source (NO param_roles: the built-in map must carry VP)' {
    $body = @{
        sourceType = 'MQTT'; profileType = 'MQTT_LOOP_SAMPLES'
        name = 'E2E OT Gateway (mosquitto-test)'
        description = 'created by test-ot-loop-ingestion-e2e.ps1'
        connectionUrl = 'mqtt://mosquitto-test:1883'   # in-network: the subscriber runs inside compose
        username = 'ams_ingest'; password = 'ams-ingest-test'
        timeoutSeconds = 15
        profileConfig = (New-LoopProfileConfig)
    } | ConvertTo-Json -Depth 8
    $r = Invoke-RestMethod -Method Post -Uri "$ing/data-sources" -Headers $H -ContentType 'application/json' -Body $body
    Assert ($null -ne $r.configId) 'no configId returned'
    Assert ($r.isActive -eq $true) 'config should be active on create'
    $script:configId = $r.configId
}
if (-not $script:configId) { Write-Host "`nCannot continue without a config."; exit 1 }

Step 'connection test SUCCESS' {
    $r = Invoke-RestMethod -Method Post -Uri "$ing/data-sources/$($script:configId)/test" -Headers $H
    Assert ($r.ok -eq $true) "connection test failed: $($r.error)"
}

# ── 4. Start the OT gateway simulator ────────────────────────────────────────
$simProcess = $null
Step 'start sim_ot_gateway_mqtt.py' {
    $sim = Join-Path $repoRoot 'ams-sims\sim_ot_gateway_mqtt.py'
    # --vp-loops defaults to FIC10302: positioner feedback for that loop only, so the
    # same run proves "vp present" (FIC10302) and "vp absent, not zero" (FIC10405).
    $script:simProcess = Start-Process -FilePath 'python' -ArgumentList "`"$sim`"", '--minutes', '16' `
        -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 3
    Assert (-not $script:simProcess.HasExited) 'simulator exited immediately (paho-mqtt installed? broker reachable on :1884?)'
}

# ── 5. Tuples on Kafka (subscriber start ≤30 s + first grid ticks) ───────────
function Read-LoopSamples([int]$timeoutMs = 15000, [int]$maxMessages = 40) {
    return (cmd /c "docker exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic $LoopSamplesTopic --property print.key=true --timeout-ms $timeoutMs --max-messages $maxMessages 2>nul")
}
Step "enriched tuples for FIC10302 on $LoopSamplesTopic" {
    $found = $null
    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline -and -not $found) {
        $lines = @(Read-LoopSamples)
        $found = $lines | Where-Object { $_ -match '^FIC10302\s' } | Select-Object -First 1
    }
    Assert ($null -ne $found) 'no tuple keyed FIC10302 within 120 s'
    $json = ($found -split "`t", 2)[1] | ConvertFrom-Json
    Assert ($json.loop_id -eq 'FIC10302') 'loop_id mismatch'
    Assert ($null -ne $json.pv -and $null -ne $json.sp -and $null -ne $json.op) 'pv/sp/op missing'
    # The sim publishes MODE=1 by default, which the SME map translates to AUT -
    # the only mode the engine analyses. A raw '1' here means the map did not apply.
    Assert ($json.mode -eq 'AUT') "mode not translated: $($json.mode)"
    Assert ($json.quality -eq 'GOOD') "quality: $($json.quality)"
    Assert ($json.loop_type -eq 'FIC') "loop_type: $($json.loop_type)"
    Assert ($json.site -eq 'hdpe') "site enrichment: $($json.site)"
    Assert ($json.area -eq 'section_100') "area enrichment: $($json.area)"
    Assert ($json.source_fcs -eq 'FCS0101') "source_fcs: $($json.source_fcs)"
}

Step 'tuning extensions (p/i/d/gw) ride the tuple once published' {
    # The sim republishes tuning only every 30 s; a subscriber that connected just
    # after a burst sees them on the NEXT burst - so wait for a tuple carrying p.
    $withTuning = $null
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline -and -not $withTuning) {
        foreach ($line in @(Read-LoopSamples)) {
            if ($line -notmatch '^FIC10302\s') { continue }
            $j = ($line -split "`t", 2)[1] | ConvertFrom-Json
            if ($null -ne $j.p) { $withTuning = $j; break }
        }
    }
    Assert ($null -ne $withTuning) 'no FIC10302 tuple carried tuning extension p within 90 s'
    Assert ($null -ne $withTuning.i -and $null -ne $withTuning.d -and $null -ne $withTuning.gw) 'i/d/gw extensions missing'
}

# ── 5b. Valve positioner (CHG-010): VP flows by default, and only where published ─
function Read-TupleFor([string]$loopId, [int]$timeoutSec = 60, [scriptblock]$where = { $true }) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        foreach ($line in @(Read-LoopSamples)) {
            if ($line -notmatch "^$loopId\s") { continue }
            $j = ($line -split "`t", 2)[1] | ConvertFrom-Json
            if (& $where $j) { return $j }
        }
    }
    return $null
}

Step 'VP rides the FIC10302 tuple with NO param_roles configured (built-in map carries VP)' {
    $t = Read-TupleFor 'FIC10302' 60 { param($j) $null -ne $j.vp }
    Assert ($null -ne $t) 'no FIC10302 tuple carried vp within 60 s - is VP in LoopIngestConfig.DefaultParamRoles?'
    $vp = 0.0
    Assert ([double]::TryParse("$($t.vp)", [ref]$vp)) "vp is not numeric: $($t.vp)"
    Assert ($vp -ge 0 -and $vp -le 100) "vp out of range: $vp"
    # The sim publishes positioner feedback that TRACKS the output with a small offset -
    # G14 compares the two, so a copy of OP would be the wrong thing to have proven.
    Assert ([math]::Abs($vp - [double]$t.op) -lt 3.0) "vp $vp does not track op $($t.op)"
    Assert ($t.quality -eq 'GOOD') "quality: $($t.quality)"
}

Step 'FIC10405 (no positioner) tuple carries NO vp key - optional means absent, never 0' {
    $t = Read-TupleFor 'FIC10405' 60
    Assert ($null -ne $t) 'no FIC10405 tuple within 60 s'
    Assert (-not ($t.PSObject.Properties.Name -contains 'vp')) "FIC10405 tuple carries vp=$($t.vp) but the sim never publishes VP for it"
    Assert ($null -ne $t.pv -and $null -ne $t.sp -and $null -ne $t.op) 'pv/sp/op missing'
}

Step 'VP is NOT parked as UNKNOWN_PARAMETER' {
    $all = Invoke-RestMethod -Method Get -Uri "$ing/unknown-sources?configId=$($script:configId)" -Headers $H
    $parked = @($all | Where-Object { $_.reason -eq 'UNKNOWN_PARAMETER' -and $_.sourceKey -match '\|VP$' })
    Assert ($parked.Count -eq 0) "VP parked as UNKNOWN_PARAMETER: $($parked | ConvertTo-Json -Compress)"
}

# ── 6. Unknown loop parks (FIC99999 + not-yet-registered TIC10101) ───────────
Step 'FIC99999 parked in unknown-sources + on the DLQ' {
    $rows = $null
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        $all = Invoke-RestMethod -Method Get -Uri "$ing/unknown-sources?configId=$($script:configId)" -Headers $H
        $rows = @($all | Where-Object { $_.reason -eq 'LOOP_NOT_REGISTERED' -and $_.sourceKey -match 'FIC99999' })
        if ($rows.Count -ge 1 -and $rows[0].messageCount -ge 4) { break }
        Start-Sleep -Seconds 5
    }
    Assert ($rows.Count -ge 1) 'no LOOP_NOT_REGISTERED row for FIC99999'
    Assert ($rows[0].messageCount -ge 4) "parking count not growing: $($rows[0].messageCount)"
    $dlq = (cmd /c "docker exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic traverse.ingestion.ot-dlq --from-beginning --timeout-ms 15000 --max-messages 5 2>nul")
    Assert (@($dlq | Where-Object { $_ -match 'LOOP_NOT_REGISTERED' }).Count -ge 1) 'no LOOP_NOT_REGISTERED record on the DLQ topic'
}

# ── 7. Ops surfaces ──────────────────────────────────────────────────────────
Step '/stats shows connected subscriber with tuples' {
    $stats = Invoke-RestMethod -Method Get -Uri "$ing/stats" -Headers $H
    $row = @($stats | Where-Object { $_.configId -eq $script:configId })[0]
    Assert ($null -ne $row) 'no stats row for the config'
    Assert ($row.connected -eq $true) "subscriber not connected: $($row.connectionError)"
    Assert ($row.tuplesEmitted -gt 0) 'no tuples counted'
    Assert ($row.registryLoops -ge 3) "registry cache has $($row.registryLoops) loops"
    # CHG-010: the EFFECTIVE parameter map is one GET away, so "is VP mapped?" is
    # never a log dive. Built-ins + overlay; here there is no overlay yet.
    Assert ($null -ne $row.paramRoles) '/stats row has no paramRoles'
    Assert ($row.paramRoles.VP -eq 'vp') "paramRoles.VP = '$($row.paramRoles.VP)', expected 'vp'"
    Assert ($row.paramRoles.PV -eq 'pv' -and $row.paramRoles.SV -eq 'sp' -and $row.paramRoles.MV -eq 'op') 'built-in entries missing from paramRoles'
}

Step 'last_data_received populated (30 s throttle)' {
    $row = $null
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
        $row = Invoke-RestMethod -Method Get -Uri "$ing/data-sources/$($script:configId)" -Headers $H
        if ($row.lastDataReceived) { break }
        Start-Sleep -Seconds 10
    }
    Assert ($null -ne $row.lastDataReceived) 'lastDataReceived still empty'
}

# ── 8. New loop flows WITHOUT redeploy (the registry-refresh guarantee) ──────
Step 'register TIC10101 mid-run -> tuples within 2x refresh interval' {
    $lateCsv = Join-Path $env:TEMP 'hdpe-pilot-loops-late.csv'
    Import-Csv $fixture | Where-Object { $_.loop_id -eq 'TIC10101' } |
        Export-Csv -Path $lateCsv -NoTypeInformation -Encoding ASCII
    & (Join-Path $PSScriptRoot 'import-cpm-loops.ps1') -CsvPath $lateCsv `
        -GatewayUrl $GatewayBase -Username $AdminUser -Password $AdminPassword | Out-Null

    $found = $null
    $deadline = (Get-Date).AddSeconds(150)   # refresh 30 s + joiner warmup + margin
    while ((Get-Date) -lt $deadline -and -not $found) {
        $lines = @(Read-LoopSamples)
        $found = $lines | Where-Object { $_ -match '^TIC10101\s' } | Select-Object -First 1
    }
    Assert ($null -ne $found) 'TIC10101 tuples did not appear after registration (registry refresh broken?)'
}

# ── 9. Historian: RawLoopIotDbConsumer lands the same tuples in IoTDB ────────
Step 'IoTDB row count grows for root.site1.cpm.FIC10302' {
    $auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${IotDbUser}:${IotDbPassword}"))
    $q = @{ sql = 'select count(pv) from root.site1.cpm.FIC10302' } | ConvertTo-Json
    function Get-PvCount($resp) {
        # No device yet => IoTDB returns an error body / empty values: treat as 0 rows.
        if ($resp.values -and $resp.values.Count -gt 0 -and $null -ne $resp.values[0]) { return [long]$resp.values[0][0] }
        return 0
    }
    $r1 = Invoke-RestMethod -Method Post -Uri "$IotDbRest/rest/v2/query" -Headers @{ Authorization = $auth } -ContentType 'application/json' -Body $q
    $c1 = Get-PvCount $r1
    Start-Sleep -Seconds 30
    $r2 = Invoke-RestMethod -Method Post -Uri "$IotDbRest/rest/v2/query" -Headers @{ Authorization = $auth } -ContentType 'application/json' -Body $q
    $c2 = Get-PvCount $r2
    Assert ($c2 -gt $c1) "IoTDB count not growing ($c1 -> $c2) - is ams-api's RawLoopIotDbConsumer running?"
    # CHG-010: the positioner measurement lands beside pv/sp/op on the same device.
    $qv = @{ sql = 'select count(vp) from root.site1.cpm.FIC10302' } | ConvertTo-Json
    $rv = Invoke-RestMethod -Method Post -Uri "$IotDbRest/rest/v2/query" -Headers @{ Authorization = $auth } -ContentType 'application/json' -Body $qv
    $cv = Get-PvCount $rv
    Assert ($cv -gt 0) "IoTDB has no vp rows for FIC10302 (count(vp)=$cv) - RawLoopIotDbConsumer dropped the optional member?"
}

# ── 10. Readiness: registry + tag checks green for the pilot loop ────────────
Step 'readiness has no registry/tag blockers for FIC10302 (incl. tag_vp)' {
    $r = Invoke-RestMethod -Method Get -Uri "$cpm/loops/FIC10302/readiness" -Headers $H
    # tag_vp is the fixture's vp_ot_tag (CHG-010) - a warning-class check, but it
    # must be green here or the loop is capped at 0.89 confidence for no reason.
    foreach ($id in @('registry_row', 'tag_pv', 'tag_sp', 'tag_op', 'tag_mode', 'tag_vp')) {
        $check = @($r.checks | Where-Object { $_.id -eq $id })[0]
        Assert ($null -ne $check -and $check.ok -eq $true) "readiness check '$id' not ok"
    }
}

Step 'registry: FIC10302 mapped VP clears NO_VP; FIC10405 without one still flags it' {
    $a = Invoke-RestMethod -Method Get -Uri "$cpm/loops/FIC10302" -Headers $H
    Assert ($null -ne $a.tags.VP) 'FIC10302 tags carry no VP path'
    Assert (@($a.observabilityFlags) -notcontains 'NO_VP') "FIC10302 still flagged NO_VP: $($a.observabilityFlags -join ',')"
    $b = Invoke-RestMethod -Method Get -Uri "$cpm/loops/FIC10405" -Headers $H
    Assert (@($b.observabilityFlags) -contains 'NO_VP') "FIC10405 has no positioner but is not flagged NO_VP: $($b.observabilityFlags -join ',')"
}

# ── 11. The param_roles trap (CHG-010): overlay, not replace ─────────────────
Step 'PARTIAL param_roles {POS:vp} keeps pv/sp/op/mode AND vp flowing (overlay, not replace)' {
    # Before CHG-010 this exact save un-mapped PV/SP/OP/MODE and every loop on the
    # source produced 0 tuples (verified live 2026-09-10). Now it adds one leaf.
    $before = @((Invoke-RestMethod -Method Get -Uri "$ing/stats" -Headers $H) | Where-Object { $_.configId -eq $script:configId })[0].startedAt
    $body = @{ profileConfig = (New-LoopProfileConfig @{ POS = 'vp' }) } | ConvertTo-Json -Depth 8
    Invoke-RestMethod -Method Put -Uri "$ing/data-sources/$($script:configId)" -Headers $H -ContentType 'application/json' -Body $body | Out-Null

    # The fingerprint changed, so the host restarts the subscriber within its 30 s
    # watch cycle: a new startedAt on the stats row is the proof it picked up the edit.
    $row = $null
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
        $row = @((Invoke-RestMethod -Method Get -Uri "$ing/stats" -Headers $H) | Where-Object { $_.configId -eq $script:configId })[0]
        if ($row -and $row.startedAt -ne $before -and $row.paramRoles) { break }
        Start-Sleep -Seconds 5
    }
    Assert ($null -ne $row -and $row.startedAt -ne $before) 'subscriber did not restart on the config edit within 90 s'
    Assert ($row.paramRoles.POS -eq 'vp') "overlay entry missing: paramRoles.POS = '$($row.paramRoles.POS)'"
    Assert ($row.paramRoles.PV -eq 'pv' -and $row.paramRoles.SP -eq 'sp' -and $row.paramRoles.OP -eq 'op' -and $row.paramRoles.MODE -eq 'mode') 'built-in PV/SP/OP/MODE were REPLACED by the overlay'
    Assert ($row.paramRoles.VP -eq 'vp') 'built-in VP was replaced by the overlay'

    $t = Read-TupleFor 'FIC10302' 120 { param($j) $null -ne $j.vp }
    Assert ($null -ne $t) 'no FIC10302 tuple with vp after the overlay - the loop went dark'
    Assert ($t.mode -eq 'AUT') "mode after overlay: $($t.mode)"
    Assert ($t.quality -eq 'GOOD') "quality after overlay: $($t.quality)"
}

Step 'un-mapping the last source of a required role is refused with 400 (fleet cannot go dark)' {
    $body = @{ profileConfig = (New-LoopProfileConfig @{ PV = $null }) } | ConvertTo-Json -Depth 8
    $status = 0; $err = ''
    try {
        Invoke-RestMethod -Method Put -Uri "$ing/data-sources/$($script:configId)" -Headers $H -ContentType 'application/json' -Body $body | Out-Null
    } catch {
        $status = [int]$_.Exception.Response.StatusCode
        $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
        $err = $reader.ReadToEnd()
    }
    Assert ($status -eq 400) "expected 400, got $status"
    Assert ($err -match 'loop_ingest\.param_roles') "error does not name the field: $err"
    Assert ($err -match "'pv'") "error does not name the unreachable role: $err"
    # And the rejected save changed nothing: the subscriber is still on the overlay.
    $row = @((Invoke-RestMethod -Method Get -Uri "$ing/stats" -Headers $H) | Where-Object { $_.configId -eq $script:configId })[0]
    Assert ($row.paramRoles.PV -eq 'pv' -and $row.paramRoles.POS -eq 'vp') 'rejected save altered the running map'
}

# ── Cleanup ──────────────────────────────────────────────────────────────────
if (-not $SkipCleanup) {
    if ($simProcess -and -not $simProcess.HasExited) { Stop-Process -Id $simProcess.Id -Force -Confirm:$false }
    if ($script:configId -and -not $KeepConfig) {
        try {
            Invoke-RestMethod -Method Post -Uri "$ing/data-sources/$($script:configId)/deactivate" -Headers $H | Out-Null
            Invoke-RestMethod -Method Delete -Uri "$ing/data-sources/$($script:configId)" -Headers $H | Out-Null
            Write-Host "`ncleanup: data source removed (pilot loops kept for soak - bulk-delete via /cpm/registry if unwanted)"
        } catch { Write-Host "cleanup warning: $($_.Exception.Message)" }
    }
}

Write-Host "`n=== Result: $script:passed passed, $script:failed failed ===" -ForegroundColor $(if ($script:failed -eq 0) { 'Green' } else { 'Red' })
exit $(if ($script:failed -eq 0) { 0 } else { 1 })
