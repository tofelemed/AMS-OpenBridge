using System.Text.Json;
using AMS.Application.Alarms;
using AMS.Application.Alarms.Commands;
using AMS.Domain.Alarms;
using AMS.Domain.Repositories;

namespace AMS.Infrastructure.Kafka;

/// <summary>
/// Persists normalized alarm events to PostgreSQL and SignalR.
/// Idempotent upsert contract: matches on serverId+sourceName+condition+subCondition (not activeTime).
/// PostgreSQL is at-least-once; Kafka+Flink are source of truth — see docs/production-contracts.md §2.
/// </summary>
internal static class NormalizedAlarmIngestor
{
    public static async Task ProcessAsync(
        NormalizedAlarmEvent evt,
        IUnitOfWork uow,
        IAlarmSignalRPublisher publisher,
        CancellationToken ct)
    {
        if (!Guid.TryParse(evt.ServerId, out var serverId)) return;

        // ── Route ALARM_STATE_DELETE (Flink clears inactive alarms) ──────────────
        if (string.Equals(evt.EventType, "ALARM_STATE_DELETE", StringComparison.OrdinalIgnoreCase))
        {
            await HandleDeleteAsync(evt, serverId, uow, publisher, ct);
            return;
        }

        var sourceName = evt.SourceName;
        if (string.IsNullOrWhiteSpace(sourceName) && !string.IsNullOrWhiteSpace(evt.Message))
        {
            const string marker = " on ";
            var idx = evt.Message.LastIndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (idx >= 0)
                sourceName = evt.Message[(idx + marker.Length)..].Trim();
        }
        if (string.IsNullOrWhiteSpace(sourceName)) return;

        var eventTime  = DateTimeOffset.FromUnixTimeMilliseconds(evt.EventTimeEpochMs);
        var activeTime = DateTimeOffset.FromUnixTimeMilliseconds(evt.ActiveTimeEpochMs);
        var priority   = ParsePriority(evt.Priority);
        var category   = ParseCategory(evt.Category);
        var eventTypeEnum = ParseEventType(evt.AlarmEventKind);

        // ── ACK_STATE_UPDATE: only update ack lifecycle, never touch conditionActive ──
        bool isAckProjection = IsOperatorAckProjection(evt);
        bool isAckStateUpdate = string.Equals(evt.EventType, "ACK_STATE_UPDATE",
            StringComparison.OrdinalIgnoreCase);

        var existing = await uow.ActiveAlarms.GetBySourceNameForIngestAsync(serverId, sourceName, ct);
        var matches = existing
            .Where(a => MatchesIngestEvent(a, evt))
            .ToList();

        if (matches.Count == 0 && evt.ConditionActive && !isAckStateUpdate)
        {
            var (alarmGuid, alarmKey) = ResolveAlarmIdentity(evt, serverId);
            var alarm = ActiveAlarm.CreateFromOpcEvent(
                serverId:         serverId,
                sourceName:       sourceName,
                eventType:        eventTypeEnum,
                conditionName:    evt.ConditionName,
                subConditionName: evt.SubConditionName,
                message:          evt.Message,
                severity:         evt.Severity,
                priority:         priority,
                category:         category,
                conditionActive:  true,
                eventTime:        eventTime,
                activeTime:       activeTime,
                quality:          evt.Quality,
                processValue:     evt.ProcessValue,
                processUnit:      evt.ProcessUnit);

            if (isAckProjection && !string.IsNullOrEmpty(evt.AckLifecycleState))
                alarm.ApplyAckLifecycle(
                    evt.AckLifecycleState,
                    evt.CommandId ?? evt.PendingAckActionId,
                    evt.AckRequestedAtEpochMs,
                    correlationId: evt.CorrelationId,
                    lifecycleId:   evt.LifecycleId,
                    dcsSequenceId: evt.DcsSequenceId);

            alarm.SetAlarmIdentity(alarmGuid, alarmKey);
            ApplyOpcTiming(alarm, evt);

            // External ACK may have occurred before this system first saw the alarm.
            if (evt.Acknowledged && !alarm.Acknowledged)
            {
                alarm.ReconcileAcknowledgement(eventTime, userId: null, comment: null);
                alarm.OpcAttributes["ackSource"] = "External OPC Client";
            }

            await uow.ActiveAlarms.AddAsync(alarm, ct);
            await publisher.PublishNewAlarmAsync(alarm, ct);
        }
        else if (matches.Count > 0)
        {
            foreach (var alarm in matches)
            {
                ApplyOpcTiming(alarm, evt);

                if (isAckProjection && !string.IsNullOrEmpty(evt.AckLifecycleState))
                {
                    // UI-originated ACK projection: only update ACK lifecycle fields — never alter conditionActive.
                    alarm.ApplyAckLifecycle(
                        evt.AckLifecycleState,
                        evt.CommandId ?? evt.PendingAckActionId,
                        evt.AckRequestedAtEpochMs,
                        correlationId: evt.CorrelationId,
                        lifecycleId:   evt.LifecycleId,
                        dcsSequenceId: evt.DcsSequenceId);
                    await publisher.PublishAlarmUpdatedAsync(alarm, ct);
                }
                else if (!isAckStateUpdate)
                {
                    // Normal OPC A&E ingest path — OPC server is the authoritative source.
                    if (evt.Acknowledged && !alarm.Acknowledged)
                    {
                        // External acknowledgment: another HMI/SCADA/Experion acknowledged via OPC.
                        // Honour the OPC-reported state without requiring a UI commandId.
                        alarm.ReconcileAcknowledgement(eventTime, userId: null, comment: null);
                        // Store the ack source so the UI can display it.
                        alarm.MergeOpcAttributes(
                            activeTimeEpochMs: null,
                            cookieOffset:      null,
                            alarmEventKind:    null,
                            opcAckWriteable:   false,
                            sourceEventId:     TryGetOpcString(evt.OpcAttributes, "sourceEventId"));
                        alarm.OpcAttributes["ackSource"] = "External OPC Client";
                        alarm.ApplyConditionChange(evt.ConditionActive, evt.Message, evt.Severity, eventTime);

                        if (!evt.ConditionActive)
                        {
                            await publisher.PublishAlarmClearedAsync(alarm.Id, alarm.SourceName, eventTime, ct);
                            await uow.ActiveAlarms.DeleteAsync(alarm.Id, ct);
                        }
                        else
                        {
                            await publisher.PublishAlarmUpdatedAsync(alarm, ct);
                        }
                    }
                    else
                    {
                        // No external ACK incoming — only reset inferred ack if OPC says not acknowledged.
                        if (!evt.Acknowledged)
                            alarm.ClearOpcInferredAcknowledgement();

                        alarm.ApplyConditionChange(evt.ConditionActive, evt.Message, evt.Severity, eventTime);

                        if (!evt.ConditionActive)
                        {
                            await publisher.PublishAlarmClearedAsync(alarm.Id, alarm.SourceName, eventTime, ct);
                            await uow.ActiveAlarms.DeleteAsync(alarm.Id, ct);
                        }
                        else
                        {
                            await publisher.PublishAlarmUpdatedAsync(alarm, ct);
                        }
                    }
                }
            }
        }

        if (!isAckStateUpdate)
            await PropagateCookieToSiblingRows(existing, evt, publisher, ct);
    }

