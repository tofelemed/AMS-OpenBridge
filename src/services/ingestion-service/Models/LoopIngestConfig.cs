using System.Text.Json.Serialization;

namespace Traverse.IngestionService.Models;

/// <summary>
/// profile_config.loop_ingest — per-data-source settings for the MQTT_LOOP_SAMPLES
/// subscriber pipeline. Snake_case on the wire like the rest of profile_config.
/// The topic template and the two maps exist so no loop/FCS/parameter name is ever
/// hardcoded in service code (docs/ot-data-integration/08 §4, 09 §1-2).
/// </summary>
public sealed class LoopIngestConfig
{
    /// <summary>'/'-separated; '{name}' captures a level. Must capture {site} {fcs} {loop} {param}.</summary>
    [JsonPropertyName("topic_template")] public string? TopicTemplate { get; set; }
    [JsonPropertyName("grid_seconds")] public int? GridSeconds { get; set; }
    [JsonPropertyName("future_skew_max_seconds")] public int? FutureSkewMaxSeconds { get; set; }
    /// <summary>Source parameter → canonical role (pv/sp/op/vp/mode = tuple members; anything else = numeric extension field).</summary>
    [JsonPropertyName("param_roles")] public Dictionary<string, string>? ParamRoles { get; set; }
    /// <summary>Numeric MODE enum → engine vocabulary (e.g. {"4":"AUT"}). Unmapped values pass through raw.</summary>
    [JsonPropertyName("mode_value_map")] public Dictionary<string, string>? ModeValueMap { get; set; }
    [JsonPropertyName("registry_refresh_seconds")] public int? RegistryRefreshSeconds { get; set; }

    public static readonly Dictionary<string, string> DefaultParamRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        ["PV"] = "pv", ["SP"] = "sp", ["OP"] = "op", ["MODE"] = "mode",
        // Yokogawa CENTUM aliases (the plant's own loop export uses SV = setpoint,
        // MV = controller output, while the broker screenshots showed SP/OP —
        // accept both so a gateway rename never silently parks a whole plant).
        ["SV"] = "sp", ["MV"] = "op",
        ["P"] = "p", ["I"] = "i", ["D"] = "d", ["GW"] = "gw",
    };

    public LoopIngestSettings Resolve() => new(
        TopicTemplate: string.IsNullOrWhiteSpace(TopicTemplate)
            ? "{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}" : TopicTemplate.Trim(),
        GridSeconds: GridSeconds is > 0 ? GridSeconds.Value : 5,
        FutureSkewMaxSeconds: FutureSkewMaxSeconds is > 0 ? FutureSkewMaxSeconds.Value : 300,
        ParamRoles: ParamRoles is { Count: > 0 }
            ? new Dictionary<string, string>(ParamRoles, StringComparer.OrdinalIgnoreCase)
            : DefaultParamRoles,
        ModeValueMap: ModeValueMap ?? new Dictionary<string, string>(),
        RegistryRefreshSeconds: RegistryRefreshSeconds is > 0 ? RegistryRefreshSeconds.Value : 60);
}

/// <summary>Resolved, defaulted settings — what the pipeline stages actually consume.</summary>
public sealed record LoopIngestSettings(
    string TopicTemplate,
    int GridSeconds,
    int FutureSkewMaxSeconds,
    IReadOnlyDictionary<string, string> ParamRoles,
    IReadOnlyDictionary<string, string> ModeValueMap,
    int RegistryRefreshSeconds);
