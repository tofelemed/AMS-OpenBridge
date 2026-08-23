# End-to-end test for the OT data-source configuration feature (ingestion-service phase 1).
#
# Exercises the full chain: gateway route -> edge auth (ingestion.* permissions) ->
# ingestion-service CRUD -> credential encryption -> live MQTT connection test against
# the broker at -BrokerUrl (default: the host Mosquitto via host.docker.internal).
#
#   .\scripts\test-ingestion-config-e2e.ps1                      # spins up the authenticated mosquitto-test container
#   .\scripts\test-ingestion-config-e2e.ps1 -BrokerUrl mqtt://host.docker.internal:1883 -SkipTestBroker   # host Mosquitto
#   .\scripts\test-ingestion-config-e2e.ps1 -BrokerUrl mqtts://192.168.190.91:8883 -BrokerUser gateway -BrokerPassword secret -SkipTestBroker
#
# Requires the docker stack up (gateway :8081) and an Admin login.
param(
    [string]$GatewayBase = 'http://localhost:8081',
    [string]$AdminUser = 'admin',
    [string]$AdminPassword = '',
    [string]$BrokerUrl = 'mqtt://mosquitto-test:1883',
    [string]$BrokerUser = 'ams_ingest',
    [string]$BrokerPassword = 'ams-ingest-test',
    [switch]$SkipTestBroker,
    [switch]$KeepBroker
)

$ErrorActionPreference = 'Stop'
$script:failed = 0
$script:passed = 0

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
    $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'infra\docker\.env'
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^AUTH_BOOTSTRAP_PASSWORD=' } | Select-Object -First 1
        if ($line) { $AdminPassword = $line.Split('=', 2)[1] }
    }
    if (-not $AdminPassword) { $AdminPassword = 'ChangeMe123!' }
}

$base = "$GatewayBase/api/ingestion"
Write-Host "`n=== Ingestion data-source config E2E ===" -ForegroundColor Cyan
Write-Host "gateway: $GatewayBase | broker under test: $BrokerUrl`n"

# ── Test broker lifecycle (authenticated mosquitto-test container) ───────────
$composeDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'infra\docker'
$script:startedBroker = $false
if (-not $SkipTestBroker) {
    Write-Host "starting mosquitto-test broker (docker compose --profile mqtt-test)..."
    Push-Location $composeDir
    try {
        # cmd /c: docker writes progress to stderr, which PS 5.1 + ErrorActionPreference=Stop
        # would turn into a terminating NativeCommandError.
        cmd /c "docker compose --profile mqtt-test up -d mosquitto-test >nul 2>&1"
        if ($LASTEXITCODE -ne 0) { throw "docker compose up mosquitto-test failed ($LASTEXITCODE)" }
        $script:startedBroker = $true
        $deadline = (Get-Date).AddSeconds(60)
        do {
            Start-Sleep -Seconds 2
            $state = (cmd /c "docker inspect -f {{.State.Health.Status}} ams-mosquitto-test 2>nul")
        } while ($state -ne 'healthy' -and (Get-Date) -lt $deadline)
        Write-Host "  broker health: $state`n"
    } finally { Pop-Location }
}

