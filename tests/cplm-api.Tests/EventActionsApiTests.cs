// CHG-032 — acknowledge / shelve / unshelve / history against the lab traverse_cplm: the frame
// row and its history row land together; the shelf and the ack are independent; the sweeper
// flips an overdue shelf to EXPIRED exactly once; the events read hides only ACTIVE shelves.
using System.Security.Claims;
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class EventActionsApiTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly string _loop = "EVSHELF_" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
    private long _open, _closed;

    private sealed class NoAudit : ICplmAuditEmitter
    {
        public List<string> Types { get; } = new();
        public void Emit(string eventType, string userId, string entityType, string entityId, object? after = null) => Types.Add(eventType);
    }
    private readonly NoAudit _audit = new();

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        _open = await conn.ExecuteScalarAsync<long>("""
            INSERT INTO analytics.cplm_event_frames (loop_id, window_kind, family, opened_at, peak_diagnosis, peak_confidence)
            VALUES (@loop, '24h', 'OSCILLATION', NOW() - interval '2 days', 'SUSPECTED_OSCILLATION', 0.8) RETURNING id
            """, new { loop = _loop });
        _closed = await conn.ExecuteScalarAsync<long>("""
            INSERT INTO analytics.cplm_event_frames (loop_id, window_kind, family, opened_at, closed_at, condition_state, peak_diagnosis, peak_confidence)
            VALUES (@loop, '24h', 'EXCESSIVE_EFFORT', NOW() - interval '3 days', NOW() - interval '1 day', 'CLOSED', 'DETECTED_EXCESSIVE_EFFORT', 0.5) RETURNING id
            """, new { loop = _loop });
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.cplm_event_frames WHERE loop_id = @loop", new { loop = _loop });   // actions cascade
        await _db.DisposeAsync();
    }

    private CpmEventActionsController Actions(string user = "engineer.a")
    {
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("preferred_username", user), new Claim(ClaimTypes.Name, user) }, "TraverseEdge")),
        };
        return new CpmEventActionsController(new EventActionStore(_db), _audit, Options.Create(new ShelvingOptions()), NullLogger<CpmEventActionsController>.Instance)
        { ControllerContext = new ControllerContext { HttpContext = http } };
    }

    private async Task<(string ack, string shelf, string? shelvedBy, string? reason, DateTime? until)> Row(long id)
    {
        await using var conn = await _db.OpenConnectionAsync();
        return await conn.QueryFirstAsync<(string, string, string?, string?, DateTime?)>(
            "SELECT ack_state, shelf_state, shelved_by, shelve_reason, shelve_until FROM analytics.cplm_event_frames WHERE id = @id", new { id });
    }

    private async Task<List<string>> History(long id)
    {
        await using var conn = await _db.OpenConnectionAsync();
        return (await conn.QueryAsync<string>("SELECT action FROM analytics.cplm_event_actions WHERE event_id = @id ORDER BY at, id", new { id })).ToList();
    }

    private static int StatusOf(IActionResult r) => r switch
    {
        ObjectResult o => o.StatusCode ?? 200,
        StatusCodeResult s => s.StatusCode,
        _ => 200,
    };

    [Fact]
    public async Task Shelve_update_acknowledge_and_unshelve_keep_the_shelf_and_the_ack_independent()
    {
        var until = DateTimeOffset.UtcNow.AddHours(8);
        StatusOf(await Actions().Shelve(_open, new CpmEventActionsController.ShelveRequest(until, "maintenance planned", null), default)).Should().Be(200);
        var row = await Row(_open);
        row.ack.Should().Be("UNACKNOWLEDGED", "shelving never reviews");
        row.shelf.Should().Be("SHELVED");
        row.shelvedBy.Should().Be("engineer.a");
        row.reason.Should().Be("maintenance planned");

        // a second shelve on an active shelf is an update, not a new shelf
        var later = DateTimeOffset.UtcNow.AddHours(24);
        StatusOf(await Actions("engineer.b").Shelve(_open, new CpmEventActionsController.ShelveRequest(later, "extended: parts due Monday", null), default)).Should().Be(200);
        (await Row(_open)).shelvedBy.Should().Be("engineer.b");

        // acknowledging leaves the active shelf in place
        StatusOf(await Actions().Acknowledge(_open, new CpmEventActionsController.AckRequest("reviewed"), default)).Should().Be(200);
        row = await Row(_open);
        row.ack.Should().Be("ACKNOWLEDGED");
        row.shelf.Should().Be("SHELVED");
        StatusOf(await Actions().Acknowledge(_open, null, default)).Should().Be(409, "already acknowledged");

        // unshelve returns it to the queue with the ack it has
        StatusOf(await Actions().Unshelve(_open, new CpmEventActionsController.UnshelveRequest("valve fixed"), default)).Should().Be(200);
        row = await Row(_open);
        row.shelf.Should().Be("NONE");
        row.ack.Should().Be("ACKNOWLEDGED");
        row.until.Should().BeNull();
        StatusOf(await Actions().Unshelve(_open, null, default)).Should().Be(409, "not shelved");

        (await History(_open)).Should().Equal("SHELVED", "SHELVE_UPDATED", "ACKNOWLEDGED", "UNSHELVED");
        _audit.Types.Should().Equal("CPM_EVENT_SHELVED", "CPM_EVENT_SHELVE_UPDATED", "CPM_EVENT_ACKNOWLEDGED", "CPM_EVENT_UNSHELVED");

        var actions = (await Actions().Actions(_open, default)).Should().BeOfType<OkObjectResult>().Subject;
        var json = JsonSerializer.SerializeToElement(actions.Value);
        json.GetProperty("count").GetInt32().Should().Be(4);
        json.GetProperty("actions")[0].GetProperty("Action").GetString().Should().Be("UNSHELVED", "newest first");
    }

    [Fact]
    public async Task Shelve_refuses_a_closed_episode_a_missing_reason_and_an_expiry_past_the_site_limit()
    {
        var until = DateTimeOffset.UtcNow.AddHours(1);
        StatusOf(await Actions().Shelve(_closed, new CpmEventActionsController.ShelveRequest(until, "x-y-z", null), default)).Should().Be(409);
        StatusOf(await Actions().Shelve(_open, new CpmEventActionsController.ShelveRequest(until, null, null), default)).Should().Be(400);
        var refused = await Actions().Shelve(_open, new CpmEventActionsController.ShelveRequest(DateTimeOffset.UtcNow.AddDays(30), "too long", null), default);
        StatusOf(refused).Should().Be(400);
        JsonSerializer.SerializeToElement(((ObjectResult)refused).Value).GetProperty("maxHours").GetInt32().Should().Be(168);
        (await History(_open)).Should().BeEmpty();
    }

    [Fact]
    public async Task The_sweeper_returns_an_overdue_shelf_exactly_once_and_acknowledging_clears_the_returned_flag()
    {
        StatusOf(await Actions().Shelve(_open, new CpmEventActionsController.ShelveRequest(DateTimeOffset.UtcNow.AddHours(1), "short shelf", null), default)).Should().Be(200);
        await using (var conn = await _db.OpenConnectionAsync())
            await conn.ExecuteAsync("UPDATE analytics.cplm_event_frames SET shelve_until = NOW() - interval '1 minute' WHERE id = @id", new { id = _open });

        var first = await EventActionStore.ExpireDueAsync(_db, default);
        first.Select(e => e.Id).Should().Contain(_open);
        (await EventActionStore.ExpireDueAsync(_db, default)).Select(e => e.Id).Should().NotContain(_open, "flipped once");
        (await Row(_open)).shelf.Should().Be("EXPIRED");

        StatusOf(await Actions().Acknowledge(_open, null, default)).Should().Be(200);
        var row = await Row(_open);
        row.shelf.Should().Be("NONE", "the review closes the returned-from-shelf flag");
        row.reason.Should().BeNull();
        (await History(_open)).Should().Equal("SHELVED", "SHELVE_EXPIRED", "ACKNOWLEDGED");
    }

    [Fact]
    public async Task The_events_read_hides_an_active_shelf_only_and_reports_the_policy()
    {
        StatusOf(await Actions().Shelve(_open, new CpmEventActionsController.ShelveRequest(DateTimeOffset.UtcNow.AddHours(4), "hidden while shelved", null), default)).Should().Be(200);
        var reads = new CpmEventsController(_db, Options.Create(new ShelvingOptions()));

        static (int count, JsonElement json) Unpack(IActionResult r)
        {
            var json = JsonSerializer.SerializeToElement(((OkObjectResult)r).Value);
            return (json.GetProperty("count").GetInt32(), json);
        }
        var (hidden, json) = Unpack(await reads.GetEvents(loopId: _loop, openOnly: true, includeShelved: false, ct: default));
        hidden.Should().Be(0);
        json.GetProperty("shelvePolicy").GetProperty("maxHours").GetInt32().Should().Be(168);

        var (shown, all) = Unpack(await reads.GetEvents(loopId: _loop, openOnly: true, includeShelved: true, ct: default));
        shown.Should().Be(1);
        var ev = all.GetProperty("events")[0];
        ev.GetProperty("shelf_state").GetString().Should().Be("SHELVED");
        ev.GetProperty("shelve_reason").GetString().Should().Be("hidden while shelved");
        ev.GetProperty("ack_state").GetString().Should().Be("UNACKNOWLEDGED");

        // once the expiry passes the row reappears at once, sweeper or not
        await using (var conn = await _db.OpenConnectionAsync())
            await conn.ExecuteAsync("UPDATE analytics.cplm_event_frames SET shelve_until = NOW() - interval '1 second' WHERE id = @id", new { id = _open });
        Unpack(await reads.GetEvents(loopId: _loop, openOnly: true, includeShelved: false, ct: default)).count.Should().Be(1);
    }
}
