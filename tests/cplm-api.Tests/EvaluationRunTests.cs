// CHG-102 Phase 5c - EVALUATE analysis runs on the lab traverse_cplm (after cpm-20): a run is registered QUEUED and its
// request published; the same window in flight or finished-with-evidence-held is handed back, not re-queued; the job's
// status records move it on idempotently and out of order; a run nobody answers times out FAILED and a late answer
// still lands; an Idempotency-Key is the caller's own and names one request; the per-user cap; the publish failure;
// and the EVALUATE gate row never lands on the LIVE row of the same window.
using Dapper;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Traverse.CplmApi.BackgroundServices;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.OnDemand;
using Xunit;

namespace Traverse.CplmApi.Tests;

/// <summary>Records what would go on the request topic; Fail = Kafka refused it.</summary>
internal sealed class FakeEvaluationPublisher : IEvaluationRequestPublisher
{
    public List<EvaluationRequest> Sent { get; } = new();
    public bool Fail { get; set; }
    public Task PublishAsync(EvaluationRequest request, CancellationToken ct)
    {
        if (Fail) throw new InvalidOperationException("broker down");
        Sent.Add(request);
        return Task.CompletedTask;
    }
}

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class EvaluationRunTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly string _tag = "ZZ_EVAL_" + Guid.NewGuid().ToString("N")[..8];
    private readonly List<Guid> _runs = new();
    private readonly FakeEvaluationPublisher _pub = new();
    private EvaluationService _svc = null!;
    private static readonly long Now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 900_000 * 900_000;

    public Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        _svc = Service(new EvaluationOptions { MaxPerUserInFlight = 3, TimeoutMinutes = 5 });
        return Task.CompletedTask;
    }

    private EvaluationService Service(EvaluationOptions o) => new(new EvaluationRunStore(_db), _pub, o,
        new IotDbWriteOptions { LoopRootPrefix = "root.hdpe.cpm" }, NullLogger<EvaluationService>.Instance);

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest WHERE provenance->>'analysis_run_id' = ANY(@ids)",
            new { ids = _runs.Select(r => r.ToString()).ToArray() });
        await conn.ExecuteAsync("DELETE FROM analytics.analysis_run WHERE loop_id LIKE @t || '%'", new { t = _tag });
        await conn.ExecuteAsync("DELETE FROM analytics.cplm_gate_results WHERE loop_id LIKE @t || '%'", new { t = _tag });
        await _db.DisposeAsync();
    }

    private CpmLoopDto Loop(string suffix = "A") => new(_tag + suffix, null, _tag + suffix, "hdpe", null, null, "flow", "LOW", true, true,
        new Dictionary<string, string>(), Array.Empty<string>(), Array.Empty<CpmLoopLinkDto>(), true, null);

    private static EvaluationWindow W(int hoursBack = 2, string kind = "12h")
        => EvaluationWindow.Resolve(kind, Now - hoursBack * 3_600_000L, Now, 90).Window!;

    private async Task<EvaluationStart> Start(CpmLoopDto loop, EvaluationWindow w, string by = "zz-eval-a", string? key = null, EvaluationService? svc = null)
    {
        var s = await (svc ?? _svc).StartAsync(loop, w, by, key, CancellationToken.None);
        if (s.AnalysisRunId is { } id) _runs.Add(id);
        return s;
    }

    private Task<bool> Status(Guid id, string state, string? g15 = null, string? error = null, long at = 1)
        => new EvaluationRunStore(_db).ApplyStatusAsync(new EvaluationStatus(id, null, state, "12h", 10, 20, 100, 7,
            g15 is null ? null : new Dictionary<string, string> { ["G15"] = g15 }, error, 1500, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + at), CancellationToken.None);

    private Task<EvaluationRunView?> Read(Guid id) => _svc.ReadAsync(id, CancellationToken.None);

    private async Task SeedManifest(Guid run, string readiness)
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            INSERT INTO analytics.evidence_manifest (evidence_id, method_run_id, gate_id, artifact_kind, chunk_count, total_bytes, sha256,
                chunk_sha256, readiness, retention_class, provenance, analysis_run_id)
            VALUES (@e, @m, 'G9', 'polygon', 0, 0, 'x', '[]'::jsonb, @readiness, 'STANDARD',
                    jsonb_build_object('purpose', 'EVALUATE', 'analysis_run_id', @run::text), @run)
            """, new { e = Guid.NewGuid(), m = Guid.NewGuid(), readiness, run });
    }

    [Fact]
    public async Task A_new_window_is_queued_and_its_request_published_with_the_writer_device()
    {
        var s = await Start(Loop(), W());
        s.Outcome.Should().Be(EvaluationOutcome.Accepted);
        var req = _pub.Sent.Should().ContainSingle().Subject;
        req.AnalysisRunId.Should().Be(s.AnalysisRunId!.Value);
        req.IotDbDevice.Should().Be("root.hdpe.cpm." + _tag + "A");
        req.HasStepTest.Should().BeTrue();
        req.Window.Should().Be(W());
        var v = (await Read(s.AnalysisRunId.Value))!;
        v.State.Should().Be("QUEUED");
        (v.WindowKind, v.FromMs, v.ToMs).Should().Be(("12h", W().FromMs, W().ToMs));
    }

    [Fact]
    public async Task The_same_window_in_flight_is_handed_back_and_a_finished_one_with_its_evidence_is_cached()
    {
        var first = await Start(Loop(), W());
        var again = await Start(Loop(), W(), by: "zz-eval-b");
        again.Outcome.Should().Be(EvaluationOutcome.InFlight);
        again.AnalysisRunId.Should().Be(first.AnalysisRunId);
        _pub.Sent.Should().HaveCount(1, "a double click queues nothing new");

        (await Status(first.AnalysisRunId!.Value, "SUCCEEDED", Guid.NewGuid().ToString())).Should().BeTrue();
        (await Start(Loop(), W())).Outcome.Should().Be(EvaluationOutcome.Accepted, "finished with no evidence held: evaluated again");

        var second = _runs.Last();
        await Status(second, "SUCCEEDED");
        await SeedManifest(second, "COMPLETE");
        var cached = await Start(Loop(), W());
        cached.Outcome.Should().Be(EvaluationOutcome.Cached);
        cached.AnalysisRunId.Should().Be(second);

        await using (var conn = await _db.OpenConnectionAsync())
            await conn.ExecuteAsync("UPDATE analytics.evidence_manifest SET readiness = 'EXPIRED' WHERE provenance->>'analysis_run_id' = @s",
                new { s = second.ToString() });   // the indexed expression (the analysis_run_id column is not indexed)
        (await Start(Loop(), W())).Outcome.Should().Be(EvaluationOutcome.Accepted, "the cached evidence aged out: evaluated again");
        (await Start(Loop(), W(3))).Outcome.Should().Be(EvaluationOutcome.Accepted, "another window is another run");
    }

    [Fact]
    public async Task Status_records_apply_once_in_order_and_never_reopen_a_finished_run()
    {
        var id = (await Start(Loop(), W())).AnalysisRunId!.Value;
        var g15 = Guid.NewGuid().ToString();
        (await Status(id, "RUNNING")).Should().BeTrue();
        (await Read(id))!.State.Should().Be("RUNNING");
        (await Status(id, "SUCCEEDED", g15)).Should().BeTrue();
        (await Status(id, "RUNNING")).Should().BeFalse("a late RUNNING never reopens a finished run");
        (await Status(id, "FAILED", error: "boom")).Should().BeFalse("the first terminal state stands");
        (await Status(id, "SUCCEEDED", g15)).Should().BeFalse("a redelivery changes nothing");
        var v = (await Read(id))!;
        v.State.Should().Be("FINISHED");
        v.Error.Should().BeNull();
        v.FinishedAt.Should().NotBeNull();
        v.MethodRunIds["G15"].Should().Be(g15);
        (v.Samples, v.Artifacts, v.ElapsedMs).Should().Be((100, 7, 1500L));

        var failed = (await Start(Loop("B"), W())).AnalysisRunId!.Value;
        (await Status(failed, "FAILED", error: "NO_SAMPLES_IN_WINDOW")).Should().BeTrue();
        (await Read(failed))!.Error.Should().Be("NO_SAMPLES_IN_WINDOW");
        (await Status(Guid.NewGuid(), "RUNNING")).Should().BeFalse("an unknown run");
    }

    [Fact]
    public async Task A_run_nobody_answers_times_out_and_a_late_answer_still_lands()
    {
        var id = (await Start(Loop(), W())).AnalysisRunId!.Value;
        await using (var conn = await _db.OpenConnectionAsync())
            await conn.ExecuteAsync("UPDATE analytics.analysis_run SET created_at = NOW() - interval '6 minutes' WHERE analysis_run_id = @id", new { id });
        var v = (await Read(id))!;
        v.State.Should().Be("FAILED");
        v.Error.Should().Be(EvaluationStates.NoResponse);
        (await Start(Loop(), W())).AnalysisRunId.Should().NotBe(id, "a timed-out run is not handed back");
        (await Status(id, "SUCCEEDED", Guid.NewGuid().ToString())).Should().BeTrue("the job did answer");
        var late = (await Read(id))!;
        late.State.Should().Be("FINISHED");
        late.Error.Should().BeNull();
    }

    [Fact]
    public async Task A_recent_status_record_keeps_a_long_run_alive()
    {
        var id = (await Start(Loop(), W())).AnalysisRunId!.Value;
        await using (var conn = await _db.OpenConnectionAsync())
            await conn.ExecuteAsync("UPDATE analytics.analysis_run SET created_at = NOW() - interval '6 minutes' WHERE analysis_run_id = @id", new { id });
        await Status(id, "RUNNING");
        (await Read(id))!.State.Should().Be("RUNNING", "it heard from the job within the timeout");
    }

    [Fact]
    public async Task An_idempotency_key_is_the_callers_own_and_names_one_request()
    {
        var a = await Start(Loop(), W(), by: "zz-eval-a", key: _tag + "-k1");
        (await Start(Loop(), W(), by: "zz-eval-a", key: _tag + "-k1")).Should()
            .Match<EvaluationStart>(s => s.Outcome == EvaluationOutcome.Idempotent && s.AnalysisRunId == a.AnalysisRunId);

        // another user's identical key never reaches a's run (security review: IDOR): b gets its own run of loop B
        var otherLoop = await Start(Loop("B"), W(), by: "zz-eval-b", key: _tag + "-k1");
        otherLoop.Outcome.Should().Be(EvaluationOutcome.Accepted);
        otherLoop.AnalysisRunId.Should().NotBe(a.AnalysisRunId!.Value);

        var reused = await Start(Loop("B"), W(), by: "zz-eval-a", key: _tag + "-k1");
        reused.Outcome.Should().Be(EvaluationOutcome.IdempotencyKeyReused, "a's key names an evaluation of loop A");
        reused.AnalysisRunId.Should().BeNull();
        (await Start(Loop(), W(5), by: "zz-eval-a", key: _tag + "-k1")).Outcome
            .Should().Be(EvaluationOutcome.IdempotencyKeyReused, "same loop, another window");
    }

    [Fact]
    public async Task A_user_may_hold_only_so_many_evaluations_in_flight()
    {
        var svc = Service(new EvaluationOptions { MaxPerUserInFlight = 2 });
        (await Start(Loop("A"), W(), "zz-eval-cap", svc: svc)).Outcome.Should().Be(EvaluationOutcome.Accepted);
        (await Start(Loop("B"), W(), "zz-eval-cap", svc: svc)).Outcome.Should().Be(EvaluationOutcome.Accepted);
        (await Start(Loop("C"), W(), "zz-eval-cap", svc: svc)).Outcome.Should().Be(EvaluationOutcome.TooManyInFlight);
        (await Start(Loop("C"), W(), "zz-eval-other", svc: svc)).Outcome.Should().Be(EvaluationOutcome.Accepted);
    }

    [Fact]
    public async Task A_request_kafka_refuses_leaves_the_run_failed_not_in_flight()
    {
        _pub.Fail = true;
        var s = await Start(Loop(), W());
        s.Outcome.Should().Be(EvaluationOutcome.PublishFailed);
        var v = (await Read(s.AnalysisRunId!.Value))!;
        v.State.Should().Be("FAILED");
        v.Error.Should().StartWith("request publish:");
        _pub.Fail = false;
        (await Start(Loop(), W())).Outcome.Should().Be(EvaluationOutcome.Accepted);
    }

    [Fact]
    public async Task The_consumer_applies_raw_status_records_and_skips_garbage()
    {
        var id = (await Start(Loop(), W())).AnalysisRunId!.Value;
        var consumer = new EvaluationStatusConsumerService(NullLogger<EvaluationStatusConsumerService>.Instance,
            Microsoft.Extensions.Options.Options.Create(new Traverse.CplmApi.Infrastructure.KafkaOptions()),
            Microsoft.Extensions.Options.Options.Create(new EvaluationOptions()), new ConsumerHeartbeat(),
            new SingleMemberGuard(NullLogger<SingleMemberGuard>.Instance, new ConsumerHeartbeat(), "127.0.0.1:1"), _db);
        (await consumer.ApplyAsync("garbage", CancellationToken.None)).Should().BeFalse();
        (await consumer.ApplyAsync($$"""{"schema":"cplm.evaluation.status.v1","analysis_run_id":"{{id}}","state":"SUCCEEDED","samples":5}""",
            CancellationToken.None)).Should().BeTrue();
        (await Read(id))!.Should().Match<EvaluationRunView>(v => v.State == "FINISHED" && v.Samples == 5);
    }

    [Fact]
    public async Task An_EVALUATE_gate_row_for_the_live_window_lands_beside_the_live_row()
    {
        var loop = _tag + "G";
        var sql = CplmResultConsumerService.GateUpsertSql.Replace("@payload", "@payload::jsonb").Replace("@methodRunIds", "@methodRunIds::jsonb");
        object Args(string purpose, int samples, string diagnosis) => new
        {
            loopId = loop, windowKind = "12h",
            winStart = new DateTime(2026, 11, 3, 12, 0, 0, DateTimeKind.Utc), winEnd = new DateTime(2026, 11, 4, 0, 0, 0, DateTimeKind.Utc),
            samples, mae = (double?)null, rmse = (double?)null, iae = (double?)null, goodErrorPct = (double?)null,
            acfPeriodS = (double?)null, acfRegularity = (double?)null, effortRatio = (double?)null, triangularity = (double?)null,
            horchOddness = (double?)null, phaseArea = (double?)null, cornerScore = (double?)null, travelPerDay = (double?)null,
            reversalsPerHour = (double?)null, harmAmpRatio = (double?)null, harmEnergyRatio = (double?)null,
            diagnosis, severity = "LOW", confidence = 0.5, payload = "{}",
            // what the consumer binds: the job's calculation_source left at "flink" on purpose (the worst case)
            source = CplmResultConsumerService.ResultSource(purpose, "flink"),
            methodRunIds = "{}", bundleHash = "profile:same", contextRevision = 0, resultRevision = 1, purpose,
            analysisRunId = purpose == "LIVE" ? (Guid?)null : Guid.NewGuid(), sourceCommit = "c", jarSha256 = "j", datasetHash = "d",
        };
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync(sql, Args("LIVE", 100, "HEALTHY"));
        await conn.ExecuteAsync(sql, Args("EVALUATE", 200, "SUSPECTED_STICTION"));
        var rows = (await conn.QueryAsync<(string purpose, string source, string diagnosis, int samples)>(
            "SELECT purpose, source, diagnosis, sample_count FROM analytics.cplm_gate_results WHERE loop_id = @loop ORDER BY purpose DESC",
            new { loop })).ToList();
        rows.Should().Equal(("LIVE", "flink", "HEALTHY", 100), ("EVALUATE", "flink-on-demand-evaluation", "SUSPECTED_STICTION", 200));
        // and the fleet / KPI reads see only the live one (they all filter purpose = 'LIVE')
        (await conn.ExecuteScalarAsync<int>("SELECT count(*)::int FROM analytics.cplm_gate_results WHERE loop_id = @loop AND purpose = 'LIVE'",
            new { loop })).Should().Be(1);
    }

    [Fact]
    public async Task A_method_run_resolves_to_the_live_row_unless_the_evaluation_run_is_named()
    {
        var loop = _tag + "R";
        var run = Guid.NewGuid();
        var evaluation = Guid.NewGuid();
        var ids = "{\"G15\":\"" + run + "\"}";
        var sql = CplmResultConsumerService.GateUpsertSql.Replace("@payload", "@payload::jsonb").Replace("@methodRunIds", "@methodRunIds::jsonb");
        object Args(string purpose, int samples) => new
        {
            loopId = loop, windowKind = "12h",
            winStart = new DateTime(2026, 11, 3, 17, 0, 0, DateTimeKind.Utc), winEnd = new DateTime(2026, 11, 4, 5, 0, 0, DateTimeKind.Utc),
            samples, mae = (double?)null, rmse = (double?)null, iae = (double?)null, goodErrorPct = (double?)null,
            acfPeriodS = (double?)null, acfRegularity = (double?)null, effortRatio = (double?)null, triangularity = (double?)null,
            horchOddness = (double?)null, phaseArea = (double?)null, cornerScore = (double?)null, travelPerDay = (double?)null,
            reversalsPerHour = (double?)null, harmAmpRatio = (double?)null, harmEnergyRatio = (double?)null,
            diagnosis = "INSUFFICIENT_DATA", severity = "LOW", confidence = 0.5, payload = "{}",
            source = CplmResultConsumerService.ResultSource(purpose, "flink"),
            methodRunIds = ids, bundleHash = "profile:same", contextRevision = 0, resultRevision = 1, purpose,
            analysisRunId = purpose == "LIVE" ? (Guid?)null : evaluation, sourceCommit = "c", jarSha256 = "j", datasetHash = "d",
        };
        await using (var conn = await _db.OpenConnectionAsync())
        {
            await conn.ExecuteAsync(sql, Args("LIVE", 6008));
            await conn.ExecuteAsync(sql, Args("EVALUATE", 7520));
        }
        var resolver = new MethodRunResolver(_db);
        (await resolver.ResolveAsync(run, CancellationToken.None))!.Purpose.Should().Be("LIVE", "links from the live pages open the live verdict");
        var named = (await resolver.ResolveAsync(run, evaluation, CancellationToken.None))!;
        named.Purpose.Should().Be("EVALUATE", "the workbench opened from 'Evaluate a window' shows that evaluation's own verdict");
        named.SampleCount.Should().Be(7520);
        (await resolver.ResolveAsync(run, Guid.NewGuid(), CancellationToken.None))!.Purpose.Should().Be("LIVE", "an unknown analysis run falls back");
    }
}
