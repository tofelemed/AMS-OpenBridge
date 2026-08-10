# ═══════════════════════════════════════════════════════════════════════════
# End-to-End Test Suite
# Tests the full data flow through all Traverse services.
# ═══════════════════════════════════════════════════════════════════════════

param(
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$script:TotalTests = 0
$script:PassedTests = 0
$script:FailedTests = 0

function Write-TestResult {
    param([string]$Name, [bool]$Passed, [string]$Details = "")
    $script:TotalTests++
    if ($Passed) {
        $script:PassedTests++
        Write-Host "  [PASS] $Name" -ForegroundColor Green
        if ($Verbose -and $Details) { Write-Host "         $Details" -ForegroundColor Gray }
    } else {
        $script:FailedTests++
        Write-Host "  [FAIL] $Name" -ForegroundColor Red
        if ($Details) { Write-Host "         $Details" -ForegroundColor Red }
    }
}

Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " END-TO-END TEST SUITE" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

# ───────────────────────────────────────────────────────────────────────────
# Test 1: Asset Model → Binding Resolver Flow
# ───────────────────────────────────────────────────────────────────────────
Write-Host "Test Suite 1: Asset Model → Binding Resolver" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────"

try {
    # Create test asset
    $testPath = "e2e-test/unit1/device$(Get-Random -Maximum 9999)"
    $asset = @{
        contextualPath = $testPath
        name = "E2E Test Device"
        type = 4
        description = "End-to-end test device"
        engineeringUnit = "PSI"
    } | ConvertTo-Json
    
    $createdAsset = Invoke-RestMethod -Uri "http://localhost:8081/api/assets" -Method Post -Body $asset -ContentType "application/json" -TimeoutSec 10
    Write-TestResult -Name "Create Asset" -Passed ($null -ne $createdAsset.id) -Details "ID: $($createdAsset.id)"
    
    # Resolve via Binding Resolver
    $resolveUrl = "http://localhost:8081/api/bindings/resolve?path=$testPath" + '&roles=all'
    $binding = Invoke-RestMethod -Uri $resolveUrl -TimeoutSec 10
    Write-TestResult -Name "Resolve Asset Path" -Passed $binding.resolved -Details "IoTDB: $($binding.history.iotDbPath)"
    
    # Verify derived paths
    $expectedIotdb = "root.$($testPath.Replace('/', '.'))"
    Write-TestResult -Name "IoTDB Path Derivation" -Passed ($binding.history.iotDbPath -eq $expectedIotdb) -Details "Expected: $expectedIotdb, Got: $($binding.history.iotDbPath)"
    
    # Cleanup
    Invoke-RestMethod -Uri "http://localhost:8081/api/assets/$($createdAsset.id)" -Method Delete -TimeoutSec 10 | Out-Null
    Write-TestResult -Name "Cleanup Asset" -Passed $true
} catch {
    Write-TestResult -Name "Asset → Binding Flow" -Passed $false -Details $_.Exception.Message
}

# ───────────────────────────────────────────────────────────────────────────
# Test 2: Display Service CRUD
# ───────────────────────────────────────────────────────────────────────────
Write-Host "`nTest Suite 2: Display Service CRUD" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────"

try {
    # Create display
    $display = @{
        name = "E2E Test Display $(Get-Random)"
        category = "overview"
        description = "E2E test display"
        ownerId = "e2e-test"
    } | ConvertTo-Json
    
    $createdDisplay = Invoke-RestMethod -Uri "http://localhost:8081/api/displays" -Method Post -Body $display -ContentType "application/json" -TimeoutSec 10
    Write-TestResult -Name "Create Display" -Passed ($null -ne $createdDisplay.id)
    
    # Get display
    $retrieved = Invoke-RestMethod -Uri "http://localhost:8081/api/displays/$($createdDisplay.id)" -TimeoutSec 10
    Write-TestResult -Name "Retrieve Display" -Passed ($retrieved.id -eq $createdDisplay.id)
    
    # Save content (CQRS compliant - no process values)
    $content = @{
        snapshot = @{
            items = @(
                @{
                    id = "test-item-1"
                    type = "ind.numeric"
                    position = @{ x = 100; y = 100 }
                    size = @{ width = 120; height = 60 }
                    bindings = @{ value = "houston/crude1/pump101.discharge_press" }
                    label = "Test Value"
                }
            )
        }
        changeNote = "E2E test content"
        userId = "e2e-test"
    } | ConvertTo-Json -Depth 10
    
    $saved = Invoke-RestMethod -Uri "http://localhost:8081/api/displays/$($createdDisplay.id)/content" -Method Put -Body $content -ContentType "application/json" -TimeoutSec 10
    Write-TestResult -Name "Save Display Content (CQRS)" -Passed ($saved.version -gt 1)
    
    # Cleanup
    Invoke-RestMethod -Uri "http://localhost:8081/api/displays/$($createdDisplay.id)" -Method Delete -TimeoutSec 10 | Out-Null
    Write-TestResult -Name "Delete Display" -Passed $true
} catch {
    Write-TestResult -Name "Display CRUD" -Passed $false -Details $_.Exception.Message
}

# ───────────────────────────────────────────────────────────────────────────
# Test 3: Template Service
# ───────────────────────────────────────────────────────────────────────────
Write-Host "`nTest Suite 3: Template Service" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────"

try {
    # List templates
    $templates = Invoke-RestMethod -Uri "http://localhost:8081/api/templates" -TimeoutSec 10
    Write-TestResult -Name "List Templates" -Passed ($templates.total -ge 0) -Details "Found $($templates.total) templates"
    
    # Check for system templates
    $systemTemplates = $templates.templates | Where-Object { $_.isSystem -eq $true }
    Write-TestResult -Name "System Templates Present" -Passed ($systemTemplates.Count -gt 0) -Details "$($systemTemplates.Count) system templates"
    
    if ($systemTemplates.Count -gt 0) {
        # Test instantiation
        $template = $systemTemplates[0]
        $instantiate = @{
            parameters = @{ basePath = "e2e-test/pump001" }
            position = @{ x = 0; y = 0 }
        } | ConvertTo-Json
        
        $instance = Invoke-RestMethod -Uri "http://localhost:8081/api/templates/$($template.id)/instantiate" -Method Post -Body $instantiate -ContentType "application/json" -TimeoutSec 10
        Write-TestResult -Name "Instantiate Template" -Passed ($null -ne $instance.instanceId) -Details "Instance: $($instance.instanceId)"
    }
} catch {
    Write-TestResult -Name "Template Service" -Passed $false -Details $_.Exception.Message
}

# ───────────────────────────────────────────────────────────────────────────
# Test 4: Analysis Service
# ───────────────────────────────────────────────────────────────────────────
Write-Host "`nTest Suite 4: Analysis Service" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────"

try {
    # List analysis types
    $types = Invoke-RestMethod -Uri "http://localhost:8081/api/analyses/types" -TimeoutSec 10
    Write-TestResult -Name "Get Analysis Types" -Passed ($types.Count -eq 4) -Details "$($types.Count) types available"
    
    # List analyses
    $analyses = Invoke-RestMethod -Uri "http://localhost:8081/api/analyses" -TimeoutSec 10
    Write-TestResult -Name "List Analyses" -Passed ($analyses.total -ge 0) -Details "Found $($analyses.total) analyses"
} catch {
    Write-TestResult -Name "Analysis Service" -Passed $false -Details $_.Exception.Message
}

# ───────────────────────────────────────────────────────────────────────────
# Test 5: Historian BFF Integration
# ───────────────────────────────────────────────────────────────────────────
Write-Host "`nTest Suite 5: Historian BFF" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────"

try {
    # Test series endpoint
    $series = Invoke-RestMethod -Uri "http://localhost:8081/api/hist/series" -TimeoutSec 10
    Write-TestResult -Name "List IoTDB Series" -Passed $true -Details "Series query successful"
    
    # Test snapshot endpoint
    $snapshot = Invoke-RestMethod -Uri "http://localhost:8081/api/hist/snapshot?assets=*" -TimeoutSec 10
    Write-TestResult -Name "Redis Snapshot" -Passed ($null -ne $snapshot.assets) -Details "$($snapshot.assets.Count) assets in snapshot"
} catch {
    Write-TestResult -Name "Historian BFF" -Passed $false -Details $_.Exception.Message
}

# ───────────────────────────────────────────────────────────────────────────
# Summary
# ───────────────────────────────────────────────────────────────────────────
Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " E2E TEST SUMMARY" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Total Tests:  $script:TotalTests"
Write-Host "  Passed:       $script:PassedTests" -ForegroundColor Green
Write-Host "  Failed:       $script:FailedTests" -ForegroundColor $(if ($script:FailedTests -gt 0) { "Red" } else { "Green" })

$exitCode = if ($script:FailedTests -eq 0) { 0 } else { 1 }
Write-Host "`n  Result: $(if ($exitCode -eq 0) { 'ALL TESTS PASSED' } else { 'SOME TESTS FAILED' })" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
Write-Host ""

exit $exitCode
