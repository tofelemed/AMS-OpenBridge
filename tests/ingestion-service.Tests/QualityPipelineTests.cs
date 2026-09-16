// v2.5 Task 1B.1 (spec v6 R04 / NR-021): the decoder wired through parser → joiner → tuple.
using System.Text;
using System.Text.Json;
using Traverse.IngestionService.Models;
using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class QualityPipelineTests
{
    private const long Now = 1_788_156_500_000;
    private static readonly RegistryLoop Loop = new("FIC10302", "aaaa-bbbb", "hdpe",
        "section_100", "u1001_polymerization_reactor_1", "FIC", true);
    private const long T0 = 1_756_600_000_000;

    private static OtLoopPayload? Parse(string json, out string? reason, out string? detail) =>
        OtPayloadParser.Parse(Encoding.UTF8.GetBytes(json), Now, 300, out reason, out detail);

    // ── parser: keep the native token, reject non-finite numbers ─────────────────

    [Fact]
    public void Parser_keeps_a_numeric_quality_as_its_native_text_instead_of_defaulting_to_GOOD()
    {
        var p = Parse("""{"value": 1.5, "ts": 1756599999000, "quality": 0}""", out var reason, out _);
        Assert.Null(reason);
        Assert.Equal("0", p!.Quality);                        // was: silently "GOOD"
    }

    [Fact]
    public void Parser_reports_a_missing_quality_as_null_not_GOOD()
    {
        var p = Parse("""{"value": 1.5, "ts": 1756599999000}""", out var reason, out _);
        Assert.Null(reason);
        Assert.Null(p!.Quality);
    }

    [Theory]
    [InlineData("""{"value": "NaN", "ts": 1756599999000}""")]
    [InlineData("""{"value": "Infinity", "ts": 1756599999000}""")]
    [InlineData("""{"value": "-Infinity", "ts": 1756599999000}""")]
    [InlineData("""{"value": "1e309", "ts": 1756599999000}""")]
    public void Parser_dead_letters_non_finite_numbers(string json)
    {
        Assert.Null(Parse(json, out var reason, out var detail));
        Assert.Equal("NON_FINITE", reason);
        Assert.NotNull(detail);
    }

    // ── joiner: per-role decode under the data source's protocol ────────────────

    private static void Feed(LoopJoiner j, LoopIngestSettings cfg, string role, double value, string qualityJson)
    {
        var payload = OtPayloadParser.Parse(Encoding.UTF8.GetBytes(
            $$"""{"value": {{value.ToString(System.Globalization.CultureInfo.InvariantCulture)}}, "ts": {{T0}}, "quality": {{qualityJson}}}"""),
            T0 + 1, 300, out _, out _)!;
        j.Accept(Loop, "FCS0101", new MappedParameter(role, true, value, null), payload, cfg, T0);
    }

    private static JsonElement Tuple(LoopJoiner j, LoopIngestSettings cfg) =>
        JsonDocument.Parse(Assert.Single(j.Tick(T0 + 5_000, cfg)).ToJson()).RootElement;

    [Fact]
    public void OPC_DA_source_decodes_numeric_words_per_role_and_the_1_0_field_is_worst_of()
    {
        var cfg = new LoopIngestConfig { QualityProtocol = "OPC_DA" }.Resolve();
        var j = new LoopJoiner();
        Feed(j, cfg, "pv", 1, "192");
        Feed(j, cfg, "sp", 2, "64");
        Feed(j, cfg, "op", 3, "0");

        var t = Tuple(j, cfg);
        Assert.Equal("BAD", t.GetProperty("quality").GetString());                // worst-of(pv,sp,op)
        Assert.Equal("GOOD", t.GetProperty("roles").GetProperty("pv").GetProperty("quality").GetString());
        Assert.Equal("UNCERTAIN", t.GetProperty("roles").GetProperty("sp").GetProperty("quality").GetString());
        Assert.Equal("BAD", t.GetProperty("roles").GetProperty("op").GetProperty("quality").GetString());
        Assert.Equal("64", t.GetProperty("roles").GetProperty("sp").GetProperty("quality_native").GetString());
        Assert.Equal("OPC_DA", t.GetProperty("roles").GetProperty("sp").GetProperty("quality_protocol").GetString());
    }

    [Fact]
    public void Default_protocol_is_the_string_vocabulary_and_a_g_prefix_is_not_GOOD()
    {
        var cfg = new LoopIngestConfig().Resolve();
        Assert.Equal(QualityProtocol.STRING_ENUM, cfg.QualityProtocol);
        var j = new LoopJoiner();
        Feed(j, cfg, "pv", 1, "\"GOOD\"");
        Feed(j, cfg, "sp", 2, "\"goodish\"");
        Feed(j, cfg, "op", 3, "\"GOOD\"");

        var t = Tuple(j, cfg);
        Assert.Equal("UNKNOWN", t.GetProperty("quality").GetString());            // UNKNOWN is not GOOD
        Assert.Equal("UNKNOWN", t.GetProperty("roles").GetProperty("sp").GetProperty("quality").GetString());
        Assert.Equal("GOOD", t.GetProperty("roles").GetProperty("pv").GetProperty("quality").GetString());
    }

    [Fact]
    public void Numeric_quality_under_the_string_contract_is_UNKNOWN_never_GOOD()
    {
        var cfg = new LoopIngestConfig().Resolve();                               // STRING_ENUM
        var j = new LoopJoiner();
        Feed(j, cfg, "pv", 1, "192");
        Feed(j, cfg, "sp", 2, "\"GOOD\"");
        Feed(j, cfg, "op", 3, "\"GOOD\"");
        var t = Tuple(j, cfg);
        Assert.Equal("UNKNOWN", t.GetProperty("roles").GetProperty("pv").GetProperty("quality").GetString());
        Assert.Equal("UNKNOWN", t.GetProperty("quality").GetString());
    }

    [Fact]
    public void Binding_revision_changes_when_the_quality_protocol_changes()
    {
        var a = new LoopIngestConfig().Resolve().BindingRevision;
        var b = new LoopIngestConfig { QualityProtocol = "OPC_UA" }.Resolve().BindingRevision;
        Assert.NotEqual(a, b);
    }

    [Fact]
    public void An_unknown_protocol_name_is_a_validation_error_not_a_silent_default()
    {
        var err = Traverse.IngestionService.Services.DataSourceValidation.ValidateLoopIngest(
            new ProfileConfig { LoopIngest = new LoopIngestConfig { QualityProtocol = "OPC_XYZ" } });
        Assert.NotNull(err);
        Assert.Equal("loop_ingest.quality_protocol", err!.Value.Field);
    }
}
