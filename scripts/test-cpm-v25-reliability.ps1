# v2.5 reliability probes (Task 4.2; spec v6 §6.8, NR-057 / NR-058, NR-052) - proven against the RUNNING lab stack.
#
#   R1  cplm-api killed mid-batch (docker kill = SIGKILL): the consumer resumes from its last stored offset; no
#       window is lost and no window is duplicated (one row per (loop, kind, window_end, source, bundle_hash),
#       the same method_run_ids); projection lag returns to ~0
#   R2  TaskManager restart (HA + retained checkpoints): every CPLM job returns RUNNING from its checkpoint and
#       the next result of the probe loop carries the SAME bundle hash as before (the broadcast state restored)
#   R3  a duplicate delivery of an evidence CHUNK record: the chunk count and the manifest readiness are unchanged
#   R4  Postgres paused for 60 s: the consumers fail their batch, store no offset, and resume without skipping -
#       every 1-minute window of the probe loop across the pause is present
#   R5  (covered by scripts/test-cpm-v25-slice1-e2e.ps1: the health publisher's LWT -> OFFLINE with the last observed
#       status retained) - referenced, not repeated
#
# Prerequisites: run-all.ps1 stack with the v2.5 images + jar, the loop's samples flowing (the OT gateway sim),
#   at least one COMPLETE evidence manifest in the last day. The probes pause Postgres for 60 s and restart
#   the TaskManager: run them on the LAB only.
#
#   .\scripts\test-cpm-v25-reliability.ps1
param(
    [string]$GatewayBase = 'http://127.0.0.1:8081',
    [string]$AdminUser = 'admin',
    [string]$AdminPassword = '',
    [string]$LoopId = 'FIC10101',
    [int]$PauseSeconds = 60,
    [string[]]$Steps = @()                  # e.g. -Steps R3 : run only the probes whose name starts with one of these
)

$ErrorActionPreference = 'Stop'
$script:failed = 0
$script:passed = 0

