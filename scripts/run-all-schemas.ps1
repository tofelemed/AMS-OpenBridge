# Run All Database Schemas
# Applies Traverse migration scripts in order via psql inside Docker.

param(
    [string]$Container = "ams-postgres",
    [string]$PostgresUser = "ams_user",
    [switch]$Reset
)

$ErrorActionPreference = "Continue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

$schemaFiles = @(
    "database/migrations/phase0/001_create_traverse_databases.sql",
    "database/scripts/10_traverse_assets_schema.sql",
    "database/scripts/11_traverse_displays_schema.sql",
    "database/scripts/12_traverse_templates_schema.sql",
    "database/scripts/13_personal_views_schema.sql",
    "database/scripts/14_traverse_analysis_schema.sql",
    "database/migrations/phase0/006_traverse_shared_schema.sql"
)

function Invoke-PsqlFile {
    param(
        [string]$FilePath,
        [string]$Label
    )

    if (-not (Test-Path $FilePath)) {
        Write-Host "  SKIP: $Label (file not found)" -ForegroundColor Gray
        return $false
    }

    Write-Host "Running: $Label" -ForegroundColor Yellow
    $output = Get-Content $FilePath -Raw | docker exec -i $Container psql -U $PostgresUser -d postgres -v ON_ERROR_STOP=1 2>&1
    $exitCode = $LASTEXITCODE

    if ($output) {
        $output | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    }

    if ($exitCode -ne 0) {
        Write-Host "  FAIL: $Label (exit $exitCode)" -ForegroundColor Red
        return $false
    }

    Write-Host "  OK: $Label" -ForegroundColor Green
    return $true
}

Write-Host ""
Write-Host "TRAVERSE DATABASE SCHEMA SETUP" -ForegroundColor Cyan
Write-Host "Container: $Container  Reset: $Reset" -ForegroundColor Cyan
Write-Host ""

$running = docker ps --filter "name=$Container" --format "{{.Names}}" 2>$null
if (-not $running) {
    Write-Host "ERROR: Container $Container is not running." -ForegroundColor Red
    exit 1
}

if ($Reset) {
    Write-Host "Reset: dropping Traverse schemas..." -ForegroundColor Yellow
    $resetSql = @"
DROP SCHEMA IF EXISTS assets CASCADE;
DROP SCHEMA IF EXISTS displays CASCADE;
DROP SCHEMA IF EXISTS templates CASCADE;
DROP SCHEMA IF EXISTS analysis CASCADE;
"@
    $databases = @("traverse_assets", "traverse_displays", "traverse_templates", "traverse_analysis")
    foreach ($db in $databases) {
        Write-Host "  Resetting $db..." -ForegroundColor Gray
        $resetSql | docker exec -i $Container psql -U $PostgresUser -d $db -v ON_ERROR_STOP=0 2>&1 | Out-Null
    }
    $sharedReset = "DROP TABLE IF EXISTS uom_classes, uom_units, categories, user_preferences, resource_permissions CASCADE;"
    $sharedReset | docker exec -i $Container psql -U $PostgresUser -d traverse_shared -v ON_ERROR_STOP=0 2>&1 | Out-Null
    Write-Host "  Reset complete." -ForegroundColor Green
    Write-Host ""
}

$failed = @()
foreach ($relativePath in $schemaFiles) {
    $fullPath = Join-Path $projectRoot $relativePath
    $ok = Invoke-PsqlFile -FilePath $fullPath -Label $relativePath
    if (-not $ok) { $failed += $relativePath }
}

Write-Host ""
Write-Host "Verification:" -ForegroundColor Yellow

$checks = @(
    @{ Db = "traverse_assets";    Query = "SELECT COUNT(*) FROM assets.assets;" },
    @{ Db = "traverse_displays";  Query = "SELECT COUNT(*) FROM displays.display_definitions;" },
    @{ Db = "traverse_templates"; Query = "SELECT COUNT(*) FROM templates.element_templates;" },
    @{ Db = "traverse_analysis";  Query = "SELECT COUNT(*) FROM analysis.analysis_definitions;" }
)

foreach ($check in $checks) {
    $result = docker exec $Container psql -U $PostgresUser -d $check.Db -t -A -c $check.Query 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  $($check.Db): $result rows" -ForegroundColor Green
    } else {
        Write-Host "  $($check.Db): FAILED - $result" -ForegroundColor Red
        $failed += $check.Db
    }
}

Write-Host ""
if ($failed.Count -eq 0) {
    Write-Host "SCHEMA SETUP COMPLETE" -ForegroundColor Green
    exit 0
} else {
    Write-Host "SCHEMA SETUP FAILED - $($failed.Count) issue(s)" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}
