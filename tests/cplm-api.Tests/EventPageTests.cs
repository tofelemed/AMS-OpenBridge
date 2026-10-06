// CHG-063 — Loop Events paged on the server (lab traverse_cplm): tab predicates match the frontend's
// matchesEventFilter, counts describe every matching episode (not a slice), search and paging work past any
// fetch cap, and one episode is readable by id whatever its rank.
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Data;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class EventPageTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly string _loop = "EVPAGE_" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
    private readonly Dictionary<string, long> _ids = new();

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        async Task Add(string name, string family, string extraCols, string extraVals, int ageHours, double conf)
        {
            _ids[name] = await conn.ExecuteScalarAsync<long>($"""
                INSERT INTO analytics.cplm_event_frames (loop_id, window_kind, family, opened_at, peak_diagnosis, peak_confidence{extraCols})
                VALUES (@loop, '24h', @family, NOW() - make_interval(hours => @age), 'CONFIRMED_' || @family, @conf{extraVals}) RETURNING id
                """, new { loop = _loop, family, age = ageHours, conf });
        }
        await Add("open", "OSCILLATION", "", "", 10, 0.9);
        await Add("unobs", "SLUGGISH", ", availability_state", ", 'UNOBSERVABLE'", 11, 0.4);
        await Add("acked", "SATURATION", ", ack_state", ", 'ACKNOWLEDGED'", 12, 0.5);
        await Add("shelved", "STICTION", ", shelf_state, shelve_until", ", 'SHELVED', NOW() + interval '4 hours'", 13, 0.6);
        await Add("overdue", "DEADBAND", ", shelf_state, shelve_until", ", 'SHELVED', NOW() - interval '1 hour'", 14, 0.7);
        await Add("closed", "EFFORT_100%_X", ", closed_at, condition_state", ", NOW() - interval '1 hour', 'CLOSED'", 15, 0.95);
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.cplm_event_frames WHERE loop_id = @loop", new { loop = _loop });
        await _db.DisposeAsync();
    }

    private CpmEventPageController Api() => new(_db, Options.Create(new ShelvingOptions()));

    private static JsonElement Json(IActionResult r) => JsonSerializer.SerializeToElement(((OkObjectResult)r).Value);

    private async Task<JsonElement> Page(string state = "all", string? q = null, int page = 1, int pageSize = 20, string sort = "triage") =>
        Json(await Api().GetPage(state, _loop, q, null, null, null, sort, page, pageSize, default));

    private static long[] Ids(JsonElement page) => page.GetProperty("events").EnumerateArray().Select(e => e.GetProperty("id").GetInt64()).ToArray();

    [Fact]
    public async Task Each_tab_holds_exactly_the_episodes_the_frontend_predicate_would()
    {
        var all = await Page();
        var counts = all.GetProperty("counts");
        counts.GetProperty("all").GetInt32().Should().Be(6);
        (await Page("open")).Let(Ids).Should().BeEquivalentTo(new[] { _ids["open"], _ids["unobs"], _ids["acked"], _ids["shelved"], _ids["overdue"] });
        (await Page("unobservable")).Let(Ids).Should().Equal(_ids["unobs"]);
        // an active shelf leaves the unacknowledged queue; an overdue one is back in it before the sweeper runs
        (await Page("unacknowledged")).Let(Ids).Should().BeEquivalentTo(new[] { _ids["open"], _ids["unobs"], _ids["overdue"] });
        (await Page("acknowledged")).Let(Ids).Should().Equal(_ids["acked"]);
        (await Page("shelved")).Let(Ids).Should().Equal(_ids["shelved"]);
        (await Page("shelfExpired")).Let(Ids).Should().Equal(_ids["overdue"]);
        (await Page("closed")).Let(Ids).Should().Equal(_ids["closed"]);
        counts.GetProperty("unacknowledged").GetInt32().Should().Be(3);
        counts.GetProperty("shelfExpired").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task Pages_are_disjoint_and_ordered_open_first_then_by_score()
    {
        var p1 = await Page(pageSize: 4);
        var p2 = await Page(pageSize: 4, page: 2);
        p1.GetProperty("total").GetInt32().Should().Be(6);
        p1.GetProperty("pageCount").GetInt32().Should().Be(2);
        Ids(p1).Should().Equal(_ids["open"], _ids["overdue"], _ids["shelved"], _ids["acked"]);
        Ids(p2).Should().Equal(_ids["unobs"], _ids["closed"]);
        Ids(await Page(sort: "recent", pageSize: 2)).Should().Equal(_ids["open"], _ids["unobs"]);
    }

    [Fact]
    public async Task Search_matches_family_and_diagnosis_and_treats_wildcards_as_text()
    {
        Ids(await Page(q: "stiction")).Should().Equal(_ids["shelved"]);
        Ids(await Page(q: "100%_")).Should().Equal(_ids["closed"]);
        Ids(await Page(q: "%")).Should().Equal(_ids["closed"]);   // a literal % matches only the family that contains one
        (await Page(q: "stiction")).GetProperty("counts").GetProperty("all").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task One_episode_is_readable_by_id_and_a_missing_one_is_404()
    {
        var ok = Json(await Api().GetById(_ids["closed"], default));
        ok.GetProperty("loop_id").GetString().Should().Be(_loop);
        (await Api().GetById(-1, default)).Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task Unknown_state_or_sort_is_a_400_and_page_size_is_capped()
    {
        (await Api().GetPage("bogus", _loop, null, null, null, null, "triage", 1, 20, default)).Should().BeOfType<BadRequestObjectResult>();
        (await Api().GetPage("all", _loop, null, null, null, null, "bogus", 1, 20, default)).Should().BeOfType<BadRequestObjectResult>();
        (await Page(pageSize: 5000)).GetProperty("pageSize").GetInt32().Should().Be(CpmEventPageController.MaxPageSize);
        EventPageSql.Pattern("  ").Should().BeNull();
    }
}

internal static class JsonLet
{
    public static T Let<T>(this JsonElement e, Func<JsonElement, T> f) => f(e);
}
