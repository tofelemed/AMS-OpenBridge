using System.Text.Json;
using System.Text.RegularExpressions;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

/// <summary>CHG-102 Phase 2 — KPI history rows for IoTDB (pure mapping, no IoTDB needed).</summary>
public class KpiHistoryMapperTests
{
    private static readonly IotDbWriteOptions V1 = new() { LoopRootPrefix = "root.hdpe.cpm" };
    private static readonly IotDbWriteOptions V2 = new()
        { LoopRootPrefix = "root.hdpe.cpm", Layout = "v2", KpiDatabase = "root.hdpe.kpi", ShortKpiDatabase = "root.hdpe.kpis" };

    private static JsonElement J(string json) => JsonDocument.Parse(json).RootElement;

    private const string Gate = """
        {"loop_id":"FIC-103.02","window_kind":"24h","windowEndMs":1793709000000,"purpose":"LIVE",
         "sample_count":17280,"mae":0.42,"rmse":null,"confidence":0.81,"auto_pct":97.5,
         "diagnosis":"OSCILLATION","severity":"MEDIUM","selected_family":"STICTION",
         "gate0_status":"PASS","gate2r_status":"PASS","gate10_status":"WARN","gate15_status":"INSUFFICIENT_EVIDENCE",
         "bundle_hash":"profile:c6e7","jarSha256":"b14ba7d0013cec3a3b6a0c3ad020ff7b"}
        """;

    private static Dictionary<string, object?> Fields(KpiHistoryPoint p) => p.Fields.ToDictionary(f => f.Key, f => f.Value);

    [Fact]
    public void V2_gate_row_goes_to_the_family_then_loop_device_with_template_fields_only()
    {
        var p = KpiHistoryMapper.Map(KpiResultKind.Gate, J(Gate), V2, out var why);
        Assert.Null(why);
        Assert.NotNull(p);
        Assert.Equal("root.hdpe.kpi.gate_24h.FIC_103_02", p!.Device);
        Assert.Equal(1793709000000, p.TimestampMs);
        Assert.Null(p.LegacyTypes);   // v2 schema comes from the template

        var f = Fields(p);
        Assert.Equal(17280d, f["sample_count"]);
        Assert.Equal(0.42, f["mae"]);
        Assert.False(f.ContainsKey("rmse"));          // not computed = gap, never 0.0
        Assert.Equal("PASS", f["g0"]);
        Assert.Equal("PASS", f["g2r"]);
        Assert.Equal("WARN", f["g10"]);
        Assert.Equal("INSUFFICIENT_EVIDENCE", f["g15"]);
        Assert.Equal("STICTION", f["selected_family"]);
        Assert.Equal("b14ba7d0013c", f["engine"]);     // 12-char engine id
        var allowed = KpiHistoryMapper.GateNumeric.Concat(KpiHistoryMapper.GateText).ToHashSet();
        Assert.All(f.Keys, k => Assert.Contains(k, allowed));   // never auto-extends the template
    }

    [Theory]
    [InlineData("SHADOW", null)]
    [InlineData("REPLAY", null)]
    [InlineData("EVIDENCE_RECONSTRUCTION", null)]
    [InlineData("LIVE", "recompute")]
    public void Only_live_flink_results_are_written(string purpose, string? source)
    {
        var json = Gate.Replace("\"purpose\":\"LIVE\"", $"\"purpose\":\"{purpose}\"" +
            (source is null ? "" : $",\"calculation_source\":\"{source}\""));
        Assert.Null(KpiHistoryMapper.Map(KpiResultKind.Gate, J(json), V2, out var why));
        Assert.StartsWith("not live", why);
        Assert.Null(KpiHistoryMapper.Map(KpiResultKind.Gate, J(json), V1, out _));
    }

    [Fact]
    public void A_family_without_a_template_is_refused_in_v2()
    {
        var json = Gate.Replace("\"24h\"", "\"8h\"");
        Assert.Null(KpiHistoryMapper.Map(KpiResultKind.Gate, J(json), V2, out var why));
        Assert.Contains("no template", why);
    }