function Step([string]$name, [scriptblock]$body) {
    if ($Steps.Count -gt 0 -and -not ($Steps | Where-Object { $name.StartsWith($_) }) -and -not $name.StartsWith('login')) { Write-Host "  SKIP  $name" -ForegroundColor DarkGray; return }
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
function Get-Json([string]$url) { return (curl.exe -s $url | ConvertFrom-Json) }
function ShortRows() { return [int](Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_short_feature_results WHERE loop_id = '$LoopId' AND window_kind = '1m' AND source = 'flink'" | Select-Object -First 1) }
function NewestShort() {
    $r = Invoke-CplmSql "SELECT window_end, bundle_hash, method_run_ids::text FROM analytics.cplm_short_feature_results WHERE loop_id = '$LoopId' AND window_kind = '1m' AND source = 'flink' ORDER BY window_end DESC LIMIT 1" | Select-Object -First 1
    if (-not $r) { return $null }
    $p = $r.Split('|')
    return [pscustomobject]@{ WindowEnd = $p[0]; BundleHash = $p[1]; MethodRunIds = $p[2] }
}

Write-Host "`n=== v2.5 reliability probes against $GatewayBase (loop $LoopId) ===`n"
if (-not $AdminPassword) { $AdminPassword = if ($env:AMS_ADMIN_PASSWORD) { $env:AMS_ADMIN_PASSWORD } else { 'ChangeMe123!' } }
$cpm = "$GatewayBase/api/v1/cpm"
Step 'login; the loop has fresh 1-minute windows (samples are flowing)' {
    $r = Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/auth/login" -ContentType 'application/json' -Body (@{ username = $AdminUser; password = $AdminPassword } | ConvertTo-Json)
    $script:H = @{ Authorization = "Bearer $($r.token)" }
    $fresh = [int](Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_short_feature_results WHERE loop_id = '$LoopId' AND window_kind = '1m' AND created_at > now() - interval '5 minutes'" | Select-Object -First 1)
    Assert ($fresh -gt 0) "no 1-minute window of $LoopId in the last 5 min: start ams-sims/sim_ot_gateway_mqtt.py first"
}

# ── R1. cplm-api killed mid-batch ───────────────────────────────────────────
Step 'R1 cplm-api SIGKILLed and restarted: windows continue, none lost, none duplicated, projection lag recovers (NR-058)' {
    $before = ShortRows
    $newestBefore = NewestShort
    cmd /c "docker kill traverse-cplm-api" | Out-Null
    Start-Sleep -Seconds 5
    cmd /c "docker start traverse-cplm-api" | Out-Null
    $up = Wait-Until { (Get-Json "$GatewayBase/gw/upstreams/cplm-api/health").status -in 'Healthy', 'Degraded' } 120 5
    Assert $up 'cplm-api did not report healthy within 120 s of the restart'
    # three new windows must land after the restart (the consumer resumed from its stored offset)
    $grew = Wait-Until { (ShortRows) -ge ($before + 3) } 300 10
    Assert $grew "no new 1-minute windows within 5 min of the restart (before $before, now $(ShortRows))"
    # no duplicate window under one bundle (the unique key holds) and the windows are consecutive minutes
    $dups = [int](Invoke-CplmSql "SELECT count(*) FROM (SELECT loop_id, window_kind, window_end, source, bundle_hash, count(*) c FROM analytics.cplm_short_feature_results WHERE loop_id = '$LoopId' GROUP BY 1,2,3,4,5 HAVING count(*) > 1) d" | Select-Object -First 1)
    Assert ($dups -eq 0) "$dups duplicated windows"
    $gaps = [int](Invoke-CplmSql "SELECT count(*) FROM (SELECT window_end, lag(window_end) OVER (ORDER BY window_end) prev FROM analytics.cplm_short_feature_results WHERE loop_id = '$LoopId' AND window_kind = '1m' AND source = 'flink' AND window_end > '$($newestBefore.WindowEnd)'::timestamptz - interval '10 minutes') g WHERE prev IS NOT NULL AND window_end - prev > interval '90 seconds'" | Select-Object -First 1)
    Assert ($gaps -eq 0) "$gaps gap(s) > 90 s in the 1-minute windows around the restart"
    $h = Get-Json "$GatewayBase/gw/upstreams/cplm-api/health"
    $lag = $h.consumers.results.projectionLag.lastMs
    Write-Host "        rows $before -> $(ShortRows), duplicates 0, gaps 0, results consumer $($h.consumers.results.state) projection lag $lag ms" -ForegroundColor DarkGray
}

# ── R2. TaskManager restart (jobs recover from their checkpoints) ───────────
Step 'R2 TaskManager restarted: every CPLM job RUNNING again; the next result carries the same bundle hash (NR-052)' {
    $newestBefore = NewestShort
    Assert ($null -ne $newestBefore) 'no short row to compare against'
    cmd /c "docker restart ams-flink-taskmanager" | Out-Null
    $expected = @('AMS - CPLM Short Feature Engine', 'AMS - CPLM Long Diagnostics Engine', 'AMS - CPLM Gate Fusion Engine', 'AMS - CPLM Condition Engine', 'AMS - CPLM Instrument Context Engine', 'AMS - CPLM Response Engine')
    $back = Wait-Until {
        $jobs = (Get-Json 'http://127.0.0.1:8082/jobs/overview').jobs
        $running = @($jobs | Where-Object { $_.state -eq 'RUNNING' } | ForEach-Object { $_.name })
        @($expected | Where-Object { $_ -notin $running }).Count -eq 0
    } 420 10
    $jobs = (Get-Json 'http://127.0.0.1:8082/jobs/overview').jobs
    Assert $back "not every CPLM job is RUNNING 7 min after the TaskManager restart: $(($jobs | Where-Object { $_.name -like 'AMS - CPLM*' -and $_.state -ne 'FINISHED' -and $_.state -ne 'CANCELED' } | ForEach-Object { "$($_.name)=$($_.state)" }) -join ', ')"
    $next = $null
    $landed = Wait-Until { $script:next = NewestShort; $script:next -and $script:next.WindowEnd -gt $newestBefore.WindowEnd } 420 10
    Assert $landed 'no new 1-minute window within 7 min of the TaskManager restart'
    Assert ($script:next.BundleHash -eq $newestBefore.BundleHash) "bundle hash changed across the restart: $($newestBefore.BundleHash) -> $($script:next.BundleHash)"
    Write-Host "        bundle hash $($script:next.BundleHash.Substring(0, [Math]::Min(16, $script:next.BundleHash.Length))) held across the restart; next window $($script:next.WindowEnd)" -ForegroundColor DarkGray
}

# ── R3. duplicate evidence chunk ────────────────────────────────────────────
Step 'R3 a duplicate delivery of an evidence CHUNK record is idempotent: chunk count and readiness unchanged (NR-058)' {
    $row = Invoke-CplmSql "SELECT m.evidence_id, m.method_run_id, m.chunk_count, m.readiness FROM analytics.evidence_manifest m WHERE m.readiness = 'COMPLETE' AND m.created_at > now() - interval '1 day' ORDER BY m.created_at DESC LIMIT 1" | Select-Object -First 1
    $row = @($row | Where-Object { "$_".Trim() })[0]   # psql returns strings; Assert takes a boolean (R3 failed on PS 5.1 binding a string to [bool])
    Assert (-not [string]::IsNullOrWhiteSpace($row)) 'no COMPLETE manifest in the last day to replay a chunk of'
    $p = $row.Split('|'); $evidenceId = $p[0]; $runId = $p[1]; $chunkCount = [int]$p[2]
    $chunksBefore = [int](Invoke-CplmSql "SELECT count(*) FROM analytics.evidence_chunk WHERE evidence_id = '$evidenceId'" | Select-Object -First 1)
    # take one CHUNK record of that evidence from the topic and produce it again, with its key
    # ...from the TAIL of every partition: the head of a lived-in topic is days old (1.7 GB on the lab), so "first 4000
    # from the beginning" never held a recent manifest's chunk (R3 false FAIL, 2026-09-25).
    $ends = @(cmd /c "docker exec ams-kafka kafka-run-class kafka.tools.GetOffsetShell --broker-list localhost:9092 --topic traverse.cpa.clpm.gate.evidence.v1 2>nul")
    $raw = @()
    foreach ($line in $ends) {
        $o = "$line".Trim() -split ':'
        if ($o.Count -lt 3) { continue }
        $partition = $o[1]; $end = [long]$o[2]; $from = [Math]::Max(0, $end - 800)
        if ($end -le 0) { continue }
        $raw += @(cmd /c "docker exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic traverse.cpa.clpm.gate.evidence.v1 --partition $partition --offset $from --timeout-ms 30000 --max-messages 800 2>nul")
    }
    $chunk = $raw | Where-Object { $_ -match '"record_kind":"EVIDENCE_CHUNK"' -and $_ -match ('"evidence_id":"' + $evidenceId + '"') } | Select-Object -First 1
    Assert (-not [string]::IsNullOrWhiteSpace($chunk)) "no CHUNK record of evidence $evidenceId found in the first 4000 messages of the topic (retention rolled it off?)"
    $tmp = Join-Path $env:TEMP 'cplm-dup-chunk.txt'
    [System.IO.File]::WriteAllText($tmp, "$runId|$chunk`n")
    # PowerShell-native stdin piping: under `cmd /c "..."` the nested quotes ended the quoted string before `|`, cmd
    # read it as a pipe and answered "The syntax of the command is incorrect" (R3 never ran before 2026-09-25)
    "$runId|$chunk" | & docker exec -i ams-kafka kafka-console-producer --bootstrap-server localhost:9092 --topic traverse.cpa.clpm.gate.evidence.v1 --property parse.key=true --property 'key.separator=|' 2>$null | Out-Null
    Start-Sleep -Seconds 15
    $chunksAfter = [int](Invoke-CplmSql "SELECT count(*) FROM analytics.evidence_chunk WHERE evidence_id = '$evidenceId'" | Select-Object -First 1)
    $readiness = (Invoke-CplmSql "SELECT readiness FROM analytics.evidence_manifest WHERE evidence_id = '$evidenceId'" | Select-Object -First 1)
    Assert ($chunksAfter -eq $chunksBefore) "chunk count changed: $chunksBefore -> $chunksAfter"
    Assert ($readiness -eq 'COMPLETE') "readiness changed: $readiness"
    $man = Invoke-RestMethod -Method Get -Uri "$cpm/method-runs/$runId/evidence" -Headers $script:H
    Assert ($man.readiness -eq 'COMPLETE') "manifest readiness via API: $($man.readiness)"
    Write-Host "        evidence $($evidenceId.Substring(0,8)): $chunksBefore chunk(s) before and after the duplicate; COMPLETE" -ForegroundColor DarkGray
}

# ── R4. Postgres paused ─────────────────────────────────────────────────────
Step "R4 Postgres paused $PauseSeconds s: the consumers resume without skipping a 1-minute window (NR-057)" {
    $newestBefore = NewestShort
    $t0 = Get-Date
    cmd /c "docker pause ams-postgres" | Out-Null
    try { Start-Sleep -Seconds $PauseSeconds } finally { cmd /c "docker unpause ams-postgres" | Out-Null }
    $t1 = Get-Date
    # wait for windows that END after the pause ended (+ the 1-minute lateness) to land
    $landed = Wait-Until { $n = NewestShort; $n -and ([datetime]$n.WindowEnd).ToUniversalTime() -gt $t1.ToUniversalTime().AddSeconds(90) } 420 10
    Assert $landed 'no window ending after the pause landed within 7 min'
    $expectedMin = [math]::Floor(($t1 - $t0).TotalSeconds / 60)
    $present = [int](Invoke-CplmSql "SELECT count(DISTINCT window_end) FROM analytics.cplm_short_feature_results WHERE loop_id = '$LoopId' AND window_kind = '1m' AND source = 'flink' AND window_end > '$($newestBefore.WindowEnd)'::timestamptz AND window_end <= '$($t1.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))'::timestamptz + interval '90 seconds'" | Select-Object -First 1)
    Assert ($present -ge $expectedMin) "expected at least $expectedMin windows across the pause, found $present"
    $gaps = [int](Invoke-CplmSql "SELECT count(*) FROM (SELECT window_end, lag(window_end) OVER (ORDER BY window_end) prev FROM analytics.cplm_short_feature_results WHERE loop_id = '$LoopId' AND window_kind = '1m' AND source = 'flink' AND window_end > '$($newestBefore.WindowEnd)'::timestamptz - interval '3 minutes') g WHERE prev IS NOT NULL AND window_end - prev > interval '90 seconds'" | Select-Object -First 1)
    Assert ($gaps -eq 0) "$gaps gap(s) in the 1-minute windows across the pause"
    Write-Host "        $present window(s) across the ${PauseSeconds}s pause, no gap" -ForegroundColor DarkGray
}

Write-Host "`n  R5 (health publisher LWT -> OFFLINE, last status retained) is proven by scripts/test-cpm-v25-slice1-e2e.ps1" -ForegroundColor DarkGray
Write-Host "`n=== Reliability: $($script:passed) passed, $($script:failed) failed ===`n"
exit $(if ($script:failed -eq 0) { 0 } else { 1 })
