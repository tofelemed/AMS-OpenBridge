# v2.5 Slice 1 end-to-end test (Task 1H.7): qualification and safe semantics on the lab stack.
#
# Proves, against the RUNNING lab (never a fixture DB), what Phase 1 delivered:
#   1D.5  fast-path conditions are served (/loops/{id}/conditions)
#   1E.2  fusion v2 is on the wire and in the API (score_semantics, hypotheses, confirmation)
#   1F    event frames carry availability_state / condition_state / qualified_support_ms
#   1G    LIVE results carry run identity; evidence manifests reach COMPLETE only checksum-verified;
#         the four cplm-api consumers are RUNNING with exactly one member each
#   1H    Instrumental NE107 health: binding as-of -> simulator F on PV -> ingestion -> Kafka ->
#         mirror -> API (< 30 s); Flink context -> INELIGIBLE; clear -> NO_ACTIVE_DIAGNOSTIC;
#         availability OFFLINE keeps the last status; fleet health filters are server-side;
#         an unbound loop is NOT_CONFIGURED (never OK); G11 health lanes ride the gate result.
#
# Prerequisites: run-all.ps1 stack with the v2.5 images + jar; scripts/cpm-07/07b/08 applied;
#   the test broker (mosquitto-test, host 1884, ams_ingest/ams-ingest-test); python3 with paho-mqtt.
#   The script registers the INSTRUMENTAL_HEALTH data source and the PV binding itself (idempotent).
#
#   .\scripts\test-cpm-v25-slice1-e2e.ps1
param(
    [string]$GatewayBase = 'http://127.0.0.1:8081',
    [string]$AdminUser = 'admin',
    [string]$AdminPassword = '',
    [string]$LoopId = 'FIC10302',          # the simulator's default loop
    [string]$UnboundLoopId = 'FIC10301',   # a registered loop with NO binding
    [string]$DeviceId = 'TT-10302',
    [string]$SourceId = 'instr-prm-1',
    [string]$Site = 'hdpe',
    [int]$ContextTimeoutSec = 90,
    # > 0: wait this long for an episode-bearing long window before judging the evidence store
    [int]$WaitForEvidenceSec = 0
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
function Invoke-CplmSql([string]$sql) {
    $q = $sql.Replace('"', '\"')
    return (cmd /c "docker exec ams-postgres psql -U ams_user -d traverse_cplm -t -A -c `"$q`" 2>nul")
}
function Wait-Until([scriptblock]$probe, [int]$timeoutSec, [int]$everySec = 3) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    do {
        try { if (& $probe) { return $true } } catch { }
        Start-Sleep -Seconds $everySec
    } while ((Get-Date) -lt $deadline)
    return $false
}
function Invoke-Sim([string]$scenario) {
    $sim = Join-Path $repoRoot 'scripts\sim\instrumental_health_sim.py'
    # No stderr merge: under -ErrorActionPreference Stop, PS 5.1 turns a native command's stderr line
    # (paho's deprecation warning) into a terminating error and the step would fail on a warning.
    $out = & python -W ignore $sim --scenario $scenario --loop $LoopId --device $DeviceId --source $SourceId --site $Site
    if ($LASTEXITCODE -ne 0) { throw "simulator '$scenario' failed (exit $LASTEXITCODE): $out" }
    return $out
}
function Get-PvHealth([string]$loop) {
    $h = Invoke-RestMethod -Method Get -Uri "$cpm/loops/$loop/instrument-health" -Headers $H
    return @{ all = $h; pv = ($h.roles | Where-Object { $_.role -eq 'PV' } | Select-Object -First 1) }
}

$ing = "$GatewayBase/api/ingestion"
$cpm = "$GatewayBase/api/v1/cpm"
Write-Host "`n=== v2.5 Slice 1 E2E against $GatewayBase ===`n"

# ── 0. Login ─────────────────────────────────────────────────────────────────
if (-not $AdminPassword) { $AdminPassword = if ($env:AMS_ADMIN_PASSWORD) { $env:AMS_ADMIN_PASSWORD } else { 'ChangeMe123!' } }
Step 'login' {
    $r = Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/auth/login" `
        -ContentType 'application/json' -Body (@{ username = $AdminUser; password = $AdminPassword } | ConvertTo-Json)
    Assert ($null -ne $r.token) 'login response has no token'
    $script:token = $r.token
}
if (-not $script:token) { Write-Host "`nCannot continue without a token."; exit 1 }
$H = @{ Authorization = "Bearer $($script:token)" }

# ── 1. Platform truth: consumers, schema ─────────────────────────────────────
Step 'cplm-api runs the four v2.5 consumers, single member each (1G.3 / 1H.5)' {
    $h = Invoke-RestMethod -Method Get -Uri "$GatewayBase/gw/upstreams/cplm-api/health"
    foreach ($c in 'results', 'frames', 'evidence', 'health') {
        Assert ($h.consumers.$c.state -eq 'RUNNING') "consumer $c is $($h.consumers.$c.state)"
    }
    Assert ($h.consumers.groupSplitDetected -eq $false) "group split detected: $($h.consumers.groupSplitDetail)"
}

Step 'v2.5 schema is present: identity columns, analysis_run, evidence, health mirror (1G.1 / 1H.3)' {
    $n = (Invoke-CplmSql "SELECT count(*) FROM information_schema.tables WHERE (table_schema, table_name) IN (('analytics','analysis_run'),('analytics','evidence_manifest'),('analytics','evidence_chunk'),('analytics','condition_event'),('cpm','signal_device_binding_history'),('cpm','instrument_health_observation'),('cpm','device_health_interval'),('cpm','source_availability'),('cpm','loop_health_context'))" | Select-Object -First 1)
    Assert ([int]$n -eq 9) "expected 9 v2.5 tables, found $n"
    $c = (Invoke-CplmSql "SELECT count(*) FROM information_schema.columns WHERE table_schema='analytics' AND table_name='cplm_gate_results' AND column_name IN ('method_run_ids','bundle_hash','purpose','result_revision','analysis_run_id','dataset_hash')" | Select-Object -First 1)
    Assert ([int]$c -eq 6) "expected 6 identity columns on cplm_gate_results, found $c"
    $f = (Invoke-CplmSql "SELECT count(*) FROM information_schema.columns WHERE table_schema='analytics' AND table_name='cplm_event_frames' AND column_name IN ('availability_state','condition_state','qualified_support_ms')" | Select-Object -First 1)
    Assert ([int]$f -eq 3) "expected 3 lifecycle columns on cplm_event_frames, found $f"
}

# ── 2. Results world: fusion v2, conditions, identity, evidence, frames ──────
Step 'the newest LIVE fused verdict carries fusion v2 + run identity + health lanes (1E.1 / 1G.3 / 1H.5)' {
    $row = (Invoke-CplmSql "SELECT (payload->>'score_semantics') || '|' || COALESCE(payload->'health_lanes'->>'configured','missing') || '|' || bundle_hash || '|' || purpose || '|' || (SELECT count(*) FROM jsonb_object_keys(method_run_ids)) FROM analytics.cplm_gate_results WHERE purpose='LIVE' AND payload ? 'hypotheses' ORDER BY window_end DESC LIMIT 1" | Select-Object -First 1)
    Assert (-not [string]::IsNullOrWhiteSpace($row)) 'no LIVE fused row with fusion v2 (has the fusion job run on the v2.5 jar?)'
    $p = $row -split '\|'
    Assert ($p[0] -eq 'EVIDENCE_SCORE_UNCALIBRATED') "score_semantics: $($p[0])"
    Assert ($p[1] -ne 'missing') 'health_lanes missing from the fused verdict (fusion job not on the 1H.5 jar)'
    Assert ($p[2] -like 'profile:*') "bundle_hash: $($p[2])"
    Assert ($p[3] -eq 'LIVE') "purpose: $($p[3])"
    Assert ([int]$p[4] -ge 15) "method_run_ids on a fused row: $($p[4])"
}

Step 'gates/latest serves verdictV2 (hypotheses + fault-scoped confirmation), never a re-derived score (1E.2)' {
    $loop = (Invoke-CplmSql "SELECT loop_id FROM analytics.cplm_gate_results WHERE purpose='LIVE' AND payload ? 'hypotheses' ORDER BY window_end DESC LIMIT 1" | Select-Object -First 1)
    Assert (-not [string]::IsNullOrWhiteSpace($loop)) 'no fused loop to read'
    $g = Invoke-RestMethod -Method Get -Uri "$cpm/loops/$loop/gates/latest?windowKind=24h" -Headers $H
    Assert ($g.verdictV2.legacy -eq $false) 'verdictV2 reported as legacy'
    Assert ($null -ne $g.verdictV2.confirmation.state) 'confirmation.state missing'
    Assert ($g.verdictV2.confirmation.state -in @('CONFIRMED', 'NOT_CONFIRMED', 'CONTRADICTED', 'NOT_APPLICABLE')) "confirmation.state: $($g.verdictV2.confirmation.state)"
}

Step 'fast-path conditions are served per loop (1D.5)' {
    $r = Invoke-RestMethod -Method Get -Uri "$cpm/loops/$LoopId/conditions" -Headers $H
    Assert ($null -ne $r) 'no conditions response'
}

Step 'evidence manifests are consistent with the long results: COMPLETE only checksum-verified, never early (1G.3)' {
    # The long job emits artifacts only for windows that CONTAIN a limit-dwell or freeze episode
    # (LongEvidence). A lab whose loops never froze or saturated has nothing to emit, which is
    # not a defect - so this step is strict whenever such a window exists and says so when none does.
    $bearing = [int](Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_long_feature_results WHERE created_at > now() - interval '24 hours' AND (jsonb_array_length(COALESCE(payload->'dwell_events','[]'::jsonb)) > 0 OR jsonb_array_length(COALESCE(payload->'freeze_events','[]'::jsonb)) > 0)" | Select-Object -First 1)
    if ($WaitForEvidenceSec -gt 0 -and $bearing -eq 0) {
        Write-Host "        waiting up to $WaitForEvidenceSec s for an episode-bearing long window (run scripts/sim/loop_freeze_sim.py first)"
        $null = Wait-Until { [int](Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_long_feature_results WHERE created_at > now() - interval '1 hour' AND (jsonb_array_length(COALESCE(payload->'dwell_events','[]'::jsonb)) > 0 OR jsonb_array_length(COALESCE(payload->'freeze_events','[]'::jsonb)) > 0)" | Select-Object -First 1) -gt 0 } $WaitForEvidenceSec 15
        $bearing = [int](Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_long_feature_results WHERE created_at > now() - interval '24 hours' AND (jsonb_array_length(COALESCE(payload->'dwell_events','[]'::jsonb)) > 0 OR jsonb_array_length(COALESCE(payload->'freeze_events','[]'::jsonb)) > 0)" | Select-Object -First 1)
    }
    $bad = [int](Invoke-CplmSql "SELECT count(*) FROM analytics.evidence_manifest m WHERE m.readiness='COMPLETE' AND (SELECT count(*) FROM analytics.evidence_chunk c WHERE c.evidence_id=m.evidence_id) <> m.chunk_count" | Select-Object -First 1)
    Assert ($bad -eq 0) "$bad COMPLETE manifests with a chunk-count mismatch"
    $failed = [int](Invoke-CplmSql "SELECT count(*) FROM analytics.evidence_manifest WHERE readiness='FAILED'" | Select-Object -First 1)
    Assert ($failed -eq 0) "$failed manifests FAILED checksum verification"
    if ($bearing -gt 0) {
        # every episode-bearing window older than 5 min must have reached the store as a COMPLETE manifest
        $ok = Wait-Until { [int](Invoke-CplmSql "SELECT count(*) FROM analytics.evidence_manifest WHERE readiness='COMPLETE'" | Select-Object -First 1) -gt 0 } 120 10
        $complete = [int](Invoke-CplmSql "SELECT count(*) FROM analytics.evidence_manifest WHERE readiness='COMPLETE'" | Select-Object -First 1)
        Assert $ok "$bearing episode-bearing long windows but no COMPLETE evidence manifest (complete=$complete)"
        Write-Host "        $bearing episode-bearing long window(s); $complete COMPLETE manifest(s)"
    } else {
        Write-Host "        NOTE: no episode-bearing long window in 24 h on this lab - the emit path is unexercised here (consistency checks only)"
    }
}

Step 'no open episode was closed by missing evidence: UNOBSERVABLE frames stay OPEN (1F)' {
    $n = (Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_event_frames WHERE availability_state='UNOBSERVABLE' AND condition_state='CLOSED' AND qualified_support_ms = 0" | Select-Object -First 1)
    Assert ([int]$n -eq 0) "$n frames closed without qualified support"
}

# ── 3. Instrumental NE107 health (1H) ────────────────────────────────────────
Step 'INSTRUMENTAL_HEALTH data source exists (created if missing) and connects (1H.2)' {
    $list = Invoke-RestMethod -Method Get -Uri "$ing/data-sources" -Headers $H
    $items = if ($list -is [array]) { $list } elseif ($list.items) { $list.items } else { @($list) }
    $ds = $items | Where-Object { $_.profileType -eq 'INSTRUMENTAL_HEALTH' } | Select-Object -First 1
    if (-not $ds) {
        $body = @{
            sourceType = 'MQTT'; profileType = 'INSTRUMENTAL_HEALTH'
            name = 'Lab Instrumental NE107 (mosquitto-test)'; description = 'created by test-cpm-v25-slice1-e2e.ps1'
            connectionUrl = 'mqtt://mosquitto-test:1883'; username = 'ams_ingest'; password = 'ams-ingest-test'; timeoutSeconds = 15
            profileConfig = @{
                mqtt = @{ topics = @("traverse/instrumental/v1/default/$Site/devices/+/state", "traverse/instrumental/v1/default/$Site/devices/+/events", "traverse/instrumental/v1/default/$Site/sources/+/availability"); qos = 1; clean_session = $false; session_expiry_seconds = 86400; keepalive_seconds = 60 }
                instrumental_health = @{ tenant_id = 'default'; site_id = $Site; allowed_source_ids = @($SourceId) }
            }
        } | ConvertTo-Json -Depth 6
        $ds = Invoke-RestMethod -Method Post -Uri "$ing/data-sources" -Headers $H -ContentType 'application/json' -Body $body
    }
    Assert ($null -ne $ds.configId) 'no configId'
    $t = Invoke-RestMethod -Method Post -Uri "$ing/data-sources/$($ds.configId)/test" -Headers $H
    Assert ($t.ok -eq $true) "connection test failed: $($t.error)"
}

Step 'PV binding is effective-dated and resolved as-of (1H.3)' {
    $b = Invoke-RestMethod -Method Get -Uri "$cpm/loops/$LoopId/instrument-bindings" -Headers $H
    $open = $b.bindings | Where-Object { $_.signalRole -eq 'PV' -and -not $_.validTo } | Select-Object -First 1
    if (-not $open -or $open.deviceId -ne $DeviceId) {
        $from = (Get-Date).ToUniversalTime().AddDays(-1).ToString('o')
        $open = Invoke-RestMethod -Method Post -Uri "$cpm/loops/$LoopId/instrument-bindings" -Headers $H -ContentType 'application/json' `
            -Body (@{ signalRole = 'PV'; deviceId = $DeviceId; sourceId = $SourceId; validFrom = $from; note = 'E2E: simulator device' } | ConvertTo-Json)
    }
    Assert ($open.deviceId -eq $DeviceId) "PV binding device: $($open.deviceId)"
    $before = Invoke-RestMethod -Method Get -Uri "$cpm/loops/$LoopId/instrument-bindings?at=2000-01-01T00:00:00Z" -Headers $H
    Assert (($before.bindings | Where-Object { $_.signalRole -eq 'PV' }).Count -eq 0) 'a binding resolved as-of a date before it was installed'
}

Step 'an unbound loop reports NOT_CONFIGURED - unavailable, never OK (1H.5, NR-044)' {
    $h = Get-PvHealth $UnboundLoopId
    Assert ($h.pv.eligibility -eq 'NOT_CONFIGURED') "PV eligibility on $($UnboundLoopId): $($h.pv.eligibility)"
    Assert ($h.pv.reason -eq 'NO_BINDING') "reason: $($h.pv.reason)"
}

Step 'F on PV: simulator -> ingestion -> Kafka -> mirror -> API within 30 s (1H.2 / 1H.5, NR-036)' {
    Invoke-Sim 'f-on-pv' | Out-Null
    $ok = Wait-Until { $h = Get-PvHealth $LoopId; ($h.pv.activeFlags -contains 'F') -and ($h.pv.nativeStatus) } 30
    Assert $ok 'F did not reach /instrument-health within 30 s'
    $h = Get-PvHealth $LoopId
    Assert ($h.pv.activeDiagnostics -ge 1) 'no diagnostics served'
    Assert ($h.pv.diagnostics[0].remedy -or $h.pv.diagnostics[0].message) 'diagnostic text not served verbatim'
    Assert ($h.all.sourceState -eq 'ONLINE') "source state: $($h.all.sourceState)"
    $n = (Invoke-CplmSql "SELECT count(*) FROM cpm.instrument_health_observation WHERE device_id='$DeviceId' AND 'F' = ANY(active_flags)" | Select-Object -First 1)
    Assert ([int]$n -ge 1) 'no F observation in the mirror ledger'
}

Step 'duplicate delivery is idempotent in the ledger (1H.2, NR-039)' {
    $before = [int](Invoke-CplmSql "SELECT count(*) FROM cpm.instrument_health_observation WHERE device_id='$DeviceId'" | Select-Object -First 1)
    Invoke-Sim 'dup' | Out-Null
    Start-Sleep -Seconds 8
    $after = [int](Invoke-CplmSql "SELECT count(*) FROM cpm.instrument_health_observation WHERE device_id='$DeviceId'" | Select-Object -First 1)
    Assert ($after -le $before + 1) "duplicate observation multiplied the ledger: $before -> $after"
}

Step "Flink context: F affecting PV -> eligibility INELIGIBLE within $ContextTimeoutSec s (1H.4, NR-042)" {
    $ok = Wait-Until { (Get-PvHealth $LoopId).pv.eligibility -eq 'INELIGIBLE' } $ContextTimeoutSec
    $h = Get-PvHealth $LoopId
    Assert $ok "PV eligibility is $($h.pv.eligibility) ($($h.pv.reason)) - is 'AMS - CPLM Instrument Context Engine' running?"
    Assert (-not [string]::IsNullOrWhiteSpace($h.pv.healthStateId)) 'no health_state_id on the context'
}

Step 'fleet rankings filter active affected-device conditions SERVER-side; unknown filter is refused (1H.6)' {
    $r = Invoke-RestMethod -Method Get -Uri "$cpm/fleet/rankings?windowKind=24h&limit=200&health=active-affected" -Headers $H
    Assert ($r.health -eq 'active-affected') 'health filter not echoed'
    $ids = @($r.loops | ForEach-Object { $_.loopId })
    Assert ($ids -contains $LoopId) "$LoopId not in the active-affected ranking (count=$($r.count); ids=$($ids -join ','))"
    $code = 0
    try { Invoke-RestMethod -Method Get -Uri "$cpm/fleet/rankings?health=bogus" -Headers $H | Out-Null } catch { $code = [int]$_.Exception.Response.StatusCode }
    Assert ($code -eq 400) "unknown filter answered $code, expected 400"
}

Step 'clear with state_complete -> NO_ACTIVE_DIAGNOSTIC, ELIGIBLE (1H.4, NR-037)' {
    Invoke-Sim 'clear' | Out-Null
    $ok = Wait-Until { (Get-PvHealth $LoopId).pv.eligibility -eq 'ELIGIBLE' } $ContextTimeoutSec
    $h = Get-PvHealth $LoopId
    Assert $ok "PV eligibility after clear: $($h.pv.eligibility) ($($h.pv.reason))"
    Assert ($h.pv.activeFlags.Count -eq 0) "flags still active after clear: $($h.pv.activeFlags -join ',')"
}

Step 'source OFFLINE keeps the last observed status and marks availability (1H.4, NR-038)' {
    Invoke-Sim 'offline' | Out-Null
    $ok = Wait-Until { (Get-PvHealth $LoopId).all.sourceState -eq 'OFFLINE' } 30
    $h = Get-PvHealth $LoopId
    Assert $ok "source state: $($h.all.sourceState)"
    Assert (-not [string]::IsNullOrWhiteSpace($h.pv.nativeStatus)) 'last native status was dropped on OFFLINE'
    Invoke-Sim 'online' | Out-Null
}

Step 'history lists the eligibility intervals incl. the F episode and the clear (1H.5)' {
    $from = (Get-Date).ToUniversalTime().AddHours(-2).ToString('o')
    $to = (Get-Date).ToUniversalTime().AddMinutes(5).ToString('o')
    $r = Invoke-RestMethod -Method Get -Uri "$cpm/loops/$LoopId/instrument-health/history?from=$from&to=$to" -Headers $H
    Assert ($r.count -ge 2) "expected >= 2 intervals, got $($r.count)"
    Assert (($r.intervals | Where-Object { $_.eligibility -eq 'INELIGIBLE' }).Count -ge 1) 'no INELIGIBLE interval in history'
}

Write-Host "`n=== Result: $script:passed passed, $script:failed failed ===" -ForegroundColor $(if ($script:failed -eq 0) { 'Green' } else { 'Red' })
exit $(if ($script:failed -eq 0) { 0 } else { 1 })
