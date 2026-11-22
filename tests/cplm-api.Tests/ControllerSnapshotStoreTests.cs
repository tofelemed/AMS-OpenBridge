// CHG-107: the controller tuning history written from G12 results (cpm.controller_snapshot, effective-dated per loop).
using System.Text.Json;
using System.Text.Json.Nodes;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class ControllerSnapshotStoreTests : IAsyncLifetime
{
    private const string Loop = "TEST_CTL";
    private NpgsqlDataSource _db = null!;
    private int _seq;

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
        await conn.ExecuteAsync("DELETE FROM cpm.controller_snapshot WHERE loop_id = @Loop", new { Loop });
        await conn.ExecuteAsync("DELETE FROM analytics.system_model WHERE loop_id = @Loop", new { Loop });
        await conn.ExecuteAsync("DELETE FROM analytics.response_metric WHERE method_run_id IN (SELECT method_run_id FROM analytics.response_event WHERE loop_id = @Loop)", new { Loop });
        await conn.ExecuteAsync("DELETE FROM analytics.response_event WHERE loop_id = @Loop", new { Loop });
    }

    /// <summary>A minimal G12 result with a candidate model; tuning = (p, i, d) effective from <paramref name="from"/>, or none.</summary>
    private string Result(double? p, double i, double d, string from, out Guid run)
    {
        _seq++;
        run = Guid.Parse(ResultIdentityUuid.V5("ctl-test-run|" + _seq));
        var root = new JsonObject
        {
            ["loop_id"] = Loop, ["path_id"] = "OP_TO_PV", ["event_id"] = ResultIdentityUuid.V5("ctl-test-event|" + _seq),
            ["method_run_id"] = run.ToString(), ["model_state"] = "CANDIDATE", ["evaluation_state"] = "EVALUATED",
            ["subgates"] = JsonNode.Parse("""{"B":{"outputs":{"event_type":"INPUT_TEST","capture_state":"COMPLETE","censor_reason":""}}}"""),
            ["metrics"] = JsonNode.Parse("""[{"quantity_id":"process_gain","value":2.0,"unit":"PV_EU/input_EU","method":"OE"}]"""),
            ["window_start_ms"] = 1789600000000L + _seq * 1000L, ["window_end_ms"] = 1789600400000L + _seq * 1000L,
            ["controller_snapshot_ref"] = p is null ? "" : $"ctl:{p}-{i}-{d}",
        };
        if (p is not null)
            root["controller_snapshot"] = new JsonObject
            {
                ["form"] = "IDEAL", ["kc"] = 100.0 / p.Value / 50.0, ["ti_s"] = i, ["td_s"] = d > 0 ? d : null, ["action"] = null,
                ["scan_s"] = 1.0, ["raw_p"] = p.Value, ["raw_i"] = i, ["raw_d"] = d, ["pv_span_eu"] = 50.0, ["op_low_eu"] = 0.0,
                ["op_high_eu"] = 100.0, ["effective_from"] = from, ["source"] = "DCS", ["adapter_version"] = "CENTUM_PB_1.0",
                ["usable"] = true, ["reason"] = null,
            };
        return root.ToJsonString();
    }

    private async Task<Guid?> ModelSnapshot(NpgsqlConnection conn, Guid run) =>
        await conn.ExecuteScalarAsync<Guid?>("SELECT controller_snapshot_id FROM analytics.system_model WHERE method_run_id = @run", new { run });

    private async Task<List<(Guid Id, DateTime From, DateTime? To, string Ref)>> Rows(NpgsqlConnection conn) =>
        (await conn.QueryAsync<(Guid, DateTime, DateTime?, string)>(
            "SELECT snapshot_id, valid_from, valid_to, normalized->>'ref' FROM cpm.controller_snapshot WHERE loop_id = @Loop ORDER BY valid_from",
            new { Loop })).ToList();

    [Fact]
    public async Task A_tuning_is_stored_once_dated_from_its_first_sample_and_linked_to_the_model()
    {
        var store = new ResponseResultStore(_db);
        var json = Result(120, 30, 0, "2026-11-22T08:00:00Z", out var run);
        (await store.ApplyAsync(json, CancellationToken.None)).Should().BeTrue();
        (await store.ApplyAsync(json, CancellationToken.None)).Should().BeTrue("re-delivery is idempotent");

        await using var conn = await _db.OpenConnectionAsync();
        var rows = await Rows(conn);
        rows.Should().ContainSingle();
        rows[0].From.Should().Be(new DateTime(2026, 11, 22, 8, 0, 0));
        rows[0].To.Should().BeNull();
        rows[0].Ref.Should().Be("ctl:120-30-0");
        (await ModelSnapshot(conn, run)).Should().Be(rows[0].Id);
        var r = await conn.QueryFirstAsync("SELECT vendor, form, source, imported_by, native::text AS native, normalized::text AS normalized FROM cpm.controller_snapshot WHERE loop_id = @Loop", new { Loop });
        ((string)r.vendor).Should().Be("CENTUM");
        ((string)r.form).Should().Be("IDEAL");
        ((string)r.source).Should().Be("DCS");
        ((string)r.imported_by).Should().Be("response-engine");
        ((string)r.native).Should().Contain("\"raw_p\"").And.Contain("\"pv_span_eu\"").And.NotContain("\"kc\"");
        ((string)r.normalized).Should().Contain("\"kc\"").And.Contain("\"usable\"").And.NotContain("\"raw_p\"");
    }

    [Fact]
    public async Task The_same_tuning_seen_later_continues_the_row_in_force()
    {
        var store = new ResponseResultStore(_db);
        await store.ApplyAsync(Result(120, 30, 0, "2026-11-22T08:00:00Z", out var run1), CancellationToken.None);
        // a stateless resubmit: the engine first sees the same values later
        await store.ApplyAsync(Result(120, 30, 0, "2026-11-22T11:00:00Z", out var run2), CancellationToken.None);
        await using var conn = await _db.OpenConnectionAsync();
        var rows = await Rows(conn);
        rows.Should().ContainSingle("the tuning did not change");
        (await ModelSnapshot(conn, run2)).Should().Be(rows[0].Id);
        (await ModelSnapshot(conn, run1)).Should().Be(rows[0].Id);
    }

    [Fact]
    public async Task A_then_B_then_A_gives_three_rows_each_ending_where_the_next_starts()
    {
        var store = new ResponseResultStore(_db);
        await store.ApplyAsync(Result(120, 30, 0, "2026-11-22T08:00:00Z", out var runA), CancellationToken.None);
        await store.ApplyAsync(Result(80, 30, 0, "2026-11-22T10:00:00Z", out var runB), CancellationToken.None);
        await store.ApplyAsync(Result(120, 30, 0, "2026-11-22T12:00:00Z", out var runA2), CancellationToken.None);
        await using var conn = await _db.OpenConnectionAsync();
        var rows = await Rows(conn);
        rows.Select(r => r.Ref).Should().Equal("ctl:120-30-0", "ctl:80-30-0", "ctl:120-30-0");
        rows[0].To.Should().Be(rows[1].From);
        rows[1].To.Should().Be(rows[2].From);
        rows[2].To.Should().BeNull();
        (await ModelSnapshot(conn, runA)).Should().Be(rows[0].Id);
        (await ModelSnapshot(conn, runB)).Should().Be(rows[1].Id);
        (await ModelSnapshot(conn, runA2)).Should().Be(rows[2].Id);
    }

    [Fact]
    public async Task A_late_result_for_an_older_tuning_is_closed_by_the_newer_row()
    {
        var store = new ResponseResultStore(_db);
        await store.ApplyAsync(Result(80, 30, 0, "2026-11-22T10:00:00Z", out _), CancellationToken.None);
        await store.ApplyAsync(Result(120, 30, 0, "2026-11-22T08:00:00Z", out _), CancellationToken.None);
        await using var conn = await _db.OpenConnectionAsync();
        var rows = await Rows(conn);
        rows.Select(r => r.Ref).Should().Equal("ctl:120-30-0", "ctl:80-30-0");
        rows[0].To.Should().Be(rows[1].From, "the older tuning ends where the newer one starts");
        rows[1].To.Should().BeNull();
    }

    [Fact]
    public async Task A_result_without_tuning_stores_nothing_and_the_model_has_no_snapshot()
    {
        var store = new ResponseResultStore(_db);
        await store.ApplyAsync(Result(null, 0, 0, "", out var run), CancellationToken.None);
        await using var conn = await _db.OpenConnectionAsync();
        (await Rows(conn)).Should().BeEmpty();
        (await ModelSnapshot(conn, run)).Should().BeNull();
    }

    [Fact]
    public async Task The_history_api_lists_newest_first_and_names_the_row_in_force()
    {
        var store = new ResponseResultStore(_db);
        await store.ApplyAsync(Result(120, 30, 0, "2026-11-22T08:00:00Z", out _), CancellationToken.None);
        await store.ApplyAsync(Result(80, 30, 5, "2026-11-22T10:00:00Z", out _), CancellationToken.None);
        var ok = (await new CpmControllerTuningController(_db).History(Loop.ToLowerInvariant())).Should().BeOfType<OkObjectResult>().Subject;
        var j = JsonDocument.Parse(JsonSerializer.Serialize(ok.Value, new JsonSerializerOptions(JsonSerializerDefaults.Web))).RootElement;
        j.GetProperty("count").GetInt32().Should().Be(2);
        var history = j.GetProperty("history").EnumerateArray().ToList();
        history[0].GetProperty("normalized").GetProperty("ref").GetString().Should().Be("ctl:80-30-5");
        history[0].GetProperty("native").GetProperty("raw_d").GetDouble().Should().Be(5);
        history[1].GetProperty("validTo").GetDateTime().Should().Be(new DateTime(2026, 11, 22, 10, 0, 0, DateTimeKind.Utc));
        j.GetProperty("current").GetProperty("normalized").GetProperty("ref").GetString().Should().Be("ctl:80-30-5");
    }
}
