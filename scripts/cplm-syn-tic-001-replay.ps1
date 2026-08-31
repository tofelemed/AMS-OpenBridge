# SYN_TIC_001 CPLM golden reference replay - the Phase 2 smoke test.
# Publishes 17,280 samples (24h @ 5s) of the triangular-OP reference loop per the
# CPLM reference manual appendix A. The gate math over this window is pinned by
# CplmGateEngineSynTic001Test (mae=0.375, effortRatio=8.0, triangularity=1.0,
# confidence=0.89, diagnosis=SUSPECTED_FINAL_ELEMENT_NONLINEARITY, NO_VP).
#
# Ported from CPA/CPAMAIN/scripts/cplm-syn-tic-001-replay.ps1 with two upgrades:
#   - canonical field names (loop_id / event_ts_ms)
#   - records keyed by loop_id (parse.key), matching the traverse.cpa.loop.samples.v1 contract
# The sample math is byte-equivalent to the CPA original - do not change it, the
# expected metrics depend on it. Deliberately NO vp field: the golden expectation
# includes the NO_VP observability flag and the 0.89 confidence cap.
#
# Usage (fast E2E without waiting 24h):
#   .\scripts\cplm-syn-tic-001-replay.ps1 -TimeShiftToNow -IncludeWatermarkAdvancer
# Then check traverse.cpa.clpm.gate.results.v1 for a SYN_TIC_001 record once the long job's
# 15-min timer fires past the window.

param(
    [string]$Topic = "traverse.cpa.loop.samples.v1",
    [string]$KafkaContainer = "ams-kafka",
    [string]$Bootstrap = "kafka:9092",
    [switch]$TimeShiftToNow,
    [switch]$IncludeWatermarkAdvancer,
    [string]$LoopId = "SYN_TIC_001"
)

$ErrorActionPreference = "Stop"
# docker/kafka CLIs write transient WARNs to stderr; under EAP=Stop with 2>&1 those
# become terminating NativeCommandErrors in PS 5.1, killing the replay mid-publish.
$PSNativeCommandUseErrorActionPreference = $false
$DT = 5.0
$N = 17280
$M = 540
$SHIFT = 135

if ($TimeShiftToNow) {
    $END_MS = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - (5 * 60 * 1000)
    $START_MS = $END_MS - [long](24 * 60 * 60 * 1000)
} else {
    $START_MS = 1738627200000
    $END_MS = $START_MS + [long]($N * $DT * 1000)
}

function Get-TriIdx([int]$i) {
    $mod = (($i % $M) + $M) % $M
    $p = $mod / [double]$M
    return 1.0 - 4.0 * [Math]::Abs($p - 0.5)
}

Write-Host "Generating SYN_TIC_001 reference samples ($N rows, topic=$Topic)..." -ForegroundColor Cyan
if ($TimeShiftToNow) {
    Write-Host "  Time-shifted: $([DateTimeOffset]::FromUnixTimeMilliseconds($START_MS).UtcDateTime) -> $([DateTimeOffset]::FromUnixTimeMilliseconds($END_MS).UtcDateTime) UTC" -ForegroundColor Gray
}

$lines = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $N; $i++) {
    $op = 50.0 + 6.0 * (Get-TriIdx $i)
    $pv = 100.0 + 0.75 * (Get-TriIdx ($i - $SHIFT))
    $ts = $START_MS + [long]($i * $DT * 1000)
    $rec = @{
        loop_id     = $LoopId
        event_ts_ms = $ts
        pv          = $pv
        sp          = 100.0
        op          = $op
        mode        = "AUTO"
        quality     = "GOOD"
    } | ConvertTo-Json -Compress
    $lines.Add("$LoopId`t$rec")
}

if ($IncludeWatermarkAdvancer) {
    # Five samples 10 min past the window end push the event-time watermark far
    # enough that the long job's timers and the fusion window actually fire.
    $advMs = $END_MS + (10 * 60 * 1000)
    for ($j = 0; $j -lt 5; $j++) {
        $adv = @{
            loop_id     = $LoopId
            event_ts_ms = ($advMs + $j * 1000)
            pv          = 100.0
            sp          = 100.0
            op          = 50.0
            mode        = "AUTO"
            quality     = "GOOD"
        } | ConvertTo-Json -Compress
        $lines.Add("$LoopId`t$adv")
    }
    Write-Host "  Added 5 watermark advancer samples at $([DateTimeOffset]::FromUnixTimeMilliseconds($advMs).UtcDateTime) UTC" -ForegroundColor Gray
}

# Topic creation with real configs lives in kafka-reset-lab-topics.ps1 (ensure tier);
# this is only a safety net so a standalone run does not rely on broker auto-create.
Write-Host "Creating topic $Topic if needed..." -ForegroundColor Cyan
docker exec $KafkaContainer kafka-topics --bootstrap-server $Bootstrap --create --if-not-exists --topic $Topic --partitions 16 --config retention.ms=604800000 2>&1 | Out-Null

Write-Host "Publishing $($lines.Count) messages to $Topic (batched, keyed by $LoopId)..." -ForegroundColor Cyan
$batchSize = 2000
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"   # stderr WARNs from the producer must not kill the replay
try {
    for ($b = 0; $b -lt $lines.Count; $b += $batchSize) {
        $end = [Math]::Min($b + $batchSize - 1, $lines.Count - 1)
        $batch = $lines[$b..$end] -join "`n"
        $batch | docker exec -i $KafkaContainer kafka-console-producer --broker-list $Bootstrap --topic $Topic --property parse.key=true --property "key.separator=`t" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "kafka-console-producer exited with code $LASTEXITCODE at batch starting $b" }
        $pct = [int](100.0 * ($end + 1) / $lines.Count)
        Write-Host "  Published $($end + 1)/$($lines.Count) ($pct%)" -ForegroundColor DarkGray
    }
}
finally { $ErrorActionPreference = $prevEap }

Write-Host "Done. The CPLM long job emits 4h/12h/24h diagnostics on its next 15-min timer;" -ForegroundColor Green
Write-Host "fusion emits the gate result from the 12h/24h records. Watch traverse.cpa.clpm.gate.results.v1:" -ForegroundColor Green
Write-Host "  docker exec ams-kafka kafka-console-consumer --bootstrap-server kafka:9092 --topic traverse.cpa.clpm.gate.results.v1 --from-beginning --timeout-ms 15000" -ForegroundColor Yellow
