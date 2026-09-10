using System.Text.Json;
using Traverse.IngestionService.Models;
using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class LoopJoinerTests
{
    private static readonly RegistryLoop Loop = new("FIC10302", "aaaa-bbbb", "hdpe",
        "section_100", "u1001_polymerization_reactor_1", "FIC", true);
    private static readonly LoopIngestSettings Cfg = new LoopIngestConfig().Resolve(); // grid 5 s
    private const long T0 = 1_756_600_000_000; // multiple of 5000 for readable grid math

    private static OtLoopPayload P(long ts, string quality = "GOOD") =>
        new(0, "0", "", quality, ts, null, 0, null, null, null, null, null, null, null);

    private static void Feed(LoopJoiner j, string role, double value, long ts, string quality = "GOOD")
    {
        var member = role is "pv" or "sp" or "op" or "vp";
        j.Accept(Loop, "FCS0101",
            new MappedParameter(role, member, value, null),
            P(ts, quality) with { NumericValue = value }, Cfg, ts);
    }

    [Fact]
    public void No_tuple_until_pv_sp_op_all_seen()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 42.1, T0 + 100);
        Feed(j, "sp", 42.0, T0 + 200);
        Assert.Empty(j.Tick(T0 + 5_000, Cfg));           // op never arrived
        Feed(j, "op", 37.6, T0 + 5_100);
        var tuples = j.Tick(T0 + 10_000, Cfg);
        var t = Assert.Single(tuples);
        Assert.Equal("FIC10302", t.LoopId);
        Assert.Equal(T0 + 5_100, t.EventTsMs);           // newest member's SOURCE ts, not the tick
        Assert.Equal(42.1, t.Pv);
        Assert.Equal(42.0, t.Sp);
        Assert.Equal(37.6, t.Op);
        Assert.Equal("GOOD", t.Quality);
        Assert.Equal("FIC", t.LoopType);
        Assert.Equal("hdpe", t.Site);
        Assert.Equal("FCS0101", t.SourceFcs);
    }

    [Fact]
    public void Forward_fills_slower_signals_onto_the_newest_source_timestamp()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        Assert.Single(j.Tick(T0 + 5_000, Cfg));

        Feed(j, "pv", 1.5, T0 + 6_000);                  // only PV advances
        var t = Assert.Single(j.Tick(T0 + 10_000, Cfg));
        Assert.Equal(T0 + 6_000, t.EventTsMs);           // PV's own timestamp
        Assert.Equal(1.5, t.Pv);
        Assert.Equal(2, t.Sp);                           // forward-filled
        Assert.Equal(3, t.Op);
    }

    [Fact]
    public void Quiet_loop_is_skipped_rather_than_restamped()
    {
        // Re-emitting forward-filled values would repeat event_ts_ms, and IoTDB keys
        // rows by (device, timestamp) — the repeat would overwrite the original.
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        Assert.Single(j.Tick(T0 + 5_000, Cfg));
        Assert.Empty(j.Tick(T0 + 10_000, Cfg));          // nothing advanced
        Assert.Empty(j.Tick(T0 + 15_000, Cfg));
        Assert.Equal(2, j.SkippedNoAdvance);
    }

    [Fact]
    public void Event_ts_never_repeats_for_a_loop()
    {
        var j = new LoopJoiner();
        var seen = new HashSet<long>();
        for (var i = 0; i < 20; i++)
        {
            Feed(j, "pv", i, T0 + i * 1_000);
            Feed(j, "sp", 2, T0 + i * 1_000);
            Feed(j, "op", 3, T0 + i * 1_000);
            foreach (var t in j.Tick(T0 + 5_000 + i * 5_000, Cfg))
                Assert.True(seen.Add(t.EventTsMs), $"duplicate event_ts_ms {t.EventTsMs}");
        }
        Assert.NotEmpty(seen);
    }

    [Fact]
    public void Server_clock_offset_does_not_turn_GOOD_into_BAD()
    {
        // Staleness is judged inside the source's own clock domain: the ticker's
        // wall clock being hours ahead of the gateway must not flip quality.
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        var t = Assert.Single(j.Tick(T0 + 3_600_000, Cfg));   // ticker 1 h ahead of source
        Assert.Equal("GOOD", t.Quality);
        Assert.Equal(T0, t.EventTsMs);
    }

    [Fact]
    public void An_old_but_good_member_stays_GOOD()
    {
        // Quality is OT's verdict only. A setpoint nobody has touched for minutes is
        // unchanged, not untrustworthy — ageing it out would flag healthy loops BAD.
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        Assert.Single(j.Tick(T0 + 5_000, Cfg));
        Feed(j, "pv", 1.5, T0 + 600_000);                // 10 min later, only PV moves
        var t = Assert.Single(j.Tick(T0 + 605_000, Cfg));
        Assert.Equal("GOOD", t.Quality);
        Assert.Equal(2, t.Sp);                           // forward-filled, still good
    }

    [Fact]
    public void Bad_member_quality_propagates()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0, "BAD"); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        Assert.Equal("BAD", Assert.Single(j.Tick(T0 + 5_000, Cfg)).Quality);
    }

    [Fact]
    public void Uncertain_counts_as_not_good()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0, "UNCERTAIN"); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        Assert.Equal("BAD", Assert.Single(j.Tick(T0 + 5_000, Cfg)).Quality);
    }

    [Fact]
    public void Numeric_opc_quality_192_is_good()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0, "192"); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        Assert.Equal("GOOD", Assert.Single(j.Tick(T0 + 5_000, Cfg)).Quality);
    }

    [Fact]
    public void Mode_and_extras_ride_the_tuple()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        j.Accept(Loop, "FCS0101", new MappedParameter("mode", true, 4.0, "AUT"), P(T0), Cfg, T0);
        Feed(j, "p", 300, T0); Feed(j, "gw", 0, T0);
        var t = Assert.Single(j.Tick(T0 + 5_000, Cfg));
        Assert.Equal("AUT", t.Mode);
        Assert.Equal(300, t.Extras["p"]);
        Assert.Equal(0, t.Extras["gw"]);
        Assert.Null(t.Vp);
    }

    [Fact]
    public void Vp_rides_the_tuple_and_advances_event_ts()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        Feed(j, "vp", 39.277, T0 + 700);                 // positioner feedback arrives last
        var t = Assert.Single(j.Tick(T0 + 5_000, Cfg));
        Assert.Equal(39.277, t.Vp);
        Assert.Equal(T0 + 700, t.EventTsMs);             // vp is a member: its ts counts
        using var doc = JsonDocument.Parse(t.ToJson());
        Assert.Equal(39.277, doc.RootElement.GetProperty("vp").GetDouble());
    }

    [Fact]
    public void Vp_alone_advancing_emits_a_fresh_tuple()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0); Feed(j, "vp", 40, T0);
        Assert.Single(j.Tick(T0 + 5_000, Cfg));
        Feed(j, "vp", 41, T0 + 6_000);                   // only the positioner moved
        var t = Assert.Single(j.Tick(T0 + 10_000, Cfg));
        Assert.Equal(41, t.Vp);
        Assert.Equal(T0 + 6_000, t.EventTsMs);
    }

    [Fact]
    public void Bad_vp_quality_does_not_invalidate_the_tuple()
    {
        // Deliberate: quality is worst-of pv/sp/op ONLY. A flaky positioner signal
        // must cost the loop its valve diagnostics, not its whole analysis.
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        Feed(j, "vp", 40, T0, "BAD");
        var t = Assert.Single(j.Tick(T0 + 5_000, Cfg));
        Assert.Equal("GOOD", t.Quality);
        Assert.Equal(40, t.Vp);                          // still carried, the engine sees it
    }

    [Fact]
    public void Two_loops_tick_independently()
    {
        var loop2 = Loop with { LoopId = "TIC10101", LoopType = "TIC" };
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        j.Accept(loop2, "FCS0101", new MappedParameter("pv", true, 9.0, null), P(T0), Cfg, T0);
        var tuples = j.Tick(T0 + 5_000, Cfg);
        Assert.Single(tuples);                            // loop2 incomplete — only FIC emits
        Assert.Equal(2, j.ActiveLoops);
    }

    [Fact]
    public void ToJson_matches_the_wire_contract()
    {
        var tuple = new LoopTuple("FIC10302", T0, T0 + 120, 42.1, 42.0, 37.6, null, "AUT", "GOOD", "FIC",
            "hdpe", "section_100", "u1001_polymerization_reactor_1", "aaaa-bbbb", "FCS0101",
            new Dictionary<string, double> { ["p"] = 300.0 });
        using var doc = JsonDocument.Parse(tuple.ToJson());
        var r = doc.RootElement;
        Assert.Equal("FIC10302", r.GetProperty("loop_id").GetString());
        Assert.Equal(T0, r.GetProperty("event_ts_ms").GetInt64());
        Assert.Equal(T0 + 120, r.GetProperty("ingest_ts_ms").GetInt64());
        Assert.Equal(42.1, r.GetProperty("pv").GetDouble());
        Assert.Equal(42.0, r.GetProperty("sp").GetDouble());
        Assert.Equal(37.6, r.GetProperty("op").GetDouble());
        Assert.Equal("AUT", r.GetProperty("mode").GetString());
        Assert.Equal("GOOD", r.GetProperty("quality").GetString());
        Assert.Equal("FIC", r.GetProperty("loop_type").GetString());
        Assert.Equal("hdpe", r.GetProperty("site").GetString());
        Assert.Equal("FCS0101", r.GetProperty("source_fcs").GetString());
        Assert.Equal(300.0, r.GetProperty("p").GetDouble());
        Assert.False(r.TryGetProperty("vp", out _)); // null vp omitted, never 0
    }
}
