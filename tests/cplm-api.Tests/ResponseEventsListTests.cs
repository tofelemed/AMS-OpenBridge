// 2026-09-17 audit F19/F20: on the lab 321 of 328 response events are censored candidates (superseded /
// source gap) - the list hid the seven real ones. The list can leave the censored ones out (includeCensored=
// false) and still says how many there are, so the reader knows they exist and can ask for them.
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class ResponseEventsListTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly string _loop = "T-RESP-LIST-" + Guid.NewGuid().ToString("N")[..8];

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        var t0 = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        for (var i = 0; i < 5; i++)
        {
            var censored = i != 2;                                                   // one COMPLETE event among four censored candidates
            await conn.ExecuteAsync("""
                INSERT INTO analytics.response_event (event_id, loop_id, method_run_id, event_type, path_id, t0_ms, t_end_ms, capture_state, censor_reason,
                    evaluation_state, eligibility, finding, model_state, purpose, analysis_run_id, bundle_hash, context_revision, result_revision,
                    dataset_hash, source_commit, jar_sha256, result, emitted_at_ms)
                VALUES (@id, @loop, @run, 'INPUT_TEST', 'OP_TO_PV', @t0, @t0 + 60000, @cap, @reason, @eval, 'ELIGIBLE', @finding, @model, 'LIVE', NULL, 'b:test', 0, 1,
                    'ds:test', 'c', 'j', '{}'::jsonb, @t0)
                """, new
            {
                id = Guid.NewGuid(), loop = _loop, run = Guid.NewGuid(), t0 = t0 - i * 600_000,
                cap = censored ? "CENSORED" : "COMPLETE", reason = censored ? (i % 2 == 0 ? "SUPERSEDED_BY_EVENT" : "SOURCE_GAP") : "",
                eval = censored ? "CENSORED" : "EVALUATED", finding = censored ? "SUPERSEDED_BY_EVENT" : "RESPONSE_CHARACTERISED", model = censored ? "NONE" : "CANDIDATE",
            });
        }
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.response_event WHERE loop_id = @loop", new { loop = _loop });
        await _db.DisposeAsync();
    }

    private CpmResponseController Controller()
    {
        var c = new CpmResponseController(_db) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() } };
        return c;
    }

    [Fact]
    public async Task Without_censored_candidates_the_list_carries_the_real_events_and_counts_the_censored_ones()
    {
        var all = System.Text.Json.JsonSerializer.SerializeToElement(((OkObjectResult)await Controller().List(_loop, null, null, null, 50, "LIVE", true, CancellationToken.None)).Value);
        all.GetProperty("count").GetInt32().Should().Be(5, "the default keeps every event, as before");
        all.GetProperty("censoredCount").GetInt32().Should().Be(4);

        var real = System.Text.Json.JsonSerializer.SerializeToElement(((OkObjectResult)await Controller().List(_loop, null, null, null, 50, "LIVE", false, CancellationToken.None)).Value);
        real.GetProperty("count").GetInt32().Should().Be(1);
        real.GetProperty("censoredCount").GetInt32().Should().Be(4, "the reader is told how many candidates are left out");
        real.GetProperty("events")[0].GetProperty("captureState").GetString().Should().Be("COMPLETE");
        real.GetProperty("nextCursor").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Null);
    }
}
