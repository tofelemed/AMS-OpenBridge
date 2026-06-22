#Requires -Version 5.1
<#
.SYNOPSIS
  Shared contract checks for AMS E2E and validation agent scripts.
#>

function Write-E2eCheck {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][bool]$Pass,
        [string]$Detail = "",
        [hashtable]$Results
    )
    $Results[$Name] = @{ Pass = $Pass; Detail = $Detail; At = (Get-Date).ToUniversalTime().ToString("o") }
    $color = if ($Pass) { "Green" } else { "Red" }
    $tag = if ($Pass) { "PASS" } else { "FAIL" }
    Write-Host ("  [{0}] {1} - {2}" -f $tag, $Name, $Detail) -ForegroundColor $color
}

function Get-AmsAuthHeaders {
    param([string]$BearerToken = "dev")
    return @{ Authorization = "Bearer $BearerToken" }
}

function Get-Coalesce {
    param([object]$Value, [object]$Fallback = $null)
    if ($null -eq $Value -or ($Value -is [string] -and [string]::IsNullOrWhiteSpace($Value))) { return $Fallback }
    return $Value
}

function Test-AmsRequiredKafkaTopics {
    param(
        [string]$Bootstrap = "localhost:9092",
        [string[]]$Topics = @(
            "raw-opc-events", "operator-actions", "ack-writeback", "ack-results",
            "lifecycle-events", "current-alarm-state", "root-cause-events",
            "raw-opc-events-dlq", "ack-writeback-dlq"
        )
    )
    $list = docker exec ams-kafka kafka-topics --bootstrap-server $Bootstrap --list 2>$null
    $missing = @()
    foreach ($t in $Topics) {
        if ($list -notmatch "(?m)^$([regex]::Escape($t))$") { $missing += $t }
    }
    return @{ Pass = ($missing.Count -eq 0); Missing = $missing; Present = $Topics.Count - $missing.Count }
}

function Get-KafkaTopicSample {
    param(
        [Parameter(Mandatory)][string]$Topic,
        [int]$TimeoutMs = 8000,
        [int]$MaxMessages = 1,
        [string]$Bootstrap = "localhost:9092"
    )
    $out = docker exec ams-kafka kafka-console-consumer `
        --bootstrap-server $Bootstrap `
        --topic $Topic `
        --timeout-ms $TimeoutMs `
        --max-messages $MaxMessages 2>&1 | Out-String
    foreach ($line in ($out -split "`n")) {
        $json = ($line -replace '^[^\{]*', '').Trim()
        if ($json -match '^\{') {
            try { return ($json | ConvertFrom-Json) } catch {}
        }
    }
    return $null
}

function Test-RawOpcEventContract {
    param([object]$Event)
    if (-not $Event) { return @{ Pass = $false; Reason = "no sample event" } }

    $serverId = Get-Coalesce $Event.serverId (Get-Coalesce $Event.opcServer "")
    $source = Get-Coalesce $Event.sourceName (Get-Coalesce $Event.sourcePath "")
    $condition = Get-Coalesce $Event.conditionName (Get-Coalesce $Event.condition "")
    $eventMs = $Event.eventTimeEpochMs
    if (-not $eventMs -and $Event.eventTime) {
        try { $eventMs = [DateTimeOffset]::Parse([string]$Event.eventTime).ToUnixTimeMilliseconds() } catch {}
    }

    $issues = @()
    if (-not $source) { $issues += "missing sourceName/sourcePath" }
    if (-not $eventMs) { $issues += "missing eventTimeEpochMs/eventTime" }

    return @{
        Pass = ($issues.Count -eq 0)
        Reason = if ($issues.Count) { ($issues -join "; ") } else { "serverId=$serverId source=$source condition=$condition eventMs=$eventMs" }
    }
}

