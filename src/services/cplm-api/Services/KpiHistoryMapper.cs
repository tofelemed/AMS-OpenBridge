using System.Text.Json;
using static Traverse.CplmApi.Services.ResultPayloadReader;

namespace Traverse.CplmApi.Services;

public enum KpiResultKind { Gate, Short, Long }

/// <summary>One IoTDB row of KPI history: device, window-end timestamp, typed fields (nulls omitted).</summary>
public sealed record KpiHistoryPoint(
    string Device,
    long TimestampMs,
    IReadOnlyList<KeyValuePair<string, object?>> Fields,
    // v1 only: CREATE TIMESERIES types for the legacy tree. v2 devices are governed by templates.
    IReadOnlyDictionary<string, string>? LegacyTypes);

/// <summary>
/// CHG-102 — maps a CPLM result message (gate / short / long) to its IoTDB KPI-history row.
///
/// LIVE only: a SHADOW / REPLAY / recompute result has the same window end as the live one,
/// and IoTDB keys a point by timestamp — writing it would silently overwrite the live point.
///
/// v2 (IotDb:Layout = v2, infra/docker/iotdb-layout-v2.sh): device
/// &lt;KpiDatabase|ShortKpiDatabase&gt;.&lt;family&gt;.&lt;loop&gt;, fields EXACTLY the template's
/// measurements (with auto-create on, an unknown measurement extends the template for every
/// device), unknown families refused. v1: the legacy &lt;prefix&gt;.&lt;loop&gt;.kpi.&lt;family&gt; series.
/// </summary>
public static class KpiHistoryMapper
{
    // ── v2 template measurement lists — keep identical to infra/docker/iotdb-layout-v2.sh ──
    public static readonly string[] GateNumeric =
    {
        "sample_count", "mae", "rmse", "iae", "good_error_pct", "acf_period_s", "acf_regularity",
        "effort_ratio", "triangularity", "horch_oddness", "phase_area_norm_per_cycle", "corner_score",
        "travel_per_day", "reversals_per_hour", "harmonic_amplitude_ratio", "harmonic_energy_ratio",
        "confidence", "auto_pct", "saturation_pct", "completeness",
    };
    public static readonly string[] GateText =
    {
        "diagnosis", "severity", "selected_family",
        "g0", "g1", "g2", "g2r", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11", "g12", "g13", "g14", "g15",
        "bundle_hash", "engine",
    };
    public static readonly string[] LongNumeric =
    {
        "sample_count", "acf_period_s", "acf_regularity", "effort_ratio", "triangularity", "horch_oddness",
        "corner_score", "travel_per_day", "reversals_per_hour", "harmonic_amplitude_ratio", "harmonic_energy_ratio",
    };
    public static readonly string[] LongText =
        { "evaluation_state", "g5", "g6", "g7", "g8", "g9", "g10", "g11", "bundle_hash", "engine" };
    public static readonly string[] ShortNumeric =
    {
        "sample_count", "iae", "ise", "mae", "rmse", "good_error_pct", "effort_ratio", "travel_per_day",
        "reversals_per_hour", "auto_pct", "completeness",
    };
    public static readonly string[] ShortText =
        { "sufficient_data", "evaluation_state", "g0", "g1", "g2", "g2r", "g3", "g4", "bundle_hash", "engine" };

    public static readonly IReadOnlySet<string> GateFamilies = new HashSet<string> { "gate_12h", "gate_24h" };
    public static readonly IReadOnlySet<string> LongFamilies = new HashSet<string> { "long_4h", "long_12h", "long_24h" };
    public static readonly IReadOnlySet<string> ShortFamilies = new HashSet<string>
        { "short_1m", "short_5m", "short_10m", "short_15m", "short_30m", "short_60m" };

    // ── v1 (legacy tree) field lists — unchanged from the Phase 3.6 dual-write ──
    private static readonly string[] LegacyGateNumeric =
    {
        "mae", "rmse", "iae", "good_error_pct", "acf_period_s", "acf_regularity", "effort_ratio", "triangularity",
        "horch_oddness", "phase_area_norm_per_cycle", "corner_score", "travel_per_day", "reversals_per_hour",
        "harmonic_amplitude_ratio", "harmonic_energy_ratio", "confidence",
    };
    private static readonly string[] LegacyLongNumeric = LongNumeric[1..];
    private static readonly string[] LegacyShortNumeric = ShortNumeric[1..];

