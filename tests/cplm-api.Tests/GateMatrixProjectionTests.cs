// v2.5 Task 1E.2 (spec v6 R02) — the gate row → matrix projection that gates/latest and the
// gate history serve. Pure: the row is an ExpandoObject shaped like Dapper's dynamic row, the
// payload is the JSON the Flink fusion engine writes (CplmGateResult.toJson). The v2 verdict
// (observations / hypotheses / fault-scoped confirmation) rides beside the legacy fields, and
// a row written by a pre-v2.5 jar is reported as LEGACY rather than guessed at.
using System.Dynamic;
using System.Text.Json;
using FluentAssertions;
using Traverse.CplmApi.Data;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class GateMatrixProjectionTests
{
    private static dynamic Row(string payload)
    {
        dynamic r = new ExpandoObject();
        r.loop_id = "TIC20803";
        r.window_kind = "24h";
        r.window_start = new DateTime(2026, 9, 15, 0, 0, 0, DateTimeKind.Utc);
        r.window_end = new DateTime(2026, 9, 16, 0, 0, 0, DateTimeKind.Utc);
        r.sample_count = 17280;
        r.diagnosis = "SUSPECTED_FINAL_ELEMENT_NONLINEARITY";
        r.severity = "HIGH";
        r.confidence = 0.89;
        r.payload = payload;
        r.created_at = new DateTime(2026, 9, 16, 0, 15, 0, DateTimeKind.Utc);
        return r;
    }

    private const string V2Payload = """
        {
          "loop_id": "TIC20803", "selected_family": "stiction", "status_reason": "selected_family=stiction",
          "recommendation": "Check VP/positioner data.", "observability_flags": ["NO_STEP_TEST"],
          "family_disqualifiers": [], "has_peer_links": false, "stiction_family_score": 0.95,
          "gates": { "G0": "PASS", "G7": "STRONG", "G14": "NOT_CONFIRMED", "G15": "SUSPECTED" },
          "observations": {
            "LAG_ASYMMETRY": { "present": true, "score": 0.9, "method_id": "XCORR_ASYMMETRY_V1", "role": "SUPPORTING", "basis": "G8=STRONG" },
            "SHAPE_TRIANGULARITY": { "present": true, "score": 0.95, "method_id": "G7.SINE_TRIANGLE_SHAPE", "role": "PRIMARY", "basis": "G7=STRONG" }
          },
          "hypotheses": {
            "STICTION": { "score": 0.95, "state": "QUALIFIED", "evidence_groups": ["SHAPE_TRIANGULARITY", "LAG_ASYMMETRY"], "contradictions": [], "disqualifiers": [] },
            "OSCILLATION_TUNING": { "score": 0.9, "state": "QUALIFIED", "evidence_groups": ["OSCILLATION"], "contradictions": [], "disqualifiers": [] }
          },
          "leading_hypothesis": "STICTION",
          "confirmation": {
            "claim_type": "FINAL_ELEMENT_NON_FOLLOWING", "state": "NOT_CONFIRMED", "reason": "NO_POSITIVE_EVIDENCE",
            "positive_evidence_ids": [], "contradictions": [], "scope": "VP tracking of OP demand over the evaluated support",
            "non_following_dwell_s": 0.0, "tracking_error_p95_pp": 1.2, "confirmed_at_ms": 0
          },
          "score_semantics": "EVIDENCE_SCORE_UNCALIBRATED",
          "result_revision": 1,
          "method_eligibility": {
            "G5": { "state": "LIMITED", "reason": "BANDWIDTH", "detail": "2.0 samples per 10.0 s period < 8 (observed grid 5.0 s)" },
            "G6": { "state": "LIMITED", "reason": "BANDWIDTH", "detail": "2.0 samples per 10.0 s period < 8 (observed grid 5.0 s)" },
            "G12": { "state": "ELIGIBLE", "reason": "", "detail": "dead times down to 5.0 s resolvable" }
          },
          "gate13_method": "G13.ALIGNED_PEER_ANALYSIS_V1", "gate13_reason": "NO_PEER_LINKS",
          "interaction": { "state": "NOT_CONFIGURED", "reason": "NO_PEER_LINKS", "peers": [] },
          "calculation_version": "3.0.0", "sourceCommit": "abc", "jarSha256": "def", "contractVersion": "v1"
        }
        """;

    private const string LegacyPayload = """
        {
          "loop_id": "TIC20803", "selected_family": "stiction", "observability_flags": ["NO_VP"],
          "family_disqualifiers": [], "has_peer_links": false, "stiction_family_score": 0.95,
          "gates": { "G0": "PASS", "G7": "STRONG", "G14": "INSUFFICIENT_EVIDENCE", "G15": "SUSPECTED" },
          "calculation_version": "3.0.0"
        }
        """;

    // ASP.NET Core serialises responses with the Web defaults (camelCase); the test must see
    // the shape the browser sees, not the PascalCase records.
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    private static JsonElement Serve(string payload)
    {
        var matrix = GateMatrixProjection.Build(Row(payload));
        return JsonSerializer.SerializeToElement(matrix, Web);
    }

    [Fact]
    public void V2_verdict_rides_beside_the_legacy_fields()
    {
        var m = Serve(V2Payload);

        m.GetProperty("diagnosis").GetString().Should().Be("SUSPECTED_FINAL_ELEMENT_NONLINEARITY");
        m.GetProperty("gates").GetArrayLength().Should().Be(17);
        m.GetProperty("narrative").GetProperty("selectedFamily").GetString().Should().Be("stiction");

        var v2 = m.GetProperty("verdictV2");
        v2.GetProperty("legacy").GetBoolean().Should().BeFalse();
        v2.GetProperty("scoreSemantics").GetString().Should().Be("EVIDENCE_SCORE_UNCALIBRATED");
        v2.GetProperty("resultRevision").GetInt32().Should().Be(1);
        v2.GetProperty("leadingHypothesis").GetString().Should().Be("STICTION");

        var conf = v2.GetProperty("confirmation");
        conf.GetProperty("claimType").GetString().Should().Be("FINAL_ELEMENT_NON_FOLLOWING");
        conf.GetProperty("state").GetString().Should().Be("NOT_CONFIRMED");
        conf.GetProperty("reason").GetString().Should().Be("NO_POSITIVE_EVIDENCE");
        conf.GetProperty("trackingErrorP95Pp").GetDouble().Should().Be(1.2);
        conf.GetProperty("positiveEvidenceIds").GetArrayLength().Should().Be(0);

        var hyps = v2.GetProperty("hypotheses");
        hyps.GetProperty("STICTION").GetProperty("score").GetDouble().Should().Be(0.95);
        hyps.GetProperty("STICTION").GetProperty("state").GetString().Should().Be("QUALIFIED");
        hyps.GetProperty("STICTION").GetProperty("evidenceGroups").EnumerateArray().Select(x => x.GetString())
            .Should().Equal("SHAPE_TRIANGULARITY", "LAG_ASYMMETRY");

        var obs = v2.GetProperty("observations");
        obs.GetProperty("LAG_ASYMMETRY").GetProperty("methodId").GetString().Should().Be("XCORR_ASYMMETRY_V1");
        obs.GetProperty("LAG_ASYMMETRY").GetProperty("role").GetString().Should().Be("SUPPORTING");
        obs.GetProperty("LAG_ASYMMETRY").GetProperty("present").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public void G14_cell_carries_the_confirmation_reason()
    {
        var m = Serve(V2Payload);
        var g14 = m.GetProperty("gates").EnumerateArray().Single(g => g.GetProperty("key").GetString() == "G14");
        g14.GetProperty("status").GetString().Should().Be("NOT_CONFIRMED");
        g14.GetProperty("reason").GetString().Should().Be("NO_POSITIVE_EVIDENCE");
    }

    [Fact]
    public void A_pre_v25_row_is_reported_as_legacy_not_guessed()
    {
        var m = Serve(LegacyPayload);
        var v2 = m.GetProperty("verdictV2");
        v2.GetProperty("legacy").GetBoolean().Should().BeTrue();
        v2.GetProperty("confirmation").GetProperty("state").GetString().Should().Be("LEGACY_FLAG_ONLY");
        v2.GetProperty("confirmation").GetProperty("reason").GetString().Should().Be("PRE_V25_ROW");
        v2.GetProperty("hypotheses").EnumerateObject().Should().BeEmpty();
        v2.GetProperty("observations").EnumerateObject().Should().BeEmpty();
        v2.GetProperty("leadingHypothesis").ValueKind.Should().Be(JsonValueKind.Null);
        v2.GetProperty("resultRevision").GetInt32().Should().Be(0);
        // the legacy G14 token is served as stored; the UI renders it through the legacy branch
        var g14 = m.GetProperty("gates").EnumerateArray().Single(g => g.GetProperty("key").GetString() == "G14");
        g14.GetProperty("status").GetString().Should().Be("INSUFFICIENT_EVIDENCE");
        g14.GetProperty("reason").GetString().Should().Be("LEGACY_FLAG_ONLY");
    }

    [Fact]
    public void Bandwidth_limited_methods_carry_their_reason_on_the_cell_and_the_row_carries_the_verdicts()
    {
        // v2.5 (2G.1, NR-016): the acquisition grid's verdict is visible next to the gate, never a silently weaker claim
        var m = Serve(V2Payload);
        var gates = m.GetProperty("gates").EnumerateArray().ToDictionary(g => g.GetProperty("key").GetString()!);
        gates["G5"].GetProperty("reason").GetString().Should().Be("BANDWIDTH");
        gates["G6"].GetProperty("reason").GetString().Should().Be("BANDWIDTH");
        gates["G12"].GetProperty("reason").ValueKind.Should().Be(JsonValueKind.Null, because: "an eligible method has no limitation to state");
        gates["G13"].GetProperty("reason").GetString().Should().Be("NO_PEER_LINKS");
        m.GetProperty("methodEligibility").GetProperty("G5").GetProperty("state").GetString().Should().Be("LIMITED");
        m.GetProperty("interaction").GetProperty("state").GetString().Should().Be("NOT_CONFIGURED");
        m.GetProperty("gate13Method").GetString().Should().Be("G13.ALIGNED_PEER_ANALYSIS_V1");
        Serve(LegacyPayload).GetProperty("methodEligibility").ValueKind.Should().Be(JsonValueKind.Null, because: "a legacy row assessed nothing");
    }

    // v2.5 workbench: the window picker lists a hundred windows per loop; a full row is ~7.5 KB
    // (metrics, narrative, verdictV2, metadata), the picker needs ~0.5 KB - the identity, the
    // verdict, the 17 statuses/reasons and the flags. The summary is a strict subset of Build().
    [Fact]
    public void The_summary_projection_is_the_picker_subset_of_the_full_row()
    {
        JsonElement full = JsonSerializer.SerializeToElement((Dictionary<string, object?>)GateMatrixProjection.Build(Row(V2Payload)), Web);
        JsonElement summary = JsonSerializer.SerializeToElement((Dictionary<string, object?>)GateMatrixProjection.Summary(Row(V2Payload)), Web);

        summary.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(new[]
        {
            "loopId", "windowKind", "windowStart", "windowEnd", "sampleCount", "diagnosis", "severity", "confidence",
            "gates", "methodRunIds", "bundleHash", "resultRevision", "observabilityFlags", "familyDisqualifiers",
            "insufficientEvidenceReason", "methodEligibility", "computedAt", "jarSha256",
        });
        foreach (var name in new[] { "loopId", "windowKind", "windowEnd", "diagnosis", "methodRunIds", "observabilityFlags", "bundleHash" })
            summary.GetProperty(name).GetRawText().Should().Be(full.GetProperty(name).GetRawText(), name);
        summary.GetProperty("gates").GetArrayLength().Should().Be(17);
        var g14 = summary.GetProperty("gates").EnumerateArray().Single(g => g.GetProperty("key").GetString() == "G14");
        g14.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(new[] { "key", "status", "reason", "methodRunId" });
        g14.GetProperty("status").GetString().Should().Be("NOT_CONFIRMED");
        summary.GetProperty("computedAt").GetRawText().Should().Be(full.GetProperty("metadata").GetProperty("computedAt").GetRawText());
        summary.TryGetProperty("metrics", out _).Should().BeFalse("the picker never needs the metric block");
        summary.TryGetProperty("verdictV2", out _).Should().BeFalse();
    }

    // audit F4: a served matrix names its companion window - the last real verdict when the served row is the
    // newest window without one, or the newest window when the served row is an older verdict - with its age.
    [Fact]
    public void A_window_reference_carries_the_identity_the_reader_needs_to_judge_its_age()
    {
        dynamic older = Row(V2Payload);
        older.window_end = new DateTime(2026, 9, 2, 20, 45, 0, DateTimeKind.Utc);
        var now = new DateTime(2026, 9, 17, 8, 0, 0, DateTimeKind.Utc);
        JsonElement r = JsonSerializer.SerializeToElement((Dictionary<string, object?>)GateMatrixProjection.WindowReference(older, now), Web);
        r.GetProperty("windowEnd").GetDateTime().Should().Be(older.window_end);
        r.GetProperty("diagnosis").GetString().Should().Be("SUSPECTED_FINAL_ELEMENT_NONLINEARITY");
        r.GetProperty("confidence").GetDouble().Should().Be(0.89);
        r.GetProperty("ageMs").GetInt64().Should().Be((long)(now - (DateTime)older.window_end).TotalMilliseconds);
        r.GetProperty("methodRunIds").ValueKind.Should().Be(JsonValueKind.Object, "the run ids ride along (empty on this fixture, which carries none)");
        r.GetProperty("insufficientEvidenceReason").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact]
    public void An_unparseable_payload_still_projects_the_typed_columns()
    {
        var m = Serve("not json");
        m.GetProperty("diagnosis").GetString().Should().Be("SUSPECTED_FINAL_ELEMENT_NONLINEARITY");
        m.GetProperty("gates").GetArrayLength().Should().Be(17);
        m.GetProperty("verdictV2").GetProperty("legacy").GetBoolean().Should().BeTrue();
    }
}
