using System.Text.Json;

namespace Traverse.CplmApi.Data;

/// <summary>
/// Projects a stored gate row into the matrix the UI binds to (gates/latest and the gate
/// history). The 17 statuses and the version stamps live only in the payload JSONB (the typed
/// columns carry metrics), so they are read from there; A13 metadata rides along so a window
/// can always be attributed to the calculation that produced it.
///
/// v2.5 Task 1E.2 (spec v6 R02): the fusion v2 verdict — observations (what was seen, with the
/// method that saw it), hypotheses (what could explain it), and the FAULT-SCOPED confirmation
/// (G14) — is served verbatim under <c>verdictV2</c> beside the legacy fields. A row written by
/// a pre-v2.5 jar carries none of it and is reported as <c>legacy</c> with the G14 flag marked
/// LEGACY_FLAG_ONLY, never re-interpreted. Pure (no DB): see GateMatrixProjectionTests.
/// </summary>
public static class GateMatrixProjection
{
    private static readonly (string Key, string Name, string Tier)[] GateDefs =
        Services.GateCatalog.Defs.Select(g => (g.Key, g.Name, g.Tier)).ToArray();

    public static Dictionary<string, object?> Build(dynamic row)
    {
        var payload = ParseJson((string?)row.payload);
        var verdictV2 = ReadVerdictV2(payload);
        // v2.5 (2E.3, R13): every cell names its immutable method run so the workbench opens THAT
        // evaluation, never "latest"; pre-v2.5 rows have no ids and the cell says so with null.
        var methodRunIds = ReadStringMap(payload, "method_run_ids");
        var gates = new List<object>();
        foreach (var (key, name, tier) in GateDefs)
        {
            gates.Add(new
            {
                key,
                name,
                tier,
                methodRunId = methodRunIds.TryGetValue(key, out var mr) ? mr : null,
                status = ReadGateStatus(payload, key),
                // Why a gate is not evaluated matters as much as its status:
                // NO_VP, NO_UPSTREAM_LINKS and NO_STEP_TEST are configuration
                // gaps the operator can close, not engine failures. G14 carries the
                // confirmation reason (NO_VP / NO_POSITIVE_EVIDENCE / VP_TRACKING_HEALTHY /
                // NON_FOLLOWING_DWELL / NOT_A_FINAL_ELEMENT_CLAIM) or LEGACY_FLAG_ONLY.
                reason = key switch
                {
                    "G9" => ReadString(payload, "gate9_reason"),
                    "G13" => ReadString(payload, "gate13_reason"),                 // v2.5 (2F.1): the analysis state/reason, or the legacy flag label
                    "G5" or "G6" or "G12" => LimitedReason(payload, key),           // v2.5 (2G.1, NR-016): BANDWIDTH when the grid limits the method
                    "G14" => verdictV2.Legacy ? "LEGACY_FLAG_ONLY" : verdictV2.Confirmation.Reason,
                    _ => null
                }
            });
        }

        return new Dictionary<string, object?>
        {
            ["loopId"] = row.loop_id,
            ["windowKind"] = row.window_kind,
            ["windowStart"] = row.window_start,
            ["windowEnd"] = row.window_end,
            ["sampleCount"] = row.sample_count,
            ["diagnosis"] = row.diagnosis,
            ["severity"] = row.severity,
            ["confidence"] = row.confidence,
            ["gates"] = gates,
            ["methodRunIds"] = methodRunIds,
            ["bundleHash"] = ReadString(payload, "bundle_hash"),
            ["resultRevision"] = ReadInt(payload, "result_revision"),
            ["observabilityFlags"] = ReadStringArray(payload, "observability_flags"),
            ["familyDisqualifiers"] = ReadStringArray(payload, "family_disqualifiers"),
            ["hasPeerLinks"] = ReadBool(payload, "has_peer_links"),
            // v2.5 (2F.1): the G13 aligned peer analysis as the long tier reported it (null on legacy rows)
            ["gate13Method"] = ReadString(payload, "gate13_method"),
            ["gate13Reason"] = ReadString(payload, "gate13_reason"),
            ["interaction"] = payload.ValueKind == JsonValueKind.Object && payload.TryGetProperty("interaction", out var ia) && ia.ValueKind == JsonValueKind.Object ? ia.Clone() : (JsonElement?)null,
            // v2.5 (2G.1, NR-016): {G5|G6|G12: {state, reason, detail}} - what the acquisition grid lets each method claim
            ["methodEligibility"] = payload.ValueKind == JsonValueKind.Object && payload.TryGetProperty("method_eligibility", out var me) && me.ValueKind == JsonValueKind.Object ? me.Clone() : (JsonElement?)null,
            ["insufficientEvidenceReason"] = ReadString(payload, "insufficient_evidence_reason"),
            // U5 Investigation — the numeric evidence behind the verdict (family
            // scores, freeze index, shape metrics, …). All numeric payload fields
            // pass through as-is; inventing a curated subset here would just mean
            // another schema to keep in sync with the engine.
            ["metrics"] = ReadNumericFields(payload),
            ["narrative"] = new
            {
                selectedFamily = ReadString(payload, "selected_family"),
                statusReason = ReadString(payload, "status_reason"),
                recommendation = ReadString(payload, "recommendation"),
            },
            ["verdictV2"] = verdictV2,
            // A13 — per-window provenance. Without these a stored verdict cannot be
            // attributed to the formula version that produced it, which makes
            // historical evidence unauditable after any engine change.
            ["metadata"] = new
            {
                schemaVersion = ReadInt(payload, "schemaVersion"),
                calculationVersion = ReadString(payload, "calculation_version") ?? ReadString(payload, "calculationVersion"),
                dynamicsProfileVersion = ReadString(payload, "dynamics_profile_version") ?? ReadString(payload, "dynamicsProfileVersion"),
                dynamicsClass = ReadString(payload, "dynamics_class"),
                profileSource = ReadString(payload, "profile_source"),
                calculationSource = ReadString(payload, "calculation_source"),
                replayId = ReadString(payload, "replay_id"),
                sourceCommit = ReadString(payload, "sourceCommit"),
                jarSha256 = ReadString(payload, "jarSha256"),
                contractVersion = ReadString(payload, "contractVersion"),
                computedAt = row.created_at
            }
        };
    }

