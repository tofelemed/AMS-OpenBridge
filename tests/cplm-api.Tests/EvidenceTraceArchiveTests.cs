// CHG-102 Phase 5b-2 - "verify, then reference" on a throwaway PLAIN database (03 + cpm-10b + cpm-19). A realistic
// boundary set is archived against a fake raw historian: raw-sample columns that match it bit for bit become references
// (cpax2), the live rows are swept, and every artifact read back from the archive decodes to exactly the engine's values,
// with served checksums that match the served bytes. A differing value stays inline; a historian down at archive time
// archives inline (cpax1); a historian down or changed at read time makes only those artifacts unavailable.
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Services;
using Xunit;
using Xunit.Abstractions;

namespace Traverse.CplmApi.Tests;

public sealed class TraceCplmDb : PlainCplmDb
{
    public TraceCplmDb() : base("cplm_evidence_trace_test") { }
    protected override Task AfterCpm10bAsync() => ApplyAsync(RepoFile("scripts", "cpm-19-evidence-archive.sql"));
}

[Trait("Category", "Integration")]
public sealed class EvidenceTraceArchiveTests : IClassFixture<TraceCplmDb>, IAsyncLifetime
{
    private readonly TraceCplmDb _fx;
    private readonly ITestOutputHelper _out;
    private NpgsqlDataSource Db => _fx.Db;
    private const string Loop = "TRC_FIC200";
    private static readonly string[] TraceKinds = { "measurement", "corners", "actuator_limits", "preprocessed_signal" };

    public EvidenceTraceArchiveTests(TraceCplmDb fx, ITestOutputHelper output) { _fx = fx; _out = output; }

    public async Task InitializeAsync()
    {
        await using var conn = await Db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest; DELETE FROM analytics.evidence_archive_run; DELETE FROM analytics.evidence_archive;");
        await EvidenceArchiveSeed.RegisterLoopAsync(Db, Loop, "trc");
    }

    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<string> CodecAsync(Guid setId)
    {
        await using var conn = await Db.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<string>("SELECT codec FROM analytics.evidence_archive WHERE boundary_set_id = @setId", new { setId }) ?? "";
    }