    [Fact]
    public void Short_rows_go_to_the_short_database_with_booleans_as_text()
    {
        var json = """
            {"loop_id":"LIC10601","window_kind":"15m","windowEndMs":1793709000000,"sample_count":180,
             "iae":1.5,"auto_pct":100,"sufficient_data":false,"evaluation_state":"EVALUATED",
             "gate1_status":"PASS","gate2r_status":"FAIL","gate5_status":"PASS"}
            """;
        var p = KpiHistoryMapper.Map(KpiResultKind.Short, J(json), V2, out _)!;
        Assert.Equal("root.hdpe.kpis.short_15m.LIC10601", p.Device);
        var f = Fields(p);
        Assert.Equal("false", f["sufficient_data"]);
        Assert.Equal("FAIL", f["g2r"]);
        Assert.False(f.ContainsKey("g5"));             // not a short-template field
        var allowed = KpiHistoryMapper.ShortNumeric.Concat(KpiHistoryMapper.ShortText).ToHashSet();
        Assert.All(f.Keys, k => Assert.Contains(k, allowed));
    }

    [Fact]
    public void Long_rows_go_to_the_kpi_database()
    {
        var json = """{"loop_id":"TIC30501","window_kind":"4h","windowEndMs":1,"acf_regularity":0.9,"gate7_status":"PASS"}""";
        var p = KpiHistoryMapper.Map(KpiResultKind.Long, J(json), V2, out _)!;
        Assert.Equal("root.hdpe.kpi.long_4h.TIC30501", p.Device);
        Assert.Equal("PASS", Fields(p)["g7"]);
    }

    [Fact]
    public void V1_keeps_the_legacy_device_fields_and_declared_types()
    {
        var p = KpiHistoryMapper.Map(KpiResultKind.Gate, J(Gate), V1, out _)!;
        Assert.Equal("root.hdpe.cpm.FIC_103_02.kpi.gate_24h", p.Device);
        Assert.NotNull(p.LegacyTypes);
        Assert.Equal("TEXT", p.LegacyTypes!["diagnosis"]);
        Assert.Equal("DOUBLE", p.LegacyTypes["mae"]);
        Assert.False(Fields(p).ContainsKey("g0"));     // legacy tree never had statuses
    }

    [Fact]
    public void Messages_without_loop_or_window_end_are_skipped()
    {
        Assert.Null(KpiHistoryMapper.Map(KpiResultKind.Gate, J("""{"windowEndMs":5}"""), V2, out var a));
        Assert.Equal("no loop_id", a);
        Assert.Null(KpiHistoryMapper.Map(KpiResultKind.Gate, J("""{"loop_id":"X"}"""), V2, out var b));
        Assert.Equal("no windowEndMs", b);
    }

    [Fact]
    public void Template_lists_match_the_layout_script()
    {
        // The writer and infra/docker/iotdb-layout-v2.sh must name the same measurements.
        var script = File.ReadAllText(Path.Combine(RepoRoot(), "infra", "docker", "iotdb-layout-v2.sh"));
        string Block(string var)
        {
            var m = Regex.Match(script, var + "=\"(.*?)\"\\s*\\n(?=[A-Z0-9_]+=|\\s*\\n)", RegexOptions.Singleline);
            Assert.True(m.Success, var);
            return m.Groups[1].Value;
        }
        static HashSet<string> Names(string block) =>
            Regex.Matches(block, @"\$\(cols ""\$[FTD]""((?:\s+(?:\\\s*)?[a-z0-9_]+)+)\)")
                 .SelectMany(m => Regex.Split(m.Groups[1].Value.Replace("\\", " ").Trim(), @"\s+")).ToHashSet();

        Assert.Equal(KpiHistoryMapper.GateNumeric.Concat(KpiHistoryMapper.GateText).ToHashSet(), Names(Block("GATE_COLS")));
        Assert.Equal(KpiHistoryMapper.LongNumeric.Concat(KpiHistoryMapper.LongText).ToHashSet(), Names(Block("LONG_COLS")));
        Assert.Equal(KpiHistoryMapper.ShortNumeric.Concat(KpiHistoryMapper.ShortText).ToHashSet(), Names(Block("SHORT_COLS")));
    }

    private static string RepoRoot()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d != null && !Directory.Exists(Path.Combine(d.FullName, "infra", "docker"))) d = d.Parent;
        return d?.FullName ?? throw new DirectoryNotFoundException("repo root");
    }
}