    /// <summary>
    /// Handle ALARM_STATE_DELETE: delete all matching rows from alarm_current and fire SignalR cleared.
    /// </summary>
    private static async Task HandleDeleteAsync(
        NormalizedAlarmEvent evt,
        Guid serverId,
        IUnitOfWork uow,
        IAlarmSignalRPublisher publisher,
        CancellationToken ct)
    {
        var sourceName = evt.SourceName;
        if (string.IsNullOrWhiteSpace(sourceName)) return;

        var eventTime = DateTimeOffset.FromUnixTimeMilliseconds(evt.EventTimeEpochMs);
        var existing  = await uow.ActiveAlarms.GetBySourceNameForIngestAsync(serverId, sourceName, ct);

        foreach (var alarm in existing)
        {
            if (!MatchesIngestEvent(alarm, evt)) continue;
            await publisher.PublishAlarmClearedAsync(alarm.Id, alarm.SourceName, eventTime, ct);
            await uow.ActiveAlarms.DeleteAsync(alarm.Id, ct);
        }
    }

    /// <summary>
    /// Duplicate ingest rows for the same tag often lack cookieOffset; propagate from the latest Kafka event.
    /// </summary>
    private static async Task PropagateCookieToSiblingRows(
        IReadOnlyList<ActiveAlarm> existing,
        NormalizedAlarmEvent evt,
        IAlarmSignalRPublisher publisher,
        CancellationToken ct)
    {
        if (evt.CookieOffset <= 0) return;

        foreach (var alarm in existing)
        {
            if (TryGetStoredCookie(alarm) > 0) continue;
            if (!alarm.ConditionActive) continue;
            if (!string.Equals(alarm.SourceName, evt.SourceName, StringComparison.OrdinalIgnoreCase)) continue;

            ApplyOpcTiming(alarm, evt);
            await publisher.PublishAlarmUpdatedAsync(alarm, ct);
        }
    }

    private static bool MatchesIngestEvent(ActiveAlarm alarm, NormalizedAlarmEvent evt)
    {
        if (!string.Equals(alarm.ConditionName, evt.ConditionName, StringComparison.OrdinalIgnoreCase))
            return false;
        if (string.IsNullOrWhiteSpace(evt.SubConditionName))
            return true;
        return string.Equals(alarm.SubConditionName, evt.SubConditionName, StringComparison.OrdinalIgnoreCase);
    }

