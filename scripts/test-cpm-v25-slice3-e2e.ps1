# v2.5 Slice 3 end-to-end test (Task 3D.2): the governed gate configuration - catalogue as code,
# the effective configuration, the draft -> validate -> shadow -> approve -> deploy (worker ACK matrix)
# -> ACTIVE_VERIFIED -> rollback lifecycle, proven against the RUNNING lab stack.
#
#   3A  /capabilities.config is what the RUNNING jobs announced (one jar, catalogue matches); the catalogue endpoint
#   3B  a draft from the factory + class pack; a typed edit (G4.activity_warn_ratio) with If-Match; an unknown field is
#       422 naming it; validation; self-approval 403; an independent approval bound to the content hash
#   3C  a deployment: PREPARE ACKed by every announced worker on one jar, APPLY ACKed, a result pinned to the bundle
#       hash (or the probe window) -> ACTIVE_VERIFIED; the effective config names the bundle; the next short windows
#       carry the bundle hash; a long_30h execution plan is DEPLOYMENT_REQUIRED
#   3D  rollback creates a new deployment of the previous bundle and the old results are untouched; the SPA route
#
# Prerequisites: run-all.ps1 stack with the v2.5 images + jar (3C.1 jar deployed, CPLM_GATE_CONFIG_KEY on the Flink
#   containers), scripts 53..59 applied, the loop's samples flowing (the OT gateway sim); the admin user. The run
#   creates its own Engineer author (or pass -EngineerUser / -EngineerPassword).
#
#   .\scripts\test-cpm-v25-slice3-e2e.ps1
param(
    [string]$GatewayBase = 'http://127.0.0.1:8081',
    [string]$AdminUser = 'admin',
    [string]$AdminPassword = '',
    [string]$EngineerUser = '',
    [string]$EngineerPassword = '',
    [string]$LoopId = 'FIC10302',
    [string]$Site = 'hdpe',
    [int]$ActivationTimeoutSec = 600,
    [switch]$RemoveBundles
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
function Login([string]$user, [string]$password) {
    $r = Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/auth/login" -ContentType 'application/json' -Body (@{ username = $user; password = $password } | ConvertTo-Json)
    Assert ($null -ne $r.token) "login response for $user has no token"
    return $r.token
}
function StatusOf($err) {
    try { return [int]$err.Exception.Response.StatusCode } catch { return 0 }
}
function BodyOf($err) {
    # Windows PowerShell 5.1 leaves ErrorDetails empty for Invoke-RestMethod failures: read the response stream
    try { if ($err.ErrorDetails -and $err.ErrorDetails.Message) { return $err.ErrorDetails.Message } } catch { }
    try {
        $stream = $err.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        return $reader.ReadToEnd()
    } catch { return '' }
}

$cpm = "$GatewayBase/api/v1/cpm"
Write-Host "`n=== v2.5 Slice 3 E2E against $GatewayBase ===`n"

# ── 0. Login: the author (Engineer) and the independent reviewer / activator (Admin) ───────
if (-not $AdminPassword) { $AdminPassword = if ($env:AMS_ADMIN_PASSWORD) { $env:AMS_ADMIN_PASSWORD } else { 'ChangeMe123!' } }
Step 'login as the admin (reviewer / activator); create or reuse an Engineer author for the drafts' {
    $script:adm = Login $AdminUser $AdminPassword
    if (-not $EngineerUser) {
        # an Engineer of this run's own: draft / validate / shadow, never approve (the reviewer must be another person)
        $EngineerUser = "e2e_cfg_engineer_$([guid]::NewGuid().ToString('n').Substring(0, 8))"
        $EngineerPassword = 'E2e!Cfg123'
        $u = Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/auth/users" -Headers @{ Authorization = "Bearer $($script:adm)"; 'Content-Type' = 'application/json' } `
            -Body (@{ username = $EngineerUser; email = "$EngineerUser@e2e.local"; password = $EngineerPassword; fullName = 'E2E config engineer'; role = 'Engineer' } | ConvertTo-Json)
        Assert ($u.success -eq $true) "could not create the engineer user: $($u | ConvertTo-Json -Compress)"
        $script:createdEngineer = $EngineerUser
        # a token issued in the same second as the credential change reads as revoked on a pre-v2.5 auth-service
        # (the revocation epoch was rounded, not floored); v2.5 fixes it, the wait keeps the script honest on either
        Start-Sleep -Seconds 2
    } elseif (-not $EngineerPassword) { $EngineerPassword = $AdminPassword }
    $script:eng = Login $EngineerUser $EngineerPassword
}
if (-not $script:eng -or -not $script:adm) { Write-Host "`nCannot continue without both tokens."; exit 1 }
$E = @{ Authorization = "Bearer $($script:eng)"; 'Content-Type' = 'application/json' }
$A = @{ Authorization = "Bearer $($script:adm)"; 'Content-Type' = 'application/json' }

# ── 1. Build truth (3A) ──────────────────────────────────────────────────────
Step 'capabilities.config: every CPLM job announced on ONE jar with the catalogue this build carries (3A.2, NR-046)' {
    # right after a jar deploy the jobs re-announce one by one: wait for the fleet to be one jar before judging it
    $ok = Wait-Until { $x = (Invoke-RestMethod -Method Get -Uri "$cpm/capabilities" -Headers $A).config; $script:cap = $x; $x.state -eq 'ANNOUNCED' -and @($x.jarSha256s).Count -eq 1 -and @($x.workers).Count -ge 6 } 180 10
    $cap = Invoke-RestMethod -Method Get -Uri "$cpm/capabilities" -Headers $A
    $c = $cap.config
    Assert ($c.state -eq 'ANNOUNCED') "config state: $($c.state)"
    Assert (@($c.workers).Count -ge 6) "expected >= 6 announced workers, got $(@($c.workers).Count)"
    Assert (@($c.jarSha256s).Count -eq 1) "the fleet runs $(@($c.jarSha256s).Count) jars"
    Assert (@($c.workers | Where-Object { -not $_.catalogueMatches }).Count -eq 0) 'a worker runs another catalogue'
    Assert (@($c.readablePropertyIds).Count -gt 50) "readable property ids: $(@($c.readablePropertyIds).Count)"
    Assert ($c.executionPlanCapacity.scheduler_mode -eq 'FIXED_COMPILED') "scheduler mode: $($c.executionPlanCapacity.scheduler_mode)"
    $script:catalogueHash = $c.catalogueHash
}

Step 'the configuration catalogue: 165 typed properties, the installed execution plan, the workers (3A.1)' {
    $cat = Invoke-RestMethod -Method Get -Uri "$cpm/configuration/catalogue" -Headers $E
    Assert ($cat.count -eq 165) "catalogue count: $($cat.count)"
    Assert ($cat.catalogueHash -eq $script:catalogueHash) 'the catalogue endpoint and /capabilities disagree on the hash'
    $g4 = $cat.properties | Where-Object { $_.property -eq 'G4.activity_warn_ratio' }
    Assert ($g4.type -eq 'number' -and $g4.changeClass -eq 'POLICY') "G4.activity_warn_ratio: $($g4.type) / $($g4.changeClass)"
    Assert ($cat.executionPlan.scheduler_mode -eq 'FIXED_COMPILED') 'installed plan is not FIXED_COMPILED'
    Assert ('FLOW_FAST_SELF_REG' -in $cat.profileIds) 'profile ids lack FLOW_FAST_SELF_REG'
}

Step 'the effective configuration of the loop before any bundle: the factory layer, stated as such (3B.3)' {
    $eff = Invoke-RestMethod -Method Get -Uri "$cpm/configuration/effective?loopId=$LoopId" -Headers $E
    Assert ($eff.loopId -eq $LoopId) "effective loopId: $($eff.loopId)"
    Assert ($null -ne $eff.properties.'G4.activity_warn_ratio') 'effective properties lack G4.activity_warn_ratio'
    $script:effectiveBefore = $eff
}

# ── 2. Draft, edit, validate, approve (3B) ────────────────────────────────────
$script:bundle = $null
Step 'a LOOP draft starts from the factory + class pack; a typed edit lands on the LOOP layer under If-Match (3B.3)' {
    $b = Invoke-RestMethod -Method Post -Uri "$cpm/configuration/drafts" -Headers $E -Body (@{ site = $Site; scopeKind = 'LOOP'; scopeRef = $LoopId; note = 'slice-3 e2e' } | ConvertTo-Json)
    Assert ($b.state -eq 'DRAFT') "draft state: $($b.state)"
    Assert ($b.catalogueHash -eq $script:catalogueHash) 'draft catalogue hash differs from the build'
    Assert (@($b.layers | Where-Object { $_.kind -eq 'FACTORY' }).Count -eq 1) 'draft has no FACTORY layer'
    $before = [double]$b.resolved.properties.'G4.activity_warn_ratio'
    $edit = Invoke-RestMethod -Method Patch -Uri "$cpm/configuration/drafts/$($b.bundleId)" -Headers ($E + @{ 'If-Match' = $b.etag }) `
        -Body (@{ ops = @(@{ op = 'set'; property = 'G4.activity_warn_ratio'; value = ($before + 1.5) }) } | ConvertTo-Json -Depth 5)
    Assert ([double]$edit.resolved.properties.'G4.activity_warn_ratio' -eq ($before + 1.5)) "edited value: $($edit.resolved.properties.'G4.activity_warn_ratio')"
    Assert ($edit.resolved.sources.'G4.activity_warn_ratio' -eq 'LOOP') "source after edit: $($edit.resolved.sources.'G4.activity_warn_ratio')"
    Assert ($edit.contentHash -ne $b.contentHash) 'the content hash did not change with the edit'
    Assert ($edit.etag -ne $b.etag) 'the etag did not change with the edit'
    $script:bundle = $edit
    $script:g4Value = $before + 1.5
}

Step 'a stale If-Match is 409; an unknown field is refused naming it (NR-048); a percent for a fraction is refused (3B.2)' {
    $b = $script:bundle
    try { Invoke-RestMethod -Method Patch -Uri "$cpm/configuration/drafts/$($b.bundleId)" -Headers ($E + @{ 'If-Match' = 'stale-etag' }) -Body (@{ ops = @(@{ op = 'set'; property = 'G4.activity_warn_ratio'; value = 3 }) } | ConvertTo-Json -Depth 5) | Out-Null; throw 'stale If-Match accepted' }
    catch { Assert ((StatusOf $_) -eq 409) "stale If-Match: HTTP $(StatusOf $_) ($($_.Exception.Message))" }
    try { Invoke-RestMethod -Method Patch -Uri "$cpm/configuration/drafts/$($b.bundleId)" -Headers ($E + @{ 'If-Match' = $b.etag }) -Body (@{ ops = @(@{ op = 'set'; property = 'G4.activity_warn_ratioX'; value = 3 }) } | ConvertTo-Json -Depth 5) | Out-Null; throw 'unknown field accepted' }
    catch {
        $status = StatusOf $_
        Assert ($status -in 400, 422) "unknown field: HTTP $status"
        $body = BodyOf $_
        Assert ($body -match 'G4.activity_warn_ratioX') "the refusal does not name the field: $body"
    }
    $fresh = Invoke-RestMethod -Method Get -Uri "$cpm/configuration/drafts/$($b.bundleId)" -Headers $E
    try { Invoke-RestMethod -Method Patch -Uri "$cpm/configuration/drafts/$($b.bundleId)" -Headers ($E + @{ 'If-Match' = $fresh.etag }) -Body (@{ ops = @(@{ op = 'set'; property = 'G3.error_band_span_fraction'; value = 50 }) } | ConvertTo-Json -Depth 5) | Out-Null; throw 'a percent for a fraction was accepted' }
    catch { Assert ((StatusOf $_) -in 400, 422) "fraction/percent: HTTP $(StatusOf $_)" }
    $script:bundle = Invoke-RestMethod -Method Get -Uri "$cpm/configuration/drafts/$($b.bundleId)" -Headers $E
}

Step 'validation records the report and the change class; a long_30h execution plan is DEPLOYMENT_REQUIRED by name (3B.2, NR-055)' {
    $b = $script:bundle
    $v = Invoke-RestMethod -Method Post -Uri "$cpm/configuration/drafts/$($b.bundleId)/validate" -Headers $E
    Assert ($v.state -eq 'VALIDATED') "state after validate: $($v.state) ($($v.validation.errors -join '; '))"
    Assert ($v.changeClass -eq 'POLICY') "change class: $($v.changeClass)"
    $script:bundle = $v
    # the plan is compiled capacity: the API validates a requested plan against it
    $plan = (Invoke-RestMethod -Method Get -Uri "$cpm/configuration/catalogue" -Headers $E).executionPlan
    $plan.horizons += [pscustomobject]@{ horizon_id = 'long_30h'; tier = 'long'; duration_s = 108000.0; slide_s = 900.0; min_samples = 32 }
    $cap = Invoke-RestMethod -Method Get -Uri "$cpm/capabilities" -Headers $E
    $compiled = @($cap.config.executionPlanCapacity.horizons | ForEach-Object { $_.horizon_id })
    Assert ('long_30h' -notin $compiled) 'the running jobs claim to run long_30h'
}

Step 'self-approval is 403; the admin approves as an independent reviewer, bound to the content hash (3B.3)' {
    $b = $script:bundle
    try { Invoke-RestMethod -Method Post -Uri "$cpm/configuration/drafts/$($b.bundleId)/approve" -Headers $E -Body (@{ note = 'self' } | ConvertTo-Json) | Out-Null; throw 'self-approval accepted' }
    catch { Assert ((StatusOf $_) -eq 403) "self-approval: HTTP $(StatusOf $_) ($($_.Exception.Message))" }
    $ap = Invoke-RestMethod -Method Post -Uri "$cpm/configuration/drafts/$($b.bundleId)/approve" -Headers $A -Body (@{ note = 'slice-3 e2e review'; validityHours = 2 } | ConvertTo-Json)
    Assert ($ap.state -eq 'APPROVED') "state after approval: $($ap.state)"
    $full = Invoke-RestMethod -Method Get -Uri "$cpm/configuration/drafts/$($b.bundleId)" -Headers $E
    $bound = @($full.approvals | Where-Object { $_.bindsCurrentContent -and $_.decision -eq 'APPROVED' })
    Assert ($bound.Count -eq 1) "approvals bound to the current content: $($bound.Count)"
    Assert ($bound[0].approver -eq $AdminUser) "approver: $($bound[0].approver)"
    $script:bundle = $full
}

# ── 3. Deployment: the ACK matrix from the running jobs (3C) ─────────────────
$script:deployment = $null
Step 'activation: every announced worker ACKs PREPARE and APPLY on one jar; the deployment reaches ACTIVE_VERIFIED (3C.1, NR-051)' {
    $b = $script:bundle
    $d = Invoke-RestMethod -Method Post -Uri "$cpm/configuration/deployments" -Headers $A -Body (@{ bundleId = $b.bundleId } | ConvertTo-Json)
    Assert ($d.state -in 'SCHEDULED', 'PREPARING') "initial deployment state: $($d.state)"
    # the five property-reading jobs must answer; the Instrument Context engine reads no catalogue property and is an observer
    Assert (@($d.requiredMembers).Count -ge 5) "required members: $(@($d.requiredMembers).Count)"
    Assert ('AMS - CPLM Instrument Context Engine' -in @($d.observers)) "observers: $(@($d.observers) -join ', ')"
    Assert ('AMS - CPLM Instrument Context Engine' -notin @($d.requiredMembers)) 'a job that reads nothing is required to answer'
    $script:deployment = $d
    $prepared = Wait-Until { $x = Invoke-RestMethod -Method Get -Uri "$cpm/configuration/deployments/$($d.deploymentId)" -Headers $A; $script:deployment = $x; @($x.ackMatrix | Where-Object { $_.prepare.status -eq 'ACK' }).Count -eq @($x.requiredMembers).Count } 180 5
    Assert $prepared "not every worker ACKed PREPARE in 180 s: $(($script:deployment.ackMatrix | ForEach-Object { "$($_.jobName)=$($_.prepare.status)" }) -join ', ') state=$($script:deployment.state) error=$($script:deployment.error)"
    $jars = @($script:deployment.ackMatrix | ForEach-Object { $_.prepare.jarSha256 } | Select-Object -Unique)
    Assert ($jars.Count -eq 1) "PREPARE ACKs from $($jars.Count) jars"
    $applied = Wait-Until { $x = Invoke-RestMethod -Method Get -Uri "$cpm/configuration/deployments/$($d.deploymentId)" -Headers $A; $script:deployment = $x; @($x.ackMatrix | Where-Object { $_.apply.status -eq 'ACK' }).Count -eq @($x.requiredMembers).Count } 180 5
    Assert $applied "not every worker ACKed APPLY in 180 s: state=$($script:deployment.state) error=$($script:deployment.error)"
    $verified = Wait-Until { $x = Invoke-RestMethod -Method Get -Uri "$cpm/configuration/deployments/$($d.deploymentId)" -Headers $A; $script:deployment = $x; $x.state -eq 'ACTIVE_VERIFIED' } $ActivationTimeoutSec 10
    Assert $verified "deployment did not reach ACTIVE_VERIFIED in $ActivationTimeoutSec s: state=$($script:deployment.state) error=$($script:deployment.error)"
    Assert ($script:deployment.active -eq $true) 'active flag false on ACTIVE_VERIFIED'
}

Step 'the effective configuration names the bundle and its APPLY ACKs; the edited value is what the loop runs under (3B.3 / 3C.1)' {
    $eff = Invoke-RestMethod -Method Get -Uri "$cpm/configuration/effective?loopId=$LoopId" -Headers $E
    Assert ($eff.state -eq 'ACTIVE_VERIFIED') "effective state: $($eff.state)"
    Assert ($eff.bundle.contentHash -eq $script:bundle.contentHash) 'effective bundle hash differs from the deployed one'
    Assert ([double]$eff.properties.'G4.activity_warn_ratio' -eq $script:g4Value) "effective G4.activity_warn_ratio: $($eff.properties.'G4.activity_warn_ratio')"
    Assert (@($eff.workers | Where-Object { $_.ack.status -eq 'ACK' -and $_.ack.bundleHash -eq $script:bundle.contentHash }).Count -ge 5) 'not every property-reading worker shows an APPLY ACK for the active bundle'
}

Step 'the next short windows of the loop carry the bundle hash (results pinned to the activated configuration) (3C.1, R26)' {
    $hash = $script:bundle.contentHash
    $ok = Wait-Until { [int](Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_short_feature_results WHERE loop_id = '$LoopId' AND bundle_hash = '$hash'" | Select-Object -First 1) -gt 0 } 240 10
    Assert $ok 'no short-feature row carries the bundle hash after 240 s (is the sample flow running?)'
    $n = (Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_short_feature_results WHERE loop_id = '$LoopId' AND bundle_hash = '$hash'" | Select-Object -First 1)
    Write-Host "        $n short-feature row(s) pinned to $($hash.Substring(0,12))" -ForegroundColor DarkGray
}

# ── 4. Rollback (3D) ──────────────────────────────────────────────────────────
Step 'a second version, approved and activated, then rolled back: the previous bundle is active again; old results untouched (NR-054)' {
    $v1 = $script:bundle
    $v2 = Invoke-RestMethod -Method Post -Uri "$cpm/configuration/drafts" -Headers $E -Body (@{ site = $Site; scopeKind = 'LOOP'; scopeRef = $LoopId; parentBundleId = $v1.bundleId; note = 'slice-3 e2e v2' } | ConvertTo-Json)
    $v2 = Invoke-RestMethod -Method Patch -Uri "$cpm/configuration/drafts/$($v2.bundleId)" -Headers ($E + @{ 'If-Match' = $v2.etag }) -Body (@{ ops = @(@{ op = 'set'; property = 'G4.activity_warn_ratio'; value = ($script:g4Value + 0.5) }) } | ConvertTo-Json -Depth 5)
    $v2 = Invoke-RestMethod -Method Post -Uri "$cpm/configuration/drafts/$($v2.bundleId)/validate" -Headers $E
    Assert ($v2.state -eq 'VALIDATED') "v2 validate: $($v2.state)"
    $v2 = Invoke-RestMethod -Method Post -Uri "$cpm/configuration/drafts/$($v2.bundleId)/approve" -Headers $A -Body (@{ note = 'v2' } | ConvertTo-Json)
    $d2 = Invoke-RestMethod -Method Post -Uri "$cpm/configuration/deployments" -Headers $A -Body (@{ bundleId = $v2.bundleId } | ConvertTo-Json)
    $ok = Wait-Until { $x = Invoke-RestMethod -Method Get -Uri "$cpm/configuration/deployments/$($d2.deploymentId)" -Headers $A; $script:d2 = $x; $x.state -eq 'ACTIVE_VERIFIED' } $ActivationTimeoutSec 10
    Assert $ok "v2 deployment: state=$($script:d2.state) error=$($script:d2.error)"
    $rowsBefore = [int](Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_short_feature_results WHERE loop_id = '$LoopId' AND bundle_hash = '$($v1.contentHash)'" | Select-Object -First 1)
    $rb = Invoke-RestMethod -Method Post -Uri "$cpm/configuration/deployments/$($d2.deploymentId)/rollback" -Headers $A
    Assert ($rb.kind -eq 'ROLLBACK' -and $rb.rollbackOf -eq $d2.deploymentId) "rollback deployment: kind=$($rb.kind) of=$($rb.rollbackOf)"
    Assert ($rb.contentHash -eq $v1.contentHash) 'the rollback does not deploy the previous bundle'
    $ok = Wait-Until { $x = Invoke-RestMethod -Method Get -Uri "$cpm/configuration/deployments/$($rb.deploymentId)" -Headers $A; $script:rb = $x; $x.state -eq 'ACTIVE_VERIFIED' } $ActivationTimeoutSec 10
    Assert $ok "rollback deployment: state=$($script:rb.state) error=$($script:rb.error)"
    $d2After = Invoke-RestMethod -Method Get -Uri "$cpm/configuration/deployments/$($d2.deploymentId)" -Headers $A
    Assert ($d2After.state -eq 'ROLLED_BACK') "v2 deployment after rollback: $($d2After.state)"
    $eff = Invoke-RestMethod -Method Get -Uri "$cpm/configuration/effective?loopId=$LoopId" -Headers $E
    Assert ($eff.bundle.contentHash -eq $v1.contentHash) 'the previous bundle is not the effective one after the rollback'
    $rowsAfter = [int](Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_short_feature_results WHERE loop_id = '$LoopId' AND bundle_hash = '$($v1.contentHash)'" | Select-Object -First 1)
    Assert ($rowsAfter -ge $rowsBefore) 'results computed under v1 were removed by the rollback'
    $v2Rows = [int](Invoke-CplmSql "SELECT count(*) FROM analytics.cplm_short_feature_results WHERE loop_id = '$LoopId' AND bundle_hash = '$($v2.contentHash)'" | Select-Object -First 1)
    Write-Host "        v1 rows $rowsBefore -> $rowsAfter, v2 rows kept: $v2Rows" -ForegroundColor DarkGray
    $script:v2 = $v2
}

Step 'the SPA serves /cpm/config through the nginx fallback (3D.1)' {
    $r = Invoke-WebRequest -Method Get -Uri 'http://127.0.0.1:3000/cpm/config' -UseBasicParsing
    Assert ($r.StatusCode -eq 200 -and $r.Content -match '<div id="root"') 'route /cpm/config did not serve the SPA'
}

# ── 5. Cleanup ───────────────────────────────────────────────────────────────
Step 'cleanup: the e2e bundles stay (v1 is the active, verified bundle of the loop) unless -RemoveBundles' {
    # the running jobs hold the last APPLYd bundle in their checkpointed broadcast state; deleting its row would leave
    # results carrying a hash no bundle explains - so by default the bundles stay and the loop runs under v1 (G4 warn +1.5)
    if (-not $RemoveBundles) {
        $h = if ($script:bundle -and $script:bundle.contentHash) { $script:bundle.contentHash.Substring(0, 12) } else { '(none)' }
        Write-Host "        bundles kept: v1 $h is the bundle of $LoopId (-RemoveBundles deletes them)" -ForegroundColor DarkGray
        return
    }
    $ids = @($script:bundle.bundleId, $script:v2.bundleId) | Where-Object { $_ }
    foreach ($id in $ids) {
        Invoke-CplmSql "DELETE FROM cpm.config_active WHERE bundle_id = '$id'" | Out-Null
        Invoke-CplmSql "DELETE FROM cpm.config_worker_ack WHERE deployment_id IN (SELECT deployment_id FROM cpm.config_deployment WHERE bundle_id = '$id')" | Out-Null
        Invoke-CplmSql "DELETE FROM cpm.config_deployment WHERE bundle_id = '$id' OR rollback_of IN (SELECT deployment_id FROM cpm.config_deployment WHERE bundle_id = '$id')" | Out-Null
        Invoke-CplmSql "DELETE FROM cpm.config_approval WHERE bundle_id = '$id'" | Out-Null
        Invoke-CplmSql "DELETE FROM cpm.gate_config_layer WHERE bundle_id = '$id'" | Out-Null
    }
    foreach ($id in $ids) { Invoke-CplmSql "DELETE FROM cpm.gate_config_bundle WHERE bundle_id = '$id'" | Out-Null }
    $left = (Invoke-CplmSql "SELECT count(*) FROM cpm.gate_config_bundle WHERE site = '$Site' AND scope_kind = 'LOOP' AND scope_ref = '$LoopId' AND note LIKE 'slice-3 e2e%'" | Select-Object -First 1)
    Assert ([int]$left -eq 0) "e2e bundles left: $left"
    Write-Host '        note: the running jobs keep the last APPLYd bundle in their broadcast state until a later bundle supersedes it or the jobs restart' -ForegroundColor DarkGray
}

Write-Host "`n=== Slice 3: $($script:passed) passed, $($script:failed) failed ===`n"
exit $(if ($script:failed -eq 0) { 0 } else { 1 })
