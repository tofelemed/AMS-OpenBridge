using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AMS.AuditService.Models;
using FluentAssertions;
using Xunit;

namespace AMS.AuditService.Tests;

/// <summary>
/// CHG-174: GET /api/v1/audit pages through the whole trail on the server. `offset` is new and
/// optional (default 0) and the answer echoes it; a caller that sends today's parameters gets the
/// same fields and the same rows. The user filter ignores case. The read keeps admin.audit.view.
/// </summary>
public sealed class AuditQueryEndpointTests
{
    private const string Trail = "/api/v1/audit";
    private static readonly DateTimeOffset T0 = new(2026, 11, 4, 13, 0, 0, TimeSpan.Zero);

    private static AuditEvent Event(int minute, string user = "alice", string type = "DISPLAY_UPDATED", string entity = "Display") => new()
    {
        TimestampUtc = T0.AddMinutes(minute),
        EventType = type,
        UserId = user,
        EntityType = entity,
        EntityId = "e-" + minute,
        PreviousHash = new string('0', 64),
        CurrentHash = minute.ToString("x64"),
    };

    private static async Task<JsonElement> ReadAsync(HttpClient client, string query)
    {
        var res = await client.GetAsync(Trail + query);
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        return await res.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static List<string> Ids(JsonElement body) =>
        body.GetProperty("events").EnumerateArray().Select(e => e.GetProperty("entityId").GetString()!).ToList();

    [Fact]
    public async Task Todays_parameters_get_the_same_fields_and_the_newest_rows_first()
    {
        await using var factory = new AuditServiceFactory();
        await factory.SeedAsync(Enumerable.Range(0, 5).Select(i => Event(i)));

        var body = await ReadAsync(factory.ClientAs("reader", "admin.audit.view"), "?take=3");

        body.GetProperty("total").GetInt32().Should().Be(5);
        body.GetProperty("count").GetInt32().Should().Be(3);
        Ids(body).Should().Equal("e-4", "e-3", "e-2");
        var first = body.GetProperty("events")[0];
        first.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(
            "eventId", "timestampUtc", "eventType", "userId", "entityType", "entityId", "correlationId", "currentHash");
    }

    [Fact]
    public async Task The_answer_echoes_the_offset_so_a_client_knows_the_service_pages()
    {
        await using var factory = new AuditServiceFactory();
        await factory.SeedAsync(Enumerable.Range(0, 3).Select(i => Event(i)));
        var client = factory.ClientAs("reader", "admin.audit.view");

        (await ReadAsync(client, "?take=2")).GetProperty("offset").GetInt32().Should().Be(0);
        (await ReadAsync(client, "?take=2&offset=2")).GetProperty("offset").GetInt32().Should().Be(2);
    }

    [Fact]
    public async Task Offset_pages_through_every_event_without_gaps_or_repeats()
    {
        await using var factory = new AuditServiceFactory();
        await factory.SeedAsync(Enumerable.Range(0, 60).Select(i => Event(i)));
        var client = factory.ClientAs("reader", "admin.audit.view");

        var seen = new List<string>();
        foreach (var offset in new[] { 0, 25, 50 })
        {
            var body = await ReadAsync(client, $"?take=25&offset={offset}");
            body.GetProperty("total").GetInt32().Should().Be(60);
            seen.AddRange(Ids(body));
        }

        seen.Should().HaveCount(60).And.OnlyHaveUniqueItems();
        seen.Should().Equal(Enumerable.Range(0, 60).Reverse().Select(i => "e-" + i), "newest first across pages");
    }

    [Fact]
    public async Task The_second_page_holds_the_next_rows()
    {
        await using var factory = new AuditServiceFactory();
        await factory.SeedAsync(Enumerable.Range(0, 10).Select(i => Event(i)));

        var body = await ReadAsync(factory.ClientAs("reader", "admin.audit.view"), "?take=4&offset=4");

        Ids(body).Should().Equal("e-5", "e-4", "e-3", "e-2");
        body.GetProperty("count").GetInt32().Should().Be(4);
    }

    [Fact]
    public async Task An_offset_past_the_end_returns_no_rows_and_keeps_the_total()
    {
        await using var factory = new AuditServiceFactory();
        await factory.SeedAsync(Enumerable.Range(0, 3).Select(i => Event(i)));

        var body = await ReadAsync(factory.ClientAs("reader", "admin.audit.view"), "?take=25&offset=50");

        body.GetProperty("total").GetInt32().Should().Be(3);
        body.GetProperty("count").GetInt32().Should().Be(0);
    }

    [Fact]
    public async Task A_negative_offset_reads_from_the_newest()
    {
        await using var factory = new AuditServiceFactory();
        await factory.SeedAsync(Enumerable.Range(0, 3).Select(i => Event(i)));

        var body = await ReadAsync(factory.ClientAs("reader", "admin.audit.view"), "?take=1&offset=-5");

        Ids(body).Should().Equal("e-2");
        body.GetProperty("offset").GetInt32().Should().Be(0);
    }

    [Fact]
    public async Task Events_at_the_same_instant_keep_one_order_so_pages_never_overlap()
    {
        await using var factory = new AuditServiceFactory();
        var same = Enumerable.Range(0, 9).Select(i => { var e = Event(0); e.EntityId = "s-" + i; return e; }).ToList();
        await factory.SeedAsync(same);
        var client = factory.ClientAs("reader", "admin.audit.view");

        var seen = new List<string>();
        foreach (var offset in new[] { 0, 3, 6 }) seen.AddRange(Ids(await ReadAsync(client, $"?take=3&offset={offset}")));

        seen.Should().HaveCount(9).And.OnlyHaveUniqueItems();
    }

    [Fact]
    public async Task The_user_filter_ignores_case()
    {
        await using var factory = new AuditServiceFactory();
        await factory.SeedAsync(new[] { Event(0, "superadmin"), Event(1, "SuperAdmin"), Event(2, "engineer") });
        var client = factory.ClientAs("reader", "admin.audit.view");

        Ids(await ReadAsync(client, "?userId=Superadmin")).Should().BeEquivalentTo("e-0", "e-1");
        Ids(await ReadAsync(client, "?userId=superadmin")).Should().BeEquivalentTo("e-0", "e-1");
        Ids(await ReadAsync(client, "?userId=super")).Should().BeEmpty("the user name still matches whole, not in part");
    }

    [Fact]
    public async Task Filters_time_range_and_offset_combine_and_the_total_counts_the_filtered_rows()
    {
        await using var factory = new AuditServiceFactory();
        await factory.SeedAsync(Enumerable.Range(0, 20).Select(i => Event(i, type: i % 2 == 0 ? "CPM_LOOP_ACTIVATED" : "DISPLAY_UPDATED", entity: i % 2 == 0 ? "CpmLoop" : "Display")));
        var from = Uri.EscapeDataString(T0.AddMinutes(4).ToString("o"));
        var to = Uri.EscapeDataString(T0.AddMinutes(15).ToString("o"));

        var body = await ReadAsync(factory.ClientAs("reader", "admin.audit.view"),
            $"?entityType=CpmLoop&eventType=CPM_LOOP_ACTIVATED&from={from}&to={to}&take=2&offset=2");

        body.GetProperty("total").GetInt32().Should().Be(6, "minutes 4, 6, 8, 10, 12, 14");
        Ids(body).Should().Equal("e-10", "e-8");
    }

    [Fact]
    public async Task The_take_cap_is_unchanged()
    {
        await using var factory = new AuditServiceFactory();
        await factory.SeedAsync(Enumerable.Range(0, 510).Select(i => Event(i)));

        var body = await ReadAsync(factory.ClientAs("reader", "admin.audit.view"), "?take=1000");

        body.GetProperty("count").GetInt32().Should().Be(500);
        body.GetProperty("total").GetInt32().Should().Be(510);
    }

    [Fact]
    public async Task The_read_keeps_the_audit_permission()
    {
        await using var factory = new AuditServiceFactory();

        (await factory.ClientAs("ops.admin", "system.manage").GetAsync(Trail + "?offset=0")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await factory.CreateClient().GetAsync(Trail)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
