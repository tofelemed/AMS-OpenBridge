using Traverse.IngestionService.Models;
using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

/// <summary>
/// Restart durability. The gateway publishes only on change, so a value that has not
/// moved is never republished — and if the broker's retained copy is gone (it was, on
/// the plant, before 2026-09-06) nothing can supply it. Holding last-known values in
/// memory alone meant every restart re-opened that hole.
/// </summary>
public class LoopStateSeedTests
{
    private static readonly LoopIngestSettings Cfg = new LoopIngestConfig().Resolve(); // grid 5 s
    private const long T0 = 1_756_600_000_000;

    private static RegistryLoop L(string id = "FIC10302") =>
        new(id, null, "hdpe", "section_100", "u1001_polymerization_reactor_1", "FIC", true);

    private static Dictionary<string, (double, long, bool)> M(params (string Role, double V, long Ts)[] items) =>
        items.ToDictionary(i => i.Role, i => (i.V, i.Ts, true));

    private static readonly Dictionary<string, (double, long, bool)> NoExtras = new();

    private static void Feed(LoopJoiner j, string role, double value, long ts)
    {
        var member = role is "pv" or "sp" or "op" or "vp";
        j.Accept(L(), "FCS0101",
            new MappedParameter(role, member, value, role == "mode" ? "AUT" : null),
            new OtLoopPayload(value, null, "", "GOOD", ts, null, 0, null, null, null, null, null, null, null),
            Cfg, ts);
    }

    [Fact]
    public void A_restored_setpoint_completes_a_loop_that_only_publishes_PV()
    {
        // The plant case exactly: SP last moved days ago and is not republished. Before
        // this, a restart meant waiting for the next SP change -- possibly weeks.
        var j = new LoopJoiner();
        j.Seed(L(), "FCS0101", M(("sp", 42.0, T0 - 86_400_000), ("op", 37.6, T0 - 86_400_000)),
               NoExtras, "AUT", T0 - 86_400_000, lastEmittedTsMs: 0, Cfg, T0);

        Feed(j, "pv", 42.1, T0 + 1_000);          // only PV arrives live
        var t = Assert.Single(j.Tick(T0 + 5_000, Cfg));
        Assert.Equal(42.1, t.Pv);
        Assert.Equal(42.0, t.Sp);                  // restored
        Assert.Equal(37.6, t.Op);                  // restored
        Assert.Equal("AUT", t.Mode);               // restored
        Assert.Equal(T0 + 1_000, t.EventTsMs);     // newest member's ts -- the live PV
    }

    [Fact]
    public void Live_data_is_never_displaced_by_a_restored_value()
    {
        var j = new LoopJoiner();
        Feed(j, "sp", 99.0, T0 + 5_000);                       // fresh, from the wire
        j.Seed(L(), "FCS0101", M(("sp", 42.0, T0)), NoExtras, null, 0, 0, Cfg, T0); // older

        Feed(j, "pv", 1, T0 + 5_000); Feed(j, "op", 2, T0 + 5_000);
        var t = Assert.Single(j.Tick(T0 + 10_000, Cfg));
        Assert.Equal(99.0, t.Sp);
    }

    [Fact]
    public void A_newer_restored_value_wins_over_an_older_one()
    {
        var j = new LoopJoiner();
        j.Seed(L(), "FCS0101", M(("sp", 1.0, T0)), NoExtras, null, 0, 0, Cfg, T0);
        j.Seed(L(), "FCS0101", M(("sp", 2.0, T0 + 60_000)), NoExtras, null, 0, 0, Cfg, T0);

        Feed(j, "pv", 1, T0 + 70_000); Feed(j, "op", 2, T0 + 70_000);
        Assert.Equal(2.0, Assert.Single(j.Tick(T0 + 75_000, Cfg)).Sp);
    }

    [Fact]
    public void The_emission_watermark_survives_so_no_timestamp_is_published_twice()
    {
        // IoTDB keys rows by device+timestamp: re-emitting a published event_ts_ms would
        // OVERWRITE the original row rather than add one. The watermark must come back.
        var j = new LoopJoiner();
        j.Seed(L(), "FCS0101", M(("pv", 1, T0), ("sp", 2, T0), ("op", 3, T0)),
               NoExtras, "AUT", T0, lastEmittedTsMs: T0, Cfg, T0);

        Assert.Empty(j.Tick(T0 + 5_000, Cfg));     // nothing newer than what was published
        Feed(j, "pv", 1.5, T0 + 6_000);
        Assert.Equal(T0 + 6_000, Assert.Single(j.Tick(T0 + 10_000, Cfg)).EventTsMs);
    }

    [Fact]
    public void The_watermark_never_moves_backwards()
    {
        // A stale store must not license re-publishing a timestamp already emitted.
        var j = new LoopJoiner();
        j.Seed(L(), "FCS0101", M(("pv", 1, T0), ("sp", 2, T0), ("op", 3, T0)),
               NoExtras, null, 0, lastEmittedTsMs: T0 + 60_000, Cfg, T0);
        j.Seed(L(), "FCS0101", M(("pv", 1, T0)), NoExtras, null, 0, lastEmittedTsMs: T0, Cfg, T0);

        Feed(j, "pv", 9, T0 + 30_000);             // newer than T0, older than the watermark
        Assert.Empty(j.Tick(T0 + 65_000, Cfg));
    }

