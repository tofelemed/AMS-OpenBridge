# ═══════════════════════════════════════════════════════════════════════════
# Traverse Edge Platform - Deployment Validation Script
# Validates all services are healthy and APIs responding correctly.
# ═══════════════════════════════════════════════════════════════════════════

param(
    [switch]$Verbose,
    [int]$Timeout = 30
)

$ErrorActionPreference = "Continue"
$script:TotalTests = 0
$script:PassedTests = 0
$script:FailedTests = 0

function Write-TestResult {
    param([string]$Name, [bool]$Passed, [string]$Message = "")
    $script:TotalTests++
    if ($Passed) {
        $script:PassedTests++
        Write-Host "  [PASS] $Name" -ForegroundColor Green
    } else {
        $script:FailedTests++
        Write-Host "  [FAIL] $Name - $Message" -ForegroundColor Red
    }
}

function Test-ServiceHealth {
    param([string]$Name, [string]$Url)
    try {
        $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec $Timeout -ErrorAction Stop
        $status = if ($response.status) { $response.status } else { "OK" }
        Write-TestResult -Name "$Name Health" -Passed ($status -eq "Healthy" -or $status -eq "OK")
    } catch {
        Write-TestResult -Name "$Name Health" -Passed $false -Message $_.Exception.Message
    }
}

function Test-ApiEndpoint {
    param([string]$Name, [string]$Url, [string]$Method = "GET", [string]$ExpectedProperty)
    try {
        $response = Invoke-RestMethod -Uri $Url -Method $Method -TimeoutSec $Timeout -ErrorAction Stop
        $passed = if ($ExpectedProperty) { 
            $null -ne ($response | Select-Object -ExpandProperty $ExpectedProperty -ErrorAction SilentlyContinue)
        } else { 
            $true 
        }
        Write-TestResult -Name $Name -Passed $passed
    } catch {
        Write-TestResult -Name $Name -Passed $false -Message $_.Exception.Message
    }
}

Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " TRAVERSE EDGE PLATFORM - DEPLOYMENT VALIDATION" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

# ───────────────────────────────────────────────────────────────────────────
# Section 1: Core AMS Services
# ───────────────────────────────────────────────────────────────────────────
Write-Host "1. Core AMS Services" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────"

Test-ServiceHealth -Name "AMS API" -Url "http://localhost:8081/health"
Test-ServiceHealth -Name "Historian BFF" -Url "http://localhost:8081/gw/upstreams/historian-bff/health"

# ───────────────────────────────────────────────────────────────────────────
# Section 2: Traverse Services (Phase 1-4)
# ───────────────────────────────────────────────────────────────────────────
Write-Host "`n2. Traverse Services" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────"

Test-ServiceHealth -Name "Asset Model" -Url "http://localhost:8081/gw/upstreams/asset-model/health"
Test-ServiceHealth -Name "Binding Resolver" -Url "http://localhost:8081/gw/upstreams/binding-resolver/health"
Test-ServiceHealth -Name "Display Service" -Url "http://localhost:8081/gw/upstreams/display-service/health"
Test-ServiceHealth -Name "Template Service" -Url "http://localhost:8081/gw/upstreams/template-service/health"
Test-ServiceHealth -Name "Analysis Service" -Url "http://localhost:8081/gw/upstreams/analysis-service/health"

# ───────────────────────────────────────────────────────────────────────────
# Section 3: Infrastructure Services
# ───────────────────────────────────────────────────────────────────────────
Write-Host "`n3. Infrastructure Services" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────"

# PostgreSQL (via pgAdmin or direct connection would be needed)
try {
    $pgResponse = docker exec ams-postgres pg_isready -U ams_user -d ams 2>&1
    Write-TestResult -Name "PostgreSQL" -Passed ($LASTEXITCODE -eq 0)
} catch {
    Write-TestResult -Name "PostgreSQL" -Passed $false -Message "Docker exec failed"
}

# Redis
try {
    $redisResponse = docker exec ams-redis redis-cli ping 2>&1
    Write-TestResult -Name "Redis" -Passed ($redisResponse -eq "PONG")
} catch {
    Write-TestResult -Name "Redis" -Passed $false -Message "Docker exec failed"
}

# Kafka
try {
    $kafkaResponse = docker exec ams-kafka kafka-broker-api-versions --bootstrap-server localhost:9092 2>&1
    Write-TestResult -Name "Kafka" -Passed ($LASTEXITCODE -eq 0)
} catch {
    Write-TestResult -Name "Kafka" -Passed $false -Message "Docker exec failed"
}

