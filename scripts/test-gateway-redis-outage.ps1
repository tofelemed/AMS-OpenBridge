<#
.SYNOPSIS
  Lab proof of the gateway's rate-limiter failure semantics (GW-03, rewritten 2026-09-17):
  Redis is PAUSED mid-session (a stall, the worst case - connections hang instead of failing) and
  the gateway must keep the plant working: token refresh succeeds, reads flow, every request stays
  bounded, login stays capped from the in-process counters, the circuit opens - and closes again
  once Redis is back.

.DESCRIPTION
  Steps (each PASS / FAIL, exit 1 on any FAIL):
    1. login + baseline: a read, a refresh, /gw/ratelimit reports decisions from redis
    2. docker pause ams-redis
    3. during the pause: a refresh → 200 (session class fails OPEN; X-RateLimit-Source open/local)
       reads → 200, each under -MaxLatencyMs
       wrong-password logins beyond LoginPerMinutePerIp → 429 (fail-CLOSED enforced in-process, not deny-all)
       /gw/ratelimit → circuitOpen true, local/open decisions counted
    4. docker unpause ams-redis; within CircuitOpenSeconds + 10 the circuit closes and decisions come from redis again
    5. the session created in step 1 is still alive: a refresh after the outage → 200

  Pausing ams-redis also stalls the other Redis users on the lab for ~PauseSeconds; run it on the lab only.

.EXAMPLE
  .\scripts\test-gateway-redis-outage.ps1 -AdminPassword 'ChangeMe123!'            # stall (pause)
  .\scripts\test-gateway-redis-outage.ps1 -AdminPassword 'ChangeMe123!' -Mode Stop  # outage (stop)
#>
[CmdletBinding()]
param(
    [string]$GatewayBase = 'http://localhost:8081',
    [string]$AdminUser = 'admin',
    [string]$AdminPassword = '',
    [string]$RedisContainer = 'ams-redis',
    [int]$PauseSeconds = 25,
    [int]$MaxLatencyMs = 1000,
    [int]$LoginLimitPerMinute = 10,
    [int]$CircuitOpenSeconds = 30,
    # Pause = a stall (connections hang: the worst case); Stop = an outage (connections refused)
    [ValidateSet('Pause', 'Stop')][string]$Mode = 'Pause'
)

$ErrorActionPreference = 'Stop'
$script:failed = 0
$script:passed = 0
if (-not $AdminPassword) { $AdminPassword = $env:UI_PASS }
if (-not $AdminPassword) { throw 'pass -AdminPassword (or set UI_PASS)' }

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
function StatusOf($err) { try { return [int]$err.Exception.Response.StatusCode } catch { return 0 } }
function HeaderOf($response, [string]$name) { try { return [string]$response.Headers[$name] } catch { return '' } }

# One web session carries the refresh cookie (httpOnly) across calls, exactly as the browser does.
$script:session = $null
$script:token = $null

