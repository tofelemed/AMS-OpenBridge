// v2.5 Task 1B.1 (spec v6 R04 / NR-021): quality is protocol-specific and UNKNOWN != GOOD.
//
// Today OtPayloadParser drops a numeric quality (192/64/0) on the floor and defaults to
// "GOOD", and the joiner treats anything starting with "g" as good — so an OPC "bad" zero,
// a GARBAGE token and a missing field all read as trustworthy data. The decoder keeps the
// native token, decodes it under the declared protocol only, and answers UNKNOWN when it
// cannot say — never GOOD.
using System.Text.Json;
using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class QualityDecoderTests
{
    private static JsonElement? J(string? json) =>
        json is null ? null : JsonDocument.Parse(json).RootElement.Clone();

    [Theory]
    // OPC DA 8-bit quality word: bits 7-6 = 11 Good, 01 Uncertain, 00 Bad
    [InlineData(QualityProtocol.OPC_DA, "192", NormalizedQuality.GOOD)]
    [InlineData(QualityProtocol.OPC_DA, "200", NormalizedQuality.GOOD)]       // Good + limit bits
    [InlineData(QualityProtocol.OPC_DA, "64",  NormalizedQuality.UNCERTAIN)]
    [InlineData(QualityProtocol.OPC_DA, "0",   NormalizedQuality.BAD)]
    [InlineData(QualityProtocol.OPC_DA, "28",  NormalizedQuality.BAD)]        // Bad, out of service
    [InlineData(QualityProtocol.OPC_DA, "\"192\"", NormalizedQuality.GOOD)]   // numeric-looking string, validated parse
    [InlineData(QualityProtocol.OPC_DA, "\"GOOD\"", NormalizedQuality.UNKNOWN)] // wrong vocabulary for this protocol
    [InlineData(QualityProtocol.OPC_DA, "300", NormalizedQuality.UNKNOWN)]    // out of the 8-bit range
    // OPC UA StatusCode: severity bits 31-30 = 00 Good, 01 Uncertain, 1x Bad
    [InlineData(QualityProtocol.OPC_UA, "0",          NormalizedQuality.GOOD)]
    [InlineData(QualityProtocol.OPC_UA, "1073741824", NormalizedQuality.UNCERTAIN)] // 0x40000000
    [InlineData(QualityProtocol.OPC_UA, "2147483648", NormalizedQuality.BAD)]       // 0x80000000
    [InlineData(QualityProtocol.OPC_UA, "2150891520", NormalizedQuality.BAD)]       // 0x80340000 BadNotConnected
    [InlineData(QualityProtocol.OPC_UA, "\"Good\"",   NormalizedQuality.UNKNOWN)]
    // Sparkplug B quality property codes
    [InlineData(QualityProtocol.SPARKPLUG, "192", NormalizedQuality.GOOD)]
    [InlineData(QualityProtocol.SPARKPLUG, "500", NormalizedQuality.UNCERTAIN)]   // STALE
    [InlineData(QualityProtocol.SPARKPLUG, "0",   NormalizedQuality.BAD)]
    [InlineData(QualityProtocol.SPARKPLUG, "7",   NormalizedQuality.UNKNOWN)]
    // String vocabulary: exact GOOD | UNCERTAIN | BAD (case-insensitive); nothing else
    [InlineData(QualityProtocol.STRING_ENUM, "\"GOOD\"",     NormalizedQuality.GOOD)]
    [InlineData(QualityProtocol.STRING_ENUM, "\"good\"",     NormalizedQuality.GOOD)]
    [InlineData(QualityProtocol.STRING_ENUM, "\"Uncertain\"",NormalizedQuality.UNCERTAIN)]
    [InlineData(QualityProtocol.STRING_ENUM, "\"BAD\"",      NormalizedQuality.BAD)]
    [InlineData(QualityProtocol.STRING_ENUM, "\"goodish\"",  NormalizedQuality.UNKNOWN)]  // the old g-prefix bug
    [InlineData(QualityProtocol.STRING_ENUM, "\"GARBAGE\"",  NormalizedQuality.UNKNOWN)]
    [InlineData(QualityProtocol.STRING_ENUM, "\"Good_NonSpecific\"", NormalizedQuality.UNKNOWN)]
    [InlineData(QualityProtocol.STRING_ENUM, "192",          NormalizedQuality.UNKNOWN)]  // numeric under a string contract
    [InlineData(QualityProtocol.STRING_ENUM, "\"\"",         NormalizedQuality.UNKNOWN)]
    // NONE: the source declares no quality — nothing can make it GOOD
    [InlineData(QualityProtocol.NONE, "\"GOOD\"", NormalizedQuality.UNKNOWN)]
    [InlineData(QualityProtocol.NONE, "192",      NormalizedQuality.UNKNOWN)]
    public void Decodes_only_under_the_declared_protocol(QualityProtocol protocol, string rawJson, NormalizedQuality expected)
    {
        var (q, native, _) = QualityDecoder.Decode(protocol, J(rawJson));
        Assert.Equal(expected, q);
        Assert.Equal(rawJson.Trim('"'), native);             // the native token is preserved verbatim
    }

    [Theory]
    [InlineData(QualityProtocol.OPC_DA)]
    [InlineData(QualityProtocol.OPC_UA)]
    [InlineData(QualityProtocol.SPARKPLUG)]
    [InlineData(QualityProtocol.STRING_ENUM)]
    [InlineData(QualityProtocol.NONE)]
    public void Missing_quality_is_UNKNOWN_under_every_protocol(QualityProtocol protocol)
    {
        var (q, native, reason) = QualityDecoder.Decode(protocol, (JsonElement?)null);
        Assert.Equal(NormalizedQuality.UNKNOWN, q);
        Assert.Equal("", native);
        Assert.Equal("QUALITY_MISSING", reason);
    }

    [Fact]
    public void Unknown_mappings_say_why()
    {
        var (_, _, reason) = QualityDecoder.Decode(QualityProtocol.OPC_DA, J("\"GOOD\""));
        Assert.Equal("NOT_A_NUMBER_FOR_OPC_DA", reason);
        var (_, _, reason2) = QualityDecoder.Decode(QualityProtocol.STRING_ENUM, J("\"goodish\""));
        Assert.Equal("NOT_IN_STRING_VOCABULARY", reason2);
    }

    [Fact]
    public void Worst_of_ranks_BAD_over_UNCERTAIN_over_UNKNOWN_over_GOOD()
    {
        Assert.Equal(NormalizedQuality.GOOD, QualityDecoder.WorstOf(NormalizedQuality.GOOD, NormalizedQuality.GOOD));
        Assert.Equal(NormalizedQuality.UNKNOWN, QualityDecoder.WorstOf(NormalizedQuality.GOOD, NormalizedQuality.UNKNOWN));
        Assert.Equal(NormalizedQuality.UNCERTAIN, QualityDecoder.WorstOf(NormalizedQuality.UNKNOWN, NormalizedQuality.UNCERTAIN));
        Assert.Equal(NormalizedQuality.BAD, QualityDecoder.WorstOf(NormalizedQuality.UNCERTAIN, NormalizedQuality.BAD));
    }
}
