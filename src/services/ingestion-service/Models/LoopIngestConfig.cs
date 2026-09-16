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
    /// <summary>
    /// Source parameter → canonical role (pv/sp/op/vp/mode = tuple members; anything
    /// else = numeric extension field). OVERLAYS <see cref="DefaultParamRoles"/>: an
    /// entry adds or re-points one leaf, and a null/blank value removes a built-in
    /// entry. It used to REPLACE the built-in map, so the natural edit — "just add
    /// VP" — un-mapped PV/SP/OP/MODE and every loop on the source went dark
    /// (runbook 10 §2b, verified live 2026-09-10).
    /// </summary>
    [JsonPropertyName("param_roles")] public Dictionary<string, string?>? ParamRoles { get; set; }
    /// <summary>Numeric MODE enum → engine vocabulary (e.g. {"4":"AUT"}). Unmapped values pass through raw.</summary>
    [JsonPropertyName("mode_value_map")] public Dictionary<string, string>? ModeValueMap { get; set; }
    [JsonPropertyName("registry_refresh_seconds")] public int? RegistryRefreshSeconds { get; set; }

    public static readonly IReadOnlyDictionary<string, string> DefaultParamRoles =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["PV"] = "pv", ["SP"] = "sp", ["OP"] = "op", ["MODE"] = "mode",
            // Valve positioner feedback. Optional tuple member: never gates emission,
            // never part of the GOOD/BAD verdict, but without it G14 reports
            // INSUFFICIENT_EVIDENCE and confidence is capped at 0.89. On by default so
            // the day OT publishes it, it flows — no config edit, nothing parks.
            ["VP"] = "vp",
            // Yokogawa CENTUM aliases (the plant's own loop export uses SV = setpoint,
            // MV = controller output, while the broker screenshots showed SP/OP —
            // accept both so a gateway rename never silently parks a whole plant).
            ["SV"] = "sp", ["MV"] = "op",
            ["P"] = "p", ["I"] = "i", ["D"] = "d", ["GW"] = "gw",
        };

    /// <summary>
    /// The map the pipeline actually consults: built-ins, then the configured
    /// overlay. Shared by <see cref="Resolve"/> and by validation, so what is
    /// checked at save time is exactly what runs. Never mutates the defaults.
    /// </summary>
    public static Dictionary<string, string> EffectiveParamRoles(IReadOnlyDictionary<string, string?>? overlay)
    {
        var map = new Dictionary<string, string>(DefaultParamRoles, StringComparer.OrdinalIgnoreCase);
        if (overlay is null) return map;
        foreach (var (param, role) in overlay)
        {
            if (string.IsNullOrWhiteSpace(param)) continue; // validation rejects; be safe at runtime
            if (string.IsNullOrWhiteSpace(role)) map.Remove(param);
            else map[param] = role.Trim();
        }
        return map;
    }

    public LoopIngestSettings Resolve() => new(
        TopicTemplate: string.IsNullOrWhiteSpace(TopicTemplate)
            ? "{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}" : TopicTemplate.Trim(),
        GridSeconds: GridSeconds is > 0 ? GridSeconds.Value : 5,
        FutureSkewMaxSeconds: FutureSkewMaxSeconds is > 0 ? FutureSkewMaxSeconds.Value : 300,
        ParamRoles: EffectiveParamRoles(ParamRoles),
        ModeValueMap: ModeValueMap ?? new Dictionary<string, string>(),
        RegistryRefreshSeconds: RegistryRefreshSeconds is > 0 ? RegistryRefreshSeconds.Value : 60,
        BindingRevision: LoopIngestSettings.ComputeBindingRevision(EffectiveParamRoles(ParamRoles), ModeValueMap));
}

/// <summary>Resolved, defaulted settings — what the pipeline stages actually consume.</summary>
public sealed record LoopIngestSettings(
    string TopicTemplate,
    int GridSeconds,
    int FutureSkewMaxSeconds,
    IReadOnlyDictionary<string, string> ParamRoles,
    IReadOnlyDictionary<string, string> ModeValueMap,
    int RegistryRefreshSeconds,
    /// <summary>v2.5 (R03): identifies the tag→role binding a tuple was assembled under.
    /// A stable 63-bit FNV-1a hash of the effective param_roles and mode_value_map, so it
    /// changes exactly when the binding changes — not on every config touch (the row
    /// version bumps on last_data_received updates and would be meaningless here).</summary>
    long BindingRevision = 0)
{
    public static long ComputeBindingRevision(
        IReadOnlyDictionary<string, string> paramRoles, IReadOnlyDictionary<string, string>? modeValueMap)
    {
        ulong h = 14695981039346656037UL;
        void Mix(string s) { foreach (var ch in s) { h ^= ch; h *= 1099511628211UL; } h ^= 0x1F; h *= 1099511628211UL; }
        foreach (var kv in paramRoles.OrderBy(k => k.Key, StringComparer.Ordinal)) { Mix(kv.Key); Mix(kv.Value); }
        Mix("|mode|");
        if (modeValueMap is not null)
            foreach (var kv in modeValueMap.OrderBy(k => k.Key, StringComparer.Ordinal)) { Mix(kv.Key); Mix(kv.Value); }
        return (long)(h & 0x7FFF_FFFF_FFFF_FFFFUL);
    }
}
