// CHG-102 Phase 5b-2 - the pieces of "verify, then reference" without a database: the exact decoding of IoTDB's REST
// numbers by data type, the raw-column map, the cpax2 pack round trip and the cpax1 compatibility.
using System.Text.Json;
using FluentAssertions;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class EvidenceTraceUnitTests
{
    private static ArchivedManifest Manifest(string gate, string kind, string[] columns, string xq = "sample_time") => new(
        Guid.NewGuid(), Guid.NewGuid(), gate, kind, null, xq, "ms_epoch", "y", "EU", "f64", JsonSerializer.Serialize(columns),
        "f64le+gzip", 3, 3, 1, 10, "aa", "[\"aa\"]", "COMPLETE", null, "{\"loop_id\":\"L1\"}", "TRANSIENT", false, null, null,
        DateTime.UtcNow, DateTime.UtcNow, null, null, null);

    [Fact]
    public void Float_series_are_widened_from_the_float_and_double_series_parsed_as_double()
    {
        // IoTDB prints a FLOAT as its shortest text; parsed as a double it would not be the stored value
        var json = """
            {"expressions":["root.a.L1.pv","root.a.L1.op","root.a.L1.vp"],"data_types":["FLOAT","DOUBLE","DOUBLE"],
             "timestamps":[1,2],"values":[[23.45,1.0E-5],[52.91795647771839,-0.0],[null,"NaN"]]}
            """;
        var s = IotDbSeriesReader.Parse(json);
        s.Degraded.Should().BeFalse();
        s.Values["pv"][0].Should().Be((double)23.45f).And.NotBe(23.45);
        s.Values["pv"][1].Should().Be((double)1.0E-5f);
        s.Values["op"][0].Should().Be(52.91795647771839);
        BitConverter.DoubleToInt64Bits(s.Values["op"][1]!.Value).Should().Be(BitConverter.DoubleToInt64Bits(-0.0));
        s.Values["vp"][0].Should().BeNull();
        BitConverter.DoubleToInt64Bits(s.Values["vp"][1]!.Value).Should().Be(0x7ff8000000000000L, "Java's NaN, not .NET's");
        var rebuilt = EvidenceTraceCodec.Rebuild(s, 0, 2, "vp")!;
        BitConverter.DoubleToInt64Bits(rebuilt[0]).Should().Be(0x7ff8000000000000L, "a missing point is the engine's NaN");
        EvidenceTraceCodec.Rebuild(s, 0, 2, TraceSource.Time).Should().Equal(1d, 2d);
    }

    [Fact]
    public void An_error_reply_is_degraded()
    {
        IotDbSeriesReader.Parse("""{"code":602,"message":"no permission"}""").Degraded.Should().BeTrue();
        IotDbSeriesReader.Parse("<html>").Degraded.Should().BeTrue();
        IotDbSeriesReader.BuildSql("root.a.L1", TraceSource.Query, 10, 20, 5)
            .Should().Be("select pv,op,vp from root.a.L1 where time >= 10 and time <= 20 limit 5");
    }

    [Fact]
    public void Only_raw_sample_columns_of_the_long_tier_are_candidates()
    {
        EvidenceTraceMap.Candidates(Manifest("G11", "measurement", new[] { "x", "y", "delta_pv", "spikes" }), new[] { "x", "y", "delta_pv", "spikes" })
            .Should().Equal(("x", "time"), ("y", "pv"));
        var g10 = new[] { "x", "y", "u_requested", "vp", "tracking_error", "active_low", "active_high", "validity" };
        EvidenceTraceMap.Candidates(Manifest("G10", "actuator_limits", g10), g10).Select(c => c.Column).Should().Equal("x", "y", "u_requested");
        EvidenceTraceMap.Candidates(Manifest("G6", "psd", new[] { "x", "y", "mask" }, "frequency_hz"), new[] { "x", "y", "mask" }).Should().BeEmpty();
        EvidenceTraceMap.Candidates(Manifest("G11", "eligibility_intervals", new[] { "x", "y" }, "from_time"), new[] { "x", "y" }).Should().BeEmpty();
    }

    [Fact]
    public void A_cpax2_pack_round_trips_trace_forms_and_verbatim_artifacts_and_cpax1_still_reads()
    {
        var verbatimBytes = EvidenceTraceSeed.Encode(new[] { new[] { 1d, 2, 3 }, new[] { 4d, 5, 6 } });
        var vm = Manifest("G6", "psd", new[] { "x", "y" }) with
        {
            TotalBytes = verbatimBytes.Length, Sha256 = EvidenceArchiveSeed.Sha(verbatimBytes),
            ChunkSha256 = JsonSerializer.Serialize(new[] { EvidenceArchiveSeed.Sha(verbatimBytes) }),
        };
        var verbatim = new ArchivedArtifact(vm, new[] { new EvidenceChunkSpec(0, EvidenceArchiveSeed.Sha(verbatimBytes), verbatimBytes) });
        var y = EvidenceTraceCodec.ToBytes(new[] { 7d, 8, 9 });
        var form = new TraceForm(3, "ff", "L1", "root.a.L1", 1, 3, TraceSource.Query,
            new[] { new TraceColumn("x", new TraceRef("time", 3, "ab", null)), new TraceColumn("y", null) });
        var traced = new ArchivedArtifact(Manifest("G11", "measurement", new[] { "x", "y" }), Array.Empty<EvidenceChunkSpec>(),
            new ArchivedTrace(form, new[] { null, ArchivedTrace.Compress(y) }));

        EvidenceArchivePack.CodecFor(new[] { verbatim }).Should().Be("cpax1");
        EvidenceArchivePack.CodecFor(new[] { verbatim, traced }).Should().Be("cpax2");
        var back = EvidenceArchivePack.Unpack(EvidenceArchivePack.Pack(new[] { verbatim, traced }));
        back[0].Trace.Should().BeNull();
        back[0].Chunks.Single().Payload.Should().Equal(verbatimBytes);
        EvidenceArchivePack.Verifies(back[0].Manifest, back[0].Chunks).Should().BeTrue();
        back[1].Chunks.Should().BeEmpty();
        back[1].Trace!.Form.Should().BeEquivalentTo(form);
        back[1].Trace!.Inline[0].Should().BeNull();
        ArchivedTrace.Decompress(back[1].Trace!.Inline[1]!).Should().Equal(y);

        var v1 = EvidenceArchivePack.Pack(new[] { verbatim });
        v1[4].Should().Be(1, "a set with nothing referenced is still written as cpax1");
        EvidenceArchivePack.Unpack(v1).Single().Chunks.Single().Payload.Should().Equal(verbatimBytes);
    }

    [Fact]
    public void The_codec_re_encodes_columns_that_decode_bit_for_bit()
    {
        var cols = new[] { new[] { 1.0, 2.0, double.MaxValue }, new[] { EvidenceTraceCodec.JavaNaN, -0.0, 1e-300 } };
        var bytes = cols.Select(EvidenceTraceCodec.ToBytes).ToArray();
        var (chunks, sha, total) = EvidenceTraceCodec.Encode(bytes);
        chunks.Should().ContainSingle();
        EvidenceArchiveSeed.Sha(chunks[0].Payload).Should().Be(sha);
        total.Should().Be(chunks[0].Payload.Length);
        var back = EvidenceTraceCodec.SplitColumns(EvidenceTraceCodec.Inflate(chunks), 2, 3)!;
        back[0].Should().Equal(bytes[0]);
        back[1].Should().Equal(bytes[1]);
        EvidenceTraceCodec.StreamSha(back).Should().Be(EvidenceTraceCodec.StreamSha(bytes));
        EvidenceTraceCodec.FirstDifference(bytes[1], EvidenceTraceCodec.ToBytes(new[] { double.NaN, -0.0, 1e-300 }))
            .Should().Be(0, ".NET's NaN is not Java's NaN");
    }

    [Theory]
    [InlineData(null, false, false)]   // auto before the v2 move: no references (they would break when the move casts to FLOAT)
    [InlineData(null, true, true)]     // auto after the move
    [InlineData(true, false, true)]    // explicit on
    [InlineData(false, true, false)]   // explicit off
    public void Trace_references_default_to_the_post_move_v2_layout(bool? setting, bool layoutV2, bool expected) =>
        new EvidenceArchiveOptions { TraceReferences = setting }.TraceReferencesFor(layoutV2).Should().Be(expected);
}