    /// <summary>
    /// 2026-09-17 audit F4: a companion window named beside a served matrix - the last real verdict when the
    /// served row is the newest window without one, or the newest window when an older verdict was asked for
    /// - with what the reader needs to judge it: when it ended, how old it is, what it said, and its run ids.
    /// </summary>
    public static Dictionary<string, object?> WindowReference(dynamic row, DateTime nowUtc)
    {
        var payload = ParseJson((string?)row.payload);
        DateTime? end = row.window_end is DateTime d ? DateTime.SpecifyKind(d, DateTimeKind.Utc) : (DateTime?)null;
        return new Dictionary<string, object?>
        {
            ["windowKind"] = row.window_kind,
            ["windowStart"] = row.window_start,
            ["windowEnd"] = row.window_end,
            ["diagnosis"] = row.diagnosis,
            ["severity"] = row.severity,
            ["confidence"] = row.confidence,
            ["ageMs"] = end is null ? null : (long)(nowUtc - end.Value).TotalMilliseconds,
            ["insufficientEvidenceReason"] = ReadString(payload, "insufficient_evidence_reason"),
            ["methodRunIds"] = ReadStringMap(payload, "method_run_ids"),
            ["computedAt"] = row.created_at,
        };
    }

    /// <summary>
    /// v2.5 workbench: the window picker's row - the identity, the verdict, the 17 statuses / reasons /
    /// run ids and the flags, without the metric block, the narrative, the v2 verdict and the metadata
    /// (~0.5 KB instead of ~7.5 KB). Served by <c>GET /loops/{id}/gates?projection=summary</c>; a strict
    /// subset of <see cref="Build"/> so the two can never disagree.
    /// </summary>
    public static Dictionary<string, object?> Summary(dynamic row)
    {
        var full = Build(row);
        var gates = ((List<object>)full["gates"]!).Select(g =>
        {
            var t = g.GetType();
            return (object)new
            {
                key = t.GetProperty("key")!.GetValue(g),
                status = t.GetProperty("status")!.GetValue(g),
                reason = t.GetProperty("reason")!.GetValue(g),
                methodRunId = t.GetProperty("methodRunId")!.GetValue(g),
            };
        }).ToList();
        var meta = full["metadata"]!;
        var metaType = meta.GetType();
        return new Dictionary<string, object?>
        {
            ["loopId"] = full["loopId"],
            ["windowKind"] = full["windowKind"],
            ["windowStart"] = full["windowStart"],
            ["windowEnd"] = full["windowEnd"],
            ["sampleCount"] = full["sampleCount"],
            ["diagnosis"] = full["diagnosis"],
            ["severity"] = full["severity"],
            ["confidence"] = full["confidence"],
            ["gates"] = gates,
            ["methodRunIds"] = full["methodRunIds"],
            ["bundleHash"] = full["bundleHash"],
            ["resultRevision"] = full["resultRevision"],
            ["observabilityFlags"] = full["observabilityFlags"],
            ["familyDisqualifiers"] = full["familyDisqualifiers"],
            ["insufficientEvidenceReason"] = full["insufficientEvidenceReason"],
            ["methodEligibility"] = full["methodEligibility"],
            ["computedAt"] = metaType.GetProperty("computedAt")!.GetValue(meta),
            ["jarSha256"] = metaType.GetProperty("jarSha256")!.GetValue(meta),
        };
    }