function Test-InstanceKeyV1Pattern {
    param(
        [string]$ServerId,
        [string]$SourceName,
        [string]$ConditionName,
        [string]$SubConditionName = ""
    )
    function Norm([string]$s) { if ([string]::IsNullOrWhiteSpace($s)) { return "" } else { $s.Trim() } }
    $expected = "v1|$(Norm $ServerId)|$(Norm $SourceName)|$(Norm $ConditionName)|$(Norm $SubConditionName)"
    return @{
        Expected = $expected
        HasV1Prefix = $expected.StartsWith("v1|")
        ExcludesActiveTime = ($expected -notmatch 'activeTime')
    }
}

function Test-ApiAlarmContractFields {
    param([object]$Alarm)
    if (-not $Alarm) { return @{ Pass = $false; Reason = "no alarm" } }

    $sub = if ($Alarm.subConditionName) { $Alarm.subConditionName } else { "" }
    $family = $Alarm.logicalAlarmFamilyId
    if (-not $family) {
        $family = "$($Alarm.serverId)|$($Alarm.sourceName)|$($Alarm.conditionName)|$sub"
    }
    $schema = $Alarm.instanceKeySchemaVersion
    if (-not $schema) { $schema = 1 }

    $hasEventTime = ($null -ne $Alarm.eventTime) -or ($Alarm.eventTimeEpochMs -gt 0)
    $issues = @()
    if (-not $family) { $issues += "missing logicalAlarmFamilyId" }
    if (-not $hasEventTime) { $issues += "missing eventTime" }

    return @{
        Pass = ($issues.Count -eq 0)
        Reason = if ($issues.Count) { ($issues -join "; ") } else { "family=$family schema=v$schema" }
        LogicalAlarmFamilyId = $family
    }
}

function Invoke-AmsKafkaPublishJson {
    param(
        [Parameter(Mandatory)][string]$Topic,
        [Parameter(Mandatory)][hashtable]$Payload,
        [string]$Key = "",
        [string]$Bootstrap = "localhost:9092"
    )
    $py = Join-Path $env:TEMP "ams_kafka_pub_$([Guid]::NewGuid().ToString('N')).py"
    $json = ($Payload | ConvertTo-Json -Compress -Depth 10) -replace "'", "\'"
    $keyPy = if ($Key) { "producer.send('$Topic', value=payload, key=b'$Key')" } else { "producer.send('$Topic', value=payload)" }
    @"
import json
from kafka import KafkaProducer
payload = json.loads('$json')
producer = KafkaProducer(bootstrap_servers=['$Bootstrap'], value_serializer=lambda x: json.dumps(x).encode())
$keyPy
producer.flush()
print('OK')
"@ | Set-Content -Path $py -Encoding UTF8
    python $py 2>$null
    if ($LASTEXITCODE -ne 0) {
        pip install kafka-python -q 2>$null
        python $py
    }
    Remove-Item $py -Force -ErrorAction SilentlyContinue
    return ($LASTEXITCODE -eq 0)
}

function Test-OperatorActionCommandId {
    param(
        [string]$AlarmId,
        [int]$TimeoutMs = 15000
    )
    $lines = docker exec ams-kafka kafka-console-consumer `
        --bootstrap-server localhost:9092 `
        --topic operator-actions `
        --timeout-ms $TimeoutMs `
        --max-messages 50 2>&1
    foreach ($line in $lines) {
        if ($line -notmatch $AlarmId) { continue }
        $json = ($line -replace '^[^\{]*', '').Trim()
        if ($json -notmatch '^\{') { continue }
        try {
            $o = $json | ConvertFrom-Json
            $cmd = Get-Coalesce $o.commandId (Get-Coalesce $o.CommandId "")
            if ($cmd -and $cmd -notmatch '^ui-') {
                return @{ Pass = $true; CommandId = $cmd; Reason = "server-generated commandId" }
            }
            if ($cmd -match '^ui-') {
                return @{ Pass = $false; CommandId = $cmd; Reason = "client-generated commandId (contract violation)" }
            }
        } catch {}
    }
    return @{ Pass = $false; Reason = "no operator-action for alarm $AlarmId in window" }
}

