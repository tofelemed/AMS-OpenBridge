// CHG-179 - GET /api/v1/cpm/loops/signal-paths: the set of loop-signal paths an HMI display needs to tell a loop signal's
// fallback binding apart (frontend utils/bindingTrust.ts, CHG-176). Any display user may read it (display.view OR
// analytics.view), and it carries the paths only. The unit tests run the real routing, the shared header-trust module and
// cplm-api's own policies under TestServer against a registry stub (no database, no Kafka); the last class needs the lab.
using System.Globalization;
using System.Net;
using System.Reflection;
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;
using Traverse.Auth;
using Traverse.CplmApi.Auth;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Data;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class LoopSignalPathsTests
{
    private const string Url = "/api/v1/cpm/loops/signal-paths";

    /// <summary>Answers only the signal-path read; any other registry member throws (so the endpoint cannot use one).</summary>
    public class SignalPathRegistry : DispatchProxy
    {
        public List<string> Stored { get; } = new();
        public int Reads;

        protected override object? Invoke(MethodInfo? m, object?[]? args)
        {
            if (m?.Name != nameof(ICpmLoopRegistryService.GetSignalPathsAsync)) throw new NotSupportedException(m?.Name);
            Interlocked.Increment(ref Reads);
            return Task.FromResult<IReadOnlyList<string>>(Stored.ToList());
        }
    }

    private sealed class NoAudit : ICplmAuditEmitter
    {
        public void Emit(string eventType, string userId, string entityType, string entityId, object? after = null) { }
    }

    /// <summary>The pipeline Program.cs builds for these routes: controllers, AddTraverseAuth + cplm-api's policies, the fleet cache.</summary>
    private static async Task<(WebApplication App, HttpClient Http, SignalPathRegistry Registry)> Start(int cacheSeconds = 15)
    {
        var proxy = DispatchProxy.Create<ICpmLoopRegistryService, SignalPathRegistry>();
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = Environments.Production });
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Configuration.Sources.Clear();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Auth:ServicePermissions"] = "",                 // no Auth:ServiceKey either: only gateway identities exist here
            ["Cpm:FleetCacheSeconds"] = cacheSeconds.ToString(CultureInfo.InvariantCulture),
        });
        builder.Services.AddControllers().AddApplicationPart(typeof(CpmLoopsController).Assembly);
        builder.AddTraverseAuth();
        CplmPolicies.Register(builder.Services);
        builder.Services.AddMemoryCache();
        builder.Services.AddSingleton<FleetReadCache>();
        builder.Services.AddSingleton<ICpmLoopRegistryService>(proxy);
        builder.Services.AddSingleton<ICplmAuditEmitter, NoAudit>();
        var app = builder.Build();
        app.UseTraverseAuth();
        app.MapControllers();
        await app.StartAsync();
        return (app, app.GetTestClient(), (SignalPathRegistry)(object)proxy);
    }

    /// <summary>A request as the gateway forwards it: X-Auth-Subject is the identity, X-Auth-Permissions its keys.</summary>
    private static HttpRequestMessage Get(string? permissions, string? subject = "operator-1", string url = Url)
    {
        var r = new HttpRequestMessage(HttpMethod.Get, url);
        if (subject is not null) r.Headers.Add("X-Auth-Subject", subject);
        if (permissions is not null) r.Headers.Add("X-Auth-Permissions", permissions);
        return r;
    }

    [Fact]
    public async Task No_identity_is_401()
    {
        var (app, http, registry) = await Start();
        await using var _ = app;

        (await http.SendAsync(Get(null, subject: null))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await http.SendAsync(Get(Perms.DisplayView, subject: null))).StatusCode
            .Should().Be(HttpStatusCode.Unauthorized, "a permissions header without the gateway's subject is no identity");
        registry.Reads.Should().Be(0);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("alarm.view,asset.view,binding.resolve,historian.view")]
    [InlineData("cpm.manage,system.manage,display.edit,display.publish")]
    [InlineData("Display.View,ANALYTICS.VIEW,analytics.viewer")]      // near misses: keys compare exactly, as every policy does
    public async Task Neither_permission_is_403(string? permissions)
    {
        var (app, http, registry) = await Start();
        await using var _ = app;

        (await http.SendAsync(Get(permissions))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        registry.Reads.Should().Be(0);
    }

    [Theory]
    [InlineData("display.view")]
    [InlineData("analytics.view")]
    [InlineData("alarm.view, display.view")]
    [InlineData("analytics.view,display.view")]
    public async Task Either_permission_alone_is_enough(string permissions)
    {
        var (app, http, registry) = await Start();
        await using var _ = app;
        registry.Stored.Add("root.hdpev2.cpm.FIC10401.pv");

        var res = await http.SendAsync(Get(permissions));

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        (await Body(res)).GetProperty("paths").EnumerateArray().Select(p => p.GetString())
            .Should().Equal("root.hdpev2.cpm.fic10401.pv");
    }

    [Fact]
    public async Task The_full_registry_list_still_needs_analytics_view()
    {
        var (app, http, _) = await Start();
        await using var __ = app;

        (await http.SendAsync(Get(Perms.DisplayView, url: "/api/v1/cpm/loops"))).StatusCode
            .Should().Be(HttpStatusCode.Forbidden, "display users get the path set, never the loop data");
    }

    [Fact]
    public async Task Paths_are_trimmed_lower_cased_deduplicated_and_sorted()
    {
        var (app, http, registry) = await Start();
        await using var _ = app;
        registry.Stored.AddRange(new[]
        {
            "  root.hdpev2.cpm.FIC10401.PV ", "root.hdpev2.cpm.fic10401.pv", "root.hdpev2.cpm.FIC10401.SP",
            "ROOT.HDPEV2.CPM.AIC200.op", "", "   ", "\troot.hdpev2.cpm.LIC300.MODE\n", "root.hdpev2.cpm.lic300.vp",
        });

        var body = await Body(await http.SendAsync(Get(Perms.DisplayView)));

        body.GetProperty("paths").EnumerateArray().Select(p => p.GetString()).Should().Equal(
            "root.hdpev2.cpm.aic200.op", "root.hdpev2.cpm.fic10401.pv", "root.hdpev2.cpm.fic10401.sp",
            "root.hdpev2.cpm.lic300.mode", "root.hdpev2.cpm.lic300.vp");
        body.GetProperty("count").GetInt32().Should().Be(5);
    }

    [Fact]
    public async Task The_answer_is_paths_count_and_generatedAt_only()
    {
        var (app, http, registry) = await Start();
        await using var _ = app;
        registry.Stored.AddRange(new[] { "a.b.c.pv", "a.b.c.sp" });
        var before = DateTimeOffset.UtcNow.AddSeconds(-1);

        var res = await http.SendAsync(Get(Perms.AnalyticsView));
        var body = await Body(res);

        res.Content.Headers.ContentType!.MediaType.Should().Be("application/json");
        body.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo("paths", "count", "generatedAt");
        body.GetProperty("paths").EnumerateArray().Should().OnlyContain(p => p.ValueKind == JsonValueKind.String);
        body.GetProperty("count").GetInt32().Should().Be(body.GetProperty("paths").GetArrayLength());
        var generatedAt = body.GetProperty("generatedAt").GetString()!;
        generatedAt.Should().EndWith("Z", "ISO-8601 in UTC");
        var at = DateTimeOffset.Parse(generatedAt, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);
        at.Offset.Should().Be(TimeSpan.Zero);
        at.Should().BeOnOrAfter(before).And.BeOnOrBefore(DateTimeOffset.UtcNow.AddSeconds(1));
    }

    [Fact]
    public async Task An_empty_registry_is_an_empty_set()
    {
        var (app, http, _) = await Start();
        await using var __ = app;

        var body = await Body(await http.SendAsync(Get(Perms.DisplayView)));

        body.GetProperty("paths").GetArrayLength().Should().Be(0);
        body.GetProperty("count").GetInt32().Should().Be(0);
    }

    [Fact]
    public async Task A_second_read_comes_from_the_short_cache_and_an_unchanged_set_is_304()
    {
        var (app, http, registry) = await Start();
        await using var _ = app;
        registry.Stored.Add("a.b.c.pv");

        var first = await http.SendAsync(Get(Perms.DisplayView));
        first.StatusCode.Should().Be(HttpStatusCode.OK);
        first.Headers.CacheControl!.Private.Should().BeTrue("a permissioned answer is never kept by a shared cache");
        first.Headers.CacheControl.NoCache.Should().BeTrue("the browser revalidates every time");
        first.Headers.GetValues("X-Cpm-Cache").Should().Equal("MISS");
        var etag = first.Headers.ETag!;
        etag.IsWeak.Should().BeTrue("generatedAt is not part of the tag");

        var again = Get(Perms.DisplayView);
        again.Headers.IfNoneMatch.Add(etag);
        var second = await http.SendAsync(again);
        second.StatusCode.Should().Be(HttpStatusCode.NotModified);
        second.Headers.ETag.Should().Be(etag);
        second.Headers.GetValues("X-Cpm-Cache").Should().Equal("HIT");
        (await second.Content.ReadAsByteArrayAsync()).Should().BeEmpty();

        var other = Get(Perms.DisplayView);
        other.Headers.TryAddWithoutValidation("If-None-Match", "W/\"not-this-set\"");
        (await http.SendAsync(other)).StatusCode.Should().Be(HttpStatusCode.OK);
        registry.Reads.Should().Be(1, "one registry query per cache period, however many displays ask");
    }

    [Fact]
    public async Task The_tag_follows_the_set_and_a_strong_form_of_it_also_matches()
    {
        var (app, http, registry) = await Start(cacheSeconds: 0);   // 0 = cache off: every read asks the registry
        await using var _ = app;
        registry.Stored.Add("a.b.c.pv");

        var tag1 = (await http.SendAsync(Get(Perms.DisplayView))).Headers.ETag!.Tag;
        var tag1Again = (await http.SendAsync(Get(Perms.DisplayView))).Headers.ETag!.Tag;
        registry.Stored.Add("  A.B.C.PV ");                         // normalises to a path already there: the same set
        var tag1Dup = (await http.SendAsync(Get(Perms.DisplayView))).Headers.ETag!.Tag;
        registry.Stored.Add("a.b.c.sp");
        var tag2 = (await http.SendAsync(Get(Perms.DisplayView))).Headers.ETag!.Tag;

        tag1Again.Should().Be(tag1);
        tag1Dup.Should().Be(tag1);
        tag2.Should().NotBe(tag1);
        registry.Reads.Should().Be(4);

        var strong = Get(Perms.DisplayView);                        // a proxy may strip W/ (weak comparison, RFC 9110 13.1.2)
        strong.Headers.TryAddWithoutValidation("If-None-Match", tag2);
        (await http.SendAsync(strong)).StatusCode.Should().Be(HttpStatusCode.NotModified);
        var listed = Get(Perms.DisplayView);
        listed.Headers.TryAddWithoutValidation("If-None-Match", $"W/\"x\", W/{tag2}");
        (await http.SendAsync(listed)).StatusCode.Should().Be(HttpStatusCode.NotModified);
    }

    [Fact]
    public void Retired_loops_count_and_the_query_reads_paths_only()
    {
        var sql = LoopSignalPaths.Select.Replace("\r\n", "\n");
        sql.Trim().Should().StartWith("SELECT DISTINCT t.uns_path\n", "the path is the only column read");
        sql.Should().Contain("FROM cpm.loop_tag_map t").And.Contain("JOIN cpm.loop_registry r ON r.loop_id = t.loop_id");
        sql.Should().Contain("t.is_active", "the loop's current tag map: the rows GET /loops shows as its tags");
        sql.Should().NotContain("r.is_active", "a retired loop keeps its paths: a display may still be bound to them");
        sql.Should().NotContain("monitoring", "a loop with monitoring off still owns its signals");
    }

    [Fact]
    public void The_service_registers_the_policy_the_route_names()
    {
        // The host above registers it itself; without this line in Program.cs every read would be a 500 (policy not found).
        File.ReadAllText(PlainCplmDb.RepoFile("src", "services", "cplm-api", "Program.cs"))
            .Should().Contain("builder.AddTraverseAuth();")
            .And.Contain("Traverse.CplmApi.Auth.CplmPolicies.Register(builder.Services);");
    }

    private static async Task<JsonElement> Body(HttpResponseMessage res)
    {
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        return JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
    }
}

