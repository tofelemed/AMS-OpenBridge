// CHG-224 "Gate property values: show what is really used, and where it is set", against the lab database in its own site: the
// entries of GET /configuration/effective for loops under a PROFILE bundle (with and without a PV range, with the loop's latest
// validated model and short result), without an active bundle, and per kind; owner decision D1 (an edit that changes nothing is
// refused, a value stored before is removed whenever a new version is made, without raising the change class, and a re-stack does
// not mistake the removal for a plant-wide change); the catalogue's kind / editable fields.
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Traverse.CplmApi.Config;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.Config;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class GatePropertyValuesTests : IAsyncLifetime
{
    private const string Site = "e2e-values-site";
    private const string Flow = "FLOW_FAST_SELF_REG";
    private const string Fic1 = "ZZ_VAL_FIC1", Fic2 = "ZZ_VAL_FIC2", Tic1 = "ZZ_VAL_TIC1", Lic1 = "ZZ_VAL_LIC1";
    private static readonly string[] Loops = { Fic1, Fic2, Tic1, Lic1 };
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    private NpgsqlDataSource _db = null!;
    private ConfigStore _store = null!;
    private ConfigDeploymentService _deployments = null!;
    private RegionBulkService _regions = null!;
    private LoopSettingsService _loopSettings = null!;
    private LoopValueReads _values = null!;
    private ICpmLoopRegistryService _registry = null!;

    private sealed class NullAudit : ICplmAuditEmitter
    {
        public void Emit(string eventType, string userId, string entityType, string entityId, object? after = null) { }
    }

    private sealed class NullPublisher : IGateConfigPublisher
    {
        public Task PublishAsync(string bundleId, string message, CancellationToken ct) => Task.CompletedTask;
    }

    private static CpmLoopDto Loop(string id, string type, CpmEngineeringRange? eng = null, CpmLoopModelDto? model = null, params string[] links) =>
        new(id, null, id, Site, null, null, type, "LOW", true, true, new Dictionary<string, string>(), Array.Empty<string>(),
            links.Select(l => new CpmLoopLinkDto(l, "INTERACTS", "PLANT_MODEL")).ToList(), false, null, eng, null, model);

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        _store = new ConfigStore(_db);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Auth:ServiceKey"] = "test-key" }).Build();
        _deployments = new ConfigDeploymentService(_db, _store, new NullPublisher(), new NullAudit(), config, NullLogger<ConfigDeploymentService>.Instance);
        var (registry, stub) = RegistryStub.Create();
        _registry = registry;
        stub.Loops[Fic1] = Loop(Fic1, "FIC", new CpmEngineeringRange(0, 100, 0, 200, "kg/h"),
            new CpmLoopModelDto("FLOW", "FAST_SELF_REG", "AVERAGING", "SINGLE", "OP_TO_VALVE", new CpmAcquisition("RBE", 2, null, null, null), "EXPLICIT"), Fic2);
        stub.Loops[Fic2] = Loop(Fic2, "FIC");
        stub.Loops[Tic1] = Loop(Tic1, "TIC", new CpmEngineeringRange(PvMin: 0, PvMax: 500, PvUnit: "°C"));
        stub.Loops[Lic1] = Loop(Lic1, "LIC");
        _regions = new RegionBulkService(_store, _registry, new NullAudit());
        _loopSettings = new LoopSettingsService(_store, _registry, new NullAudit());
        _values = new LoopValueReads(_db, new ConfigurationBuilder().Build());
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
            DELETE FROM cpm.config_active WHERE site = @site;
            DELETE FROM cpm.config_approval WHERE bundle_id IN (SELECT bundle_id FROM cpm.gate_config_bundle WHERE site = @site);
            DELETE FROM cpm.gate_config_bundle WHERE site = @site;
            DELETE FROM analytics.system_model WHERE loop_id = ANY(@loops);
            DELETE FROM analytics.cplm_short_feature_results WHERE loop_id = ANY(@loops)
            """, new { site = Site, loops = Loops });
    }

    // ── helpers ─────────────────────────────────────────────────────────────
    /// <summary>The bundle in force for its scope (as a verified deployment leaves it), without the deployment itself.</summary>
    private async Task<BundleView> ActivateAsync(BundleView b)
    {
        await _store.SetStateAsync(b.BundleId, "ACTIVE_VERIFIED", default);
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            INSERT INTO cpm.config_active (site, scope_kind, scope_ref, bundle_id, content_hash, since) VALUES (@site, @kind, @ref, @id, @hash, now())
            ON CONFLICT (site, scope_kind, scope_ref) DO UPDATE SET bundle_id = EXCLUDED.bundle_id, content_hash = EXCLUDED.content_hash, since = EXCLUDED.since
            """, new { site = Site, kind = b.ScopeKind, @ref = b.ScopeRef ?? "", id = b.BundleId, hash = b.ContentHash });
        return (await _store.GetAsync(b.BundleId, default))!;
    }

    private async Task<BundleView> DraftAsync(string kind, string? scopeRef, Guid? parent, string? profileId, params (string Property, string Json)[] sets)
    {
        var d = await _store.CreateDraftAsync(Site, kind, scopeRef, parent, profileId, "erin", null, default);
        if (sets.Length > 0)
            d = await _store.PatchAsync(d.BundleId, d.Etag, sets.Select(s => new ConfigStore.PatchOp("set", s.Property, JsonDocument.Parse(s.Json).RootElement)).ToList(), "erin", default);
        return await _store.ValidateAsync(d.BundleId, default);
    }

    /// <summary>A bundle as an older version stored it: <paramref name="extra"/> written into a layer's content, resolved and hashed again.</summary>
    private async Task<BundleView> LegacyAsync(BundleView b, params (string Kind, string Json)[] extra)
    {
        var layers = JsonNode.Parse(b.Layers.GetRawText())!.AsArray();
        foreach (var (kind, json) in extra)
        {
            var content = layers.Single(l => l!["kind"]!.GetValue<string>() == kind)!["content"]!.AsObject();
            foreach (var p in JsonNode.Parse(json)!.AsObject().ToList()) content[p.Key] = p.Value?.DeepClone();
        }
        var element = JsonDocument.Parse(layers.ToJsonString()).RootElement.Clone();
        var res = ConfigStore.Resolve(element);
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("UPDATE cpm.gate_config_bundle SET layers = @layers::jsonb, resolved = @resolved::jsonb, content_hash = @hash WHERE bundle_id = @id",
            new { id = b.BundleId, layers = element.GetRawText(), resolved = res.ResolvedJson, hash = res.ContentHash });
        return (await _store.GetAsync(b.BundleId, default))!;
    }

    /// <summary>Fic1's newest short result (5.0 s; an older one 2.0 s) and models: the newest VALIDATED dead time is 4.0 s (an older one 9.0, a newer CANDIDATE 7.0).</summary>
    private async Task SeedFactsAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        foreach (var (kind, agoMin, dt) in new[] { ("15m", 0, 5.0), ("60m", 120, 2.0) })
            await conn.ExecuteAsync("""
                INSERT INTO analytics.cplm_short_feature_results (loop_id, window_kind, window_start, window_end, sample_count, payload, source, bundle_hash)
                VALUES (@loop, @kind, now() - make_interval(mins => @ago + 15), now() - make_interval(mins => @ago), 180, jsonb_build_object('sample_period_sec', @dt), 'flink', 'b:test')
                """, new { loop = Fic1, kind, ago = agoMin, dt });
        foreach (var (state, agoMin, theta) in new[] { ("VALIDATED", 180, 9.0), ("VALIDATED", 60, 4.0), ("CANDIDATE", 0, 7.0) })
            await conn.ExecuteAsync("""
                INSERT INTO analytics.system_model (model_id, loop_id, path_id, family, parameters, model_state, created_at)
                VALUES (@id, @loop, 'OP_TO_PV', 'FOPDT', jsonb_build_object('dead_time', jsonb_build_object('value', @theta)), @state, now() - make_interval(mins => @ago))
                """, new { id = Guid.NewGuid(), loop = Fic1, state, ago = agoMin, theta });
    }

    private CpmConfigurationController Api()
    {
        var api = new CpmConfigurationController(_store, _deployments, _registry, null!, new NullAudit(), null!);
        api.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("preferred_username", "erin") }, "test")) } };
        return api;
    }

    private static JsonElement Body(IActionResult r)
    {
        r.Should().BeOfType<OkObjectResult>();
        return JsonSerializer.SerializeToElement(((OkObjectResult)r).Value, Web);
    }

    private async Task<(JsonElement Body, Dictionary<string, JsonElement> Entries)> EffectiveAsync(string loopId)
    {
        var body = Body(await Api().Effective(loopId, null, null, default, _values));
        return (body, body.GetProperty("entries").EnumerateArray().ToDictionary(e => e.GetProperty("property").GetString()!));
    }

    private static (double? Value, string Basis) VB(JsonElement e) =>
        (e.GetProperty("value").ValueKind == JsonValueKind.Number ? e.GetProperty("value").GetDouble() : null, e.GetProperty("basis").GetString()!);

    private static string? S(JsonElement e, string name) => e.GetProperty(name).ValueKind == JsonValueKind.String ? e.GetProperty(name).GetString() : null;

    // ── tests ───────────────────────────────────────────────────────────────
    [Fact]
    public async Task Under_a_profile_bundle_a_loop_with_a_pv_range_shows_the_values_in_use_scaled_and_worked_out()
    {
        await ActivateAsync(await DraftAsync("PROFILE", Flow, null, null, ("G4.activity_warn_ratio", "2.5")));
        await SeedFactsAsync();
        var (body, e) = await EffectiveAsync(Fic1);
        body.GetProperty("bundle").GetProperty("scopeKind").GetString().Should().Be("PROFILE");
        foreach (var kept in new[] { "properties", "sources", "effectiveHash", "layers", "workers" }) body.TryGetProperty(kept, out _).Should().BeTrue(kept + " is kept");
        e.Should().HaveCount(165);
        e.Values.Should().OnlyContain(x => !x.GetProperty("basis").GetString()!.Contains('{'));

        VB(e["G2.stability_band_pv_eu"]).Should().Be((2.0, "2.0 kg/h - 1 % of the PV range"));
        (S(e["G2.stability_band_pv_eu"], "unit"), S(e["G2.stability_band_pv_eu"], "level"), S(e["G2.stability_band_pv_eu"], "kind")).Should().Be(("kg/h", null, "EDITABLE"));
        VB(e["G12.step_min_input_eu"]).Should().Be((2.0, "2.0 kg/h - 1.0 per 100 of the PV range"));
        (e["G12.step_min_input_eu"].GetProperty("configured").GetDouble(), S(e["G12.step_min_input_eu"], "level")).Should().Be((1.0, "FACTORY"));
        VB(e["G12.settling_abs_band_pv_eu"]).Value.Should().Be(0.2);
        VB(e["G12.gain_abs_max"]).Value.Should().Be(2000);
        VB(e["G10.limit_dwell_warn_s"]).Should().Be((150.0, "Not decided - 150 s used (30 samples at 5.0 s)"));
        (S(e["G10.limit_dwell_warn_s"], "kind"), e["G10.limit_dwell_warn_s"].GetProperty("editable").GetBoolean()).Should().Be(("DECISION", true));
        VB(e["G12.lambda_s"]).Should().Be((4.0, "Not decided - advice uses the dead time (4.0 s)"), "the newest VALIDATED model, not the CANDIDATE");
        VB(e["G4.activity_warn_ratio"]).Should().Be((2.5, "2.5 - set for this loop type"));
        (e["G4.activity_warn_ratio"].GetProperty("configured").GetDouble(), S(e["G4.activity_warn_ratio"], "level"), S(e["G4.activity_warn_ratio"], "setIn"))
            .Should().Be((2.5, "PROFILE", "GATE_CONFIGURATION"));

        // a value a LOOP layer sets is in the loop's units: never scaled
        var loopDraft = await DraftAsync("LOOP", Fic1, (await _store.ActiveForLoopAsync(Site, Fic1, Flow, default))!.BundleId, Flow, ("G12.step_min_input_eu", "3.0"));
        loopDraft.State.Should().Be("VALIDATED", loopDraft.Validation?.GetRawText());
        await ActivateAsync(loopDraft);
        (_, e) = await EffectiveAsync(Fic1);
        VB(e["G12.step_min_input_eu"]).Should().Be((3.0, "3.0 kg/h - set for this loop"));
        VB(e["G2.step_min_pv_eu"]).Value.Should().Be(3.0, "max(3.0 set for the loop, 1 % of the 200 kg/h span)");
        VB(e["G12.settling_abs_band_pv_eu"]).Value.Should().Be(0.2, "not set by a layer: still scaled");
        VB(e["G4.activity_warn_ratio"]).Value.Should().Be(2.5, "the loop's bundle carries the plant-wide layers");
    }

    [Fact]
    public async Task A_loop_without_a_pv_range_and_a_loop_without_an_active_bundle()
    {
        await ActivateAsync(await DraftAsync("PROFILE", Flow, null, null));
        var (_, e) = await EffectiveAsync(Fic2);
        VB(e["G2.stability_band_pv_eu"]).Should().Be((1.0, "1.0 - range assumed 0-100; declare the PV range in Loop Registry"));
        S(e["G2.stability_band_pv_eu"], "unit").Should().BeNull();
        VB(e["G12.step_min_input_eu"]).Should().Be((1.0, "1.0 - range assumed 0-100; declare the PV range in Loop Registry"));
        VB(e["G10.limit_dwell_warn_s"]).Should().Be((null, "Not decided - 30 samples at the loop's sample interval are used"));
        VB(e["G12.lambda_s"]).Should().Be((null, "Not decided - no tuning advice until a validated model gives the dead time"));

        var (body, t) = await EffectiveAsync(Tic1);
        body.GetProperty("state").GetString().Should().Be("NO_ACTIVE_BUNDLE");
        t.Should().HaveCount(165);
        VB(t["G12.step_min_input_eu"]).Should().Be((5.0, "5.0 °C - 1.0 per 100 of the PV range"));
        VB(t["G2.stability_band_pv_eu"]).Should().Be((5.0, "5.0 °C - 1 % of the PV range"));
        (S(t["G5.period_min_s"], "level"), VB(t["G6.period_min_s"]).Value).Should().Be(("PROFILE", 300.0));
    }

    [Fact]
    public async Task Registry_retention_automatic_and_not_applied_properties_say_where_they_come_from()
    {
        var (_, e) = await EffectiveAsync(Fic1);
        var objective = e["G3.objective_type"];
        (S(objective, "kind"), S(objective, "setIn"), S(objective, "registryField"), S(objective, "value"), S(objective, "basis"))
            .Should().Be(("REGISTRY", "LOOP_REGISTRY", "model.objectiveType", "AVERAGING", "Averaging - set in Loop Registry"));
        S(e["G0.acquisition_mode"], "basis").Should().Be("On change, every 2 s - set in Loop Registry");
        (S(e["G13.peer_binding_ids"], "basis"), S(e["G13.peer_binding_ids"], "registryField")).Should().Be(($"{Fic2} - from the Plant model", "links"));
        e["G13.peer_binding_ids"].GetProperty("value").EnumerateArray().Select(v => v.GetString()).Should().Equal(Fic2);
        S(e["G5.signal_role"], "basis").Should().Be("Controller output - the loop is self-regulating (Loop Registry)");

        await using var conn = await _db.OpenConnectionAsync();
        var rows = (await conn.QueryAsync<(string C, int? D)>("SELECT record_class, days FROM analytics.retention_policy")).ToDictionary(r => r.C, r => r.D);
        var archive = rows.TryGetValue("EVIDENCE_ARCHIVE", out var a) ? a : EvidenceArchiveRetention.DefaultDays;
        var g5 = e["G5.evidence_retention_days"];
        (S(g5, "kind"), S(g5, "setIn"), g5.GetProperty("editable").GetBoolean()).Should().Be(("RETENTION", "EVIDENCE_RETENTION", false));
        g5.GetProperty("value").GetProperty("liveHours").GetInt32().Should().Be(6);
        g5.GetProperty("value").GetProperty("archiveDays").ValueKind.Should().Be(archive is null ? JsonValueKind.Null : JsonValueKind.Number);
        S(g5, "basis").Should().StartWith("Live 6 hours · daily archive ").And.EndWith(" after they close - evidence retention");

        (VB(e["G2.event_dwell_s"]), S(e["G2.event_dwell_s"], "kind")).Should().Be(((30.0, "A new set point must hold 30 s - fixed rule"), "AUTOMATIC_FIXED"));
        (S(e["G6.period_min_s"], "kind"), VB(e["G6.period_min_s"]).Value).Should().Be(("AUTOMATIC_DERIVED", 10.0));
        (VB(e["G15.notification_repeat_s"]), S(e["G15.notification_repeat_s"], "setIn")).Should().Be(((null, "No notifications are sent"), "NOT_APPLIED"));
        e.Values.Where(x => !x.GetProperty("editable").GetBoolean())
            .Should().OnlyContain(x => x.GetProperty("configured").ValueKind == JsonValueKind.Null && x.GetProperty("level").ValueKind == JsonValueKind.Null);
    }

    [Fact]
    public async Task An_edit_that_changes_nothing_is_refused_saying_where_and_a_value_stored_before_can_be_removed()
    {
        var d = await _store.CreateDraftAsync(Site, "LOOP", Fic1, null, Flow, "erin", null, default);
        async Task<string> Refused(string property, string json)
        {
            var set = () => _store.PatchAsync(d.BundleId, d.Etag, new[] { new ConfigStore.PatchOp("set", property, JsonDocument.Parse(json).RootElement) }, "erin", default);
            return (await set.Should().ThrowAsync<ArgumentException>()).Which.Message;
        }
        (await Refused("G3.objective_type", "\"TIGHT\"")).Should().Contain("cannot be changed in Gate Configuration").And.Contain("Loop Registry");
        (await Refused("G0.evidence_retention_days", "30")).Should().Contain("evidence retention policy");
        (await Refused("G6.period_min_s", "20")).Should().Contain("G5 shortest period");
        (await Refused("G7.role", "\"PRIMARY\"")).Should().Contain("does not perform this check");
        (await _store.GetAsync(d.BundleId, default))!.Etag.Should().Be(d.Etag, "a refused edit changes nothing");

        // a draft holding such values (stored before) fails Validate, naming each and where it is changed
        d = await LegacyAsync(d, ("LOOP", """{"G3.ewma_alpha": 0.3, "G0.evidence_retention_days": 30}"""));
        var rejected = await _store.ValidateAsync(d.BundleId, default);
        rejected.State.Should().Be("REJECTED");
        rejected.Validation!.Value.GetProperty("errors").EnumerateArray().Select(x => x.GetString()).Should()
            .Contain(x => x!.StartsWith("'G3.ewma_alpha' cannot be changed in Gate Configuration") && x.EndsWith("remove it from this draft"))
            .And.Contain(x => x!.StartsWith("'G0.evidence_retention_days'"));
        rejected.Validation!.Value.GetProperty("edited").EnumerateArray().Should().BeEmpty("a value that changes nothing is no edit");

        // "Remove": reset takes the value out of the layer (no marker stays) and never raises the change class
        var removed = await _store.PatchAsync(d.BundleId, rejected.Etag, new[] { new ConfigStore.PatchOp("reset", "G3.ewma_alpha", null), new ConfigStore.PatchOp("reset", "G0.evidence_retention_days", null) }, "erin", default);
        var own = removed.Layers.EnumerateArray().Single(l => l.GetProperty("kind").GetString() == "LOOP").GetProperty("content");
        own.EnumerateObject().Should().BeEmpty();
        removed.ChangeClass.Should().Be("POLICY", "G3.ewma_alpha is a STATE_BOUNDARY property, but removing it changes nothing");
        (await _store.ValidateAsync(d.BundleId, default)).State.Should().Be("VALIDATED");
    }

    private const string LegacyProfileValues = """{"G6.period_min_s": 25.0, "G7.role": "SUPPORTING", "G3.ewma_alpha": 0.3}""";
    private const string LegacyLoopValues = """{"G3.objective_type": "TIGHT", "G12.confidence_level": 0.9, "G5.evidence_retention_days": 30}""";

    [Fact]
    public async Task A_new_version_drops_values_that_change_nothing_keeps_what_the_engine_reads_and_its_class()
    {
        var parent = await DraftAsync("LOOP", Fic1, null, Flow, ("G2r.pv_region_min", "50"), ("G2r.pv_region_max", "150"), ("G4.activity_warn_ratio", "2.25"));
        parent = await ActivateAsync(await LegacyAsync(parent, ("PROFILE", LegacyProfileValues), ("LOOP", LegacyLoopValues)));

        // the old bundle: the engine applies the stored G6 copy after G5, so 25 s is in use for both
        var (_, before) = await EffectiveAsync(Fic1);
        VB(before["G6.period_min_s"]).Value.Should().Be(25);
        VB(before["G5.period_min_s"]).Should().Be((25.0, "25 s in use - set to 10 s, but a stored copy of it still applies until this bundle is next changed"));

        var (_, rows) = await _regions.CreateAsync(new[] { new RegionBulkService.RegionRow(Fic1, 60, 140) }, null, "erin", default);
        rows.Single().State.Should().Be("VALIDATED", string.Join("; ", rows.Single().Problems));
        var copy = (await _store.GetAsync(rows.Single().BundleId!.Value, default))!;
        copy.ParentBundleId.Should().Be(parent.BundleId);
        var sources = PropertySources.Current;
        foreach (var layer in copy.Layers.EnumerateArray())
        {
            var kind = layer.GetProperty("kind").GetString()!;
            var mine = layer.GetProperty("content");
            var theirs = parent.Layers.EnumerateArray().Single(l => l.GetProperty("kind").GetString() == kind).GetProperty("content");
            if (kind == "FACTORY") { mine.GetRawText().Should().Be(theirs.GetRawText()); continue; }
            mine.EnumerateObject().Where(p => !sources.IsEditable(p.Name)).Should().BeEmpty(kind + " keeps no value that changes nothing");
            foreach (var p in theirs.EnumerateObject().Where(p => sources.IsEditable(p.Name) && p.Name is not (ConfigBatchService.MinProperty or ConfigBatchService.MaxProperty)))
                mine.GetProperty(p.Name).GetRawText().Should().Be(p.Value.GetRawText(), $"{kind} keeps {p.Name}");
        }
        var was = LoopEffective.Resolve(parent, Flow);
        var now = LoopEffective.Resolve(copy, Flow);
        foreach (var p in sources.Entries.Values.Where(x => x.Editable && x.Property is not (ConfigBatchService.MinProperty or ConfigBatchService.MaxProperty)))
            now.Properties[p.Property].GetRawText().Should().Be(was.Properties[p.Property].GetRawText(), p.Property + " the engine reads is unchanged");

        var edited = copy.Validation!.Value.GetProperty("edited").EnumerateArray().Select(x => x.GetString()!).ToList();
        edited.Should().BeEquivalentTo(ConfigBatchService.MinProperty, ConfigBatchService.MaxProperty, "G4.activity_warn_ratio");
        copy.ChangeClass.Should().Be(ChangeClassifier.Classify(edited)).And.Be("POLICY");
        ChangeClassifier.Classify(edited.Append("G6.period_min_s")).Should().Be("STATE_BOUNDARY", "the removed G6 copy would have raised it");

        await ActivateAsync(copy);
        var (_, after) = await EffectiveAsync(Fic1);
        VB(after["G5.period_min_s"]).Should().Be((10.0, "10 s - set for this loop type"));
        VB(after["G6.period_min_s"]).Value.Should().Be(10, "the copy follows G5 again");
    }

    [Fact]
    public async Task A_loop_bundle_that_only_lacks_the_dropped_values_is_not_reported_as_needing_a_restack()
    {
        // the plant-wide bundle for level loops still stores the class pack's G6 / G7 / G9 copies and roles (an older version)
        var plant = await DraftAsync("PROFILE", "LEVEL_INTEGRATING", null, null);
        await ActivateAsync(await LegacyAsync(plant, ("PROFILE", """{"G6.period_min_s": 120.0, "G7.role": "PRIMARY", "G8.role": "SUPPORTING", "G10.role": "PRIMARY", "G7.min_accepted_cycles": 3, "G9.min_accepted_cycles": 3}""")));
        var (_, rows) = await _regions.CreateAsync(new[] { new RegionBulkService.RegionRow(Lic1, 1, 2) }, null, "erin", default);
        var own = await ActivateAsync((await _store.GetAsync(rows.Single().BundleId!.Value, default))!);
        own.Layers.EnumerateArray().Single(l => l.GetProperty("kind").GetString() == "PROFILE").GetProperty("content").TryGetProperty("G7.role", out _).Should().BeFalse();
        (await _loopSettings.StaleAsync(Site, default)).Should().NotContain(s => s.LoopId == Lic1, "the loop sits on the plant-wide bundle in force");
    }

    [Fact]
    public async Task The_catalogue_says_per_property_its_kind_and_whether_it_can_be_edited()
    {
        var body = Body(await Api().Catalogue(default));
        var props = body.GetProperty("properties").EnumerateArray().ToDictionary(p => p.GetProperty("property").GetString()!);
        props.Should().HaveCount(165);
        props.Values.Count(p => p.GetProperty("editable").GetBoolean()).Should().Be(63);
        (S(props["G3.objective_type"], "kind"), props["G3.objective_type"].GetProperty("editable").GetBoolean(), S(props["G3.objective_type"], "setIn"), S(props["G3.objective_type"], "registryField"))
            .Should().Be(("REGISTRY", false, "LOOP_REGISTRY", "model.objectiveType"));
        (S(props["G4.activity_warn_ratio"], "kind"), props["G4.activity_warn_ratio"].GetProperty("editable").GetBoolean()).Should().Be(("EDITABLE", true));
        (S(props["G12.lambda_s"], "kind"), props["G12.lambda_s"].GetProperty("editable").GetBoolean()).Should().Be(("DECISION", true));
        S(props["G7.role"], "kind").Should().Be("NOT_APPLIED");
        props["G3.ewma_alpha"].TryGetProperty("notReadByBuild", out _).Should().BeTrue("the existing fields stay");
    }
}
