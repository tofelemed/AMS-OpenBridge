using System.Text.Json;
using AMS.Domain.Alarms;

namespace AMS.Application.Alarms;

public static class OpcCookieHelper
{
    private static bool IsSnapshotFeedAlarm(ActiveAlarm alarm) =>
        alarm.OpcAttributes.TryGetValue("feed", out var feed)
        && string.Equals(feed?.ToString(), "http-current-alarms", StringComparison.OrdinalIgnoreCase);

    private static bool IsHttpFeedAlarm(ActiveAlarm alarm) =>
        IsSnapshotFeedAlarm(alarm)
        || (alarm.OpcAttributes.TryGetValue("ackPath", out var path)
            && string.Equals(path?.ToString(), "http", StringComparison.OrdinalIgnoreCase));

    public static int ExtractCookieOffset(ActiveAlarm alarm)
    {
        if (!alarm.OpcAttributes.TryGetValue("cookieOffset", out var val))
            return 0;
        return val switch
        {
            int i => i,
            long l => (int)l,
            JsonElement { ValueKind: JsonValueKind.Number } je when je.TryGetInt32(out var v) => v,
            _ => int.TryParse(val?.ToString(), out var p) ? p : 0
        };
    }

    public static long ExtractActiveFileTime(ActiveAlarm alarm)
    {
        if (!alarm.OpcAttributes.TryGetValue("activeFileTime", out var val))
            return 0;
        return val switch
        {
            long l => l,
            int i => i,
            JsonElement { ValueKind: JsonValueKind.Number } je when je.TryGetInt64(out var v) => v,
            _ => long.TryParse(val?.ToString(), out var p) ? p : 0
        };
    }

    public static string? ExtractSourceEventId(ActiveAlarm alarm)
    {
        if (!alarm.OpcAttributes.TryGetValue("sourceEventId", out var val))
            return null;
        var text = val?.ToString();
        return string.IsNullOrWhiteSpace(text) ? null : text.Trim();
    }

    public static long ExtractActiveTimeEpochMs(ActiveAlarm alarm)
    {
        if (alarm.OpcAttributes.TryGetValue("activeTimeEpochMs", out var val))
        {
            return val switch
            {
                long l => l,
                int i => i,
                JsonElement { ValueKind: JsonValueKind.Number } je when je.TryGetInt64(out var v) => v,
                _ => long.TryParse(val?.ToString(), out var p) ? p : 0
            };
        }

        if (alarm.ActiveTime.Year > 2000)
            return alarm.ActiveTime.ToUnixTimeMilliseconds();
        if (alarm.EventTime.Year > 2000)
            return alarm.EventTime.ToUnixTimeMilliseconds();
        return 0;
    }

    public static Guid ResolveServerId(ActiveAlarm alarm, string? defaultServerId = null)
    {
        if (alarm.ServerId != Guid.Empty)
            return alarm.ServerId;

        if (alarm.OpcAttributes.TryGetValue("serverId", out var attr)
            && Guid.TryParse(attr?.ToString(), out var fromAttr))
            return fromAttr;

        if (!string.IsNullOrWhiteSpace(defaultServerId)
            && Guid.TryParse(defaultServerId, out var fromConfig))
            return fromConfig;

        return Guid.Parse("7ce5ecbf-70c9-498d-b899-5c8bb7add383");
    }

    private static bool IsConditionActiveOnDcs(ActiveAlarm alarm) =>
        alarm.ConditionActive
        || alarm.State is AlarmState.UnacknowledgedUncleared or AlarmState.AcknowledgedUncleared;

    public static bool IsWritebackAckEligible(ActiveAlarm alarm)
    {
        if (IsHttpFeedAlarm(alarm))
            return IsConditionActiveOnDcs(alarm) && !string.IsNullOrWhiteSpace(alarm.ConditionName);

        if (IsSnapshotFeedAlarm(alarm)) return false;
        if (!IsConditionActiveOnDcs(alarm)) return false;
        if (string.IsNullOrWhiteSpace(alarm.ConditionName)) return false;
        var cookie = ExtractCookieOffset(alarm);
        if (cookie <= 0) return false;

        if (alarm.OpcAttributes.TryGetValue("opcAckWriteable", out var flag))
        {
            if (flag is true or "true") return true;
            if (flag is false or "false") return false;
        }

        var kind = alarm.OpcAttributes.TryGetValue("alarmEventKind", out var k)
            ? k?.ToString() ?? "CONDITION"
            : "CONDITION";
        if (!string.Equals(kind, "CONDITION", StringComparison.OrdinalIgnoreCase))
            return false;

        var src = alarm.SourceName ?? string.Empty;
        if (src.StartsWith("Tracking", StringComparison.OrdinalIgnoreCase)
            || src.StartsWith("System", StringComparison.OrdinalIgnoreCase))
            return false;

        return true;
    }

    public static string AckIneligibleReason(ActiveAlarm alarm)
    {
        if (IsWritebackAckEligible(alarm)) return string.Empty;
        if (IsHttpFeedAlarm(alarm) && !IsConditionActiveOnDcs(alarm)) return "Alarm is not active";
        if (IsHttpFeedAlarm(alarm) && string.IsNullOrWhiteSpace(alarm.ConditionName)) return "Missing condition name";
        if (IsSnapshotFeedAlarm(alarm)) return "ACK writeback is unavailable for HTTP snapshot feeds";
        if (alarm.OpcAttributes.TryGetValue("ackPath", out var ackPath)
            && ackPath is not null)
        {
            var normalized = ackPath.ToString() ?? string.Empty;
            if (normalized.Equals("none", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("FoxAPI", StringComparison.OrdinalIgnoreCase))
                return $"ACK requires {normalized}";
        }
        if (ExtractCookieOffset(alarm) <= 0) return "No OPC cookieOffset — wait for live DCS event";
        if (!IsConditionActiveOnDcs(alarm)) return "Alarm is not active on DCS";
        if (string.IsNullOrWhiteSpace(alarm.ConditionName)) return "Missing OPC condition name";
        return "OPC writeback ACK not available for this event type";
    }
}
