using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Xunit;

namespace AMS.AuditService.Tests;

/// <summary>
/// CHG-173: POST /api/v1/audit/rechain rewrites every hash of the chain, so it needs
/// system.manage (not the read key admin.audit.view), and every call is itself recorded
/// in the chain. Verification keeps admin.audit.view.
/// </summary>
public sealed class RechainEndpointTests
{
    private const string Rechain = "/api/v1/audit/rechain";
    private const string Verify = "/api/v1/audit/verify";

    [Fact]
    public async Task Rechain_with_only_the_audit_read_permission_is_forbidden_and_changes_nothing()
    {
        await using var factory = new AuditServiceFactory();
        await factory.SeedLegacyChainAsync(3);
        var before = await factory.ReadChainAsync();

        var res = await factory.ClientAs("reader", "admin.audit.view").PostAsync(Rechain, null);

        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        var after = await factory.ReadChainAsync();
        after.Select(e => (e.EventId, e.PreviousHash, e.CurrentHash))
            .Should().Equal(before.Select(e => (e.EventId, e.PreviousHash, e.CurrentHash)));
    }

    [Fact]
    public async Task Rechain_without_an_identity_is_unauthorized()
    {
        await using var factory = new AuditServiceFactory();

        var res = await factory.CreateClient().PostAsync(Rechain, null);

        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Rechain_with_system_manage_succeeds_and_appends_one_event_naming_the_actor()
    {
        await using var factory = new AuditServiceFactory();
        await factory.SeedLegacyChainAsync(3);

        var res = await factory.ClientAs("ops.admin", "system.manage").PostAsync(Rechain, null);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo("total", "rehashed", "note");
        body.GetProperty("total").GetInt32().Should().Be(3);
        body.GetProperty("rehashed").GetInt32().Should().Be(3);

        var chain = await factory.ReadChainAsync();
        chain.Should().HaveCount(4);
        var records = chain.Where(e => e.EventType == TestChain.RechainedType).ToList();
        records.Should().ContainSingle();
        var record = records[0];
        chain[^1].EventId.Should().Be(record.EventId, "the record is appended after the rechain");
        record.PreviousHash.Should().Be(chain[^2].CurrentHash, "it is hashed under the new chain");
        record.UserId.Should().Be("ops.admin");

        var state = record.AfterState!.RootElement;
        state.GetProperty("total").GetInt32().Should().Be(3);
        state.GetProperty("rehashed").GetInt32().Should().Be(3);
        state.GetProperty("actor").GetProperty("username").GetString().Should().Be("ops.admin");
        state.GetProperty("actor").GetProperty("user_id").GetString().Should().Be("sub-ops.admin");
    }

    [Fact]
    public async Task Every_rechain_is_recorded_even_when_nothing_needed_rehashing()
    {
        await using var factory = new AuditServiceFactory();
        await factory.SeedLegacyChainAsync(2);
        var client = factory.ClientAs("ops.admin", "system.manage");

        (await client.PostAsync(Rechain, null)).StatusCode.Should().Be(HttpStatusCode.OK);
        var second = await client.PostAsync(Rechain, null);

        second.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await second.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("total").GetInt32().Should().Be(3, "the first call's record is part of the chain");
        body.GetProperty("rehashed").GetInt32().Should().Be(0);

        var chain = await factory.ReadChainAsync();
        chain.Where(e => e.EventType == TestChain.RechainedType).Should().HaveCount(2);
        chain[^1].AfterState!.RootElement.GetProperty("rehashed").GetInt32().Should().Be(0);
    }

    [Fact]
    public async Task Verify_keeps_the_audit_read_permission_and_passes_after_a_rechain()
    {
        await using var factory = new AuditServiceFactory();
        await factory.SeedLegacyChainAsync(3);
        var reader = factory.ClientAs("reader", "admin.audit.view");

        (await reader.PostAsync(Verify, null)).StatusCode
            .Should().Be(HttpStatusCode.InternalServerError, "legacy rows cannot verify before the rechain");

        (await factory.ClientAs("ops.admin", "system.manage").PostAsync(Rechain, null))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        var verified = await reader.PostAsync(Verify, null);
        verified.StatusCode.Should().Be(HttpStatusCode.OK, "the chain, record included, verifies");
        (await verified.Content.ReadAsStringAsync()).Should().Contain("Chain verified");
    }

    [Fact]
    public async Task Verify_is_not_opened_to_system_manage_alone()
    {
        await using var factory = new AuditServiceFactory();

        var res = await factory.ClientAs("ops.admin", "system.manage").PostAsync(Verify, null);

        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task The_record_is_visible_in_the_trail_query()
    {
        await using var factory = new AuditServiceFactory();
        await factory.SeedLegacyChainAsync(1);
        (await factory.ClientAs("ops.admin", "system.manage").PostAsync(Rechain, null))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        var res = await factory.ClientAs("reader", "admin.audit.view")
            .GetAsync("/api/v1/audit?eventType=" + TestChain.RechainedType);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        var events = body.GetProperty("events").EnumerateArray().ToList();
        events.Should().ContainSingle();
        events[0].GetProperty("userId").GetString().Should().Be("ops.admin");
        events[0].GetProperty("entityType").GetString().Should().Be("AuditChain");
    }
}
