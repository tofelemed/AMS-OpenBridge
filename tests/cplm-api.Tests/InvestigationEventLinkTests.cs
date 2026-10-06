// SME review #22 (CHG-058) - loop notes on the lab traverse_cplm: a note needs no open episode, can be linked
// to an episode of its own loop at creation or later (never another loop's), can be unlinked, is listed for
// the episode, and linking never acknowledges the episode. Needs 63_cplm_investigation_event_link.sql.
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class InvestigationEventLinkTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly string _loop = "NOTE_" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
    private readonly string _other = "NOTX_" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
    private long _event, _otherEvent;

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        _event = await conn.ExecuteScalarAsync<long>("""
            INSERT INTO analytics.cplm_event_frames (loop_id, window_kind, family, opened_at, peak_diagnosis, peak_confidence)
            VALUES (@loop, '24h', 'OSCILLATION', NOW() - interval '1 day', 'CONFIRMED_OSCILLATION', 1.0) RETURNING id
            """, new { loop = _loop });
        _otherEvent = await conn.ExecuteScalarAsync<long>("""
            INSERT INTO analytics.cplm_event_frames (loop_id, window_kind, family, opened_at, peak_diagnosis, peak_confidence)
            VALUES (@loop, '24h', 'OSCILLATION', NOW() - interval '1 day', 'CONFIRMED_OSCILLATION', 1.0) RETURNING id
            """, new { loop = _other });
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.investigation_reference WHERE loop_id = ANY(@loops)", new { loops = new[] { _loop, _other } });
        await conn.ExecuteAsync("DELETE FROM analytics.cplm_event_frames WHERE loop_id = ANY(@loops)", new { loops = new[] { _loop, _other } });
        await _db.DisposeAsync();
    }

    private CpmInvestigationsController Controller(string user = "engineer.a")
    {
        var http = new DefaultHttpContext
        {
            User = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity(
                new[] { new System.Security.Claims.Claim("preferred_username", user) }, "TraverseEdge")),
        };
        return new CpmInvestigationsController(new InvestigationStore(_db)) { ControllerContext = new ControllerContext { HttpContext = http } };
    }

    private static System.Text.Json.JsonElement Json(object? v) => System.Text.Json.JsonSerializer.SerializeToElement(v);

    [Fact]
    public async Task A_note_needs_no_episode_and_is_linked_later_without_acknowledging_it()
    {
        var created = (CreatedResult)await Controller().Create(new CpmInvestigationsController.CreateRequest(_loop, null, null, "OP looks sticky at 30 %, insufficient evidence yet", null), CancellationToken.None);
        var json = Json(created.Value);
        json.GetProperty("eventId").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Null, "a loop note does not need an episode");
        var id = json.GetProperty("refId").GetGuid();

        var linked = await Controller("engineer.b").LinkEvent(id, new CpmInvestigationsController.EventLinkRequest(_event), CancellationToken.None);
        Json(linked.Should().BeOfType<OkObjectResult>().Subject.Value).GetProperty("eventId").GetInt64().Should().Be(_event);

        var forEvent = (OkObjectResult)await Controller().ForEvent(_event, CancellationToken.None);
        Json(forEvent.Value).GetProperty("count").GetInt32().Should().Be(1);

        await using var conn = await _db.OpenConnectionAsync();
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.cplm_event_actions WHERE event_id = @e", new { e = _event }))
            .Should().Be(0, "linking a note is not an acknowledgement (ISA-18.2: acknowledging is a deliberate act)");

        var unlinked = await Controller().LinkEvent(id, new CpmInvestigationsController.EventLinkRequest(null), CancellationToken.None);
        Json(((OkObjectResult)unlinked).Value).GetProperty("eventId").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Null);
    }

    [Fact]
    public async Task A_note_is_never_linked_to_another_loops_episode_or_a_missing_one()
    {
        var res = await Controller().Create(new CpmInvestigationsController.CreateRequest(_loop, null, null, "n", null, _otherEvent), CancellationToken.None);
        res.Should().BeOfType<UnprocessableEntityObjectResult>();
        (await Controller().Create(new CpmInvestigationsController.CreateRequest(_loop, null, null, "n", null, long.MaxValue), CancellationToken.None))
            .Should().BeOfType<NotFoundObjectResult>();

        var ok = (CreatedResult)await Controller().Create(new CpmInvestigationsController.CreateRequest(_loop, null, null, "n", null, _event), CancellationToken.None);
        var id = Json(ok.Value).GetProperty("refId").GetGuid();
        (await Controller().LinkEvent(id, new CpmInvestigationsController.EventLinkRequest(_otherEvent), CancellationToken.None))
            .Should().BeOfType<UnprocessableEntityObjectResult>();
        (await Controller().LinkEvent(Guid.NewGuid(), new CpmInvestigationsController.EventLinkRequest(_event), CancellationToken.None))
            .Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task An_overlong_note_is_refused()
    {
        var res = await Controller().Create(new CpmInvestigationsController.CreateRequest(_loop, null, null, new string('x', CpmInvestigationsController.MaxNoteLength + 1), null), CancellationToken.None);
        res.Should().BeOfType<BadRequestObjectResult>();
    }
}
