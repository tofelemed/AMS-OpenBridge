// 2026-09-18 Gate Configuration redesign: the page lands on "what does each loop run under?" - one
// fleet read instead of one /effective call per loop - and lists bundles in progress from a summary
// projection instead of the full rows (25 KB each: layers + resolved + shadow). The per-loop rule is
// the one /effective uses (the ACTIVE bundle of the most specific scope: LOOP > PROFILE > SITE, else
// the factory layer), applied in memory over the site's active rows.
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Services.Config;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class ConfigEffectiveSummaryTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private ConfigStore _store = null!;
    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); _store = new ConfigStore(_db); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _db.DisposeAsync();

    private static CpmLoopDto Loop(string id, string site, string type, string? area = "A", string? unit = "U") => new(
        id, null, $"Loop {id}", site, area, unit, type, "MEDIUM", true, true, new Dictionary<string, string>(), Array.Empty<string>(), Array.Empty<CpmLoopLinkDto>(), false, null);

    [Fact]
    public void The_summary_resolves_loop_over_profile_over_site_and_names_the_factory_layer_otherwise()
    {
        var loopBundle = Guid.NewGuid(); var profileBundle = Guid.NewGuid(); var siteBundle = Guid.NewGuid();
        var active = new[]
        {
            new ConfigStore.ActiveRow("LOOP", "FIC10302", loopBundle, "h-loop", DateTimeOffset.UtcNow, null),
            new ConfigStore.ActiveRow("PROFILE", "FLOW_FAST_SELF_REG", profileBundle, "h-prof", DateTimeOffset.UtcNow, null),
            new ConfigStore.ActiveRow("SITE", "", siteBundle, "h-site", DateTimeOffset.UtcNow, null),
        };
        var loops = new[] { Loop("FIC10302", "hdpe", "FIC"), Loop("FIC10405", "hdpe", "FIC"), Loop("TIC10101", "hdpe", "TIC"), Loop("PIC20001", "other", "PIC") };
        var rows = EffectiveSummary.Resolve(loops, new Dictionary<string, IReadOnlyList<ConfigStore.ActiveRow>> { ["hdpe"] = active, ["other"] = Array.Empty<ConfigStore.ActiveRow>() });

        rows.Select(r => (r.LoopId, r.ProfileId, r.ScopeKind, r.BundleId)).Should().Equal(
            ("FIC10302", "FLOW_FAST_SELF_REG", "LOOP", loopBundle),                       // its own bundle wins
            ("FIC10405", "FLOW_FAST_SELF_REG", "PROFILE", profileBundle),                 // the class pack's bundle
            ("TIC10101", "TEMP_SLOW_SELF_REG", "SITE", siteBundle),                       // no LOOP / PROFILE bundle: the site's
            ("PIC20001", "PRESSURE_LIQUID_FAST", null, (Guid?)null));                    // nothing active: factory layer
        rows[3].State.Should().Be("NO_ACTIVE_BUNDLE");
    }

    [Fact]
    public async Task On_the_lab_the_summary_row_of_a_loop_equals_the_per_loop_effective_read()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var loopId = await conn.ExecuteScalarAsync<string?>("SELECT scope_ref FROM cpm.config_active WHERE scope_kind = 'LOOP' LIMIT 1");
        if (loopId is null) return;                                                       // no active LOOP bundle on this database: nothing to compare
        var site = await conn.ExecuteScalarAsync<string>("SELECT site FROM cpm.loop_registry WHERE loop_id = @loopId", new { loopId });
        var loopType = await conn.ExecuteScalarAsync<string>("SELECT loop_type FROM cpm.loop_registry WHERE loop_id = @loopId", new { loopId });
        var perLoop = await _store.ActiveForLoopAsync(site, loopId, ConfigStore.ProfileIdFor(loopType), CancellationToken.None);
        var active = await _store.ActiveAsync(site, CancellationToken.None);
        var row = EffectiveSummary.Resolve(new[] { Loop(loopId, site, loopType) }, new Dictionary<string, IReadOnlyList<ConfigStore.ActiveRow>> { [site] = active }).Single();
        row.BundleId.Should().Be(perLoop!.BundleId);
        row.ScopeKind.Should().Be(perLoop.ScopeKind);

        // the light rows the summary carries for its bundles: version / state / change class, no layers
        var light = await _store.SummariesAsync(new[] { perLoop.BundleId }, CancellationToken.None);
        light.Single().Version.Should().Be(perLoop.Version);
        light.Single().State.Should().Be(perLoop.State);
    }

    [Fact]
    public async Task The_summary_projection_of_a_bundle_carries_the_identity_and_state_without_the_content()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var id = await conn.ExecuteScalarAsync<Guid?>("SELECT bundle_id FROM cpm.gate_config_bundle ORDER BY created_at DESC LIMIT 1");
        if (id is null) return;
        var full = (await _store.GetAsync(id.Value, CancellationToken.None))!;
        var json = JsonSerializer.SerializeToElement(CpmConfigurationController.ShapeSummary(full), new JsonSerializerOptions(JsonSerializerDefaults.Web));   // the API's casing
        json.GetProperty("bundleId").GetGuid().Should().Be(full.BundleId);
        json.GetProperty("version").GetInt32().Should().Be(full.Version);
        json.GetProperty("state").GetString().Should().Be(full.State);
        json.GetProperty("changeClass").GetString().Should().Be(full.ChangeClass);
        json.GetProperty("validationErrors").GetInt32().Should().Be(full.Validation is { } v && v.TryGetProperty("errors", out var e) ? e.GetArrayLength() : 0);
        json.TryGetProperty("layers", out _).Should().BeFalse("the summary is for lists: no layers");
        json.TryGetProperty("resolved", out _).Should().BeFalse();
        json.TryGetProperty("shadow", out _).Should().BeFalse();
        JsonSerializer.Serialize(json).Length.Should().BeLessThan(1200, "a summary row is a few hundred bytes, a full row is tens of KB");
    }
}