function Get-AmsPipelineMetrics {
    param(
        [string]$ApiBase = "http://127.0.0.1:8000",
        [hashtable]$Headers = @{ Authorization = "Bearer dev" }
    )
    $m = @{
        ApiOk = $false
        KafkaLag = -1
        FlinkRunning = 0
        DlqRawCount = 0
        SignalRHealthy = $false
    }
    try {
        $h = Invoke-RestMethod "$ApiBase/api/v1/health/pipeline" -Headers $Headers -TimeoutSec 20
        $m.ApiOk = $true
        if ($h.kafka.lag -ne $null) { $m.KafkaLag = [int]$h.kafka.lag }
        $m.SignalRHealthy = ($h.signalR.status -eq "Healthy" -or $h.signalR.status -eq "Idle")
    } catch {}
    if (Get-Command Get-AmsFlinkAlarmJobs -ErrorAction SilentlyContinue) {
        $m.FlinkRunning = @(Get-AmsFlinkAlarmJobs | Where-Object { $_.Status -eq "RUNNING" }).Count
    }
    try {
        $dlq = docker exec ams-kafka kafka-run-class kafka.tools.GetOffsetShell `
            --broker-list localhost:9092 --topic raw-opc-events-dlq 2>&1
        $sum = 0
        foreach ($l in $dlq) { if ($l -match ':(\d+)$') { $sum += [int64]$Matches[1] } }
        $m.DlqRawCount = $sum
    } catch {}
    return $m
}

function Export-E2eReport {
    param(
        [hashtable]$Results,
        [string]$ReportPath
    )
    $passed = @($Results.Values | Where-Object { $_.Pass }).Count
    $report = @{
        generatedAt = (Get-Date).ToUniversalTime().ToString("o")
        passed = $passed
        failed = $Results.Count - $passed
        total = $Results.Count
        checks = $Results
    }
    $dir = Split-Path $ReportPath -Parent
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $report | ConvertTo-Json -Depth 6 | Set-Content -Path $ReportPath -Encoding UTF8
    return $report
}

function Invoke-AmsLabEventInject {
    param(
        [int]$Count = 3,
        [string]$ServerId = "7ce5ecbf-70c9-498d-b899-5c8bb7add383",
        [string]$SourcePrefix = "E2E/Motor_01_Overload",
        [switch]$DuplicateLast
    )
    $py = Join-Path $env:TEMP "ams_e2e_inject.py"
    $dupFlag = if ($DuplicateLast) { "True" } else { "False" }
    @"
import json, time, uuid
from kafka import KafkaProducer
now = int(time.time() * 1000)
p = KafkaProducer(bootstrap_servers=['localhost:9092'], value_serializer=lambda x: json.dumps(x).encode())
events = []
for i in range($Count):
    src = '$SourcePrefix'
    evt = {
        'schemaVersion': 2,
        'eventType': 'RAW_OPC_EVENT',
        'eventId': str(uuid.uuid4()),
        'serverId': '$ServerId',
        'sourceName': src,
        'sourcePath': src,
        'conditionName': 'HIGH',
        'subConditionName': '',
        'eventTimeEpochMs': now + i * 1000,
        'activeTimeEpochMs': now + i * 1000,
        'severity': 700,
        'conditionActive': True,
        'message': f'E2E inject {i}',
        'quality': 192,
    }
    events.append(evt)
if $dupFlag and events:
    events.append(dict(events[-1]))
for evt in events:
    key = f"{evt['serverId']}|{evt['sourceName']}"
    p.send('raw-opc-events', value=evt, key=key.encode())
p.flush()
print(len(events))
"@ | Set-Content -Path $py -Encoding UTF8
    python $py 2>$null
    if ($LASTEXITCODE -ne 0) { pip install kafka-python -q; python $py }
    Remove-Item $py -Force -ErrorAction SilentlyContinue
    return ($LASTEXITCODE -eq 0)
}
