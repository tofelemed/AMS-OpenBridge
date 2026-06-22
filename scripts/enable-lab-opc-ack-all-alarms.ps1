#Requires -Version 5.1
<#
.SYNOPSIS
  Lab: mark all active unacked alarms with OPC cookies as ack-writeable for free UI testing.
.EXAMPLE
  .\scripts\enable-lab-opc-ack-all-alarms.ps1
#>
param(
    [string]$PostgresContainer = "ams-postgres",
    [string]$DbUser = "ams_user",
    [string]$DbName = "ams"
)

$ErrorActionPreference = "Stop"

$sql = @"
UPDATE alarms.alarm_current
SET opc_attributes = COALESCE(opc_attributes, '{}'::jsonb) || jsonb_build_object(
    'alarmEventKind', 'CONDITION',
    'opcAckWriteable', true,
    'ackRequired', true,
    'acknowledged', false
),
last_updated = NOW()
WHERE ack_status = false
  AND COALESCE(opc_attributes->>'cookieOffset', '0')::bigint > 0;

SELECT COUNT(*) AS unacked_opc_ack_writeable
FROM alarms.alarm_current
WHERE ack_status = false
  AND (opc_attributes->>'opcAckWriteable')::boolean = true;
"@

Write-Host "Applying lab OPC ACK eligibility to all unacked alarms with cookies..." -ForegroundColor Cyan
docker exec $PostgresContainer psql -U $DbUser -d $DbName -c $sql
Write-Host "Done. Enable OpcGateway:EnableDynamicOpcSyncForAllAlarms in ams-api for continuous refresh." -ForegroundColor Green
