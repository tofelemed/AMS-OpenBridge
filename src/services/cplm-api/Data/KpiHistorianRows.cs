using System.Dynamic;
using System.Text.Json;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Data;

/// <summary>
/// CHG-102 Phase 3 — maps a KPI-history row read from IoTDB (layout v2 templates, KpiHistoryMapper) to the
/// SAME row the Postgres path serves, so the frontend never knows which tier answered. Pure (no I/O).
///
/// Rules: every key of the Postgres row is present; a field IoTDB does not keep is null (never invented);
/// <c>method_run_ids</c> is <c>'{}'</c> — the same text a pre-v2.5 row carries, meaning "cannot be opened in
/// the workbench"; <c>purpose</c> is LIVE (only LIVE results are written to the history); <c>source</c> says
/// which tier answered.
/// </summary>
public static class KpiHistorianRows
{
    public const string SourcePostgres = "postgres";
    public const string SourceHistorian = "historian";
    private const string NoRunIds = "{}";

    /// <summary>The IoTDB family for a window kind, or null when the kind has none (served from Postgres only).</summary>
    public static string? Family(string windowKind, KpiResultKind kind)
    {
        var (prefix, families) = kind switch
        {
            KpiResultKind.Gate => ("gate_", KpiHistoryMapper.GateFamilies),
            KpiResultKind.Long => ("long_", KpiHistoryMapper.LongFamilies),
            _ => ("short_", KpiHistoryMapper.ShortFamilies),
        };
        var family = prefix + windowKind;
        return families.Contains(family) ? family : null;
    }

    public static string[] Columns(KpiResultKind kind) => kind switch
    {
        KpiResultKind.Gate => KpiHistoryMapper.GateNumeric.Concat(KpiHistoryMapper.GateText).ToArray(),
        KpiResultKind.Long => KpiHistoryMapper.LongNumeric.Concat(KpiHistoryMapper.LongText).ToArray(),
        _ => KpiHistoryMapper.ShortNumeric.Concat(KpiHistoryMapper.ShortText).ToArray(),
    };

    /// <summary>KpiSql.Short's row shape from a <c>short_&lt;wk&gt;</c> point.</summary>
    public static Dictionary<string, object?> Short(IotDbRow r)
    {
        var v = r.Values;
        return new Dictionary<string, object?>
        {
            ["window_start"] = null,
            ["window_end"] = WindowEnd(r),
            ["sample_count"] = Int(v, "sample_count"),
            ["iae"] = Num(v, "iae"),
            ["ise"] = Num(v, "ise"),
            ["mae"] = Num(v, "mae"),
            ["rmse"] = Num(v, "rmse"),
            ["good_error_pct"] = Num(v, "good_error_pct"),
            ["effort_ratio"] = Num(v, "effort_ratio"),
            ["travel_per_day"] = Num(v, "travel_per_day"),
            ["reversals_per_hour"] = Num(v, "reversals_per_hour"),
            ["auto_pct"] = Num(v, "auto_pct"),
            ["completeness"] = Num(v, "completeness"),
            ["created_at"] = null,
            ["sufficient_data"] = Bool(v, "sufficient_data"),
            ["sample_period_sec"] = null,
            ["expected_sample_count"] = null,
            ["gate0_status"] = Text(v, "g0"),
            ["gate1_status"] = Text(v, "g1"),
            ["gate2_status"] = Text(v, "g2"),
            ["gate2r_status"] = Text(v, "g2r"),
            ["gate3_status"] = Text(v, "g3"),
            ["gate4_status"] = Text(v, "g4"),
            ["gate0_reason"] = null,
            ["evaluation_state"] = Text(v, "evaluation_state"),
            ["evaluation_reason"] = null,
            ["method_run_ids"] = NoRunIds,
            ["bundle_hash"] = Text(v, "bundle_hash"),
            ["purpose"] = "LIVE",
            ["source"] = SourceHistorian,
        };
    }