    [Fact]
    public void Restored_state_is_visible_in_the_audit()
    {
        var j = new LoopJoiner();
        j.Seed(L(), "FCS0101", M(("sp", 42.0, T0)), NoExtras, null, 0, 0, Cfg, T0);
        var row = Assert.Single(j.HealthSnapshot(T0, 30));
        Assert.True(row.Restored, "a loop holding restored values should say so");
        Assert.Equal(new[] { "pv", "op" }, row.Missing);   // sp restored, the rest still absent
    }

    [Fact]
    public void A_first_value_for_a_role_flags_an_immediate_save()
    {
        // The rare setpoint is the one hardest to re-acquire, so it must not wait on the
        // 60 s cycle. A first value for ANY role raises the flag; steady updates do not.
        var j = new LoopJoiner();
        Assert.False(j.ConsumeNewMemberFlag(), "nothing has arrived yet");

        Feed(j, "pv", 1, T0);
        Assert.True(j.ConsumeNewMemberFlag(), "first PV should trigger a save");
        Assert.False(j.ConsumeNewMemberFlag(), "reading the flag clears it");

        Feed(j, "pv", 2, T0 + 1_000);
        Assert.False(j.ConsumeNewMemberFlag(), "an update to a known role is not a new member");

        Feed(j, "sp", 42, T0 + 2_000);
        Assert.True(j.ConsumeNewMemberFlag(), "first SP should trigger a save");

        Feed(j, "mode", 1, T0 + 3_000);
        Assert.True(j.ConsumeNewMemberFlag(), "first MODE should trigger a save");
        Feed(j, "mode", 1, T0 + 4_000);
        Assert.False(j.ConsumeNewMemberFlag(), "a repeated MODE is not a new member");
    }

    [Fact]
    public void A_restored_member_does_not_re_trigger_a_save()
    {
        // Seeding is not new information; only the wire is.
        var j = new LoopJoiner();
        j.Seed(L(), "FCS0101", M(("sp", 42.0, T0)), NoExtras, "AUT", T0, 0, Cfg, T0);
        Assert.False(j.ConsumeNewMemberFlag());
    }

    [Fact]
    public void A_setpoint_months_old_is_still_used_and_still_GOOD()
    {
        // The whole point of the feature. A setpoint the plant has not touched since
        // March is not stale data -- it IS the setpoint. Values never expire: CHG-002
        // removed the ageing rule because ageing one out marked healthy loops BAD.
        const long sixMonths = 182L * 24 * 60 * 60 * 1000;
        var j = new LoopJoiner();
        j.Seed(L(), "FCS0101",
               M(("sp", 42.0, T0 - sixMonths), ("op", 37.6, T0 - sixMonths)),
               NoExtras, "AUT", T0 - sixMonths, lastEmittedTsMs: 0, Cfg, T0);

        Feed(j, "pv", 41.9, T0 + 1_000);
        var t = Assert.Single(j.Tick(T0 + 5_000, Cfg));
        Assert.Equal(42.0, t.Sp);
        Assert.Equal("AUT", t.Mode);
        Assert.Equal("GOOD", t.Quality);           // age is not a quality judgement
        Assert.Equal(T0 + 1_000, t.EventTsMs);     // stamped by the newest member, the live PV

        // ...and the age is visible rather than hidden.
        var row = Assert.Single(j.HealthSnapshot(T0 + 5_000, 30));
        Assert.Equal(T0 - sixMonths, row.MemberTsMs!["sp"]);
        Assert.Equal(T0 + 1_000, row.MemberTsMs["pv"]);
    }

    [Fact]
    public void Snapshot_round_trips_through_a_second_joiner()
    {
        var a = new LoopJoiner();
        Feed(a, "pv", 1.5, T0); Feed(a, "sp", 2.5, T0); Feed(a, "op", 3.5, T0);
        Feed(a, "mode", 1, T0);
        Assert.Single(a.Tick(T0 + 5_000, Cfg));

        var snap = Assert.Single(a.StateSnapshot());
        var b = new LoopJoiner();
        b.Seed(L(), snap.SourceFcs, snap.Members, snap.Extras,
               snap.ModeToken, snap.ModeTsMs, snap.LastEmittedTsMs, Cfg, T0 + 5_000);

        // Nothing new has arrived, so the restored joiner correctly emits nothing...
        Assert.Empty(b.Tick(T0 + 10_000, Cfg));
        // ...and one live PV is enough to produce a complete tuple.
        Feed(b, "pv", 9.9, T0 + 11_000);
        var t = Assert.Single(b.Tick(T0 + 15_000, Cfg));
        Assert.Equal(9.9, t.Pv);
        Assert.Equal(2.5, t.Sp);
        Assert.Equal(3.5, t.Op);
        Assert.Equal("AUT", t.Mode);
    }
}
