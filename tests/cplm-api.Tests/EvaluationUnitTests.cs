// CHG-102 Phase 5c - the pure parts of on-demand EVALUATE runs: the window an EVALUATE covers (and what it refuses), the
// job's status words, the request / status record shapes the Flink on-demand job is built against, and the consumer's
// source guard that keeps a non-LIVE gate row off the LIVE row's upsert key.
using System.Text.Json;
using FluentAssertions;
using Traverse.CplmApi.BackgroundServices;
using Traverse.CplmApi.Services.OnDemand;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class EvaluationUnitTests
{
    private static readonly long Now = new DateTimeOffset(2026, 11, 4, 10, 37, 12, TimeSpan.Zero).ToUnixTimeMilliseconds();
    private const long H = 3_600_000L;

    [Fact]
    public void The_default_window_is_12h_ending_at_now_floored_to_the_quarter_hour()
    {
        var (w, err) = EvaluationWindow.Resolve(null, null, Now, 90);
        err.Should().BeNull();
        w!.WindowKind.Should().Be("12h");
        w.ToMs.Should().Be(new DateTimeOffset(2026, 11, 4, 10, 30, 0, TimeSpan.Zero).ToUnixTimeMilliseconds());
        w.FromMs.Should().Be(w.ToMs - 12 * H);
    }

    [Theory]
    [InlineData("4h", 4)]
    [InlineData("24H", 24)]
    [InlineData(" 12h ", 12)]
    public void Every_kind_spans_its_hours_back_from_the_given_end(string kind, int hours)
    {
        var end = Now - 5 * H;
        var (w, _) = EvaluationWindow.Resolve(kind, end, Now, 90);
        w!.ToMs.Should().Be(end);
        w.FromMs.Should().Be(end - hours * H);
        w.WindowKind.Should().Be(kind.Trim().ToLowerInvariant());
    }

    [Theory]
    [InlineData("1h", null, "windowKind")]
    [InlineData("12h", 1L, "future")]
    [InlineData("12h", -1L, "epoch")]
    [InlineData("24h", -2L, "retention")]
    public void A_window_it_cannot_evaluate_is_refused_with_the_reason(string kind, long? endCode, string reason)
    {
        long? end = endCode switch { 1L => Now + 60_000, -1L => 0, -2L => Now - 90L * 24 * H + 12 * H, _ => null };
        var (w, err) = EvaluationWindow.Resolve(kind, end, Now, 90);
        w.Should().BeNull();
        err.Should().Contain(reason);
    }

    [Fact]
    public void The_jobs_status_words_map_onto_the_analysis_run_states()
    {
        EvaluationStates.FromJob("RUNNING").Should().Be("RUNNING");
        EvaluationStates.FromJob("succeeded").Should().Be("FINISHED");
        EvaluationStates.FromJob("FAILED").Should().Be("FAILED");
        EvaluationStates.FromJob("QUEUED").Should().BeNull();
        EvaluationStates.FromJob(null).Should().BeNull();
    }

    [Fact]
    public void The_request_record_carries_the_contract_field_names()
    {
        var id = Guid.NewGuid();
        var json = new EvaluationRequest(id, "FIC-101", "hdpe", null, new EvaluationWindow("12h", 1000, 2000), "root.hdpe.cpm.FIC_101",
            true, false, null, null, 3000).ToJson();
        var r = JsonDocument.Parse(json).RootElement;
        r.GetProperty("schema").GetString().Should().Be("cplm.evaluation.request.v1");
        r.GetProperty("analysis_run_id").GetString().Should().Be(id.ToString());
        r.GetProperty("mode").GetString().Should().Be("EVALUATE");
        r.GetProperty("loop_id").GetString().Should().Be("FIC-101");
        r.GetProperty("site").GetString().Should().Be("hdpe");
        r.GetProperty("loop_type").ValueKind.Should().Be(JsonValueKind.Null);
        r.GetProperty("window_kind").GetString().Should().Be("12h");
        r.GetProperty("from_ms").GetInt64().Should().Be(1000);
        r.GetProperty("to_ms").GetInt64().Should().Be(2000);
        r.GetProperty("iotdb_device").GetString().Should().Be("root.hdpe.cpm.FIC_101");
        r.GetProperty("has_step_test").GetBoolean().Should().BeTrue();
        r.GetProperty("has_peer_links").GetBoolean().Should().BeFalse();
        r.GetProperty("bundle_hash").ValueKind.Should().Be(JsonValueKind.Null);
        r.GetProperty("bundle_properties_b64").ValueKind.Should().Be(JsonValueKind.Null);
        r.GetProperty("requested_at_ms").GetInt64().Should().Be(3000);
    }

    [Fact]
    public void A_status_record_parses_and_anything_else_is_skipped()
    {
        var id = Guid.NewGuid();
        var g15 = Guid.NewGuid().ToString();
        var s = EvaluationStatus.Parse($$"""
            {"schema":"cplm.evaluation.status.v1","analysis_run_id":"{{id}}","loop_id":"FIC-101","state":"succeeded","window_kind":"12h",
             "window_start_ms":1,"window_end_ms":2,"samples":8640,"artifacts":41,"method_run_ids":{"G15":"{{g15}}","G0":"not-a-uuid"},
             "error":null,"elapsed_ms":2300,"at_ms":99}
            """)!;
        s.AnalysisRunId.Should().Be(id);
        s.State.Should().Be("SUCCEEDED");
        s.Samples.Should().Be(8640);
        s.Artifacts.Should().Be(41);
        s.MethodRunIds.Should().ContainKey("G15").WhoseValue.Should().Be(g15);
        s.MethodRunIds.Should().NotContainKey("G0");
        s.ElapsedMs.Should().Be(2300);
        s.AtMs.Should().Be(99);

        EvaluationStatus.Parse("not json").Should().BeNull();
        EvaluationStatus.Parse("""{"schema":"other.v1","analysis_run_id":"00000000-0000-0000-0000-000000000001","state":"RUNNING"}""").Should().BeNull();
        EvaluationStatus.Parse("""{"analysis_run_id":"x","state":"RUNNING"}""").Should().BeNull();
        EvaluationStatus.Parse($$"""{"analysis_run_id":"{{id}}"}""").Should().BeNull();
    }

    [Theory]
    [InlineData("LIVE", "flink", "flink")]
    [InlineData(null, null, "flink")]
    [InlineData("EVALUATE", "flink", "flink-on-demand-evaluation")]
    [InlineData("EVALUATE", null, "flink-on-demand-evaluation")]
    [InlineData("evidence_reconstruction", "flink", "flink-evidence-reconstruction")]
    [InlineData("REPLAY", "flink-historical-replay", "flink-historical-replay")]
    [InlineData("EVALUATE", "flink-on-demand-evaluation", "flink-on-demand-evaluation")]
    public void A_non_live_row_never_takes_the_live_source(string? purpose, string? source, string expected)
        => CplmResultConsumerService.ResultSource(purpose, source).Should().Be(expected);

    [Fact]
    public void The_episode_service_ignores_an_EVALUATE_verdict()
    {
        var root = JsonDocument.Parse("""
            {"loop_id":"FIC-101","purpose":"EVALUATE","calculation_source":"flink-on-demand-evaluation","windowStartMs":1,"windowEndMs":2}
            """).RootElement;
        CplmEventFrameService.ParseVerdict(root).Should().BeNull();
        var sameSource = JsonDocument.Parse("""{"loop_id":"FIC-101","purpose":"EVALUATE","windowStartMs":1,"windowEndMs":2}""").RootElement;
        CplmEventFrameService.ParseVerdict(sameSource).Should().BeNull("even without its own source, purpose EVALUATE is not LIVE");
    }

    [Fact]
    public void The_view_points_at_the_G15_verdict_run()
    {
        var g15 = Guid.NewGuid().ToString();
        var v = new EvaluationRunView(Guid.NewGuid(), "FIC-101", "FINISHED", "u", DateTime.UtcNow, DateTime.UtcNow, null, "12h", 1, 2,
            new Dictionary<string, string> { ["G15"] = g15 }, 10, 3, 2000, 1, 3, 3, 0);
        var json = JsonSerializer.Serialize(EvaluationService.View(v, cached: true));
        var r = JsonDocument.Parse(json).RootElement;
        r.GetProperty("verdictMethodRunId").GetString().Should().Be(g15);
        r.GetProperty("evidenceUrl").GetString().Should().Be($"/api/v1/cpm/method-runs/{g15}/evidence");
        r.GetProperty("succeeded").GetBoolean().Should().BeTrue();
        r.GetProperty("cached").GetBoolean().Should().BeTrue();
    }
}