    // ── fusion v2 ─────────────────────────────────────────────────────────

    public sealed record ObservationView(bool Present, double Score, string MethodId, string Role, string Basis);

    /// <param name="MissingInputs">CHG-092: the inputs a NOT_ASSESSED hypothesis lacks (engine CHG-095); empty on older rows.</param>
    public sealed record HypothesisView(
        double Score, string State, string[] EvidenceGroups, string[] Contradictions, string[] Disqualifiers,
        string[]? MissingInputs = null);

    public sealed record ConfirmationView(
        string ClaimType, string State, string Reason, string[] PositiveEvidenceIds, string[] Contradictions,
        string Scope, double NonFollowingDwellS, double TrackingErrorP95Pp, long ConfirmedAtMs);

    /// <summary>
    /// The served shape (camelCase through the JSON options). <c>Legacy</c> is true for a row
    /// that carries no <c>confirmation</c> block, i.e. was written before v2.5.
    /// </summary>
    public sealed record VerdictV2View(
        bool Legacy,
        Dictionary<string, ObservationView> Observations,
        Dictionary<string, HypothesisView> Hypotheses,
        string? LeadingHypothesis,
        ConfirmationView Confirmation,
        string ScoreSemantics,
        int ResultRevision);

    public static VerdictV2View ReadVerdictV2(JsonElement payload)
    {
        bool hasV2 = payload.ValueKind == JsonValueKind.Object
            && payload.TryGetProperty("confirmation", out var c) && c.ValueKind == JsonValueKind.Object;
        if (!hasV2)
        {
            return new VerdictV2View(
                Legacy: true,
                Observations: new Dictionary<string, ObservationView>(),
                Hypotheses: new Dictionary<string, HypothesisView>(),
                LeadingHypothesis: null,
                Confirmation: new ConfirmationView("FINAL_ELEMENT_NON_FOLLOWING", "LEGACY_FLAG_ONLY", "PRE_V25_ROW",
                    Array.Empty<string>(), Array.Empty<string>(), "", 0, 0, 0),
                ScoreSemantics: "LEGACY",
                ResultRevision: 0);
        }

        var conf = payload.GetProperty("confirmation");
        var observations = new Dictionary<string, ObservationView>();
        if (payload.TryGetProperty("observations", out var obs) && obs.ValueKind == JsonValueKind.Object)
        {
            foreach (var o in obs.EnumerateObject())
            {
                observations[o.Name] = new ObservationView(
                    ReadBool(o.Value, "present"), ReadDouble(o.Value, "score"),
                    ReadString(o.Value, "method_id") ?? "", ReadString(o.Value, "role") ?? "",
                    ReadString(o.Value, "basis") ?? "");
            }
        }
        var hypotheses = new Dictionary<string, HypothesisView>();
        if (payload.TryGetProperty("hypotheses", out var hyps) && hyps.ValueKind == JsonValueKind.Object)
        {
            foreach (var h in hyps.EnumerateObject())
            {
                hypotheses[h.Name] = new HypothesisView(
                    ReadDouble(h.Value, "score"), ReadString(h.Value, "state") ?? "NOT_ASSESSED",
                    ReadStringArray(h.Value, "evidence_groups"), ReadStringArray(h.Value, "contradictions"),
                    ReadStringArray(h.Value, "disqualifiers"), ReadStringArray(h.Value, "missing_inputs"));
            }
        }
        return new VerdictV2View(
            Legacy: false,
            Observations: observations,
            Hypotheses: hypotheses,
            LeadingHypothesis: ReadString(payload, "leading_hypothesis"),
            Confirmation: new ConfirmationView(
                ReadString(conf, "claim_type") ?? "FINAL_ELEMENT_NON_FOLLOWING",
                ReadString(conf, "state") ?? "NOT_APPLICABLE",
                ReadString(conf, "reason") ?? "",
                ReadStringArray(conf, "positive_evidence_ids"),
                ReadStringArray(conf, "contradictions"),
                ReadString(conf, "scope") ?? "",
                ReadDouble(conf, "non_following_dwell_s"),
                ReadDouble(conf, "tracking_error_p95_pp"),
                ReadLong(conf, "confirmed_at_ms")),
            ScoreSemantics: ReadString(payload, "score_semantics") ?? "EVIDENCE_SCORE_UNCALIBRATED",
            ResultRevision: ReadInt(payload, "result_revision") ?? 1);
    }