function Timed([scriptblock]$call) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try { $r = & $call; $sw.Stop(); return @{ ok = $true; ms = $sw.ElapsedMilliseconds; response = $r; status = [int]$r.StatusCode } }
    catch { $sw.Stop(); return @{ ok = $false; ms = $sw.ElapsedMilliseconds; status = (StatusOf $_); error = $_ } }
}
function Login() {
    $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$GatewayBase/api/auth/login" -ContentType 'application/json' `
        -Body (@{ username = $AdminUser; password = $AdminPassword } | ConvertTo-Json) -SessionVariable s
    $script:session = $s
    $script:token = ($r.Content | ConvertFrom-Json).token
    Assert ($null -ne $script:token) 'login returned no token'
}
function Refresh() {
    return Timed { Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$GatewayBase/api/auth/refresh" -ContentType 'application/json' -Body '{}' -WebSession $script:session }
}
function Read([string]$path) {
    return Timed { Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$GatewayBase$path" -Headers @{ Authorization = "Bearer $($script:token)" } }
}
function WrongLogin() {
    return Timed { Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$GatewayBase/api/auth/login" -ContentType 'application/json' -Body (@{ username = 'no-such-user'; password = 'x' } | ConvertTo-Json) }
}
function RateLimitStatus() { return Invoke-RestMethod -Uri "$GatewayBase/gw/ratelimit" }
function Wait-Until([scriptblock]$probe, [int]$timeoutSec, [int]$everySec = 2) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    do { try { if (& $probe) { return $true } } catch { }; Start-Sleep -Seconds $everySec } while ((Get-Date) -lt $deadline)
    return $false
}

Write-Host "`n=== Gateway rate limiter under a Redis $($Mode.ToLower()) ($RedisContainer, $Mode for ~$PauseSeconds s) ===`n"

Step 'login + baseline: read and refresh answered from Redis counters' {
    Login
    $r = Read '/api/v1/cpm/loops'
    Assert ($r.ok -and $r.status -eq 200) "baseline read failed: status $($r.status)"
    Assert ((HeaderOf $r.response 'X-RateLimit-Source') -eq 'redis') "baseline read decided by '$(HeaderOf $r.response 'X-RateLimit-Source')', expected redis"
    $f = Refresh
    Assert ($f.ok -and $f.status -eq 200) "baseline refresh failed: status $($f.status)"
    $script:token = ($f.response.Content | ConvertFrom-Json).token
    $st = RateLimitStatus
    Assert (-not $st.redis.circuitOpen) 'circuit must be closed before the outage'
    Assert ($st.decisions.redis -gt 0) 'no redis decisions counted'
}

try { $script:before = RateLimitStatus } catch { $script:before = @{ decisions = @{ open = 0; local = 0 } } }   # an older gateway has no /gw/ratelimit
Step "$Mode $RedisContainer ($(if ($Mode -eq 'Pause') { 'a stall: connections hang' } else { 'an outage: connections refused' }))" {
    if ($Mode -eq 'Pause') { docker pause $RedisContainer | Out-Null } else { docker stop $RedisContainer | Out-Null }
    Start-Sleep -Seconds 1
}

Step 'during the stall: token refresh succeeds (session class fails OPEN) and is bounded' {
    $f = Refresh
    Assert ($f.ok -and $f.status -eq 200) "refresh during the stall: status $($f.status) - the session would have ended"
    Assert ($f.ms -lt $MaxLatencyMs) "refresh took $($f.ms) ms (max $MaxLatencyMs)"
    $src = HeaderOf $f.response 'X-RateLimit-Source'
    Assert ($src -eq 'open' -or $src -eq 'local') "refresh decided by '$src', expected open/local (Redis is paused)"
    $script:token = ($f.response.Content | ConvertFrom-Json).token
}

Step 'during the stall: 10 reads all 200, each bounded at the gateway, none decided by Redis' {
    # /api/auth/me is a cheap read (auth-service answers in ms): what it costs is the gateway's own overhead
    $times = @()
    for ($i = 0; $i -lt 10; $i++) {
        $r = Read '/api/auth/me'
        Assert ($r.ok -and $r.status -eq 200) "read $i failed: status $($r.status)"
        $times += $r.ms
        $src = HeaderOf $r.response 'X-RateLimit-Source'
        Assert ($src -ne 'redis') "read $i decided by Redis while it is paused"
    }
    $worst = ($times | Measure-Object -Maximum).Maximum
    Write-Host "        read latencies ms: $($times -join ' ')"
    Assert ($worst -lt $MaxLatencyMs) "worst read $worst ms (max $MaxLatencyMs)"
    $big = Read '/api/v1/cpm/loops'
    Assert ($big.ok -and $big.status -eq 200) "fleet read failed: status $($big.status)"
}

Step 'during the stall: the circuit is open and decisions are local/open' {
    $st = RateLimitStatus
    Assert ($st.redis.circuitOpen) 'circuit is not open'
    Assert (($st.decisions.open + $st.decisions.local) -gt ($script:before.decisions.open + $script:before.decisions.local)) 'no local/open decisions counted'
}

Step "during the stall: login stays capped at $LoginLimitPerMinute/min from the in-process counters (never deny-all)" {
    $codes = @()
    for ($i = 0; $i -lt ($LoginLimitPerMinute + 2); $i++) { $codes += (WrongLogin).status }
    Write-Host "        login statuses: $($codes -join ' ')"
    $first = $codes[0..($LoginLimitPerMinute - 1)]
    # auth-service answers a bad credential with 400 / 401 - either proves the attempt reached it
    Assert (($first | Where-Object { $_ -eq 401 -or $_ -eq 400 }).Count -eq $LoginLimitPerMinute) "the first $LoginLimitPerMinute attempts must reach auth-service (400/401), got: $($first -join ' ')"
    Assert ($codes[$LoginLimitPerMinute] -eq 429 -and $codes[$LoginLimitPerMinute + 1] -eq 429) 'attempts beyond the limit must be 429 from the local counters'
}

Step "bring $RedisContainer back" {
    if ($Mode -eq 'Pause') { docker unpause $RedisContainer | Out-Null } else { docker start $RedisContainer | Out-Null }
}

Step "after the outage: the circuit closes within $($CircuitOpenSeconds + 10) s and decisions come from Redis again" {
    $closed = Wait-Until {
        $r = Read '/api/v1/cpm/loops/FIC10302/gates/latest'
        $r.ok -and (HeaderOf $r.response 'X-RateLimit-Source') -eq 'redis' -and -not (RateLimitStatus).redis.circuitOpen
    } ($CircuitOpenSeconds + 10)
    Assert $closed 'circuit did not close after Redis returned'
    $st = RateLimitStatus
    Assert ($st.redis.trips -ge 1) 'the breaker never tripped (the stall was not seen?)'
    Write-Host "        trips $($st.redis.trips) · decisions redis $($st.decisions.redis) local $($st.decisions.local) open $($st.decisions.open) denied $($st.decisions.denied)"
}

Step 'after the outage: the session that lived through it still refreshes' {
    $f = Refresh
    Assert ($f.ok -and $f.status -eq 200) "post-outage refresh failed: status $($f.status)"
    Assert ((HeaderOf $f.response 'X-RateLimit-Source') -eq 'redis') 'post-outage refresh not decided by Redis'
}

Write-Host "`n=== Gateway Redis outage: $($script:passed) passed, $($script:failed) failed ===`n"
exit $(if ($script:failed -eq 0) { 0 } else { 1 })
