namespace Traverse.IngestionService.Health;

public enum HealthTopicKind { State, Events, Availability }

/// <summary>The captures of one health topic: {prefix}/{tenant}/{site}/devices/{device}/(state|events) or /sources/{source}/availability.</summary>
public sealed record HealthTopic(HealthTopicKind Kind, string TenantId, string SiteId, string? DeviceId, string? SourceId)
{
    public string ExpectedMessageKind => Kind switch
    {
        HealthTopicKind.State => "STATE_SNAPSHOT",
        HealthTopicKind.Events => "STATE_EVENT",
        _ => "SOURCE_AVAILABILITY",
    };

    public static bool TryParse(string prefix, string topic, out HealthTopic? parsed, out string? error)
    {
        parsed = null;
        error = null;
        if (!topic.StartsWith(prefix + "/", StringComparison.Ordinal))
        {
            error = $"topic is outside the prefix '{prefix}'";
            return false;
        }
        var rest = topic[(prefix.Length + 1)..].Split('/');
        // tenant / site / devices / device / (state|events)  = 5   |   tenant / site / sources / source / availability = 5
        if (rest.Length != 5 || rest.Any(string.IsNullOrEmpty))
        {
            error = "expected {tenant}/{site}/devices/{device}/(state|events) or {tenant}/{site}/sources/{source}/availability";
            return false;
        }
        switch (rest[2], rest[4])
        {
            case ("devices", "state"): parsed = new HealthTopic(HealthTopicKind.State, rest[0], rest[1], rest[3], null); return true;
            case ("devices", "events"): parsed = new HealthTopic(HealthTopicKind.Events, rest[0], rest[1], rest[3], null); return true;
            case ("sources", "availability"): parsed = new HealthTopic(HealthTopicKind.Availability, rest[0], rest[1], null, rest[3]); return true;
            default:
                error = $"unknown topic shape '{rest[2]}/.../{rest[4]}'";
                return false;
        }
    }
}
