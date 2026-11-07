// CHG-146 - retire and restore a loop. Retire is never a delete: it sets is_active and monitoring.enabled
// to false (ingestion reads the first, fleet SQL the second) and touches nothing else. No database: the SQL is
// asserted as text, and the controller runs against a registry stub.
using System.Reflection;
using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Data;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.Registry;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class LoopRetireTests
{
    public class RegistryProxy : DispatchProxy
    {
        public Dictionary<string, CpmLoopDto> Loops { get; } = new(StringComparer.Ordinal);
        public Dictionary<string, bool> Retired { get; } = new(StringComparer.Ordinal);
        public List<(string Loop, bool Retire)> Calls { get; } = new();

        protected override object? Invoke(MethodInfo? m, object?[]? args)
        {
            switch (m?.Name)
            {
                case nameof(ICpmLoopRegistryService.GetAsync):
                    return Task.FromResult(Loops.TryGetValue((string)args![0]!, out var l) ? l : null);
                case nameof(ICpmLoopRegistryService.SetRetiredAsync):
                {
                    var id = (string)args![0]!; var retire = (bool)args[1]!;
                    Calls.Add((id, retire));
                    if (!Retired.TryGetValue(id, out var was)) return Task.FromResult(LoopRetireOutcome.NotFound);
                    Retired[id] = retire;
                    return Task.FromResult(was == retire ? LoopRetireOutcome.Unchanged : LoopRetireOutcome.Changed);
                }
            }
            throw new NotSupportedException(m?.Name);
        }
    }

    private sealed class Audit : ICplmAuditEmitter
    {
        public List<(string Type, string Id, object? After)> Events { get; } = new();
        public void Emit(string eventType, string userId, string entityType, string entityId, object? after = null) =>
            Events.Add((eventType, entityId, after));
    }

    private static (CpmLoopsController C, RegistryProxy R, Audit A) Make()
    {
        var p = DispatchProxy.Create<ICpmLoopRegistryService, RegistryProxy>();
        var r = (RegistryProxy)(object)p;
        var a = new Audit();
        var c = new CpmLoopsController(p, a, NullLogger<CpmLoopsController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
        return (c, r, a);
    }

    [Fact]
    public void Retire_sets_is_active_false_and_monitoring_disabled()
    {
        LoopRetireSql.Retire.Should().Contain("is_active = FALSE");
        LoopRetireSql.Retire.Should().Contain("jsonb_set(monitoring, '{enabled}', 'false'");
        LoopRetireSql.Retire.Should().Contain("WHERE loop_id = @loopId");
    }

    [Fact]
    public void Retire_keeps_tags_links_bindings_and_history()
    {
        foreach (var sql in new[] { LoopRetireSql.Retire, LoopRetireSql.Restore })
        {
            sql.ToUpperInvariant().Should().NotContain("DELETE").And.NotContain("INSERT").And.NotContain("TRUNCATE");
            sql.Should().NotContain("loop_tag_map").And.NotContain("loop_link").And.NotContain("loop_signal_asset");
            sql.Should().NotContain("analytics.");
            sql.Split("UPDATE cpm.loop_registry").Length.Should().Be(2, "one UPDATE of the registry row and nothing else");
        }
    }

    [Fact]
    public void Restore_sets_both_back()
    {
        LoopRetireSql.Restore.Should().Contain("is_active = TRUE");
        LoopRetireSql.Restore.Should().Contain("jsonb_set(monitoring, '{enabled}', 'true'");
        LoopRetireSql.Restore.Should().Contain("is_active = FALSE", "only a retired loop is touched");
    }

    [Fact]
    public async Task Retire_needs_a_reason()
    {
        var (c, r, a) = Make();
        r.Retired["L1"] = false;

        foreach (var reason in new string?[] { null, "", "   " })
            (await c.Retire("L1", new CpmLoopRetireRequest(reason), default)).Should().BeOfType<BadRequestObjectResult>();
        (await c.Retire("L1", null!, default)).Should().BeOfType<BadRequestObjectResult>();

        r.Calls.Should().BeEmpty();
        a.Events.Should().BeEmpty();
    }

    [Fact]
    public async Task Retire_answers_and_writes_the_reason_into_the_audit_event()
    {
        var (c, r, a) = Make();
        r.Retired["L1"] = false;

        var ok = (OkObjectResult)await c.Retire("L1", new CpmLoopRetireRequest("  decommissioned  "), default);

        ok.Value!.ToString().Should().Contain("retired = True").And.Contain("L1");
        r.Retired["L1"].Should().BeTrue();
        a.Events.Should().ContainSingle().Which.Type.Should().Be("CPM_LOOP_RETIRED");
        a.Events[0].After!.ToString().Should().Contain("decommissioned");
    }

    [Fact]
    public async Task Retire_twice_is_safe_and_says_so_without_a_second_audit_event()
    {
        var (c, r, a) = Make();
        r.Retired["L1"] = true;

        var ok = (OkObjectResult)await c.Retire("L1", new CpmLoopRetireRequest("again"), default);

        ok.Value!.ToString().Should().Contain("changed = False").And.Contain("already");
        a.Events.Should().BeEmpty();
    }

    [Fact]
    public async Task Restore_an_active_loop_is_safe_and_says_so()
    {
        var (c, r, a) = Make();
        r.Retired["L1"] = false;

        var ok = (OkObjectResult)await c.Restore("L1", null, default);

        ok.Value!.ToString().Should().Contain("retired = False").And.Contain("changed = False").And.Contain("not retired");
        a.Events.Should().BeEmpty();
    }

    [Fact]
    public async Task Restore_a_retired_loop_audits_with_the_reason()
    {
        var (c, r, a) = Make();
        r.Retired["L1"] = true;

        var ok = (OkObjectResult)await c.Restore("L1", new CpmLoopRetireRequest("back in service"), default);

        ok.Value!.ToString().Should().Contain("retired = False").And.Contain("changed = True");
        a.Events.Should().ContainSingle().Which.Type.Should().Be("CPM_LOOP_RESTORED");
        a.Events[0].After!.ToString().Should().Contain("back in service");
    }

    [Fact]
    public async Task Unknown_loop_is_404_for_both()
    {
        var (c, _, a) = Make();
        (await c.Retire("ghost", new CpmLoopRetireRequest("x"), default)).Should().BeOfType<NotFoundObjectResult>();
        (await c.Restore("ghost", null, default)).Should().BeOfType<NotFoundObjectResult>();
        a.Events.Should().BeEmpty();
    }

    [Fact]
    public void Both_actions_need_cpm_manage()
    {
        foreach (var name in new[] { nameof(CpmLoopsController.Retire), nameof(CpmLoopsController.Restore) })
        {
            var attr = typeof(CpmLoopsController).GetMethod(name)!
                .GetCustomAttributes<Microsoft.AspNetCore.Authorization.AuthorizeAttribute>().Single();
            attr.Policy.Should().Be("cpm.manage");
        }
    }

    [Fact]
    public async Task Loop_read_still_answers_for_a_retired_loop()
    {
        var (c, r, _) = Make();
        r.Retired["L1"] = true;
        r.Loops["L1"] = new CpmLoopDto("L1", null, "L1", "hdpe", null, null, "flow", "LOW", false, false,
            new Dictionary<string, string>(), Array.Empty<string>(), Array.Empty<CpmLoopLinkDto>(), false, null);

        (await c.Get("L1", default)).Should().BeOfType<OkObjectResult>();
        CpmLoopRegistryReads.RegistrySelect.Should().NotContain("is_active = TRUE", "the single-loop read does not hide retired loops");
    }

    [Fact]
    public void Retired_loop_leaves_fleet_kpis_and_rankings()
    {
        const string enabled = "COALESCE((r.monitoring->>'enabled')::boolean, FALSE)";
        FleetKpiSql.Rows.Should().Contain(enabled);
        FleetLatestSql.Rankings("r.loop_id").Should().Contain(enabled);
        FleetLatestSql.SummaryByDiagnosis.Should().Contain(enabled);
        FleetLatestSql.Heatmap.Should().Contain(enabled);
        FleetPrioritySql.Queue().Should().Contain(enabled);
    }
}
