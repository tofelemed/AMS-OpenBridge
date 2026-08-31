using System.Text;
using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class OtPayloadParserTests
{
    private const long Now = 1_788_156_500_000; // 2026-08-31T06:08:20Z — just after the sample envelope's ts

    private static OtLoopPayload? Parse(string json, out string? reason, out string? detail) =>
        OtPayloadParser.Parse(Encoding.UTF8.GetBytes(json), Now, 300, out reason, out detail);

    [Fact]
    public void Parses_the_observed_envelope()
    {
        var p = Parse("""
            {"value": -0.2363, "unit": "", "quality": "GOOD", "ts": "2026-08-31T06:07:14.187Z",
             "source": "opc_ua", "seq": 0, "device": "FIC10302", "area": "FCS0101", "line": "Flow",
             "enterprise": "", "site": "HDPE", "process_unit": "Flow", "equipment": "FIC10302", "item": "PV"}
            """, out var reason, out _);
        Assert.Null(reason);
        Assert.Equal(-0.2363, p!.NumericValue!.Value, 4);
        Assert.Equal("GOOD", p.Quality);
        Assert.Equal("FIC10302", p.Device);
        Assert.Equal("FIC10302", p.Equipment);
        Assert.Equal("FCS0101", p.Area);
        Assert.Equal("HDPE", p.Site);
        Assert.Equal("PV", p.Item);
        Assert.Equal("opc_ua", p.Source);
        Assert.Equal(0, p.Seq);
        Assert.Equal(DateTimeOffset.Parse("2026-08-31T06:07:14.187Z").ToUnixTimeMilliseconds(), p.TsMs);
    }

    [Fact]
    public void Numeric_mode_value_keeps_raw_text()
    {
        var p = Parse("""{"value": 4.0, "ts": 1756599999000, "item": "MODE"}""", out var reason, out _);
        Assert.Null(reason);
        Assert.Equal(4.0, p!.NumericValue);
        Assert.Equal("4.0", p.RawValue);
    }

    [Fact]
    public void Epoch_ms_timestamp_is_accepted()
    {
        var p = Parse("""{"value": 1, "ts": 1756599999000}""", out var reason, out _);
        Assert.Null(reason);
        Assert.Equal(1_756_599_999_000, p!.TsMs);
    }

    [Theory]
    [InlineData("not json at all", "MALFORMED_JSON")]
    [InlineData("[1,2,3]", "MALFORMED_JSON")]
    [InlineData("""{"ts": 1756599999000}""", "MISSING_FIELD")]                       // no value
    [InlineData("""{"value": 1}""", "MISSING_FIELD")]                                // no ts
    [InlineData("""{"value": 1, "ts": "yesterday-ish"}""", "BAD_TIMESTAMP")]
    public void Bad_payloads_return_the_right_reason(string json, string expected)
    {
        Assert.Null(Parse(json, out var reason, out _));
        Assert.Equal(expected, reason);
    }

    [Fact]
    public void Future_timestamp_beyond_skew_is_rejected()
    {
        Assert.Null(Parse($$"""{"value": 1, "ts": {{Now + 301_000}}}""", out var reason, out _));
        Assert.Equal(DlqReasons.FutureTimestamp, reason);
        Assert.NotNull(Parse($$"""{"value": 1, "ts": {{Now + 299_000}}}""", out reason, out _));
        Assert.Null(reason);
    }

    [Fact]
    public void Quality_defaults_to_GOOD_when_absent()
    {
        var p = Parse("""{"value": 1, "ts": 1756599999000}""", out _, out _);
        Assert.Equal("GOOD", p!.Quality);
    }

    [Fact]
    public void String_and_boolean_values_coerce()
    {
        Assert.Equal(1.0, Parse("""{"value": true, "ts": 1756599999000}""", out _, out _)!.NumericValue);
        Assert.Equal(63.5, Parse("""{"value": "63.5", "ts": 1756599999000}""", out _, out _)!.NumericValue);
        var nonNumeric = Parse("""{"value": "AUT", "ts": 1756599999000}""", out var reason, out _);
        Assert.Null(reason);                       // parses — role mapping decides if numeric is required
        Assert.Null(nonNumeric!.NumericValue);
        Assert.Equal("AUT", nonNumeric.RawValue);
    }
}
