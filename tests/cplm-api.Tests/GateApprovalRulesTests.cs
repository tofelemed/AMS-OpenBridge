// CHG-108 gap #5 (owner, 23 Nov): the same approval rule everywhere in Gate Configuration - a second person, except an Admin or
// SuperAdmin may approve their own draft (recorded as a self-approval); site-wide / objective / test-permission changes need a
// SuperAdmin (or ControlAuthority); an expired approval can be approved again. Against the lab database.
using System.Security.Claims;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.Config;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class GateApprovalRulesTests : IAsyncLifetime
{
    private const string Site = "e2e-approval-site";
    private NpgsqlDataSource _db = null!;
    private ConfigStore _store = null!;

    private sealed class NullAudit : ICplmAuditEmitter
    {
        public void Emit(string eventType, string userId, string entityType, string entityId, object? after = null) { }
    }

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        _store = new ConfigStore(_db);
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
        await conn.ExecuteAsync("""
            DELETE FROM cpm.config_approval WHERE bundle_id IN (SELECT bundle_id FROM cpm.gate_config_bundle WHERE site = @site);
            DELETE FROM cpm.gate_config_bundle WHERE site = @site
            """, new { site = Site });
    }

    private async Task<BundleView> ValidatedAsync(string kind, string? scopeRef, string author)
    {
        var d = await _store.CreateDraftAsync(Site, kind, scopeRef, null, kind == "LOOP" ? "FLOW_FAST_SELF_REG" : null, author, null, default);
        return await _store.ValidateAsync(d.BundleId, default);
    }

    /// <summary>The single-bundle approve endpoint as a user with these roles.</summary>
    private CpmConfigurationController Api(string user, params string[] roles)
    {
        var claims = new List<Claim> { new("preferred_username", user) };
        claims.AddRange(roles.Select(r => new Claim("role", r)));
        return new CpmConfigurationController(_store, null!, null!, null!, new NullAudit(), null!)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")) } },
        };
    }

    private static int Status(IActionResult r) => r switch { ObjectResult o => o.StatusCode ?? 200, _ => 0 };

    [Fact]
    public async Task In_the_editor_an_admin_may_approve_their_own_draft_and_an_engineer_may_not()
    {
        var engineer = await ValidatedAsync("LOOP", "AP_FIC1", "erin");
        Status(await Api("erin", "Engineer").Approve(engineer.BundleId, null, default)).Should().Be(403);

        var admin = await ValidatedAsync("LOOP", "AP_FIC2", "carol");
        Status(await Api("carol", "Admin").Approve(admin.BundleId, new CpmConfigurationController.ApproveRequest("urgent", null), default)).Should().Be(200);
        var approval = (await _store.ApprovalsAsync(admin.BundleId, admin.ContentHash, default)).Single();
        approval.Role.Should().Be("Admin");
        approval.Note.Should().Be("[self-approved as Admin] urgent");

        var other = await ValidatedAsync("LOOP", "AP_FIC3", "erin");
        Status(await Api("bob", "Engineer").Approve(other.BundleId, null, default)).Should().Be(200, "a second person needs no special role");
    }

    [Fact]
    public async Task A_site_wide_bundle_needs_a_superadmin_and_an_admin_is_refused()
    {
        var site = await ValidatedAsync("SITE", null, "erin");
        var admin = await Api("carol", "Admin").Approve(site.BundleId, null, default);
        Status(admin).Should().Be(403);
        ((ObjectResult)admin).Value!.ToString().Should().Contain("SuperAdmin");
        Status(await Api("sam", "SuperAdmin").Approve(site.BundleId, null, default)).Should().Be(200);

        var own = await ValidatedAsync("SITE", null, "sam");
        Status(await Api("sam", "SuperAdmin").Approve(own.BundleId, null, default)).Should().Be(200, "a SuperAdmin may approve their own site-wide bundle");
    }

    [Fact]
    public async Task An_expired_approval_can_be_approved_again_but_a_valid_one_cannot()
    {
        var d = await ValidatedAsync("LOOP", "AP_FIC4", "alice");
        await _store.ApproveAsync(d.BundleId, "bob", "Supervisor", null, TimeSpan.FromHours(-1), false, new[] { "Supervisor" }, default);
        var again = await _store.ApproveAsync(d.BundleId, "bob", "Supervisor", "again", TimeSpan.FromHours(1), false, new[] { "Supervisor" }, default);
        again.State.Should().Be("APPROVED");
        (await _store.ValidApprovalAsync(d.BundleId, again.ContentHash, default))!.Value.ExpiresAt.Should().BeAfter(DateTimeOffset.UtcNow);

        var thrice = async () => await _store.ApproveAsync(d.BundleId, "dave", "Supervisor", null, TimeSpan.FromHours(1), false, new[] { "Supervisor" }, default);
        await thrice.Should().ThrowAsync<ConfigStateException>("the approval is still valid");
    }
}
