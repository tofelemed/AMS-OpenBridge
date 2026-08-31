using System.Text.Json;

namespace AMS.Infrastructure.Kafka;

/// <summary>Parses timestamps from HTTP API traverse.alarm.raw-alarms payloads.</summary>
internal static class RawAlarmEventParser
{
    public static long ResolveEventTimeEpochMs(JsonElement root)
    {
        if (root.TryGetProperty("eventTimeEpochMs", out var et) && et.TryGetInt64(out var ms))
            return ms;
        if (root.TryGetProperty("timestamp", out var ts) && ts.ValueKind == JsonValueKind.String)
        {
            if (DateTimeOffset.TryParse(ts.GetString(), out var dto))
                return dto.ToUnixTimeMilliseconds();
        }
        return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    public static long ResolveIngestEpochMs(JsonElement root, long eventTimeEpochMs) =>
        eventTimeEpochMs > 0 ? eventTimeEpochMs : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
