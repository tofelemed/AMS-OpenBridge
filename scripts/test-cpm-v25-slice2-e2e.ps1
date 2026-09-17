# v2.5 Slice 2 end-to-end test (Task 2G.2): G12 system response, the evidence workbench API,
# G13 aligned interaction, the loop model dimensions - proven against the RUNNING lab stack.
#
#   2A/2B  a COMPLETE response event with its 52 quantities; a second step CENSORS the first (NR-007)
#   2C     every gate's exact artifacts: G5 acf_series, G6 psd (ordinate_kind PSD), manifests COMPLETE
#          only checksum-verified; /method-runs/{id}/evidence with ETag / 304; chunk bytes match their sha
#   2D     gate catalogue (17 once, G12 + G13 installed); investigation pins evidence with an explicit outcome
#   2E     the heatmap / gates cells carry the immutable method_run_id the workbench opens (never "latest")
#   2F     G13 is the long tier's aligned analysis on the fused row (state + reason, never a link flag)
#   2G     registry dimensions: explicit model survives a preset re-activation; contract lists the enums;
#          bandwidth eligibility rides the results
#
# Prerequisites: run-all.ps1 stack with the v2.5 images + jar (2F/2G jar deployed), scripts 53..57 applied,
#   the OT test broker (mosquitto-test, host 1884) and an MQTT_LOOP_SAMPLES data source for the loop;
#   python3 with paho-mqtt. The response scenarios take ~8 min each; they run only when the lab has no
#   recent event of that kind (or always with -ForceSimulator).
#
#   .\scripts\test-cpm-v25-slice2-e2e.ps1
param(
    [string]$GatewayBase = 'http://127.0.0.1:8081',
    [string]$AdminUser = 'admin',
    [string]$AdminPassword = '',
    [string]$LoopId = 'FIC10302',
    [string]$Site = 'hdpe',
    [int]$RecentHours = 24,
    [switch]$ForceSimulator,
    [switch]$SkipSimulator,
    [int]$EventTimeoutSec = 240
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
function Assert([bool]$condition, [string]$message) { if (-not $condition) { throw $message } }
function Invoke-CplmSql([string]$sql) {
    $q = $sql.Replace('"', '\"')
    return (cmd /c "docker exec ams-postgres psql -U ams_user -d traverse_cplm -t -A -c `"$q`" 2>nul")
}
function Wait-Until([scriptblock]$probe, [int]$timeoutSec, [int]$everySec = 5) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    do {
        try { if (& $probe) { return $true } } catch { }
        Start-Sleep -Seconds $everySec
    } while ((Get-Date) -lt $deadline)
    return $false
}
function Invoke-StepSim([string]$scenario) {
    $sim = Join-Path $repoRoot 'scripts\sim\loop_step_sim.py'
    Write-Host "        running loop_step_sim $scenario on $LoopId (~8 min)..." -ForegroundColor DarkGray
    $out = & python -W ignore $sim --loop $LoopId --scenario $scenario
    if ($LASTEXITCODE -ne 0) { throw "simulator '$scenario' failed (exit $LASTEXITCODE): $out" }
}
function Sha256Hex([byte[]]$bytes) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '') } finally { $sha.Dispose() }
}

$cpm = "$GatewayBase/api/v1/cpm"
Write-Host "`n=== v2.5 Slice 2 E2E against $GatewayBase ===`n"

# ── 0. Login ─────────────────────────────────────────────────────────────────
if (-not $AdminPassword) { $AdminPassword = if ($env:AMS_ADMIN_PASSWORD) { $env:AMS_ADMIN_PASSWORD } else { 'ChangeMe123!' } }
Step 'login' {
    $r = Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/auth/login" -ContentType 'application/json' -Body (@{ username = $AdminUser; password = $AdminPassword } | ConvertTo-Json)
    Assert ($null -ne $r.token) 'login response has no token'
    $script:token = $r.token
}
if (-not $script:token) { Write-Host "`nCannot continue without a token."; exit 1 }
$H = @{ Authorization = "Bearer $($script:token)" }
$HJ = @{ Authorization = "Bearer $($script:token)"; 'Content-Type' = 'application/json' }

# ── 1. Build truth: catalogue, capabilities, schema ─────────────────────────
Step 'gate catalogue lists the 17 gates once; G12 and G13 are installed methods (2D.1 / 2F.1)' {
    $c = Invoke-RestMethod -Method Get -Uri "$cpm/gate-catalogue" -Headers $H
    $gates = @($c.gates | ForEach-Object { $_.gate })
    Assert ($gates.Count -eq 17) "expected 17 catalogue entries, got $($gates.Count)"
    Assert (($gates | Select-Object -Unique).Count -eq 17) 'a gate is listed twice'
    Assert ('G2r' -in $gates) 'G2r missing from the catalogue'
    $g12 = $c.gates | Where-Object { $_.gate -eq 'G12' }
    $g13 = $c.gates | Where-Object { $_.gate -eq 'G13' }
    Assert ($g12.method.id -eq 'G12.SYSTEM_RESPONSE') "G12 method: $($g12.method.id)"
    Assert ($g13.method.id -eq 'G13.ALIGNED_PEER_ANALYSIS_V1') "G13 method: $($g13.method.id)"
    Assert ($g13.capabilityState -eq 'INSTALLED') "G13 capability: $($g13.capabilityState)"
    Assert ('aligned_series' -in $g13.artifactKinds) 'G13 artifact kinds lack aligned_series'
}

Step 'v2.5 schema: response tables, investigation references, loop model dimensions (2B.2 / 2D.2 / 2G.1)' {
    $n = (Invoke-CplmSql "SELECT count(*) FROM information_schema.tables WHERE (table_schema, table_name) IN (('analytics','response_event'),('analytics','response_metric'),('analytics','system_model'),('analytics','model_validation'),('analytics','investigation_reference'))" | Select-Object -First 1)
    Assert ([int]$n -eq 5) "expected 5 slice-2 tables, found $n"
    $c = (Invoke-CplmSql "SELECT count(*) FROM information_schema.columns WHERE table_schema='cpm' AND table_name='loop_registry' AND column_name IN ('service_family','dynamic_class','objective_type','topology','command_path','acquisition','classification_source')" | Select-Object -First 1)
    Assert ([int]$c -eq 7) "expected 7 loop-model columns on cpm.loop_registry, found $c"
}

# ── 2. Registry dimensions (2G.1) ───────────────────────────────────────────
$probe = 'E2E-LIC-DIMS'
Step 'registry contract lists the loop model enums and the preset per loop type (2G.1)' {
    $rc = Invoke-RestMethod -Method Get -Uri "$cpm/registry-contract" -Headers $H
    Assert ($null -ne $rc.model) 'registry-contract has no model section'
    Assert ('INTEGRATING_LAG' -in $rc.model.dynamicClasses) 'dynamicClasses lack INTEGRATING_LAG'
    Assert ($rc.model.presets.LIC.dynamicClass -eq 'INTEGRATING') "LIC preset dynamic class: $($rc.model.presets.LIC.dynamicClass)"
    Assert ($rc.model.acquisitionModes -contains 'RBE') 'acquisitionModes lack RBE'
}

Step 'an explicit LIC self-regulating model is stored EXPLICIT and survives a preset re-activation (2G.1, R25)' {
    $base = @{ loopId = $probe; displayName = 'E2E dimensions probe'; site = $Site; loopType = 'LIC'; enableMonitoring = $false; allowUnmodelledLocation = $true
               tags = @(@{ signalRole = 'PV'; unsPath = "root.$Site.e2e.$probe.pv" }, @{ signalRole = 'SP'; unsPath = "root.$Site.e2e.$probe.sp" }, @{ signalRole = 'OP'; unsPath = "root.$Site.e2e.$probe.op" }, @{ signalRole = 'MODE'; unsPath = "root.$Site.e2e.$probe.mode" }) }
    $explicit = $base.Clone()
    $explicit.model = @{ serviceFamily = 'LEVEL'; dynamicClass = 'SLOW_SELF_REG'; topology = 'CASCADE_SLAVE'; acquisition = @{ mode = 'RBE'; gridSeconds = 5; declaredScanS = 1.0 } }
    $l = Invoke-RestMethod -Method Post -Uri "$cpm/loops/activate" -Headers $HJ -Body ($explicit | ConvertTo-Json -Depth 6)
    Assert ($l.model.classificationSource -eq 'EXPLICIT') "after explicit activation: $($l.model.classificationSource)"
    Assert ($l.model.dynamicClass -eq 'SLOW_SELF_REG') "dynamic class: $($l.model.dynamicClass)"
    Assert ($l.model.objectiveType -eq 'AVERAGING') "an omitted field takes the preset: objective $($l.model.objectiveType)"
    Assert ($l.model.acquisition.mode -eq 'RBE' -and $l.model.acquisition.gridSeconds -eq 5) "acquisition: $($l.model.acquisition | ConvertTo-Json -Compress)"
    # re-activate WITHOUT a model (the wizard's identity edit): the explicit declaration must survive
    $l2 = Invoke-RestMethod -Method Post -Uri "$cpm/loops/activate" -Headers $HJ -Body ($base | ConvertTo-Json -Depth 6)
    Assert ($l2.model.classificationSource -eq 'EXPLICIT' -and $l2.model.dynamicClass -eq 'SLOW_SELF_REG') "preset re-activation overwrote the explicit model: $($l2.model | ConvertTo-Json -Compress)"
    $row = (Invoke-CplmSql "SELECT dynamic_class || '|' || classification_source || '|' || (acquisition->>'mode') FROM cpm.loop_registry WHERE loop_id = '$probe'" | Select-Object -First 1)
    Assert ($row -eq 'SLOW_SELF_REG|EXPLICIT|RBE') "stored row: $row"
    # an unknown enum is refused naming the field
    $bad = $base.Clone(); $bad.model = @{ dynamicClass = 'FAST' }
    try { Invoke-RestMethod -Method Post -Uri "$cpm/loops/activate" -Headers $HJ -Body ($bad | ConvertTo-Json -Depth 6) | Out-Null; throw 'an unknown dynamicClass was accepted' }
    catch { Assert ($_.Exception.Message -match '400|422|dynamicClass') "unexpected refusal: $($_.Exception.Message)" }
}

# ── 2b. Sample flow: the long tier needs samples (the lab's OT gateway sim is a host process) ──
Step "sample flow: short-tier results are fresh, else the OT gateway simulator is started for this run (excluding $LoopId)" {
    $fresh = (Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_short_feature_results WHERE created_at > now() - interval '10 minutes'" | Select-Object -First 1) -as [int]
    if ($fresh -gt 0) { Write-Host '        (samples already flowing)' -ForegroundColor DarkGray; return }
    $sim = Join-Path $repoRoot 'ams-sims\sim_ot_gateway_mqtt.py'
    # the step scenarios drive $LoopId themselves: two publishers on one loop would corrupt the event
    $script:otSim = Start-Process -FilePath 'python' -ArgumentList "`"$sim`"", '--minutes', '90', '--exclude', $LoopId -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 3
    Assert (-not $script:otSim.HasExited) 'the OT gateway simulator exited immediately (paho-mqtt installed? mosquitto-test on :1884?)'
    Assert (Wait-Until { (Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_short_feature_results WHERE created_at > now() - interval '5 minutes'" | Select-Object -First 1) -as [int] -gt 0 } 240 10) 'no short-tier result within 4 min of starting the simulator'
}

Step 'capabilities: the running jar is what the tree built; every gate is an installed method (0.4 / 2F.1)' {
    $hostJar = (Get-FileHash -Algorithm SHA256 (Join-Path $repoRoot 'src\flink\target\ams-flink-1.0-SNAPSHOT.jar')).Hash.ToLowerInvariant()
    # the observed list comes from the newest results: give the freshly deployed jar a few short windows to show up
    $seen = Wait-Until { $hostJar -in @((Invoke-RestMethod -Method Get -Uri "$cpm/capabilities" -Headers $H).engine.observed | ForEach-Object { $_.jarSha256 } | Where-Object { $_ }) } 300 15
    $m = Invoke-RestMethod -Method Get -Uri "$cpm/capabilities" -Headers $H
    $observed = @($m.engine.observed | ForEach-Object { $_.jarSha256 } | Where-Object { $_ })
    Assert $seen "no observed engine result carries the host jar $($hostJar.Substring(0,12)) (observed: $(($observed | ForEach-Object { $_.Substring(0, [Math]::Min(12, $_.Length)) }) -join ', '))"
    $legacy = @($m.methods | Where-Object { $_.state -ne 'INSTALLED' })
    Assert ($legacy.Count -eq 0) "flag-only methods remain: $(($legacy | ForEach-Object { $_.gate }) -join ', ')"
}

# ── 3. Results world: G13, bandwidth eligibility, artifacts (2C / 2F / 2G) ─────
Step 'the newest LIVE fused row carries G13 as the aligned analysis (state + reason), never a link flag (2F.1, R09)' {
    $ok = Wait-Until { (Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_gate_results WHERE purpose='LIVE' AND payload ? 'interaction' AND payload->>'gate13_method' = 'G13.ALIGNED_PEER_ANALYSIS_V1'" | Select-Object -First 1) -as [int] -gt 0 } 900 15
    Assert $ok 'no fused row from the 2F jar within 15 min (has the fusion job run on the deployed jar?)'
    $row = (Invoke-CplmSql "SELECT loop_id || '|' || (payload->'interaction'->>'state') || '|' || (payload->>'gate13_reason') || '|' || (payload->'gates'->>'G13') FROM analytics.cplm_gate_results WHERE purpose='LIVE' AND payload ? 'interaction' ORDER BY window_end DESC LIMIT 1" | Select-Object -First 1)
    $p = $row -split '\|'
    Assert ($p[1] -in @('INTERACTION_DETECTED', 'NO_INTERACTION', 'UNAVAILABLE', 'NOT_CONFIGURED')) "interaction.state: $($p[1])"
    Assert (-not [string]::IsNullOrWhiteSpace($p[2])) 'gate13_reason is empty'
    if ($p[1] -eq 'NOT_CONFIGURED') { Assert ($p[3] -eq 'NOT_EVALUATED' -and $p[2] -eq 'NO_PEER_LINKS') "NOT_CONFIGURED must read NOT_EVALUATED / NO_PEER_LINKS, got $($p[3]) / $($p[2])" }
    if ($p[1] -eq 'UNAVAILABLE') { Assert ($p[3] -eq 'NOT_EVALUATED') "UNAVAILABLE must be NOT_EVALUATED, got $($p[3])" }
    # gates/latest is verdict-aware (it prefers the newest row WITH a verdict over an INSUFFICIENT/EXCLUDED one), so it may
    # name another window than the newest payload row: compare the API cell with the payload of ITS OWN window
    $g = Invoke-RestMethod -Method Get -Uri "$cpm/loops/$($p[0])/gates/latest?windowKind=24h" -Headers $H
    $cell = $g.gates | Where-Object { $_.key -eq 'G13' }
    $own = (Invoke-CplmSql "SELECT COALESCE(payload->>'gate13_reason','') || '|' || COALESCE(payload->>'gate13_method','') FROM analytics.cplm_gate_results WHERE loop_id = '$($p[0])' AND window_kind = '24h' AND purpose = 'LIVE' AND source = 'flink' AND window_end = '$($g.windowEnd)'::timestamptz ORDER BY result_revision DESC, created_at DESC LIMIT 1" | Select-Object -First 1)
    Assert (-not [string]::IsNullOrWhiteSpace($own)) "no payload row for the window gates/latest returned ($($g.windowEnd))"
    $o = $own -split '\|'
    $apiReason = if ($null -eq $cell.reason) { '' } else { [string]$cell.reason }
    Assert ($apiReason -eq $o[0]) "gates/latest G13 reason '$apiReason' <> that window's payload '$($o[0])'"
    $apiMethod = if ($null -eq $g.gate13Method) { '' } else { [string]$g.gate13Method }
    Assert ($apiMethod -eq $o[1]) "gates/latest gate13Method '$apiMethod' <> that window's payload '$($o[1])'"
    if ($g.gate13Method -ne 'G13.ALIGNED_PEER_ANALYSIS_V1') { Write-Host "        (the verdict-aware latest 24h window of $($p[0]) predates the 2F jar: $($g.gate13Method))" -ForegroundColor DarkGray }
}

Step 'a loop with a configured but unobserved peer is UNAVAILABLE / PEER_UNOBSERVED - a link is not a verdict (2F.1, NR-028)' {
    $row = (Invoke-CplmSql "SELECT loop_id || '|' || (payload->'interaction'->>'state') || '|' || (payload->'interaction'->>'reason') FROM analytics.cplm_gate_results WHERE purpose='LIVE' AND payload ? 'interaction' AND jsonb_array_length(payload->'interaction'->'peers') > 0 ORDER BY window_end DESC LIMIT 1" | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($row)) { Write-Host '        (no loop with peer links on this lab - the NOT_CONFIGURED path was proven above)' -ForegroundColor DarkGray; return }
    $p = $row -split '\|'
    Assert ($p[1] -ne 'NOT_CONFIGURED') "a loop with peers must not be NOT_CONFIGURED: $row"
    if ($p[1] -eq 'UNAVAILABLE') { Assert ($p[2] -like 'PEER_UNOBSERVED*' -or $p[2] -like '*INSUFFICIENT_SUPPORT*') "UNAVAILABLE reason: $($p[2])" }
}

Step 'bandwidth eligibility rides the long and fused rows and the gate cells (2G.1, NR-016)' {
    $row = (Invoke-CplmSql "SELECT (payload->'method_eligibility'->'G5'->>'state') || '|' || COALESCE(payload->'method_eligibility'->'G5'->>'reason','') || '|' || (payload->'method_eligibility'->'G12'->>'state') FROM analytics.cplm_long_feature_results WHERE purpose='LIVE' AND payload ? 'method_eligibility' ORDER BY window_end DESC LIMIT 1" | Select-Object -First 1)
    Assert (-not [string]::IsNullOrWhiteSpace($row)) 'no long row with method_eligibility (long job not on the 2G jar?)'
    $p = $row -split '\|'
    Assert ($p[0] -in @('ELIGIBLE', 'LIMITED', 'UNKNOWN')) "G5 eligibility: $($p[0])"
    if ($p[0] -eq 'LIMITED') { Assert ($p[1] -eq 'BANDWIDTH') "LIMITED without BANDWIDTH reason: $($p[1])" }
    $fused = (Invoke-CplmSql "SELECT loop_id || '|' || (payload->'method_eligibility'->'G5'->>'state') FROM analytics.cplm_gate_results WHERE purpose='LIVE' AND payload->'method_eligibility' ? 'G5' ORDER BY window_end DESC LIMIT 1" | Select-Object -First 1)
    Assert (-not [string]::IsNullOrWhiteSpace($fused)) 'no fused row with method_eligibility (excluded rows must carry it too)'
    $f = $fused -split '\|'
    # gates/latest is verdict-aware: on a cold lab the newest REAL verdict may predate 2G - compare the cell with that window's own payload
    $g = Invoke-RestMethod -Method Get -Uri "$cpm/loops/$($f[0])/gates/latest?windowKind=24h" -Headers $H
    $ownState = (Invoke-CplmSql "SELECT COALESCE(payload->'method_eligibility'->'G5'->>'state','') FROM analytics.cplm_gate_results WHERE loop_id = '$($f[0])' AND window_kind = '24h' AND purpose = 'LIVE' AND source = 'flink' AND window_end = '$($g.windowEnd)'::timestamptz ORDER BY result_revision DESC, created_at DESC LIMIT 1" | Select-Object -First 1)
    $g5 = $g.gates | Where-Object { $_.key -eq 'G5' }
    if ([string]::IsNullOrWhiteSpace($ownState)) {
        Write-Host "        (the verdict-aware latest 24h window of $($f[0]) predates 2G: no eligibility on it, none claimed by the API)" -ForegroundColor DarkGray
        Assert ($null -eq $g.methodEligibility) 'the API claims an eligibility the window never carried'
    } else {
        Assert ($null -ne $g.methodEligibility) 'gates/latest lacks methodEligibility although its window carries it'
        Assert ($g.methodEligibility.G5.state -eq $ownState) "API G5 eligibility '$($g.methodEligibility.G5.state)' <> the window's '$ownState'"
        if ($ownState -eq 'LIMITED') { Assert ($g5.reason -eq 'BANDWIDTH') "G5 cell reason: $($g5.reason)" } else { Assert ([string]::IsNullOrEmpty($g5.reason)) "an eligible G5 states no limitation, got '$($g5.reason)'" }
    }
}

Step 'G5 acf_series has length and G6 psd declares ordinate_kind PSD on a COMPLETE long-tier manifest (2C.1)' {
    $ok = Wait-Until { (Invoke-CplmSql "SELECT count(*) FROM analytics.evidence_manifest WHERE readiness='COMPLETE' AND gate_id='G6' AND artifact_kind='psd' AND created_at > now() - interval '$RecentHours hours'" | Select-Object -First 1) -as [int] -gt 0 } 600 15
    Assert $ok "no COMPLETE G6 psd manifest in the last $RecentHours h"
    $acf = (Invoke-CplmSql "SELECT calculation_samples || '|' || (provenance->>'regularity_method') FROM analytics.evidence_manifest WHERE readiness='COMPLETE' AND gate_id='G5' AND artifact_kind='acf_series' ORDER BY created_at DESC LIMIT 1" | Select-Object -First 1)
    Assert (-not [string]::IsNullOrWhiteSpace($acf)) 'no COMPLETE G5 acf_series'
    Assert ([int]($acf -split '\|')[0] -gt 0) "acf_series has no samples: $acf"
    $psd = (Invoke-CplmSql "SELECT (provenance->>'ordinate_kind') || '|' || (provenance->>'spectral_window') || '|' || y_unit FROM analytics.evidence_manifest WHERE readiness='COMPLETE' AND gate_id='G6' AND artifact_kind='psd' ORDER BY created_at DESC LIMIT 1" | Select-Object -First 1)
    $p = $psd -split '\|'
    Assert ($p[0] -eq 'PSD') "ordinate_kind: $($p[0])"
    Assert ($p[1] -eq 'HANN') "spectral_window: $($p[1])"
    Assert ($p[2] -eq 'signal^2/Hz') "y_unit: $($p[2])"
}

Step 'G13 evidence: an interaction record exists under the long tier G13 run id shared with the fused row (2F.1)' {
    $ok = Wait-Until { (Invoke-CplmSql "SELECT count(*) FROM analytics.evidence_manifest WHERE gate_id='G13' AND artifact_kind='interaction' AND readiness='COMPLETE'" | Select-Object -First 1) -as [int] -gt 0 } 600 15
    Assert $ok 'no COMPLETE G13 interaction record yet'
    $row = (Invoke-CplmSql "SELECT m.method_run_id::text || '|' || (m.provenance->>'capability_state') || '|' || (m.provenance->>'method_id') FROM analytics.evidence_manifest m WHERE m.gate_id='G13' AND m.artifact_kind='interaction' AND m.readiness='COMPLETE' ORDER BY m.created_at DESC LIMIT 1" | Select-Object -First 1)
    $p = $row -split '\|'
    Assert ($p[2] -eq 'G13.ALIGNED_PEER_ANALYSIS_V1') "record method_id: $($p[2])"
    $fusedHas = (Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_gate_results WHERE method_run_ids->>'G13' = '$($p[0])'" | Select-Object -First 1)
    Assert ([int]$fusedHas -ge 1) "no fused row names the long tier's G13 run $($p[0]) (identity must agree across tiers)"
}

# ── 4. G12 response events (2A / 2B / 2E.5) ─────────────────────────────────
Step "a COMPLETE INPUT_TEST response event with its quantities exists for $LoopId (2B; simulator when the lab has none)" {
    $count = { (Invoke-CplmSql "SELECT count(*) FROM analytics.response_event WHERE lower(loop_id)=lower('$LoopId') AND capture_state='COMPLETE' AND event_type='INPUT_TEST' AND t0_ms > (extract(epoch from now())*1000 - $RecentHours*3600000)" | Select-Object -First 1) -as [int] }
    if ($ForceSimulator -or ((& $count) -eq 0 -and -not $SkipSimulator)) {
        $before = & $count
        Invoke-StepSim 'input-test'
        Assert (Wait-Until { (& $count) -gt $before } $EventTimeoutSec 10) "no COMPLETE INPUT_TEST event within $EventTimeoutSec s of the scenario"
    }
    Assert ((& $count) -gt 0) "no COMPLETE INPUT_TEST event for $LoopId in the last $RecentHours h (run with the simulator)"
    $page = Invoke-RestMethod -Method Get -Uri "$cpm/loops/$LoopId/response-events?limit=50" -Headers $H
    $ev = $page.events | Where-Object { $_.captureState -eq 'COMPLETE' -and $_.eventType -eq 'INPUT_TEST' } | Select-Object -First 1
    Assert ($null -ne $ev) 'response-events lists no COMPLETE INPUT_TEST'
    $script:eventId = $ev.eventId
    $script:eventRunId = $ev.methodRunId
    $d = Invoke-RestMethod -Method Get -Uri "$cpm/response-events/$($ev.eventId)" -Headers $H
    Assert ($d.metrics.Count -ge 52) "expected the 52 catalogue quantities, got $($d.metrics.Count)"
    foreach ($sg in 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H') { Assert ($null -ne $d.result.subgates.$sg) "subgate $sg missing" }
    Assert ($null -ne $d.result.subgates.A.outputs.sample_grid_s) 'subgate A lacks sample_grid_s (2G.1 bandwidth check)'
    $gain = $d.metrics | Where-Object { $_.quantityId -eq 'process_gain' }
    Assert ($null -ne $gain) 'process_gain quantity missing'
    Assert ($null -ne $gain.value -or -not [string]::IsNullOrEmpty($gain.reasonIfNull)) 'process_gain is null without a reason'
    $dead = $d.metrics | Where-Object { $_.quantityId -eq 'dead_time' }
    Assert ($dead.unit -eq 's') "dead_time unit: $($dead.unit)"
}

Step 'a second step 30 s after the first CENSORS the first event (SUPERSEDED_BY_EVENT) and opens a second (NR-007)' {
    $count = { (Invoke-CplmSql "SELECT count(*) FROM analytics.response_event WHERE lower(loop_id)=lower('$LoopId') AND capture_state='CENSORED' AND censor_reason='SUPERSEDED_BY_EVENT' AND t0_ms > (extract(epoch from now())*1000 - $RecentHours*3600000)" | Select-Object -First 1) -as [int] }
    if ($ForceSimulator -or ((& $count) -eq 0 -and -not $SkipSimulator)) {
        $before = & $count
        Invoke-StepSim 'interrupted-step'
        Assert (Wait-Until { (& $count) -gt $before } $EventTimeoutSec 10) "no SUPERSEDED_BY_EVENT censoring within $EventTimeoutSec s of the scenario"
    }
    Assert ((& $count) -gt 0) 'no censored (SUPERSEDED_BY_EVENT) event on the lab (run with the simulator)'
    $page = Invoke-RestMethod -Method Get -Uri "$cpm/loops/$LoopId/response-events?limit=50" -Headers $H
    $c = $page.events | Where-Object { $_.censorReason -eq 'SUPERSEDED_BY_EVENT' } | Select-Object -First 1
    Assert ($null -ne $c) 'response-events does not list the censored event (rejected / censored must be listed)'
    Assert ($c.captureState -eq 'CENSORED') "captureState: $($c.captureState)"
}

Step 'the response event evidence: manifest COMPLETE, ETag honoured (304), chunk bytes match their sha (2C.2 / 2E.5)' {
    Assert (-not [string]::IsNullOrEmpty($script:eventRunId)) 'no event run id from the previous step'
    $run = $script:eventRunId
    $ok = Wait-Until { (Invoke-RestMethod -Method Get -Uri "$cpm/method-runs/$run/evidence" -Headers $H).readiness -in @('COMPLETE', 'PARTIAL') } 180 10
    Assert $ok 'the event manifest did not become COMPLETE / PARTIAL'
    $resp = Invoke-WebRequest -Method Get -Uri "$cpm/method-runs/$run/evidence" -Headers $H -UseBasicParsing
    $etag = $resp.Headers['ETag']
    Assert (-not [string]::IsNullOrEmpty($etag)) 'manifest has no ETag'
    $man = $resp.Content | ConvertFrom-Json
    $kinds = @($man.artifacts | ForEach-Object { $_.kind })
    foreach ($k in 'response_event', 'accepted_samples', 'input_reconstruction', 'baseline', 'target', 'response_times', 'rejection_reasons') { Assert ($k -in $kinds) "G12 artifact '$k' missing (kinds: $($kinds -join ', '))" }
    try { Invoke-WebRequest -Method Get -Uri "$cpm/method-runs/$run/evidence" -Headers ($H + @{ 'If-None-Match' = $etag }) -UseBasicParsing | Out-Null; throw 'If-None-Match with the current ETag returned a body instead of 304' }
    catch { Assert ($_.Exception.Message -match '304') "expected 304, got: $($_.Exception.Message)" }
    $samples = $man.artifacts | Where-Object { $_.kind -eq 'accepted_samples' -and $_.readiness -eq 'COMPLETE' } | Select-Object -First 1
    Assert ($null -ne $samples) 'accepted_samples not COMPLETE'
    $chunk = Invoke-WebRequest -Method Get -Uri "$cpm/evidence/$($samples.artifactId)/chunks/0" -Headers $H -UseBasicParsing
    $sha = Sha256Hex $chunk.Content
    Assert ($sha -eq $samples.chunkChecksums[0]) "chunk 0 sha $sha <> manifest $($samples.chunkChecksums[0])"
    Assert ($chunk.Headers['Cache-Control'] -match 'immutable') "chunk Cache-Control: $($chunk.Headers['Cache-Control'])"
    Assert ('lower' -in $man.artifacts.Where({ $_.kind -eq 'prediction_interval' }).columns -or -not ('prediction_interval' -in $kinds)) 'prediction_interval lacks the lower column (2E.5 writer fix)'
}

# ── 5. Workbench entry points (2E.3) and investigations (2D.2) ───────────────
Step 'the gate cells carry the immutable method_run_id the workbench opens; /method-runs resolves it (2E.3, R13)' {
    $newest = (Invoke-CplmSql "SELECT loop_id || '|' || (method_run_ids->>'G5') FROM analytics.cplm_gate_results WHERE purpose='LIVE' AND method_run_ids ? 'G5' ORDER BY window_end DESC LIMIT 1" | Select-Object -First 1)
    Assert (-not [string]::IsNullOrWhiteSpace($newest)) 'no fused row with method_run_ids'
    $n = $newest -split '\|'
    $loop = $n[0]
    $mr = Invoke-RestMethod -Method Get -Uri "$cpm/method-runs/$($n[1])" -Headers $H
    Assert ($mr.gate -eq 'G5' -and $mr.loopId -eq $loop) "method-run resolved to $($mr.gate) / $($mr.loopId)"
    # the cell the workbench opens names the run of ITS window (verdict-aware latest may predate 1G on a cold lab: then null, stated)
    $g = Invoke-RestMethod -Method Get -Uri "$cpm/loops/$loop/gates/latest?windowKind=24h" -Headers $H
    $cell = $g.gates | Where-Object { $_.key -eq 'G5' }
    $ownId = (Invoke-CplmSql "SELECT COALESCE(method_run_ids->>'G5','') FROM analytics.cplm_gate_results WHERE loop_id = '$loop' AND window_kind = '24h' AND purpose = 'LIVE' AND source = 'flink' AND window_end = '$($g.windowEnd)'::timestamptz ORDER BY result_revision DESC, created_at DESC LIMIT 1" | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($ownId)) {
        Write-Host "        (the verdict-aware latest 24h window of $loop predates 1G: the cell states null, never a made-up id)" -ForegroundColor DarkGray
        Assert ([string]::IsNullOrEmpty($cell.methodRunId)) 'the cell names a run its window never carried'
    } else {
        Assert ($cell.methodRunId -eq $ownId) "G5 cell '$($cell.methodRunId)' <> the window's run '$ownId'"
        Assert ($g.methodRunIds.G5 -eq $cell.methodRunId) 'cell methodRunId <> row methodRunIds.G5'
    }
    if (-not [string]::IsNullOrWhiteSpace($ownId)) { Assert ($mr.methodRunIds.G13 -eq $g.methodRunIds.G13) 'sibling run ids differ between the cell row and the resolved run' }
    $script:workbenchUrl = "/cpm/evidence?loop=$loop&methodRun=$($n[1])&gate=G5&mode=FIXED"
    Write-Host "        workbench: $($script:workbenchUrl)" -ForegroundColor DarkGray
}

Step 'an investigation pins evidence with an explicit outcome (default INCONCLUSIVE); work completed is not restored (2D.2, NR-062)' {
    $ev = (Invoke-CplmSql "SELECT evidence_id::text || '|' || (provenance->>'loop_id') FROM analytics.evidence_manifest WHERE readiness='COMPLETE' AND provenance ? 'loop_id' ORDER BY created_at DESC LIMIT 1" | Select-Object -First 1)
    Assert (-not [string]::IsNullOrWhiteSpace($ev)) 'no COMPLETE manifest to pin'
    $p = $ev -split '\|'
    $inv = Invoke-RestMethod -Method Post -Uri "$cpm/investigations" -Headers $HJ -Body (@{ loopId = $p[1]; evidenceIds = @($p[0]); note = 'slice-2 e2e' } | ConvertTo-Json)
    Assert ($inv.outcome -eq 'INCONCLUSIVE') "default outcome: $($inv.outcome)"
    $pinned = (Invoke-CplmSql "SELECT pinned FROM analytics.evidence_manifest WHERE evidence_id = '$($p[0])'" | Select-Object -First 1)
    Assert ($pinned -eq 't') "evidence not pinned: $pinned"
    $set = Invoke-RestMethod -Method Patch -Uri "$cpm/investigations/$($inv.refId)/outcome" -Headers $HJ -Body (@{ outcome = 'WORK_COMPLETED'; note = 'valve serviced' } | ConvertTo-Json)
    Assert ($set.outcome -eq 'WORK_COMPLETED') "outcome after set: $($set.outcome)"
    $list = Invoke-RestMethod -Method Get -Uri "$cpm/loops/$($p[1])/investigations" -Headers $H
    Assert (@($list.investigations | Where-Object { $_.refId -eq $inv.refId }).Count -eq 1) 'investigation not listed for the loop'
}

Step 'the SPA serves the new routes (/cpm/response, /cpm/evidence) through the nginx fallback (2E)' {
    foreach ($route in '/cpm/response', '/cpm/evidence') {
        $r = Invoke-WebRequest -Method Get -Uri "http://127.0.0.1:3000$route" -UseBasicParsing
        Assert ($r.StatusCode -eq 200 -and $r.Content -match '<div id="root"') "route $route did not serve the SPA"
    }
}

# ── 6. Cleanup ───────────────────────────────────────────────────────────────
Step 'cleanup: the dimensions probe loop is deleted; a simulator this run started is stopped' {
    if ($script:otSim -and -not $script:otSim.HasExited) { Stop-Process -Id $script:otSim.Id -Force -ErrorAction SilentlyContinue }
    try { Invoke-RestMethod -Method Delete -Uri "$cpm/loops/$probe" -Headers $H | Out-Null } catch { if ($_.Exception.Message -notmatch '404') { throw } }
    $left = (Invoke-CplmSql "SELECT count(*) FROM cpm.loop_registry WHERE loop_id = '$probe'" | Select-Object -First 1)
    Assert ([int]$left -eq 0) 'probe loop still registered'
}

Write-Host "`n=== Slice 2: $($script:passed) passed, $($script:failed) failed ===`n"
exit $(if ($script:failed -eq 0) { 0 } else { 1 })
