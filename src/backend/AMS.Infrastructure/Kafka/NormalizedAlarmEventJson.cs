using System.Text.Json;

namespace AMS.Infrastructure.Kafka;

/// <summary>Parses <see cref="NormalizedAlarmEvent"/> from Flink traverse.alarm.current-alarm-state JSON.</summary>
internal static class NormalizedAlarmEventJson
{
    private static readonly JsonSerializerOptions DeserializeOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new NormalizedAlarmConsumerService.QualityJsonConverter() }
    };

    public static NormalizedAlarmEvent? Parse(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;

        var evt = JsonSerializer.Deserialize<NormalizedAlarmEvent>(json, DeserializeOpts);
        if (evt is null) return null;

        var cookie = ResolveCookieOffset(json, evt.CookieOffset);
        return cookie == evt.CookieOffset ? evt : evt with { CookieOffset = cookie };
    }

    internal static int ResolveCookieOffset(string json, int deserialized = 0)
    {
        if (deserialized != 0) return deserialized;

        try
        {
            using var doc = JsonDocument.Parse(json);
            return ReadCookieElement(doc.RootElement);
        }
        catch
        {
            return 0;
        }
    }

    private static int ReadCookieElement(JsonElement root)
    {
        if (root.TryGetProperty("cookieOffset", out var co))
        {
            var flat = ParseCookieValue(co);
            if (flat != 0) return flat;
        }

        if (root.TryGetProperty("opcAttributes", out var opc)
            && opc.ValueKind == JsonValueKind.Object
            && opc.TryGetProperty("cookieOffset", out var nested))
        {
            return ParseCookieValue(nested);
        }

        return 0;
    }

    private static int ParseCookieValue(JsonElement co) => co.ValueKind switch
    {
        JsonValueKind.Number when co.TryGetInt32(out var n) => n,
        JsonValueKind.String when int.TryParse(co.GetString(), out var p) => p,
        _ => 0
    };
}
