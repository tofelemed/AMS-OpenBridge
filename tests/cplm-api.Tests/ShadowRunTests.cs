// CHG-222 (owner, 23 Nov): a shadow run ("Try on past data") is always linked to its change, and its windows end where the
// LIVE windows end, so the before / after has something to compare. Against the lab database.
using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
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
public sealed class ShadowRunTests : IAsyncLifetime
{
    private const string Site = "e2e-shadow-site";
    private const string Loop = "E2E_SHADOW_FIC1";
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
        await using var conn = await _db.OpenConnectionAsync();
        await Cleanup(conn);
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await Cleanup(conn);
        await _db.DisposeAsync();
    }

    private static Task<int> Cleanup(NpgsqlConnection conn) => conn.ExecuteAsync("""
        DELETE FROM analytics.cplm_gate_results WHERE loop_id = @loop;
        DELETE FROM cpm.config_approval WHERE bundle_id IN (SELECT bundle_id FROM cpm.gate_config_bundle WHERE site = @site);
        DELETE FROM cpm.gate_config_bundle WHERE site = @site
        """, new { site = Site, loop = Loop });

    private async Task<BundleView> ValidatedAsync()
    {
        var d = await _store.CreateDraftAsync(Site, "LOOP", Loop, null, "FLOW_FAST_SELF_REG", "alice", "shadow test", default);
        return await _store.ValidateAsync(d.BundleId, default);
    }

    private (CpmConfigurationController Api, ShadowRecomputeStub Stub) Controller()
    {
        var (registry, regStub) = RegistryStub.Create();
        regStub.Loops[Loop] = new CpmLoopDto(Loop, null, Loop, Site, null, null, "flow", "LOW", true, true,
            new Dictionary<string, string>(), Array.Empty<string>(), Array.Empty<CpmLoopLinkDto>(), false, null);
        var (recompute, stub) = ShadowRecomputeStub.Create();
        var api = new CpmConfigurationController(_store, null!, registry, recompute, new NullAudit(), new ShadowComparison(_db, _store))
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("preferred_username", "alice") }, "test")) } },
        };
        return (api, stub);
    }

    [Fact]
    public async Task The_shadow_run_is_planned_on_the_newest_live_24h_window()
    {
        var b = await ValidatedAsync();
        await using var conn = await _db.OpenConnectionAsync();
        // two LIVE 24 h windows on the 15-minute grid: the newer one ends today 06:00 UTC (or yesterday's, before 06:00)
        var newer = DateTime.UtcNow.Date.AddHours(6);
        if (newer > DateTime.UtcNow) newer = newer.AddDays(-1);
        await conn.ExecuteAsync("""
            INSERT INTO analytics.cplm_gate_results (loop_id, window_kind, window_start, window_end, sample_count, diagnosis, payload, source, purpose, analysis_run_id, bundle_hash)
            VALUES (@loop, '24h', @newer::timestamptz - interval '48 hour', @newer::timestamptz - interval '24 hour', 17280, 'NO_FAULT_IDENTIFIED', '{}'::jsonb, 'flink', 'LIVE', NULL, 'b:older'),
                   (@loop, '24h', @newer::timestamptz - interval '24 hour', @newer::timestamptz, 17280, 'NO_FAULT_IDENTIFIED', '{}'::jsonb, 'flink', 'LIVE', NULL, 'b:newer')
            """, new { loop = Loop, newer = DateTime.SpecifyKind(newer, DateTimeKind.Utc) });
        var (api, stub) = Controller();

        var result = await api.Shadow(b.BundleId, new CpmConfigurationController.ShadowRequest(Loop, 2), default);

        result.Should().BeOfType<AcceptedResult>();
        var end = new DateTimeOffset(newer, TimeSpan.Zero).ToUnixTimeMilliseconds();
        stub.WindowOffsetMs.Should().Be(6 * 3_600_000L, "the shadow's 24 h windows end on 06:00 like the LIVE ones");
        stub.Support!.ToMs.Should().Be(end);
        stub.Support.FromMs.Should().Be(end - 86_400_000L, "2 hours round up to one whole day");
    }

    [Fact]
    public async Task A_client_that_gives_up_during_the_submit_still_gets_the_run_linked()
    {
        var b = await ValidatedAsync();
        var (api, stub) = Controller();
        using var cts = new CancellationTokenSource();
        stub.OnStart = cts.Cancel;                                  // the browser gives up while Flink accepts the job (~29 s)

        var result = await api.Shadow(b.BundleId, new CpmConfigurationController.ShadowRequest(Loop, 24), cts.Token);

        result.Should().BeOfType<AcceptedResult>();
        var stored = (await _store.GetAsync(b.BundleId, default))!;
        stored.State.Should().Be("SHADOW_EVALUATED");
        stored.Shadow!.Value.GetProperty("analysisRunId").GetString().Should().Be(stub.RunId.ToString());
    }
}

/// <summary>ICplmRecomputeService for the shadow action: records what StartShadowAsync was asked, returns one handle.</summary>
public class ShadowRecomputeStub : DispatchProxy
{
    public Guid RunId { get; } = Guid.NewGuid();
    public Action? OnStart { get; set; }
    public long? WindowOffsetMs { get; private set; }
    public ReplaySupport? Support { get; private set; }

    protected override object? Invoke(MethodInfo? m, object?[]? args)
    {
        if (m?.Name == nameof(ICplmRecomputeService.StartShadowAsync))
        {
            WindowOffsetMs = (long)args![3]!;
            Support = (ReplaySupport)args[5]!;
            var ct = (CancellationToken)args[6]!;
            OnStart?.Invoke();
            ct.ThrowIfCancellationRequested();                      // a real submit honours its token
            return Task.FromResult(new CplmRecomputeHandle("r1", "job1", (string)args[0]!, RunId, "SHADOW"));
        }
        if (m?.Name == nameof(ICplmRecomputeService.GetWindowOffsetMsAsync)) return Task.FromResult(0L);
        throw new NotSupportedException(m?.Name);
    }

    public static (ICplmRecomputeService Service, ShadowRecomputeStub Stub) Create()
    {
        var p = DispatchProxy.Create<ICplmRecomputeService, ShadowRecomputeStub>();
        return (p, (ShadowRecomputeStub)(object)p);
    }
}