# EMQX
Test-ServiceHealth -Name "EMQX MQTT" -Url "http://localhost:18083/api/v5/status"

# IoTDB
try {
    $iotdbResponse = Invoke-RestMethod -Uri "http://localhost:8181/rest/v2/ping" -TimeoutSec 5 -ErrorAction Stop
    Write-TestResult -Name "IoTDB" -Passed $true
} catch {
    Write-TestResult -Name "IoTDB" -Passed $false -Message $_.Exception.Message
}

# ───────────────────────────────────────────────────────────────────────────
# Section 4: API Smoke Tests
# ───────────────────────────────────────────────────────────────────────────
Write-Host "`n4. API Smoke Tests" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────"

# Asset Model API
Test-ApiEndpoint -Name "List Assets" -Url "http://localhost:8081/api/assets" -ExpectedProperty "assets"

# Binding Resolver API
Test-ApiEndpoint -Name "Preview Path Resolution" -Url "http://localhost:8081/api/bindings/preview?path=houston/crude1/pump101.discharge_press"

# Display Service API
Test-ApiEndpoint -Name "List Displays" -Url "http://localhost:8081/api/displays" -ExpectedProperty "displays"

# Template Service API
Test-ApiEndpoint -Name "List Templates" -Url "http://localhost:8081/api/templates" -ExpectedProperty "templates"

# Analysis Service API
Test-ApiEndpoint -Name "Analysis Types" -Url "http://localhost:8081/api/analyses/types"

# Historian BFF API
Test-ApiEndpoint -Name "Series List" -Url "http://localhost:8081/api/hist/series"

# ───────────────────────────────────────────────────────────────────────────
# Section 5: End-to-End Data Flow Test
# ───────────────────────────────────────────────────────────────────────────
Write-Host "`n5. End-to-End Data Flow" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────"

# Test: UNS Path → Binding Resolution → Live Transport Info
try {
    $binding = Invoke-RestMethod -Uri 'http://localhost:8081/api/bindings/resolve?path=houston/crude1/pump101.discharge_press&roles=all' -TimeoutSec 10
    $hasLive = $null -ne $binding.live
    $hasHistory = $null -ne $binding.history
    $hasAlarm = $null -ne $binding.alarm
    Write-TestResult -Name "Binding Resolution (all roles)" -Passed ($hasLive -and $hasHistory -and $hasAlarm)
    
    if ($Verbose -and $binding.resolved) {
        Write-Host "    Live Topic: $($binding.live.sparkplugTopic)" -ForegroundColor Gray
        Write-Host "    IoTDB Path: $($binding.history.iotDbPath)" -ForegroundColor Gray
        Write-Host "    Alarm Source: $($binding.alarm.alarmSource)" -ForegroundColor Gray
    }
} catch {
    Write-TestResult -Name "Binding Resolution" -Passed $false -Message $_.Exception.Message
}

# Test: Create → Retrieve Asset
try {
    $testAsset = @{
        contextualPath = "test/validation/sensor_$(Get-Random)"
        name = "Validation Test Sensor"
        type = 5
        description = "Created by deployment validation"
    } | ConvertTo-Json
    
    $created = Invoke-RestMethod -Uri "http://localhost:8081/api/assets" -Method Post -Body $testAsset -ContentType "application/json" -TimeoutSec 10
    $retrieved = Invoke-RestMethod -Uri "http://localhost:8081/api/assets/$($created.id)" -TimeoutSec 10
    
    # Cleanup
    Invoke-RestMethod -Uri "http://localhost:8081/api/assets/$($created.id)" -Method Delete -TimeoutSec 10 | Out-Null
    
    Write-TestResult -Name "Asset CRUD (create/read/delete)" -Passed ($retrieved.id -eq $created.id)
} catch {
    Write-TestResult -Name "Asset CRUD" -Passed $false -Message $_.Exception.Message
}

# ───────────────────────────────────────────────────────────────────────────
# Summary
# ───────────────────────────────────────────────────────────────────────────
Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " VALIDATION SUMMARY" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Total Tests:  $script:TotalTests"
Write-Host "  Passed:       $script:PassedTests" -ForegroundColor Green
Write-Host "  Failed:       $script:FailedTests" -ForegroundColor $(if ($script:FailedTests -gt 0) { "Red" } else { "Green" })

$exitCode = if ($script:FailedTests -eq 0) { 0 } else { 1 }
Write-Host "`n  Result: $(if ($exitCode -eq 0) { 'DEPLOYMENT VALIDATED' } else { 'VALIDATION FAILED' })" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
Write-Host ""

exit $exitCode