    private static void ApplyOpcTiming(ActiveAlarm alarm, NormalizedAlarmEvent evt)
    {
        var cookie = evt.CookieOffset != 0 ? evt.CookieOffset : TryGetStoredCookie(alarm);
        alarm.MergeOpcAttributes(
            activeTimeEpochMs: evt.ConditionActive ? evt.ActiveTimeEpochMs : null,
            cookieOffset: cookie > 0 ? cookie : null,
            alarmEventKind: evt.AlarmEventKind,
            opcAckWriteable: IsOpcAckWriteable(evt, cookie),
            feed: IsHttpFeedEvent(evt) ? "http-current-alarms" : null,
            ackPath: IsHttpFeedEvent(evt) ? "http" : null,
            sourceEventId: TryGetOpcString(evt.OpcAttributes, "sourceEventId"));
        if (evt.ConditionActive)
            alarm.SyncOpcActiveTime(DateTimeOffset.FromUnixTimeMilliseconds(evt.ActiveTimeEpochMs));
    }

    private static int TryGetStoredCookie(ActiveAlarm alarm)
    {
        if (!alarm.OpcAttributes.TryGetValue("cookieOffset", out var val))
            return 0;
        return val switch
        {
            int i => i,
            long l => (int)l,
            _ => int.TryParse(val?.ToString(), out var p) ? p : 0
        };
    }

    private static bool IsOpcAckWriteable(NormalizedAlarmEvent evt, int cookie)
    {
        if (IsHttpFeedEvent(evt))
            return evt.ConditionActive && !string.IsNullOrWhiteSpace(evt.ConditionName);

        return cookie > 0
            && evt.ConditionActive
            && !string.IsNullOrWhiteSpace(evt.ConditionName)
            && string.Equals(evt.AlarmEventKind, "CONDITION", StringComparison.OrdinalIgnoreCase)
            && !evt.SourceName.StartsWith("Tracking", StringComparison.OrdinalIgnoreCase)
            && !evt.SourceName.StartsWith("System", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsHttpFeedEvent(NormalizedAlarmEvent evt) =>
        evt.OpcAttributes.TryGetValue("feed", out var feed)
        && string.Equals(feed.GetString(), "http-current-alarms", StringComparison.OrdinalIgnoreCase);

    private static (Guid Id, string AlarmKey) ResolveAlarmIdentity(NormalizedAlarmEvent evt, Guid serverId)
    {
        if (!string.IsNullOrWhiteSpace(evt.AlarmId))
        {
            if (Guid.TryParse(evt.AlarmId, out var parsed))
                return (parsed, evt.AlarmId);
            return (AlarmPartitionKeys.DeterministicAlarmId(evt.AlarmId), evt.AlarmId);
        }

        var instanceKey = AlarmPartitionKeys.AlarmInstanceKey(
            serverId, evt.SourceName, evt.ConditionName ?? "", evt.SubConditionName);
        return (AlarmPartitionKeys.DeterministicAlarmId(instanceKey), instanceKey);
    }

    private static bool IsOperatorAckProjection(NormalizedAlarmEvent evt) =>
        !string.IsNullOrEmpty(evt.CommandId) || !string.IsNullOrEmpty(evt.PendingAckActionId);

    private static string? TryGetOpcString(Dictionary<string, JsonElement> opc, string key)
    {
        if (!opc.TryGetValue(key, out var el)) return null;
        if (el.ValueKind == JsonValueKind.String) return el.GetString();
        return el.ToString();
    }

    private static AlarmPriority ParsePriority(string p) => p.ToUpper() switch
    {
        "CRITICAL"   => AlarmPriority.Critical,
        "HIGH"       => AlarmPriority.High,
        "MEDIUM"     => AlarmPriority.Medium,
        "LOW"        => AlarmPriority.Low,
        "DIAGNOSTIC" => AlarmPriority.Diagnostic,
        _            => AlarmPriority.Low
    };

    private static AlarmCategory ParseCategory(string c) => c.ToUpper() switch
    {
        "PROCESS"         => AlarmCategory.Process,
        "EQUIPMENT"       => AlarmCategory.Equipment,
        "INSTRUMENT"      => AlarmCategory.Instrument,
        "SAFETY"          => AlarmCategory.Safety,
        "ENVIRONMENTAL"   => AlarmCategory.Environmental,
        "SYSTEM"          => AlarmCategory.System,
        "OPERATOR_ACTION" => AlarmCategory.OperatorAction,
        "COMMUNICATION"   => AlarmCategory.Communication,
        _                 => AlarmCategory.Process
    };

    private static AlarmEventType ParseEventType(string e) => e.ToUpper() switch
    {
        "SIMPLE"    => AlarmEventType.Simple,
        "TRACKING"  => AlarmEventType.Tracking,
        "CONDITION" => AlarmEventType.Condition,
        _           => AlarmEventType.Condition
    };
}