/// <summary>The query itself on the lab traverse_cplm: a retired loop's paths are in, an inactive tag-map row is out.</summary>
[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]   // writes the shared lab registry: serialised with the other lab tests
public sealed class LoopSignalPathsLabTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly string _live = "ZZ_SIGP_A_" + Guid.NewGuid().ToString("N")[..8];
    private readonly string _retired = "ZZ_SIGP_R_" + Guid.NewGuid().ToString("N")[..8];

    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); return Task.CompletedTask; }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM cpm.loop_registry WHERE loop_id = ANY(@ids)", new { ids = new[] { _live, _retired } });
        await _db.DisposeAsync();
    }

    [Fact]
    public async Task A_retired_loop_keeps_its_paths_and_an_inactive_mapping_is_left_out()
    {
        await using var conn = await _db.OpenConnectionAsync();
        foreach (var loop in new[] { _live, _retired })
        {
            await conn.ExecuteAsync("""
                INSERT INTO cpm.loop_registry (loop_id, display_name, loop_type, site, monitoring)
                VALUES (@loop, 'signal-path probe', 'FIC', 'sigp_site', '{"enabled":true}'::jsonb)
                """, new { loop });
            await conn.ExecuteAsync("""
                INSERT INTO cpm.loop_tag_map (loop_id, signal_role, uns_path, is_active)
                VALUES (@loop, 'PV', ' root.sigp.' || @loop || '.PV ', TRUE), (@loop, 'SP', 'root.sigp.' || @loop || '.sp', TRUE),
                       (@loop, 'OP', 'root.sigp.' || @loop || '.old_op', FALSE)
                """, new { loop });
        }
        (await conn.QueryFirstOrDefaultAsync<string>(LoopRetireSql.Retire, new { loopId = _retired })).Should().Be(_retired);

        var paths = LoopSignalPaths.Normalise(await LoopSignalPaths.LoadAsync(conn, default));

        foreach (var loop in new[] { _live, _retired }.Select(l => l.ToLowerInvariant()))
        {
            paths.Should().Contain($"root.sigp.{loop}.pv").And.Contain($"root.sigp.{loop}.sp");
            paths.Should().NotContain($"root.sigp.{loop}.old_op");
        }
        paths.Should().BeInAscendingOrder(StringComparer.Ordinal).And.OnlyHaveUniqueItems();
    }
}
