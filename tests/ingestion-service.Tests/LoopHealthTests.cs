using Traverse.IngestionService.Models;
using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

/// <summary>
/// The audit that would have answered, in one GET, the question that took a two-hour
/// MQTT inventory on the plant (2026-09-11): 143 of 175 registered loops produced
/// nothing and the joiner never said why.
/// </summary>
public class LoopHealthTests
{
    private static readonly LoopIngestSettings Cfg = new LoopIngestConfig().Resolve(); // grid 5 s
    private const long T0 = 1_756_600_000_000;
    private const int IdleAfter = 30;

    private static RegistryLoop L(string id) =>
        new(id, null, "hdpe", "section_100", "u1001_polymerization_reactor_1", "FIC", true);

    private static void Feed(LoopJoiner j, string loopId, string role, double value, long ts)
    {
        var member = role is "pv" or "sp" or "op" or "vp";
        j.Accept(L(loopId), "FCS0101",
            new MappedParameter(role, member, value, role == "mode" ? "AUT" : null),
            new OtLoopPayload(value, value.ToString(), "", "GOOD", ts, null, 0,
                null, null, null, null, null, null, null),
            Cfg, ts);
    }

    private static LoopHealthRow Row(LoopJoiner j, string loopId, long nowMs) =>
        Assert.Single(j.HealthSnapshot(nowMs, IdleAfter).Where(r => r.LoopId == loopId));

    [Fact]
    public void A_loop_publishing_only_PV_is_held_and_names_the_missing_signals()
    {
        // The plant's actual shape: 61 loops published PV with no SP and no OP.
        var j = new LoopJoiner();
        Feed(j, "FIC10302", "pv", 42.1, T0);
        j.Tick(T0 + 5_000, Cfg);

        var row = Row(j, "FIC10302", T0 + 5_000);
        Assert.Equal(LoopHealthState.Held, row.State);
        Assert.Equal(new[] { "sp", "op" }, row.Missing);
        Assert.Equal(new[] { "pv" }, row.Seen);
        Assert.Null(row.LastEmittedTsMs);
    }

    [Fact]
    public void Missing_SP_alone_still_holds_the_loop()
    {
        // 49 loops on the plant: PV and OP present, SP absent. Without a setpoint
        // there is no control error, so the loop is unusable, not merely degraded.
        var j = new LoopJoiner();
        Feed(j, "FIC10401", "pv", 42.1, T0);
        Feed(j, "FIC10401", "op", 37.6, T0);
        j.Tick(T0 + 5_000, Cfg);

        var row = Row(j, "FIC10401", T0 + 5_000);
        Assert.Equal(LoopHealthState.Held, row.State);
        Assert.Equal(new[] { "sp" }, row.Missing);
    }

    [Fact]
    public void A_complete_loop_flows_then_goes_idle_when_the_source_stops()
    {
        var j = new LoopJoiner();
        Feed(j, "FIC10405", "pv", 1, T0);
        Feed(j, "FIC10405", "sp", 2, T0);
        Feed(j, "FIC10405", "op", 3, T0);
        Assert.Single(j.Tick(T0 + 5_000, Cfg));

        Assert.Equal(LoopHealthState.Flowing, Row(j, "FIC10405", T0 + 5_000).State);
        Assert.Empty(Row(j, "FIC10405", T0 + 5_000).Missing);

        // Nothing advances for longer than the idle window.
        var later = T0 + 5_000 + (IdleAfter + 5) * 1000L;
        j.Tick(later, Cfg);
        var idle = Row(j, "FIC10405", later);
        Assert.Equal(LoopHealthState.Idle, idle.State);
        Assert.True(idle.SkippedTicks > 0, "quiet ticks should be counted, not hidden");
    }

    [Fact]
    public void Held_outranks_idle_because_it_needs_a_different_fix()
    {
        // An incomplete loop has also never emitted, so it satisfies "idle" too.
        // It must report `held`: idle is a source that went quiet, held is a signal
        // that was never wired -- one waits, the other needs an OT change.
        var j = new LoopJoiner();
        Feed(j, "FIC10302", "pv", 42.1, T0);
        var later = T0 + (IdleAfter + 60) * 1000L;
        j.Tick(later, Cfg);
        Assert.Equal(LoopHealthState.Held, Row(j, "FIC10302", later).State);
    }

    [Fact]
    public void Mode_is_tracked_but_never_gates_emission()
    {
        // The plant's 8 MODE-less loops DO flow; they are excluded later at G1,
        // which is a visible failure. Holding them here would hide that.
        var j = new LoopJoiner();
        Feed(j, "FIC10303B", "pv", 1, T0);
        Feed(j, "FIC10303B", "sp", 2, T0);
        Feed(j, "FIC10303B", "op", 3, T0);
        Assert.Single(j.Tick(T0 + 5_000, Cfg));

        var row = Row(j, "FIC10303B", T0 + 5_000);
        Assert.Equal(LoopHealthState.Flowing, row.State);
        Assert.False(row.ModeSeen);
        Assert.Empty(row.Missing);
    }

    [Fact]
    public void Summary_counts_the_fleet_the_way_the_plant_reported_it()
    {
        var j = new LoopJoiner();
        // one complete, one PV-only, one missing SP
        Feed(j, "GOOD1", "pv", 1, T0); Feed(j, "GOOD1", "sp", 2, T0); Feed(j, "GOOD1", "op", 3, T0);
        Feed(j, "PVONLY", "pv", 1, T0);
        Feed(j, "NOSP", "pv", 1, T0); Feed(j, "NOSP", "op", 3, T0);
        j.Tick(T0 + 5_000, Cfg);

        var rows = j.HealthSnapshot(T0 + 5_000, IdleAfter).ToList();
        // plus a registered loop nothing ever arrived for
        rows.Add(new LoopHealthRow("NEVER", LoopHealthState.Silent,
            LoopHealthRow.RequiredRoles, Array.Empty<string>(), false, null, null, null, 0, null, null));

        var s = LoopHealthSummary.From(rows);
        Assert.Equal(4, s.Total);
        Assert.Equal(1, s.Flowing);
        Assert.Equal(2, s.Held);
        Assert.Equal(1, s.Silent);
        Assert.Equal(3, s.MissingByRole["sp"]);   // PVONLY + NOSP + NEVER
        Assert.Equal(2, s.MissingByRole["op"]);   // PVONLY + NEVER
        Assert.Equal(1, s.MissingByRole["pv"]);   // NEVER only
        // Only GOOD1: a held loop's missing MODE is not the actionable fact (its
        // missing SP is), and a silent loop has no data at all.
        Assert.Equal(1, s.NoMode);
    }
}
