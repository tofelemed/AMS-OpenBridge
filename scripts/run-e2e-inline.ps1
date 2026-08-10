$ErrorActionPreference = "Continue"
$passed = 0
$failed = 0

function Test-Step {
    param([string]$Name, [scriptblock]$Action)
    try {
        & $Action
        Write-Host "[PASS] $Name" -ForegroundColor Green
        $script:passed++
    } catch {
        Write-Host "[FAIL] $Name - $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
    }
}

Write-Host ""
Write-Host "PLATFORM + DESIGNER E2E" -ForegroundColor Cyan
Write-Host ""

Test-Step "AMS API health" { $r = Invoke-RestMethod http://localhost:8081/health -TimeoutSec 10; if ($r.status -ne 'Healthy') { throw $r.status } }
Test-Step "Historian BFF health" { $r = Invoke-RestMethod http://localhost:8081/gw/upstreams/historian-bff/health -TimeoutSec 10; if ($r.status -ne 'Healthy') { throw $r.status } }
Test-Step "Asset Model health" { $r = Invoke-RestMethod http://localhost:8081/gw/upstreams/asset-model/health -TimeoutSec 10; if ($r.status -ne 'Healthy') { throw $r.status } }
Test-Step "Binding Resolver health" { $r = Invoke-RestMethod http://localhost:8081/gw/upstreams/binding-resolver/health -TimeoutSec 10; if ($r.status -ne 'Healthy') { throw $r.status } }
Test-Step "Display Service health" { $r = Invoke-RestMethod http://localhost:8081/gw/upstreams/display-service/health -TimeoutSec 10; if ($r.status -ne 'Healthy') { throw $r.status } }
Test-Step "Template Service health" { $r = Invoke-RestMethod http://localhost:8081/gw/upstreams/template-service/health -TimeoutSec 10; if ($r.status -ne 'Healthy') { throw $r.status } }
Test-Step "Analysis Service health" { $r = Invoke-RestMethod http://localhost:8081/gw/upstreams/analysis-service/health -TimeoutSec 10; if ($r.status -ne 'Healthy') { throw $r.status } }

Test-Step "List assets (seed data)" { $r = Invoke-RestMethod http://localhost:8081/api/assets -TimeoutSec 10; if ($r.total -lt 5) { throw "expected >=5 got $($r.total)" } }
Test-Step "List displays" { $r = Invoke-RestMethod http://localhost:8081/api/displays -TimeoutSec 10; if ($r.total -lt 1) { throw "expected >=1" } }
Test-Step "List templates" { $r = Invoke-RestMethod http://localhost:8081/api/templates -TimeoutSec 10; if ($r.total -lt 2) { throw "expected >=2" } }
Test-Step "List analyses" { $r = Invoke-RestMethod http://localhost:8081/api/analyses -TimeoutSec 10; if ($r.total -lt 3) { throw "expected >=3" } }

Test-Step "Asset create + bind + delete" {
    $path = "e2e-test/unit/dev$(Get-Random -Maximum 9999)"
    $body = @{ contextualPath = $path; name = "E2E"; type = 4 } | ConvertTo-Json
    $asset = Invoke-RestMethod http://localhost:8081/api/assets -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
    $url = "http://localhost:8081/api/bindings/resolve?path=$path" + "&roles=all"
    $bind = Invoke-RestMethod $url -TimeoutSec 10
    if (-not $bind.resolved) { throw "not resolved" }
    Invoke-RestMethod "http://localhost:8081/api/assets/$($asset.id)" -Method Delete -TimeoutSec 10 | Out-Null
}

Write-Host ""
Write-Host "DESIGNER (nginx :3000)" -ForegroundColor Cyan
Write-Host ""

Test-Step "Frontend index" { $r = Invoke-WebRequest http://localhost:3000 -UseBasicParsing -TimeoutSec 15; if ($r.StatusCode -ne 200) { throw $r.StatusCode } }

$script:displayId = $null
Test-Step "Designer proxy - list displays" {
    $r = Invoke-RestMethod http://localhost:3000/api/displays -TimeoutSec 15
    if ($r.total -lt 1) { throw "no displays" }
    $script:displayId = $r.displays[0].id
}

Test-Step "Designer proxy - load content" {
    if (-not $script:displayId) { throw "no display id" }
    $r = Invoke-RestMethod "http://localhost:3000/api/displays/$($script:displayId)/content" -TimeoutSec 15
    if ($null -eq $r.snapshot) { throw "no snapshot" }
}

Test-Step "Designer proxy - save and reload" {
    if (-not $script:displayId) { throw "no display id" }
    $content = Invoke-RestMethod "http://localhost:3000/api/displays/$($script:displayId)/content" -TimeoutSec 15
    $items = @(@{
        id = "e2e-numeric"
        type = "ind.numeric"
        position = @{ x = 250; y = 250 }
        size = @{ width = 120; height = 60 }
        label = "E2E"
        bindings = @{ value = "houston/crude1/pump101.discharge_press" }
        formatting = @{ decimals = 1; unit = "PSI" }
    })
    if ($content.snapshot.items) { $items = @($content.snapshot.items) + $items }
    $saveBody = @{
        snapshot = @{ items = $items; metadata = @{ e2e = $true } }
        changeNote = "E2E test"
        userId = "e2e"
    } | ConvertTo-Json -Depth 10
    $saved = Invoke-RestMethod "http://localhost:3000/api/displays/$($script:displayId)/content" -Method Put -Body $saveBody -ContentType "application/json" -TimeoutSec 15
    if ($saved.version -le $content.version) { throw "version did not increment" }
    $reload = Invoke-RestMethod "http://localhost:3000/api/displays/$($script:displayId)/content" -TimeoutSec 15
    $found = $reload.snapshot.items | Where-Object { $_.id -eq "e2e-numeric" }
    if (-not $found) { throw "e2e item not found after reload" }
}

Test-Step "Designer proxy - binding resolve" {
    $url = "http://localhost:3000/api/bindings/resolve?path=houston/crude1/pump101.discharge_press" + "&roles=all"
    $r = Invoke-RestMethod $url -TimeoutSec 15
    if (-not $r.resolved) { throw "not resolved" }
}

Test-Step "Designer proxy - create display" {
    $body = @{ name = "E2E $(Get-Random)"; category = "overview"; ownerId = "e2e" } | ConvertTo-Json
    $r = Invoke-RestMethod http://localhost:3000/api/displays -Method Post -Body $body -ContentType "application/json" -TimeoutSec 15
    $c = Invoke-RestMethod "http://localhost:3000/api/displays/$($r.id)/content" -TimeoutSec 15
    if ($c.snapshot.items.Count -ne 0) { throw "expected empty canvas" }
    Invoke-RestMethod "http://localhost:8081/api/displays/$($r.id)" -Method Delete -TimeoutSec 10 | Out-Null
}

Test-Step "Historian snapshot (live data path)" {
    $r = Invoke-RestMethod "http://localhost:8081/api/hist/snapshot?assets=*" -TimeoutSec 10
    if ($null -eq $r.assets) { throw "no assets in snapshot" }
}

Write-Host ""
Write-Host "SUMMARY: Passed=$passed Failed=$failed" -ForegroundColor Cyan
if ($failed -eq 0) {
    Write-Host "Open designer: http://localhost:3000/designer" -ForegroundColor Green
}
exit $(if ($failed -eq 0) { 0 } else { 1 })
