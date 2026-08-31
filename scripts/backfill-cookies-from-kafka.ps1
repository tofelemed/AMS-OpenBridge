# Backfill opc_attributes.cookieOffset from traverse.alarm.current-alarm-state when projection lagged.
param(
    [string]$Bootstrap = "localhost:9092",
    [string]$Topic = "traverse.alarm.current-alarm-state",
    [string]$ServerId = "",
    [int]$PartitionCount = 8
)

$ErrorActionPreference = "Continue"

Write-Host "Reading $Topic partitions..." -ForegroundColor Yellow
$byKey = @{}
for ($p = 0; $p -lt $PartitionCount; $p++) {
    $part = docker exec ams-kafka kafka-console-consumer `
        --bootstrap-server $Bootstrap `
        --topic $Topic `
        --partition $p `
        --from-beginning `
        --max-messages 3000 `
        --timeout-ms 15000 2>&1
    foreach ($line in $part) {
        if ($line -notmatch '^\s*\{') { continue }
        try {
            $j = $line.Trim() | ConvertFrom-Json
            $cookie = 0
            if ($j.cookieOffset) { $cookie = [int]$j.cookieOffset }
            elseif ($j.opcAttributes -and $j.opcAttributes.cookieOffset) { $cookie = [int]$j.opcAttributes.cookieOffset }
            if ($cookie -le 0) { continue }
            if (-not $j.sourceName) { continue }
            $sid = if ($j.serverId) { $j.serverId } elseif ($ServerId) { $ServerId } else { continue }
            if ($ServerId -and $sid -ne $ServerId) { continue }
            $cond = if ($j.conditionName) { $j.conditionName } else { "" }
            $key = "{0}|{1}|{2}" -f $sid, $j.sourceName, $cond
            $byKey[$key] = @{ ServerId = $sid; Source = $j.sourceName; Condition = $cond; Cookie = $cookie }
        } catch {}
    }
}

Write-Host "Found $($byKey.Count) source/condition keys with cookieOffset" -ForegroundColor Cyan
$updated = 0
foreach ($kv in $byKey.Values) {
    $src = $kv.Source -replace "'", "''"
    $cond = $kv.Condition -replace "'", "''"
    $sid = $kv.ServerId
    $cookie = $kv.Cookie
    $condClause = if ($cond) { "AND condition_name = '$cond'" } else { "" }
    $sql = @"
UPDATE alarms.active_alarms
SET opc_attributes = COALESCE(opc_attributes, '{}'::jsonb) || jsonb_build_object('cookieOffset', $cookie, 'alarmEventKind', 'CONDITION', 'opcAckWriteable', true),
    updated_at = NOW()
WHERE server_id = '$sid'::uuid
  AND source_name = '$src'
  $condClause
  AND condition_active = true
  AND (opc_attributes->>'cookieOffset' IS NULL OR (opc_attributes->>'cookieOffset')::bigint <= 0);
"@
    docker exec ams-postgres psql -U ams_user -d ams -q -c $sql 2>$null | Out-Null
    $updated++
}
Write-Host "Applied $updated cookie backfill updates." -ForegroundColor Green