    // ── JSON readers ──────────────────────────────────────────────────────

    private static string ReadGateStatus(JsonElement payload, string key)
    {
        // Preferred: the gates{} rollup the engine writes.
        if (payload.ValueKind == JsonValueKind.Object
            && payload.TryGetProperty("gates", out var gates)
            && gates.ValueKind == JsonValueKind.Object
            && gates.TryGetProperty(key, out var status)
            && status.ValueKind == JsonValueKind.String)
        {
            return status.GetString() ?? "UNKNOWN";
        }
        // Fallback: the flat gateN_status fields, for rows written before the
        // rollup existed. G2r and G10 do not follow the plain pattern.
        var flat = key switch
        {
            "G2r" => "gate2r_status",
            "G10" => "gate10_valve_output",
            _ => $"gate{key[1..]}_status"
        };
        return ReadString(payload, flat) ?? "UNKNOWN";
    }

    private static JsonElement ParseJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return default;
        try { return JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { return default; }
    }

    /// <summary>v2.5 (2G.1): the LIMITED reason of a method (BANDWIDTH), null when eligible or not assessed.</summary>
    private static string? LimitedReason(JsonElement payload, string gate)
    {
        if (payload.ValueKind != JsonValueKind.Object || !payload.TryGetProperty("method_eligibility", out var me) || me.ValueKind != JsonValueKind.Object) return null;
        if (!me.TryGetProperty(gate, out var v) || v.ValueKind != JsonValueKind.Object) return null;
        var state = v.TryGetProperty("state", out var st) && st.ValueKind == JsonValueKind.String ? st.GetString() : null;
        if (state != "LIMITED") return null;
        return v.TryGetProperty("reason", out var r) && r.ValueKind == JsonValueKind.String && r.GetString() is { Length: > 0 } reason ? reason : "LIMITED";
    }

    private static string? ReadString(JsonElement el, string name) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String
            ? p.GetString() : null;

    private static bool ReadBool(JsonElement el, string name) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.True;

    private static int? ReadInt(JsonElement el, string name) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var p) && p.TryGetInt32(out var v) ? v : null;

    private static long ReadLong(JsonElement el, string name) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var p)
        && p.ValueKind == JsonValueKind.Number && p.TryGetInt64(out var v) ? v : 0;

    private static double ReadDouble(JsonElement el, string name) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var p)
        && p.ValueKind == JsonValueKind.Number && p.TryGetDouble(out var v)
        && !double.IsNaN(v) && !double.IsInfinity(v) ? v : 0;

    private static Dictionary<string, double> ReadNumericFields(JsonElement el)
    {
        var result = new Dictionary<string, double>();
        if (el.ValueKind != JsonValueKind.Object) return result;
        foreach (var prop in el.EnumerateObject())
        {
            if (prop.Value.ValueKind == JsonValueKind.Number && prop.Value.TryGetDouble(out var v)
                && !double.IsNaN(v) && !double.IsInfinity(v))
            {
                result[prop.Name] = v;
            }
        }
        return result;
    }

    private static Dictionary<string, string> ReadStringMap(JsonElement el, string name)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(name, out var obj) || obj.ValueKind != JsonValueKind.Object) return map;
        foreach (var p in obj.EnumerateObject()) if (p.Value.ValueKind == JsonValueKind.String) map[p.Name] = p.Value.GetString()!;
        return map;
    }

    private static string[] ReadStringArray(JsonElement el, string name)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(name, out var arr) || arr.ValueKind != JsonValueKind.Array)
            return Array.Empty<string>();
        return arr.EnumerateArray()
            .Where(x => x.ValueKind == JsonValueKind.String)
            .Select(x => x.GetString()!)
            .ToArray();
    }
}