    /// <summary>Maps a message; null + <paramref name="skipReason"/> when it must not be written.</summary>
    public static KpiHistoryPoint? Map(KpiResultKind kind, JsonElement root, IotDbWriteOptions opts, out string? skipReason)
    {
        skipReason = null;
        var purpose = GetString(root, "purpose") ?? "LIVE";
        var source = GetString(root, "calculation_source") ?? "flink";
        if (!purpose.Equals("LIVE", StringComparison.OrdinalIgnoreCase) || !source.Equals("flink", StringComparison.OrdinalIgnoreCase))
        { skipReason = $"not live ({purpose}/{source})"; return null; }

        var loopId = GetString(root, "loop_id") ?? GetString(root, "tagId");
        if (string.IsNullOrWhiteSpace(loopId)) { skipReason = "no loop_id"; return null; }
        if (!(root.TryGetProperty("windowEndMs", out var p) && p.TryGetInt64(out var endMs) && endMs > 0))
        { skipReason = "no windowEndMs"; return null; }

        var windowKind = GetString(root, "window_kind") ?? kind switch
            { KpiResultKind.Short => "5m", _ => "24h" };
        var family = kind switch
        {
            KpiResultKind.Gate => "gate_" + windowKind,
            KpiResultKind.Short => "short_" + windowKind,
            _ => "long_" + windowKind,
        };
        var node = IotDbWriteClient.SafeNode(loopId);

        if (opts.IsLayoutV2)
            return MapV2(kind, root, opts, family, node, endMs, out skipReason);
        return MapLegacy(kind, root, opts, family, node, endMs);
    }

    private static KpiHistoryPoint? MapV2(KpiResultKind kind, JsonElement root, IotDbWriteOptions opts,
        string family, string node, long endMs, out string? skipReason)
    {
        skipReason = null;
        var (families, numeric, text, db) = kind switch
        {
            KpiResultKind.Gate => (GateFamilies, GateNumeric, GateText, opts.KpiDatabase),
            KpiResultKind.Long => (LongFamilies, LongNumeric, LongText, opts.KpiDatabase),
            _ => (ShortFamilies, ShortNumeric, ShortText, opts.ShortKpiDatabase),
        };
        if (!families.Contains(family)) { skipReason = $"family {family} has no template"; return null; }

        var fields = new List<KeyValuePair<string, object?>>();
        foreach (var f in numeric)
        {
            var v = f == "sample_count" ? (object)(double)GetInt(root, f) : GetDoubleOrNull(root, f);
            if (v is double d) fields.Add(new(f, d));   // P1-8: a metric not computed is a gap, never 0.0
        }
        foreach (var f in text)
        {
            var v = TextField(root, f);
            if (!string.IsNullOrEmpty(v)) fields.Add(new(f, v));
        }
        return new KpiHistoryPoint($"{db}.{family}.{node}", endMs, fields, null);
    }

    /// <summary>Template text fields: gN = gateN_status, engine = short jar hash, booleans as text.</summary>
    private static string? TextField(JsonElement root, string f)
    {
        if (f == "engine")
        {
            var jar = GetString(root, "jarSha256");
            return string.IsNullOrEmpty(jar) ? null : jar[..Math.Min(12, jar.Length)];
        }
        if (f.Length <= 4 && f[0] == 'g' && char.IsDigit(f[1]))
            return GetString(root, $"gate{f[1..]}_status");
        if (root.TryGetProperty(f, out var el))
        {
            return el.ValueKind switch
            {
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                JsonValueKind.String => el.GetString(),
                _ => null,
            };
        }
        return null;
    }

    private static KpiHistoryPoint MapLegacy(KpiResultKind kind, JsonElement root, IotDbWriteOptions opts,
        string family, string node, long endMs)
    {
        var numeric = kind switch
        {
            KpiResultKind.Gate => LegacyGateNumeric,
            KpiResultKind.Long => LegacyLongNumeric,
            _ => LegacyShortNumeric,
        };
        string[] text = kind == KpiResultKind.Gate ? new[] { "diagnosis", "severity" } : Array.Empty<string>();

        var types = new Dictionary<string, string> { ["sample_count"] = "DOUBLE" };
        foreach (var f in numeric) types[f] = "DOUBLE";
        foreach (var f in text) types[f] = "TEXT";

        var fields = new List<KeyValuePair<string, object?>> { new("sample_count", (double)GetInt(root, "sample_count")) };
        foreach (var f in numeric)
        {
            var v = GetDoubleOrNull(root, f);
            if (v is double d) fields.Add(new(f, d));
        }
        foreach (var f in text)
        {
            var v = GetString(root, f);
            if (v != null) fields.Add(new(f, v));
        }
        return new KpiHistoryPoint($"{opts.LoopRootPrefix}.{node}.kpi.{family}", endMs, fields, types);
    }
}
