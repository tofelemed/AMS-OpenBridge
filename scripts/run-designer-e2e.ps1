# Designer End-to-End Test Suite
# Tests HMI designer flow through nginx (port 3000) and direct service ports.

param(
    [switch]$Verbose,
    [string]$FrontendBase = "http://localhost:3000",
    [string]$DisplayDirect = "http://localhost:5003"
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

Write-Host ""
Write-Host "DESIGNER END-TO-END TEST SUITE" -ForegroundColor Cyan
Write-Host "Frontend: $FrontendBase  Display direct: $DisplayDirect" -ForegroundColor Cyan
Write-Host ""

# ── 1. Frontend shell loads ───────────────────────────────────────────────
Write-Host "Suite 1: Frontend availability" -ForegroundColor Yellow
try {
    $html = Invoke-WebRequest -Uri $FrontendBase -TimeoutSec 15 -UseBasicParsing
    Write-TestResult -Name "Frontend index (port 3000)" -Passed ($html.StatusCode -eq 200)
} catch {
    Write-TestResult -Name "Frontend index (port 3000)" -Passed $false -Details $_.Exception.Message
}

# ── 2. Display API via nginx proxy ────────────────────────────────────────
Write-Host ""
Write-Host "Suite 2: Display API via nginx (/api/displays)" -ForegroundColor Yellow
$displayId = $null
try {
    $list = Invoke-RestMethod -Uri "$FrontendBase/api/displays" -TimeoutSec 15
    Write-TestResult -Name "List displays via nginx" -Passed ($list.total -ge 0) -Details "total=$($list.total)"

    if ($list.displays.Count -gt 0) {
        $displayId = $list.displays[0].id
        Write-TestResult -Name "Seed display present" -Passed $true -Details "id=$displayId name=$($list.displays[0].name)"
    } else {
        Write-TestResult -Name "Seed display present" -Passed $false -Details "No displays in DB"
    }
} catch {
    Write-TestResult -Name "List displays via nginx" -Passed $false -Details $_.Exception.Message
}

# ── 3. Load display content (designer load path) ──────────────────────────
Write-Host ""
Write-Host "Suite 3: Designer load/save cycle" -ForegroundColor Yellow
if ($displayId) {
    try {
        $content = Invoke-RestMethod -Uri "$FrontendBase/api/displays/$displayId/content" -TimeoutSec 15
        $itemCount = $content.snapshot.items.Count
        Write-TestResult -Name "Load display content" -Passed ($null -ne $content.snapshot) -Details "items=$itemCount version=$($content.version)"

        # Save updated content (CQRS compliant)
        $updatedItems = @(
            @{
                id = "e2e-test-numeric"
                type = "ind.numeric"
                position = @{ x = 200; y = 200 }
                size = @{ width = 120; height = 60 }
                label = "E2E Test"
                bindings = @{ value = "houston/crude1/pump101.discharge_press" }
                formatting = @{ decimals = 1; unit = "PSI" }
            }
        )
        if ($content.snapshot.items) {
            $updatedItems = $content.snapshot.items + $updatedItems
        }

        $saveBody = @{
            snapshot = @{ items = $updatedItems; metadata = @{ e2eTest = $true } }
            changeNote = "E2E designer test save"
            userId = "e2e-test"
        } | ConvertTo-Json -Depth 10

        $saved = Invoke-RestMethod -Uri "$FrontendBase/api/displays/$displayId/content" -Method Put -Body $saveBody -ContentType "application/json" -TimeoutSec 15
        Write-TestResult -Name "Save display content" -Passed ($saved.version -gt $content.version) -Details "new version=$($saved.version)"

        # Reload and verify item persisted
        $reloaded = Invoke-RestMethod -Uri "$FrontendBase/api/displays/$displayId/content" -TimeoutSec 15
        $hasE2eItem = $reloaded.snapshot.items | Where-Object { $_.id -eq "e2e-test-numeric" }
        Write-TestResult -Name "Reload saved content" -Passed ($null -ne $hasE2eItem) -Details "items=$($reloaded.snapshot.items.Count)"
    } catch {
        Write-TestResult -Name "Designer load/save cycle" -Passed $false -Details $_.Exception.Message
    }
} else {
    Write-TestResult -Name "Designer load/save cycle" -Passed $false -Details "Skipped — no display ID"
}

# ── 4. Binding resolver via nginx (preview mode data path) ────────────────
Write-Host ""
Write-Host "Suite 4: Binding resolver (preview bindings)" -ForegroundColor Yellow
try {
    $resolveUrl = "$FrontendBase/api/bindings/resolve?path=houston/crude1/pump101.discharge_press" + '&roles=all'
    $binding = Invoke-RestMethod -Uri $resolveUrl -TimeoutSec 15
    Write-TestResult -Name "Resolve UNS path via nginx" -Passed $binding.resolved -Details "live topic=$($binding.live.sparkplugTopic)"
    Write-TestResult -Name "History binding present" -Passed ($null -ne $binding.history.iotDbPath) -Details $binding.history.iotDbPath
    Write-TestResult -Name "Alarm binding present" -Passed ($null -ne $binding.alarm.alarmSource) -Details $binding.alarm.alarmSource
} catch {
    Write-TestResult -Name "Binding resolver via nginx" -Passed $false -Details $_.Exception.Message
}

# ── 5. Create new display (designer entry flow) ───────────────────────────
Write-Host ""
Write-Host "Suite 5: Create new display" -ForegroundColor Yellow
$newDisplayId = $null
try {
    $createBody = @{
        name = "E2E Designer Display $(Get-Random)"
        category = "overview"
        description = "Created by designer E2E test"
        ownerId = "e2e-test"
    } | ConvertTo-Json

    $created = Invoke-RestMethod -Uri "$FrontendBase/api/displays" -Method Post -Body $createBody -ContentType "application/json" -TimeoutSec 15
    $newDisplayId = $created.id
    Write-TestResult -Name "Create display via nginx" -Passed ($null -ne $newDisplayId) -Details "id=$newDisplayId"

    $newContent = Invoke-RestMethod -Uri "$FrontendBase/api/displays/$newDisplayId/content" -TimeoutSec 15
    Write-TestResult -Name "New display has empty canvas" -Passed ($newContent.snapshot.items.Count -eq 0)

    # Cleanup
    Invoke-RestMethod -Uri "$DisplayDirect/displays/$newDisplayId" -Method Delete -TimeoutSec 15 | Out-Null
    Write-TestResult -Name "Cleanup test display" -Passed $true
} catch {
    Write-TestResult -Name "Create new display" -Passed $false -Details $_.Exception.Message
}

# ── Summary ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "DESIGNER E2E SUMMARY" -ForegroundColor Cyan
Write-Host "  Total:  $script:TotalTests"
Write-Host "  Passed: $script:PassedTests" -ForegroundColor Green
Write-Host "  Failed: $script:FailedTests" -ForegroundColor $(if ($script:FailedTests -gt 0) { "Red" } else { "Green" })
Write-Host ""
if ($script:FailedTests -eq 0) {
    Write-Host "  Open designer: $FrontendBase/designer" -ForegroundColor Green
} else {
    Write-Host "  Fix failures above before manual UI test" -ForegroundColor Yellow
}

exit $(if ($script:FailedTests -eq 0) { 0 } else { 1 })