    /// <summary>KpiSql.Long's row shape from a <c>long_&lt;wk&gt;</c> point.</summary>
    public static Dictionary<string, object?> Long(IotDbRow r)
    {
        var v = r.Values;
        return new Dictionary<string, object?>
        {
            ["window_start"] = null,
            ["window_end"] = WindowEnd(r),
            ["sample_count"] = Int(v, "sample_count"),
            ["acf_period_s"] = Num(v, "acf_period_s"),
            ["acf_regularity"] = Num(v, "acf_regularity"),
            ["effort_ratio"] = Num(v, "effort_ratio"),
            ["triangularity"] = Num(v, "triangularity"),
            ["horch_oddness"] = Num(v, "horch_oddness"),
            ["corner_score"] = Num(v, "corner_score"),
            ["travel_per_day"] = Num(v, "travel_per_day"),
            ["reversals_per_hour"] = Num(v, "reversals_per_hour"),
            ["harmonic_amplitude_ratio"] = Num(v, "harmonic_amplitude_ratio"),
            ["harmonic_energy_ratio"] = Num(v, "harmonic_energy_ratio"),
            ["created_at"] = null,
            // not kept in the history: unknown, not "qualified" (the Postgres COALESCE-to-TRUE would claim it)
            ["long_metrics_qualified"] = null,
            ["freeze_fraction"] = null,
            ["sample_period_sec"] = null,
            ["expected_sample_count"] = null,
            ["method_run_ids"] = NoRunIds,
            ["bundle_hash"] = Text(v, "bundle_hash"),
            ["purpose"] = "LIVE",
            ["vw_completeness"] = null,
            ["vw_sample_count"] = null,
            ["vw_auto_pct"] = null,
            ["vw_mae"] = null,
            ["vw_rmse"] = null,
            ["vw_iae"] = null,
            ["vw_ise"] = null,
            ["vw_good_error_pct"] = null,
            ["vw_effort_ratio"] = null,
            ["source"] = SourceHistorian,
        };
    }

    /// <summary>
    /// The gate-history SUMMARY projection of a <c>gate_&lt;wk&gt;</c> point, built through
    /// <see cref="GateMatrixProjection.Summary"/> itself (a synthetic row + payload) so the two tiers
    /// cannot drift in shape. Statuses ride the payload's <c>gates{}</c> rollup; <c>jarSha256</c> is the
    /// 12-character prefix the history keeps.
    /// </summary>
    public static Dictionary<string, object?> GateSummary(IotDbRow r, string loopId, string windowKind)
    {
        var v = r.Values;
        var gates = new Dictionary<string, string>();
        foreach (var g in Services.GateCatalog.Defs)
        {
            var status = Text(v, "g" + g.Key[1..].ToLowerInvariant());
            if (status is not null) gates[g.Key] = status;
        }
        var payload = new Dictionary<string, object?> { ["gates"] = gates };
        AddText(payload, "bundle_hash", v, "bundle_hash");
        AddText(payload, "selected_family", v, "selected_family");
        AddText(payload, "jarSha256", v, "engine");
        foreach (var f in KpiHistoryMapper.GateNumeric)
            if (Num(v, f) is double d) payload[f] = d;

        dynamic row = new ExpandoObject();
        row.loop_id = loopId;
        row.window_kind = windowKind;
        row.window_start = null;
        row.window_end = WindowEnd(r);
        row.sample_count = Int(v, "sample_count");
        row.diagnosis = Text(v, "diagnosis");
        row.severity = Text(v, "severity");
        row.confidence = Num(v, "confidence");
        row.payload = JsonSerializer.Serialize(payload);
        row.created_at = null;
        Dictionary<string, object?> summary = GateMatrixProjection.Summary(row);
        summary["source"] = SourceHistorian;
        return summary;
    }

    public static DateTime WindowEnd(IotDbRow r) => DateTime.SpecifyKind(DateTime.UnixEpoch.AddMilliseconds(r.TimestampMs), DateTimeKind.Utc);

    private static void AddText(Dictionary<string, object?> payload, string key, IReadOnlyDictionary<string, object?> v, string field)
    {
        if (Text(v, field) is string s) payload[key] = s;
    }

    private static double? Num(IReadOnlyDictionary<string, object?> v, string k) =>
        v.TryGetValue(k, out var o) && o is double d && !double.IsNaN(d) ? d : null;

    private static int? Int(IReadOnlyDictionary<string, object?> v, string k) =>
        Num(v, k) is double d ? (int)Math.Round(d) : null;

    private static string? Text(IReadOnlyDictionary<string, object?> v, string k) =>
        v.TryGetValue(k, out var o) && o is string s && s.Length > 0 ? s : null;

    private static bool? Bool(IReadOnlyDictionary<string, object?> v, string k) => Text(v, k) switch
    {
        "true" => true,
        "false" => false,
        _ => null,
    };
}
