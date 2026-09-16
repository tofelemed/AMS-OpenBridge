using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

/// <summary>v2.5 Task 2B.2: the v5 UUID derivation agrees with Flink's, and the response store is verbatim and idempotent.</summary>
public sealed class ResponseIdentityTests
{
    [Fact]
    public void V5_matches_the_rfc4122_reference_vector_and_flinks_derivation()
    {
        var dns = Guid.Parse("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
        ResultIdentityUuid.V5(dns, "python.org").Should().Be("886313e1-3b8a-5372-9b90-0c9aee199e5d");
        ResultIdentityUuid.V5("model|x").Should().Be(ResultIdentityUuid.V5("model|x"));
        ResultIdentityUuid.V5("model|x").Should().NotBe(ResultIdentityUuid.V5("model|y"));
    }
}

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class ResponseResultStoreTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private static readonly Guid EventId = Guid.Parse("11111111-2222-5333-8444-555555555555");
    private static readonly Guid RunId = Guid.Parse("aaaaaaaa-bbbb-5ccc-8ddd-eeeeeeeeeeee");

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await Cleanup();
    }

    public async Task DisposeAsync()
    {
        await Cleanup();
        await _db.DisposeAsync();
    }

    private async Task Cleanup()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.system_model WHERE loop_id = 'TEST_G12'");
        await conn.ExecuteAsync("DELETE FROM analytics.response_metric WHERE method_run_id = @run", new { run = RunId });
        await conn.ExecuteAsync("DELETE FROM analytics.response_event WHERE loop_id = 'TEST_G12'");
    }

    private const string Template = """
        {"loop_id":"TEST_G12","path_id":"OP_TO_PV","event_id":"__EVENT__","method_id":"G12.SYSTEM_RESPONSE","method_version":"1.0.0",
         "score_semantics":"EVIDENCE_SCORE_UNCALIBRATED","evaluation_state":"__EVAL__","eligibility":"ELIGIBLE","finding":"RESPONSE_CHARACTERISED",
         "model_state":"__MODEL__",
         "subgates":{"A":{"state":"EVALUATED","outputs":{}},"B":{"state":"EVALUATED","outputs":{"event_type":"INPUT_TEST","capture_state":"COMPLETE","censor_reason":""}},
                     "C":{"state":"EVALUATED","outputs":{}},"D":{"state":"ESTIMATED","outputs":{"method_id":"OE_LM_DELAY_PROFILE"}},
                     "E":{"state":"WAITING","outputs":{"reason":"NO_INDEPENDENT_EVENT_YET"}},"F":{"state":"EVALUATED","outputs":{}},"G":{"state":"EVALUATED","outputs":{}},"H":{"state":"NOT_EVALUATED","outputs":{}}},
         "metrics":[
           {"quantity_id":"process_gain",__GAIN__,"unit":"PV_EU/input_EU","uncertainty":0.02,"method":"OE_LM_DELAY_PROFILE","path_id":"OP_TO_PV","config_hash":"g12:abc"},
           {"quantity_id":"dead_time","value":4.0,"unit":"s","uncertainty":null,"method":"OE_LM_DELAY_PROFILE","path_id":"OP_TO_PV","config_hash":"g12:abc"},
           {"quantity_id":"time_constant","value":20.0,"unit":"s","uncertainty":null,"method":"OE_LM_DELAY_PROFILE","path_id":"OP_TO_PV","config_hash":"g12:abc"},
           {"quantity_id":"settle_response","value":null,"unit":"s","uncertainty":null,"method":"","path_id":"OP_TO_PV","config_hash":"g12:abc","reason_if_null":"RIGHT_CENSORED_OR_INTEGRATING_OPEN_LOOP"}
         ],
         "evidence":{"has_approved_test_record":false},"controller_snapshot_ref":"","health_exclusions":[],
         "method_run_id":"__RUN__","bundle_hash":"g12:abc","dataset_hash":"ds:1","purpose":"LIVE","analysis_run_id":"","context_revision":0,"result_revision":1,
         "sourceCommit":"deadbeef","jarSha256":"cafe","contractVersion":"v1","window_start_ms":1789600000000,"window_end_ms":1789600400000,"emitted_at_ms":1789600500000}
        """;

    private static string Result(string modelState, string evalState, double? gain)
    {
        var gainField = gain is null
            ? "\"value\":null,\"reason_if_null\":\"INTEGRATING_OR_NOT_IDENTIFIABLE\""
            : "\"value\":" + gain.Value.ToString(System.Globalization.CultureInfo.InvariantCulture);
        return Template.Replace("__EVENT__", EventId.ToString()).Replace("__RUN__", RunId.ToString())
            .Replace("__EVAL__", evalState).Replace("__MODEL__", modelState).Replace("__GAIN__", gainField);
    }

    [Fact]
    public async Task Persists_event_metrics_and_a_candidate_model_verbatim_and_idempotently()
    {
        var store = new ResponseResultStore(_db);
        (await store.ApplyAsync(Result("CANDIDATE", "EVALUATED", 3.0), CancellationToken.None)).Should().BeTrue();
        (await store.ApplyAsync(Result("CANDIDATE", "EVALUATED", 3.0), CancellationToken.None)).Should().BeTrue("re-delivery is idempotent");
        (await store.ApplyAsync("not json", CancellationToken.None)).Should().BeFalse();

        await using var conn = await _db.OpenConnectionAsync();
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_event WHERE loop_id = 'TEST_G12'")).Should().Be(1);
        var ev = await conn.QueryFirstAsync("SELECT event_type, capture_state, evaluation_state, model_state, bundle_hash, purpose, t0_ms, t_end_ms FROM analytics.response_event WHERE event_id = @id", new { id = EventId });
        ((string)ev.event_type).Should().Be("INPUT_TEST");
        ((string)ev.capture_state).Should().Be("COMPLETE");
        ((string)ev.model_state).Should().Be("CANDIDATE");
        ((long)ev.t0_ms).Should().Be(1789600000000);
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_metric WHERE method_run_id = @run", new { run = RunId })).Should().Be(4);
        var settle = await conn.QueryFirstAsync("SELECT value, reason, unit FROM analytics.response_metric WHERE method_run_id = @run AND quantity_id = 'settle_response'", new { run = RunId });
        ((double?)settle.value).Should().BeNull();
        ((string)settle.reason).Should().Be("RIGHT_CENSORED_OR_INTEGRATING_OPEN_LOOP");
        ((string)settle.unit).Should().Be("s");
        var model = await conn.QueryFirstAsync("SELECT model_id, family, model_state, estimator, revision, parameters::text AS parameters FROM analytics.system_model WHERE loop_id = 'TEST_G12'");
        ((string)model.family).Should().Be("FOPDT");
        ((string)model.model_state).Should().Be("CANDIDATE");
        ((string)model.estimator).Should().Be("OE_LM_DELAY_PROFILE");
        ((int)model.revision).Should().Be(1);
        ((string)model.parameters).Should().Contain("process_gain").And.Contain("PV_EU/input_EU");
        ((Guid)model.model_id).ToString().Should().Be(ResultIdentityUuid.V5("model|" + RunId), "the model id is derived, so a re-delivered result maps to the same row");
    }

    [Fact]
    public async Task A_reviewed_model_keeps_its_decision_when_the_job_redelivers()
    {
        var store = new ResponseResultStore(_db);
        await store.ApplyAsync(Result("CANDIDATE", "EVALUATED", 3.0), CancellationToken.None);
        await using var conn = await _db.OpenConnectionAsync();
        var modelId = Guid.Parse(ResultIdentityUuid.V5("model|" + RunId));
        await conn.ExecuteAsync("UPDATE analytics.system_model SET model_state = 'ACTIVE_BASELINE', revision = 2, reviewed_by = 'eng' WHERE model_id = @id", new { id = modelId });
        await store.ApplyAsync(Result("CANDIDATE", "EVALUATED", 3.05), CancellationToken.None);
        var m = await conn.QueryFirstAsync("SELECT model_state, revision, parameters::text AS parameters FROM analytics.system_model WHERE model_id = @id", new { id = modelId });
        ((string)m.model_state).Should().Be("ACTIVE_BASELINE", "a server-owned review is never overwritten by a re-delivered job result");
        ((int)m.revision).Should().Be(2);
        ((string)m.parameters).Should().Contain("3.05", "the parameters themselves are still the kernel's latest");
    }

    [Fact]
    public async Task An_integrating_result_yields_an_ipdt_model_without_a_static_gain()
    {
        var store = new ResponseResultStore(_db);
        var json = Result("CANDIDATE", "EVALUATED", null)
            .Replace("{\"quantity_id\":\"time_constant\",\"value\":20.0,\"unit\":\"s\"", "{\"quantity_id\":\"integrating_gain\",\"value\":0.000166667,\"unit\":\"PV_EU/(input_EU*s)\"");
        await store.ApplyAsync(json, CancellationToken.None);
        await using var conn = await _db.OpenConnectionAsync();
        var m = await conn.QueryFirstAsync("SELECT family, parameters::text AS parameters FROM analytics.system_model WHERE loop_id = 'TEST_G12'");
        ((string)m.family).Should().Be("IPDT");
        ((string)m.parameters).Should().Contain("INTEGRATING_OR_NOT_IDENTIFIABLE");
    }
}
