// v2.5 Task 1A.1 (spec v6 R03 / C02): per-role provenance on the SAME samples tuple.
//
// The 1.0 tuple has one event_ts_ms and one quality for five roles, so a stale VP held
// for 90 s is indistinguishable from a fresh one, and a fresh OP cannot be told from a
// stale PV. Schema 1.1 adds a roles{} block with per-role sample time, verified time,
// native + normalised quality, unit, held flag and age — and leaves every 1.0 field
// byte-for-byte unchanged so Flink, the historian writer and old jars keep working.
using System.Text.Json;
using Traverse.IngestionService.Models;
using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class LoopTupleRolesTests
{
    private static readonly RegistryLoop Loop = new("FIC10302", "aaaa-bbbb", "hdpe",
        "section_100", "u1001_polymerization_reactor_1", "FIC", true);
    private static readonly LoopIngestSettings Cfg = new LoopIngestConfig().Resolve(); // grid 5 s
    private const long T0 = 1_756_600_000_000;

    private static OtLoopPayload P(long ts, string quality = "GOOD", string? unit = null, string? raw = null) =>
        new(0, raw, unit, quality, ts, null, 0, null, null, null, null, null, null, null);

    private static void Feed(LoopJoiner j, string role, double value, long ts, string quality = "GOOD", string? unit = null)
    {
        var member = role is "pv" or "sp" or "op" or "vp";
        j.Accept(Loop, "FCS0101", new MappedParameter(role, member, value, null),
            P(ts, quality, unit) with { NumericValue = value }, Cfg, ts);
    }

    private static void FeedMode(LoopJoiner j, string token, string raw, long ts) =>
        j.Accept(Loop, "FCS0101", new MappedParameter("mode", true, null, token), P(ts, "GOOD", null, raw), Cfg, ts);

    private static JsonElement Roles(LoopTuple t) => JsonDocument.Parse(t.ToJson()).RootElement.GetProperty("roles");

    [Fact]
    public void Tick_EmitsRolesWithPerRoleTimesAndHeldFlag()
    {
        var j = new LoopJoiner();
        Feed(j, "vp", 41.8, T0 - 90_000, unit: "pp");            // VP published 90 s before the others
        Feed(j, "pv", 101.2, T0, unit: "t/h");
        Feed(j, "sp", 100.0, T0 - 2_000, unit: "t/h");
        Feed(j, "op", 42.1, T0 - 1_000, unit: "pp");
        FeedMode(j, "AUT", "1", T0 - 3_000);

        var t = Assert.Single(j.Tick(T0 + 5_000, Cfg));
        var root = JsonDocument.Parse(t.ToJson()).RootElement;
        Assert.Equal("1.1", root.GetProperty("schema_version").GetString());
        Assert.Equal(5, root.GetProperty("grid_seconds").GetInt32());
        Assert.Equal(T0, t.EventTsMs);                             // 1.0 rule unchanged: newest member

        var roles = root.GetProperty("roles");
        var pv = roles.GetProperty("pv");
        Assert.Equal(101.2, pv.GetProperty("value").GetDouble());
        Assert.Equal(T0, pv.GetProperty("sample_ts_ms").GetInt64());
        Assert.Equal(T0, pv.GetProperty("verified_ts_ms").GetInt64());   // a change publication is a verification
        Assert.Equal("t/h", pv.GetProperty("unit").GetString());
        Assert.False(pv.GetProperty("held").GetBoolean());
        Assert.Equal(0, pv.GetProperty("age_ms").GetInt64());

        var vp = roles.GetProperty("vp");
        Assert.Equal(T0 - 90_000, vp.GetProperty("sample_ts_ms").GetInt64());
        Assert.Equal(90_000, vp.GetProperty("age_ms").GetInt64());
        Assert.Equal("pp", vp.GetProperty("unit").GetString());
        // First tick: nothing was published before, so nothing is "held" yet — but the
        // age says how stale it is. (Held is about carry-forward across ticks, see below.)
        Assert.False(vp.GetProperty("held").GetBoolean());

        var mode = roles.GetProperty("mode");
        Assert.Equal("AUT", mode.GetProperty("value").GetString());
        Assert.Equal("1", mode.GetProperty("mode_native").GetString());
        Assert.Equal(T0 - 3_000, mode.GetProperty("sample_ts_ms").GetInt64());
    }

    [Fact]
    public void Tick_MarksCarriedForwardMembersAsHeld()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0); Feed(j, "vp", 4, T0);
        Assert.Single(j.Tick(T0 + 5_000, Cfg));

        Feed(j, "pv", 1.5, T0 + 6_000);                            // only PV advances
        var t = Assert.Single(j.Tick(T0 + 10_000, Cfg));
        var roles = Roles(t);
        Assert.False(roles.GetProperty("pv").GetProperty("held").GetBoolean());
        Assert.True(roles.GetProperty("sp").GetProperty("held").GetBoolean());
        Assert.True(roles.GetProperty("op").GetProperty("held").GetBoolean());
        Assert.True(roles.GetProperty("vp").GetProperty("held").GetBoolean());
        Assert.Equal(6_000, roles.GetProperty("vp").GetProperty("age_ms").GetInt64());
        Assert.Equal(0, roles.GetProperty("pv").GetProperty("age_ms").GetInt64());
    }

    [Fact]
    public void Tick_RoleQualityIsPerRoleNotWorstOf()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0, quality: "GOOD");
        Feed(j, "sp", 2, T0, quality: "BAD");
        Feed(j, "op", 3, T0, quality: "GOOD");
        Feed(j, "vp", 4, T0, quality: "BAD");

        var t = Assert.Single(j.Tick(T0 + 5_000, Cfg));
        Assert.Equal("BAD", t.Quality);                            // 1.0 worst-of(pv,sp,op) unchanged
        var roles = Roles(t);
        Assert.Equal("GOOD", roles.GetProperty("pv").GetProperty("quality").GetString());
        Assert.Equal("BAD", roles.GetProperty("sp").GetProperty("quality").GetString());
        Assert.Equal("BAD", roles.GetProperty("sp").GetProperty("quality_native").GetString());
        Assert.Equal("GOOD", roles.GetProperty("op").GetProperty("quality").GetString());
        Assert.Equal("BAD", roles.GetProperty("vp").GetProperty("quality").GetString());   // 1.0 ignored vp quality
    }

    [Fact]
    public void Tick_TopLevelFieldsAreByteForByteThe10Contract()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 42.1, T0); Feed(j, "sp", 42.0, T0 + 100); Feed(j, "op", 37.6, T0 + 200);
        FeedMode(j, "AUT", "1", T0);
        var t = Assert.Single(j.Tick(T0 + 5_000, Cfg));

        var json = t.ToJson();
        var legacy = (t with { Roles = null }).ToJson();           // exactly what a 1.0 build wrote
        Assert.DoesNotContain("\"roles\"", legacy);
        Assert.DoesNotContain("\"schema_version\"", legacy);
        Assert.StartsWith(legacy.TrimEnd('}'), json);              // 1.0 fields first, unchanged, in order
        Assert.Contains("\"schema_version\":\"1.1\"", json);
    }

    [Fact]
    public void Tick_ReportsTheBindingRevisionItWasAssembledUnder()
    {
        var j = new LoopJoiner();
        var cfg = Cfg with { BindingRevision = 17 };
        j.Accept(Loop, "FCS0101", new MappedParameter("pv", true, 1, null), P(T0) with { NumericValue = 1 }, cfg, T0);
        j.Accept(Loop, "FCS0101", new MappedParameter("sp", true, 2, null), P(T0) with { NumericValue = 2 }, cfg, T0);
        j.Accept(Loop, "FCS0101", new MappedParameter("op", true, 3, null), P(T0) with { NumericValue = 3 }, cfg, T0);

        var t = Assert.Single(j.Tick(T0 + 5_000, cfg));
        Assert.Equal(17, JsonDocument.Parse(t.ToJson()).RootElement.GetProperty("binding_revision").GetInt64());
    }
}
