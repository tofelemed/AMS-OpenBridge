using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Traverse.IngestionService.Health;

/// <summary>
/// profile_config.instrumental_health — per-data-source settings for the INSTRUMENTAL_HEALTH
/// profile (v2.5 Task 1H.2; contract: docs/next-release/instrumental-health-contract.md).
/// The subscriber derives its topic filters from the prefix + tenant + site, so a source can
/// only ever subscribe to its own scope (spec v6 §4.3).
/// </summary>
public sealed class InstrumentalHealthConfig
{
    public const string DefaultTopicPrefix = "traverse/instrumental/v1";
    public const int DefaultMaxSkewSeconds = 86_400;
    public const int DefaultMaxMessageBytes = 65_536;

    [JsonPropertyName("topic_prefix")] public string? TopicPrefix { get; set; }
    [JsonPropertyName("tenant_id")] public string? TenantId { get; set; }
    [JsonPropertyName("site_id")] public string? SiteId { get; set; }
    /// <summary>Producers this source is allowed to speak for; anything else is dead-lettered SOURCE_NOT_ALLOWED.</summary>
    [JsonPropertyName("allowed_source_ids")] public List<string>? AllowedSourceIds { get; set; }
    /// <summary>|published_at - received_at| beyond this is a transport/clock fault (observed/verified times are never limited: an old retained snapshot is valid, just stale).</summary>
    [JsonPropertyName("max_skew_seconds")] public int? MaxSkewSeconds { get; set; }
    [JsonPropertyName("max_message_bytes")] public int? MaxMessageBytes { get; set; }

    public InstrumentalHealthSettings Resolve() => new(
        string.IsNullOrWhiteSpace(TopicPrefix) ? DefaultTopicPrefix : TopicPrefix.Trim().TrimEnd('/'),
        (TenantId ?? "").Trim(),
        (SiteId ?? "").Trim(),
        (AllowedSourceIds ?? new List<string>()).Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim())
            .ToHashSet(StringComparer.Ordinal),
        MaxSkewSeconds is > 0 ? MaxSkewSeconds.Value : DefaultMaxSkewSeconds,
        MaxMessageBytes is > 0 ? MaxMessageBytes.Value : DefaultMaxMessageBytes);

    private static readonly Regex IdPattern = new("^[A-Za-z0-9][A-Za-z0-9._:-]*$", RegexOptions.Compiled);

    /// <summary>Save-time validation (DataSourceValidation): the block must name its scope.</summary>
    public static (string Error, string Field)? Validate(InstrumentalHealthConfig? c)
    {
        if (c is null) return null;
        if (string.IsNullOrWhiteSpace(c.TenantId) || !IdPattern.IsMatch(c.TenantId.Trim()))
            return ("tenant_id is required (letters, digits, . _ : -)", "instrumental_health.tenant_id");
        if (string.IsNullOrWhiteSpace(c.SiteId) || !IdPattern.IsMatch(c.SiteId.Trim()))
            return ("site_id is required (letters, digits, . _ : -)", "instrumental_health.site_id");
        if (c.AllowedSourceIds is null || c.AllowedSourceIds.All(string.IsNullOrWhiteSpace))
            return ("allowed_source_ids must list at least one Instrumental source id", "instrumental_health.allowed_source_ids");
        if (c.AllowedSourceIds.Any(s => !string.IsNullOrWhiteSpace(s) && !IdPattern.IsMatch(s.Trim())))
            return ("allowed_source_ids entries must be identifiers (letters, digits, . _ : -)", "instrumental_health.allowed_source_ids");
        if (c.MaxSkewSeconds is <= 0) return ("max_skew_seconds must be greater than 0", "instrumental_health.max_skew_seconds");
        if (c.MaxMessageBytes is <= 0) return ("max_message_bytes must be greater than 0", "instrumental_health.max_message_bytes");
        return null;
    }
}

public sealed record InstrumentalHealthSettings(
    string TopicPrefix, string TenantId, string SiteId, IReadOnlySet<string> AllowedSourceIds,
    int MaxSkewSeconds, int MaxMessageBytes)
{
    /// <summary>The only three filters this source subscribes to: its own tenant/site scope.</summary>
    public IReadOnlyList<string> SubscriptionFilters() => new[]
    {
        $"{TopicPrefix}/{TenantId}/{SiteId}/devices/+/state",
        $"{TopicPrefix}/{TenantId}/{SiteId}/devices/+/events",
        $"{TopicPrefix}/{TenantId}/{SiteId}/sources/+/availability",
    };
}
