<#
.SYNOPSIS
  Replays a loop CSV (Timestamp,PV,OP,SP,Mode[,VP]) into Kafka loop.samples.v1 as LIVE
  data, one row per -IntervalMs, stamped with wall-clock time. This is the real ingress
  for CPLM testing: CSV -> Kafka -> Flink CPLM jobs -> clpm.gate.results.v1.

.DESCRIPTION
  Ported from CPA/CPAMAIN/scripts/replay-csv-live.ps1 with the intake-decision upgrades:
    - canonical field names (loop_id / event_ts_ms), not the legacy tagId/timestamp aliases
    - records are KEYED by loop_id (kafka-console-producer parse.key), so one loop stays
      on one partition and per-partition ordering holds
    - optional VP column / -LoopType pass-through. Without VP, G14 caps every diagnosis
      confidence at 0.89 (observability flag NO_VP) - supply it when the data has it.

.NOTES
  Each row is published as:
    <loopId>TAB{"loop_id":...,"event_ts_ms":<nowMs>,"pv":..,"sp":..,"op":..,"vp":..,"mode":"AUTO","quality":"GOOD"}
  through a single persistent kafka-console-producer (docker exec stdin block-buffers
  otherwise, which stalls the pacing).
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$CsvPath,
    [Parameter(Mandatory = $true)]
    [string]$LoopId,
    [string]$LoopType = "",
    [string]$Topic = "loop.samples.v1",
    [string]$KafkaContainer = "ams-kafka",
    [string]$Bootstrap = "kafka:9092",
    [int]$IntervalMs = 1000,
    [int]$MaxRows = 0,
    # Use the CSV's own Timestamp column (epoch ms or parseable datetime) instead of
    # wall-clock now. Wall-clock (default) is the live-ingress mode.
    [switch]$UseSourceTime
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $CsvPath)) { throw "CSV not found: $CsvPath" }

$rows = Import-Csv -Path $CsvPath
if ($MaxRows -gt 0 -and $rows.Count -gt $MaxRows) { $rows = $rows[0..($MaxRows - 1)] }
$total = $rows.Count
$hasVp = $rows.Count -gt 0 -and ($rows[0].PSObject.Properties.Name -contains "VP")

Write-Host "Replaying $total rows as live data into $Topic (loop=$LoopId, vp=$(if ($hasVp) { 'yes' } else { 'NO - G14 caps confidence at 0.89' }))" -ForegroundColor Cyan
Write-Host "  Estimated duration: $([math]::Round($total * $IntervalMs / 60000.0, 1)) min" -ForegroundColor Gray

function Convert-Mode([string]$m) {
    if ([string]::IsNullOrWhiteSpace($m)) { return "AUTO" }
    switch -Wildcard ($m.ToUpper()) {
        "AUT*" { "AUTO" }
        "MAN*" { "MANUAL" }
        "CAS*" { "CASCADE" }
        default { $m.ToUpper() }
    }
}

function Get-SourceTimeMs([string]$raw) {
    $parsedLong = 0L
    if ([long]::TryParse($raw, [ref]$parsedLong)) { return $parsedLong }
    $parsedDate = [datetime]::MinValue
    if ([datetime]::TryParse($raw, [ref]$parsedDate)) {
        return [DateTimeOffset]::new($parsedDate.ToUniversalTime(), [TimeSpan]::Zero).ToUnixTimeMilliseconds()
    }
    throw "Cannot parse Timestamp value '$raw' as epoch ms or datetime."
}

# Persistent producer with an auto-flushed stdin writer so each line is sent
# immediately. parse.key/key.separator makes the record key = loop_id.
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "docker"
$psi.Arguments = "exec -i $KafkaContainer kafka-console-producer --broker-list $Bootstrap --topic $Topic --property parse.key=true --property key.separator=`t"
$psi.RedirectStandardInput = $true
$psi.UseShellExecute = $false
$proc = [System.Diagnostics.Process]::Start($psi)
$sw = $proc.StandardInput
$sw.AutoFlush = $true

$idx = 0
try {
    foreach ($row in $rows) {
        $idx++
        $tsMs = if ($UseSourceTime) { Get-SourceTimeMs ([string]$row.Timestamp) } else { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
        $rec = [ordered]@{
            loop_id     = $LoopId
            event_ts_ms = $tsMs
            pv          = [double]$row.PV
            sp          = [double]$row.SP
            op          = [double]$row.OP
            mode        = (Convert-Mode $row.Mode)
            quality     = "GOOD"
        }
        if ($hasVp -and -not [string]::IsNullOrWhiteSpace([string]$row.VP)) { $rec.vp = [double]$row.VP }
        if ($LoopType) { $rec.loop_type = $LoopType }
        $json = $rec | ConvertTo-Json -Compress
        $sw.WriteLine("$LoopId`t$json")
        if ($idx % 30 -eq 0) {
            Write-Host ("  [{0}/{1}] {2}%  last pv={3} op={4} sp={5}" -f $idx, $total, [int](100.0 * $idx / $total), $row.PV, $row.OP, $row.SP) -ForegroundColor DarkGray
        }
        if ($IntervalMs -gt 0) { Start-Sleep -Milliseconds $IntervalMs }
    }
}
finally {
    $sw.Close()
    $proc.WaitForExit(5000) | Out-Null
}

Write-Host "Replay complete: $idx rows published to $Topic (keyed by $LoopId)." -ForegroundColor Green