    private CpmEvidenceController Chunks(EvidenceTraceRehydrator traces)
    {
        var c = new CpmEvidenceController(Db, new PostgresEvidenceBlobStore(Db), traces);
        c.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };
        return c;
    }

    /// <summary>Every artifact of the set as served from the archive: manifest JSON per artifact and its decoded columns.</summary>
    private async Task<Dictionary<Guid, (JsonElement Art, double[][]? Cols)>> ServeAsync(TraceSet ts, EvidenceTraceRehydrator traces)
    {
        var served = new Dictionary<Guid, (JsonElement, double[][]?)>();
        await using var conn = await Db.OpenConnectionAsync();
        var reader = new EvidenceManifestReader(new MethodRunResolver(Db), traces);
        foreach (var run in ts.Set.MethodRuns)
        {
            var m = await reader.ReadAsync(conn, run, "trc", CancellationToken.None);
            m.Source.Should().Be("ARCHIVE");
            var json = JsonSerializer.SerializeToElement(m.ToResponse());
            m.Etag.Should().Be((await reader.ReadAsync(conn, run, "trc", CancellationToken.None)).Etag, "a rebuild is deterministic, so the ETag is stable");
            foreach (var art in json.GetProperty("artifacts").EnumerateArray())
            {
                var id = art.GetProperty("artifactId").GetGuid();
                if (art.GetProperty("readiness").GetString() != "COMPLETE") { served[id] = (art.Clone(), null); continue; }
                // per chunk through the controller, verified as artifactCodec.ts verifies: each chunk, then the whole stream
                var parts = new List<byte[]>();
                var shas = art.GetProperty("chunkChecksums").EnumerateArray().Select(e => e.GetString()).ToArray();
                for (var n = 0; n < art.GetProperty("chunkCount").GetInt32(); n++)
                {
                    var f = (await Chunks(traces).GetChunk(id, n, CancellationToken.None)).Should().BeOfType<FileContentResult>().Subject;
                    EvidenceArchiveSeed.Sha(f.FileContents).Should().Be(shas[n]);
                    parts.Add(f.FileContents);
                }
                var all = parts.SelectMany(p => p).ToArray();
                EvidenceArchiveSeed.Sha(all).Should().Be(art.GetProperty("checksum").GetString());
                all.Length.Should().Be(art.GetProperty("totalBytes").GetInt32());
                var names = art.GetProperty("columns").EnumerateArray().Select(e => e.GetString()!).ToArray();
                served[id] = (art.Clone(), EvidenceTraceSeed.Decode(all, names.Length, art.GetProperty("calculationSamples").GetInt32()));
            }
        }
        return served;
    }

    private static void ShouldBeBitIdentical(double[][] a, double[][] b)
    {
        a.Length.Should().Be(b.Length);
        for (var c = 0; c < a.Length; c++)
            EvidenceTraceCodec.ToBytes(a[c]).Should().Equal(EvidenceTraceCodec.ToBytes(b[c]), "column {0} decodes to the engine's bits", c);
    }

    [Fact]
    public async Task Exact_matches_are_referenced_and_every_artifact_decodes_to_the_engines_values()
    {
        var h = new FakeHistorian();
        var ts = await EvidenceTraceSeed.SeedAsync(Db, h, Loop, DateTime.UtcNow.AddHours(-1), 390);
        var stats = new EvidenceArchiveStats();
        var pass = await EvidenceTraceSeed.Archiver(Db, h, stats).RunOnceAsync(DateTime.UtcNow, CancellationToken.None);
        pass.SetsArchived.Should().Be(1);
        h.Calls.Should().Be(1, "one historian read per set");
        (await CodecAsync(ts.Set.SetId)).Should().Be("cpax2");
        stats.Traces.ReferencedArtifacts.Should().Be(4);
        stats.Traces.ReferencedColumns.Should().Be(7, "x of all four, pv of G11, y + u_requested (op) of G10");
        stats.Traces.InlineByReason.Should().BeEmpty();
        stats.Traces.BytesSaved.Should().BeGreaterThan(0);

        await EvidenceArchiveSeed.SweepLiveAsync(Db, ts.Set);
        var reads = new EvidenceTraceReadStats();
        var served = await ServeAsync(ts, EvidenceTraceSeed.Rehydrator(h, reads));
        served.Should().HaveCount(ts.Artifacts.Count);
        foreach (var (id, (kind, _, cols)) in ts.Artifacts)
        {
            var (art, decoded) = served[id];
            decoded.Should().NotBeNull($"{kind} is served");
            ShouldBeBitIdentical(decoded!, cols);
            var prov = art.GetProperty("provenance");
            if (TraceKinds.Contains(kind))
            {
                prov.GetProperty("trace_source").GetString().Should().Be("historian");
                prov.GetProperty("trace_archived_sha256").GetString().Should().NotBe(art.GetProperty("checksum").GetString(),
                    "Java-like (here: Fastest) gzip bytes differ from the .NET rebuild; the served checksums are the rebuilt ones");
            }
            else prov.TryGetProperty("trace_source", out _).Should().BeFalse("{0} is served verbatim", kind);
        }
        reads.Rebuilt.Should().Be(4);
        reads.FailuresByReason.Should().BeEmpty();
    }

    [Fact]
    public async Task One_differing_value_keeps_that_column_inline()
    {
        var h = new FakeHistorian();
        var ts = await EvidenceTraceSeed.SeedAsync(Db, h, Loop, DateTime.UtcNow.AddHours(-1), 390);
        var pv = h.Devices.Values.Single().Values["pv"];
        pv[200] = BitConverter.Int64BitsToDouble(BitConverter.DoubleToInt64Bits(pv[200]!.Value) + 1);   // one ulp
        var stats = new EvidenceArchiveStats();
        await EvidenceTraceSeed.Archiver(Db, h, stats).RunOnceAsync(DateTime.UtcNow, CancellationToken.None);
        stats.Traces.ReferencedColumns.Should().Be(6, "G11's pv column differs by one ulp at one sample");
        stats.Traces.InlineByReason.Should().Equal(new Dictionary<string, long> { [TraceInlineReason.Mismatch] = 1 });

        await EvidenceArchiveSeed.SweepLiveAsync(Db, ts.Set);
        var served = await ServeAsync(ts, EvidenceTraceSeed.Rehydrator(h));
        foreach (var (id, (_, _, cols)) in ts.Artifacts) ShouldBeBitIdentical(served[id].Cols!, cols);
    }

    [Fact]
    public async Task A_historian_down_at_archive_time_archives_the_set_inline()
    {
        var h = new FakeHistorian();
        var ts = await EvidenceTraceSeed.SeedAsync(Db, h, Loop, DateTime.UtcNow.AddHours(-1), 390);
        h.Down = true;
        var stats = new EvidenceArchiveStats();
        (await EvidenceTraceSeed.Archiver(Db, h, stats).RunOnceAsync(DateTime.UtcNow, CancellationToken.None)).SetsArchived.Should().Be(1);
        (await CodecAsync(ts.Set.SetId)).Should().Be("cpax1", "nothing referenced: the 5b-1 format, byte for byte");
        stats.Traces.InlineByReason.Should().Equal(new Dictionary<string, long> { [TraceInlineReason.Unavailable] = 7 });
        await EvidenceArchiveSeed.SweepLiveAsync(Db, ts.Set);
        var served = await ServeAsync(ts, EvidenceTraceSeed.Rehydrator(h));     // still down: nothing needs it
        foreach (var (id, (_, _, cols)) in ts.Artifacts)
        {
            ShouldBeBitIdentical(served[id].Cols!, cols);
            served[id].Art.GetProperty("provenance").TryGetProperty("trace_source", out _).Should().BeFalse();
        }
    }

    [Fact]
    public async Task A_historian_down_or_changed_at_read_time_makes_only_the_traced_artifacts_unavailable()
    {
        var h = new FakeHistorian();
        var ts = await EvidenceTraceSeed.SeedAsync(Db, h, Loop, DateTime.UtcNow.AddHours(-1), 390);
        await EvidenceTraceSeed.Archiver(Db, h, new EvidenceArchiveStats()).RunOnceAsync(DateTime.UtcNow, CancellationToken.None);
        await EvidenceArchiveSeed.SweepLiveAsync(Db, ts.Set);

        h.Down = true;
        var reads = new EvidenceTraceReadStats();
        var traces = EvidenceTraceSeed.Rehydrator(h, reads);
        var served = await ServeAsync(ts, traces);
        foreach (var (id, (kind, _, cols)) in ts.Artifacts)
        {
            var (art, decoded) = served[id];
            if (!TraceKinds.Contains(kind)) { ShouldBeBitIdentical(decoded!, cols); continue; }
            decoded.Should().BeNull();
            art.GetProperty("readiness").GetString().Should().Be("EXPIRED");
            art.GetProperty("readinessReason").GetString().Should().StartWith(TraceFailure.HistorianUnavailable);
            var res = (await Chunks(traces).GetChunk(id, 0, CancellationToken.None)).Should().BeOfType<ObjectResult>().Subject;
            res.StatusCode.Should().Be(StatusCodes.Status503ServiceUnavailable);
        }
        reads.FailuresByReason[TraceFailure.HistorianUnavailable].Should().BeGreaterThanOrEqualTo(4);

        // back, but the historian's pv was rewritten since (e.g. a DOUBLE -> FLOAT tree copy): the checksum catches it
        h.Down = false;
        var pv = h.Devices.Values.Single().Values["pv"];
        for (var i = 0; i < pv.Length; i++) pv[i] = (float)pv[i]!.Value;
        var changed = EvidenceTraceSeed.Rehydrator(h);
        var measurement = ts.Artifacts.Single(a => a.Value.Kind == "measurement").Key;
        var r = (await Chunks(changed).GetChunk(measurement, 0, CancellationToken.None)).Should().BeOfType<ObjectResult>().Subject;
        r.StatusCode.Should().Be(StatusCodes.Status409Conflict);
        JsonSerializer.SerializeToElement(r.Value).GetProperty("error").GetString().Should().Be(TraceFailure.HistorianDiffers);
        var corners = ts.Artifacts.Single(a => a.Value.Kind == "corners").Key;
        (await Chunks(changed).GetChunk(corners, 0, CancellationToken.None)).Should().BeOfType<FileContentResult>("its axis is unchanged");
    }

    [Fact]
    public async Task References_are_not_made_when_the_archive_outlives_the_historian()
    {
        var h = new FakeHistorian();
        await EvidenceTraceSeed.SeedAsync(Db, h, Loop, DateTime.UtcNow.AddHours(-1), 390);
        var stats = new EvidenceArchiveStats();
        var opts = EvidenceTraceSeed.Options();
        opts.HistorianRetentionDays = 31;                 // the archive keeps 30 d (+2 d of window / partition slack)
        await EvidenceTraceSeed.Archiver(Db, h, stats, opts).RunOnceAsync(DateTime.UtcNow, CancellationToken.None);
        stats.Traces.InlineByReason.Should().Equal(new Dictionary<string, long> { [TraceInlineReason.Retention] = 7 });
        h.Calls.Should().Be(0);
    }

    [Theory]
    [InlineData(8_600, "12h")]
    [InlineData(17_200, "24h")]
    public async Task Size_saving_on_a_plant_sized_set(int n, string kind)
    {
        var sizes = new long[2];
        for (var pass = 0; pass < 2; pass++)
        {
            await InitializeAsync();
            var h = new FakeHistorian();
            var ts = await EvidenceTraceSeed.SeedAsync(Db, h, Loop, DateTime.UtcNow.AddHours(-1), n, kind, seed: 11, cycles: 20);
            var stats = new EvidenceArchiveStats();
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var r = await EvidenceTraceSeed.Archiver(Db, h, stats, EvidenceTraceSeed.Options(traces: pass == 1)).RunOnceAsync(DateTime.UtcNow, CancellationToken.None);
            sizes[pass] = r.PackBytes;
            _out.WriteLine($"{n} samples, references {(pass == 1 ? "on " : "off")}: chunks {r.SourceBytes} B, pack {r.PackBytes} B " +
                           $"({await CodecAsync(ts.Set.SetId)}, {sw.ElapsedMilliseconds} ms); trace bytes saved {stats.Traces.BytesSaved}");
            if (pass == 1)
            {
                await EvidenceArchiveSeed.SweepLiveAsync(Db, ts.Set);
                sw.Restart();
                var served = await ServeAsync(ts, EvidenceTraceSeed.Rehydrator(h));
                _out.WriteLine($"  read back + verified the whole set in {sw.ElapsedMilliseconds} ms");
                foreach (var (id, (_, _, cols)) in ts.Artifacts) ShouldBeBitIdentical(served[id].Cols!, cols);
            }
        }
        _out.WriteLine($"  saving {sizes[0] - sizes[1]} B = {100.0 * (sizes[0] - sizes[1]) / sizes[0]:F1} % of the pack");
        sizes[1].Should().BeLessThan(sizes[0] * 7 / 10, "the raw sample columns dominate a plant-sized boundary set");
    }
}