# ── Login ────────────────────────────────────────────────────────────────────
$token = $null
Step 'login as Admin' {
    $r = Invoke-RestMethod -Method Post -Uri "$GatewayBase/api/auth/login" `
        -ContentType 'application/json' -Body (@{ username = $AdminUser; password = $AdminPassword } | ConvertTo-Json)
    Assert ($null -ne $r.token) 'login response has no token'
    $script:token = $r.token
}
if (-not $script:token) { Write-Host "`nCannot continue without a token."; exit 1 }
$H = @{ Authorization = "Bearer $($script:token)" }

# ── Unauthenticated probe ────────────────────────────────────────────────────
Step 'GET without token -> 401' {
    try {
        Invoke-RestMethod -Method Get -Uri "$base/data-sources" | Out-Null
        throw 'request unexpectedly succeeded'
    } catch {
        if ($null -eq $_.Exception.Response) { throw } ; $code = [int]$_.Exception.Response.StatusCode
        Assert ($code -eq 401) "expected 401, got $code"
    }
}

# ── Profiles ─────────────────────────────────────────────────────────────────
Step 'GET /profiles lists MQTT_PRM' {
    $profiles = Invoke-RestMethod -Method Get -Uri "$base/profiles" -Headers $H
    Assert (@($profiles | Where-Object { $_.profileType -eq 'MQTT_PRM' }).Count -eq 1) 'MQTT_PRM profile missing'
}

# ── Create ───────────────────────────────────────────────────────────────────
$configId = $null
Step 'POST create config' {
    $body = @{
        sourceType = 'MQTT'; profileType = 'MQTT_PRM'
        name = 'E2E Local Mosquitto'; description = 'created by test-ingestion-config-e2e.ps1'
        connectionUrl = $BrokerUrl; username = $BrokerUser; password = $BrokerPassword
        timeoutSeconds = 15
        profileConfig = @{ mqtt = @{ topics = @('prm/data/#'); qos = 1; clean_session = $false; session_expiry_seconds = 86400; keepalive_seconds = 60 } }
    } | ConvertTo-Json -Depth 6
    $r = Invoke-RestMethod -Method Post -Uri "$base/data-sources" -Headers $H -ContentType 'application/json' -Body $body
    Assert ($null -ne $r.configId) 'no configId returned'
    Assert ($r.hasPassword -eq $true) 'hasPassword should be true'
    Assert ($r.effectiveClientId -eq "ingestion-$($r.configId)") "effectiveClientId mismatch: $($r.effectiveClientId)"
    $script:configId = $r.configId
}
if (-not $script:configId) { Write-Host "`nCannot continue without a config."; exit 1 }
$id = $script:configId

# ── Redaction ────────────────────────────────────────────────────────────────
Step 'list response never contains a password' {
    $raw = Invoke-WebRequest -Method Get -Uri "$base/data-sources" -Headers $H -UseBasicParsing
    Assert (-not ($raw.Content -match 'password_encrypted|passwordEncrypted|\"password\"')) 'response body leaks a password field'
    Assert (-not ($raw.Content -match [regex]::Escape($BrokerPassword))) 'response body contains the plaintext password'
}

# ── Live connection test ─────────────────────────────────────────────────────
$firstTest = $null
Step "POST test -> live broker connect ($BrokerUrl)" {
    $r = Invoke-RestMethod -Method Post -Uri "$base/data-sources/$id/test" -Headers $H
    $script:firstTest = $r
    Write-Host "        result: ok=$($r.ok) latency=$($r.latencyMs)ms error='$($r.error)'"
    Assert ($null -ne $r.status) 'no status in test response'
    $row = Invoke-RestMethod -Method Get -Uri "$base/data-sources/$id" -Headers $H
    Assert ($row.lastConnectionStatus -eq $r.status) 'test result not persisted on the row'
    Assert ($null -ne $row.lastConnectionTest) 'lastConnectionTest not stamped'
}

# ── Blank-password edit keeps credential (spec §5 rule 1) ────────────────────
Step 'PUT rename with blank password keeps stored credential' {
    $body = @{ name = 'E2E Local Mosquitto (renamed)'; password = '' } | ConvertTo-Json
    $r = Invoke-RestMethod -Method Put -Uri "$base/data-sources/$id" -Headers $H -ContentType 'application/json' -Body $body
    Assert ($r.name -eq 'E2E Local Mosquitto (renamed)') 'rename did not apply'
    Assert ($r.hasPassword -eq $true) 'hasPassword lost after blank-password update'
    Assert ($r.version -ge 2) "version did not bump (got $($r.version))"
    $r2 = Invoke-RestMethod -Method Post -Uri "$base/data-sources/$id/test" -Headers $H
    Assert ($r2.ok -eq $script:firstTest.ok) "test outcome changed after blank-password edit (was ok=$($script:firstTest.ok), now ok=$($r2.ok)) - credential was clobbered"
}

# ── Wrong credentials are refused (only provable on the authenticated test broker) ──
if ($script:startedBroker) {
    Step 'wrong credentials -> connection refused' {
        $body = @{
            sourceType = 'MQTT'; profileType = 'MQTT_ALARMS'; name = 'E2E Wrong Creds'
            connectionUrl = $BrokerUrl; username = $BrokerUser; password = 'definitely-wrong'; timeoutSeconds = 10
            profileConfig = @{ mqtt = @{ topics = @('ot/alarms/#') } }
        } | ConvertTo-Json -Depth 6
        $bad = Invoke-RestMethod -Method Post -Uri "$base/data-sources" -Headers $H -ContentType 'application/json' -Body $body
        try {
            $r = Invoke-RestMethod -Method Post -Uri "$base/data-sources/$($bad.configId)/test" -Headers $H
            Assert ($r.ok -eq $false) 'test with a wrong password unexpectedly succeeded'
            Write-Host "        refused as expected: '$($r.error)'"
            $row = Invoke-RestMethod -Method Get -Uri "$base/data-sources/$($bad.configId)" -Headers $H
            Assert ($row.lastConnectionStatus -eq 'FAILED') 'FAILED not persisted for wrong credentials'
        } finally {
            Invoke-RestMethod -Method Delete -Uri "$base/data-sources/$($bad.configId)" -Headers $H | Out-Null
        }
    }
}

# ── Validation 400s ──────────────────────────────────────────────────────────
Step 'invalid topic filter -> 400 field=topics' {
    $body = @{
        sourceType = 'MQTT'; profileType = 'MQTT_PRM'; name = 'bad'; connectionUrl = 'mqtt://x:1883'
        username = 'u'; password = 'p'
        profileConfig = @{ mqtt = @{ topics = @('bad/#/topic') } }
    } | ConvertTo-Json -Depth 6
    try {
        Invoke-RestMethod -Method Post -Uri "$base/data-sources" -Headers $H -ContentType 'application/json' -Body $body | Out-Null
        throw 'create unexpectedly succeeded'
    } catch {
        if ($null -eq $_.Exception.Response) { throw } ; Assert ([int]$_.Exception.Response.StatusCode -eq 400) 'expected 400'
    }
}
Step 'http:// URL -> 400' {
    $body = @{
        sourceType = 'MQTT'; profileType = 'MQTT_PRM'; name = 'bad'; connectionUrl = 'http://x:1883'
        username = 'u'; password = 'p'
        profileConfig = @{ mqtt = @{ topics = @('a/#') } }
    } | ConvertTo-Json -Depth 6
    try {
        Invoke-RestMethod -Method Post -Uri "$base/data-sources" -Headers $H -ContentType 'application/json' -Body $body | Out-Null
        throw 'create unexpectedly succeeded'
    } catch {
        if ($null -eq $_.Exception.Response) { throw } ; Assert ([int]$_.Exception.Response.StatusCode -eq 400) 'expected 400'
    }
}

# ── Failure path: unreachable broker persists FAILED ─────────────────────────
Step 'unreachable broker -> FAILED persisted' {
    $body = @{
        sourceType = 'MQTT'; profileType = 'MQTT_PRM'; name = 'E2E Unreachable'
        connectionUrl = 'mqtt://host.docker.internal:1999'; username = 'u'; password = 'p'; timeoutSeconds = 5
        profileConfig = @{ mqtt = @{ topics = @('a/#') } }
    } | ConvertTo-Json -Depth 6
    $bad = Invoke-RestMethod -Method Post -Uri "$base/data-sources" -Headers $H -ContentType 'application/json' -Body $body
    try {
        $r = Invoke-RestMethod -Method Post -Uri "$base/data-sources/$($bad.configId)/test" -Headers $H
        Assert ($r.ok -eq $false) 'test against dead port unexpectedly succeeded'
        $row = Invoke-RestMethod -Method Get -Uri "$base/data-sources/$($bad.configId)" -Headers $H
        Assert ($row.lastConnectionStatus -eq 'FAILED') 'FAILED not persisted'
        Assert (-not [string]::IsNullOrEmpty($row.lastConnectionError)) 'no error text persisted'
    } finally {
        Invoke-RestMethod -Method Delete -Uri "$base/data-sources/$($bad.configId)" -Headers $H | Out-Null
    }
}

# ── Activate / deactivate ────────────────────────────────────────────────────
Step 'deactivate then activate' {
    $r = Invoke-RestMethod -Method Post -Uri "$base/data-sources/$id/deactivate" -Headers $H
    Assert ($r.isActive -eq $false) 'deactivate did not apply'
    $r = Invoke-RestMethod -Method Post -Uri "$base/data-sources/$id/activate" -Headers $H
    Assert ($r.isActive -eq $true) 'activate did not apply'
}

# ── Delete ───────────────────────────────────────────────────────────────────
Step 'delete -> 404 afterwards' {
    Invoke-RestMethod -Method Delete -Uri "$base/data-sources/$id" -Headers $H | Out-Null
    try {
        Invoke-RestMethod -Method Get -Uri "$base/data-sources/$id" -Headers $H | Out-Null
        throw 'row still exists after delete'
    } catch {
        if ($null -eq $_.Exception.Response) { throw } ; Assert ([int]$_.Exception.Response.StatusCode -eq 404) 'expected 404'
    }
}

# ── Teardown ─────────────────────────────────────────────────────────────────
if ($script:startedBroker -and -not $KeepBroker) {
    Push-Location $composeDir
    try { cmd /c "docker compose --profile mqtt-test stop mosquitto-test >nul 2>&1" } finally { Pop-Location }
    Write-Host "`nmosquitto-test broker stopped (use -KeepBroker to leave it running for manual UI tests)"
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host ""
if ($script:firstTest -and -not $script:firstTest.ok) {
    Write-Host "NOTE: the live broker test returned ok=false ('$($script:firstTest.error)')." -ForegroundColor Yellow
    Write-Host "      The mechanism worked (result persisted); check broker auth/reachability for a SUCCESS run." -ForegroundColor Yellow
}
Write-Host ("=== {0} passed, {1} failed ===" -f $script:passed, $script:failed) -ForegroundColor ($(if ($script:failed -eq 0) { 'Green' } else { 'Red' }))
exit $(if ($script:failed -eq 0) { 0 } else { 1 })
