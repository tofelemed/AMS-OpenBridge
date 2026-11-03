// CHG-102 Phase 5b-2 against a REAL IoTDB (set IOTDB_TEST_URL, IOTDB_TEST_PASSWORD; skipped otherwise), gated like
// KpiHistoryIotDbTests:
//   1. the lab's own archived boundary sets (CPLM_TEST_DB, read-only) re-packed against the lab's raw tree
//      (IOTDB_TEST_LOOP_PREFIX, default root.hdpe.cpm, read-only): which columns verify, the size change, and every
//      referenced artifact rebuilt from IoTDB decodes to the archived values bit for bit;
//   2. a FLOAT device in a scratch database (root.p0test_trace, dropped after): a float-representable column round-trips
//      through the REST text exactly; a full-precision double column does not and stays inline.
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;
using Xunit.Abstractions;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class EvidenceTraceIotDbTests
{
    private static readonly string? Url = Environment.GetEnvironmentVariable("IOTDB_TEST_URL");
    private static readonly string Pw = Environment.GetEnvironmentVariable("IOTDB_TEST_PASSWORD") ?? "root";
    private static readonly string LoopPrefix = Environment.GetEnvironmentVariable("IOTDB_TEST_LOOP_PREFIX") ?? "root.hdpe.cpm";
    private const string ScratchDb = "root.p0test_trace";
    private readonly ITestOutputHelper _out;

    public EvidenceTraceIotDbTests(ITestOutputHelper output) => _out = output;

    private static IotDbSeriesReader Reader()
    {
        var sp = new ServiceCollection().AddHttpClient().BuildServiceProvider();
        return new IotDbSeriesReader(sp.GetRequiredService<IHttpClientFactory>(),
            Options.Create(new IotDbWriteOptions { RestUrl = Url!, Password = Pw }), Options.Create(new EvidenceArchiveOptions()));
    }

    private static async Task NonQuery(string sql)
    {
        using var http = new HttpClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.ASCII.GetBytes($"root:{Pw}")));
        await http.PostAsync($"{Url}/rest/v2/nonQuery", new StringContent(JsonSerializer.Serialize(new { sql }), Encoding.UTF8, "application/json"));
    }

    [Fact]
    public async Task The_labs_archived_sets_verify_against_the_labs_raw_tree_and_rebuild_bit_for_bit()
    {
        var cs = Environment.GetEnvironmentVariable("CPLM_TEST_DB");
        if (string.IsNullOrEmpty(Url) || string.IsNullOrEmpty(cs)) return;
        await using var conn = new NpgsqlConnection(cs);
        var packs = (await conn.QueryAsync<(string loop_id, byte[] payload)>(
            "SELECT loop_id, payload FROM analytics.evidence_archive WHERE codec = 'cpax1' ORDER BY window_end DESC LIMIT 12")).ToList();
        if (packs.Count == 0) return;
        var reader = Reader();
        var opts = new EvidenceArchiveOptions();
        long before = 0, after = 0;
        var referencedSets = 0;
        foreach (var (loop, payload) in packs)
        {
            var stats = new EvidenceTraceArchiveStats();
            var original = EvidenceArchivePack.Unpack(payload);
            var traced = await new EvidenceTraceReferencer(reader, opts, LoopPrefix, stats).ApplyAsync(loop, original, 30, CancellationToken.None);
            var repacked = EvidenceArchivePack.Pack(traced);
            before += payload.Length;
            after += repacked.Length;
            _out.WriteLine($"{loop}: {payload.Length} -> {repacked.Length} B, referenced {stats.ReferencedColumns} column(s) in {stats.ReferencedArtifacts} artifact(s), " +
                           $"inline {string.Join(",", stats.InlineByReason.Select(kv => $"{kv.Key}={kv.Value}"))}");
            if (stats.ReferencedArtifacts > 0) referencedSets++;
            var rehydrator = new EvidenceTraceRehydrator(reader, opts, LoopPrefix, new EvidenceTraceReadStats());
            foreach (var a in EvidenceArchivePack.Unpack(repacked).Where(a => a.Trace is not null))
            {
                var built = await rehydrator.ResolveAsync(a, DateTime.UtcNow, CancellationToken.None);
                built.Unavailable.Should().BeNull(built.Unavailable?.Reason);
                var orig = original.Single(o => o.Manifest.EvidenceId == a.Manifest.EvidenceId);
                EvidenceTraceCodec.Inflate(built.Chunks).Should().Equal(EvidenceTraceCodec.Inflate(orig.Chunks), "the decoded stream is the engine's");
            }
        }
        _out.WriteLine($"lab: {packs.Count} set(s) {before} -> {after} B ({100.0 * (before - after) / before:F1} % saved); {referencedSets} with references");
        referencedSets.Should().BeGreaterThan(0, "the lab's raw tree is DOUBLE and holds the samples the engine saw");
    }

    [Fact]
    public async Task A_float_series_references_float_values_exactly_and_refuses_full_doubles()
    {
        if (string.IsNullOrEmpty(Url)) return;
        const string loop = "TRC_FLOAT1";
        var device = $"{ScratchDb}.{loop}";
        var n = 200;
        var t0 = DateTimeOffset.UtcNow.AddDays(-1).ToUnixTimeMilliseconds() / 1000 * 1000;
        var rng = new Random(5);
        var pv = Enumerable.Range(0, n).Select(_ => (double)(float)(50 + rng.NextDouble() * 10)).ToArray();   // a 32-bit source
        var op = Enumerable.Range(0, n).Select(_ => 30 + rng.NextDouble() * 10).ToArray();                    // 64-bit (the lab sim)
        try
        {
            await NonQuery($"CREATE DATABASE {ScratchDb}");
            await NonQuery($"CREATE TIMESERIES {device}.pv WITH DATATYPE=FLOAT");
            await NonQuery($"CREATE TIMESERIES {device}.op WITH DATATYPE=FLOAT");
            await NonQuery($"CREATE TIMESERIES {device}.vp WITH DATATYPE=FLOAT");
            for (var i = 0; i < n; i += 50)
                await NonQuery($"INSERT INTO {device}(time, pv, op) VALUES " + string.Join(",", Enumerable.Range(i, 50)
                    .Select(k => $"({t0 + k * 5000L},{pv[k].ToString("R", System.Globalization.CultureInfo.InvariantCulture)},{op[k].ToString("R", System.Globalization.CultureInfo.InvariantCulture)})")));
            var x = Enumerable.Range(0, n).Select(k => (double)(t0 + k * 5000L)).ToArray();
            var cols = new[] { x, op, op, Enumerable.Repeat(1d, n).ToArray() };
            var all = EvidenceTraceSeed.Encode(cols);
            var g11 = EvidenceTraceSeed.Encode(new[] { x, pv });
            ArchivedArtifact Art(string gate, string kind, string[] names, byte[] bytes) => new(new ArchivedManifest(Guid.NewGuid(), Guid.NewGuid(), gate, kind,
                null, "sample_time", "ms_epoch", "y", "EU", "f64", JsonSerializer.Serialize(names), "f64le+gzip", n, n, 1, bytes.Length,
                EvidenceArchiveSeed.Sha(bytes), JsonSerializer.Serialize(new[] { EvidenceArchiveSeed.Sha(bytes) }), "COMPLETE", null, "{}", "TRANSIENT",
                false, null, null, DateTime.UtcNow, DateTime.UtcNow, null, null, null), new[] { new EvidenceChunkSpec(0, EvidenceArchiveSeed.Sha(bytes), bytes) });
            var set = new[] { Art("G11", "measurement", new[] { "x", "y" }, g11), Art("G10", "actuator_limits", new[] { "x", "y", "u_requested", "validity" }, all) };
            var stats = new EvidenceTraceArchiveStats();
            var opts = new EvidenceArchiveOptions();
            var traced = await new EvidenceTraceReferencer(Reader(), opts, ScratchDb, stats).ApplyAsync(loop, set, 30, CancellationToken.None);
            _out.WriteLine($"FLOAT device: referenced {stats.ReferencedColumns}, inline {string.Join(",", stats.InlineByReason.Select(kv => $"{kv.Key}={kv.Value}"))}");
            stats.ReferencedColumns.Should().Be(3, "x of both artifacts and the float-representable pv");
            stats.InlineByReason[TraceInlineReason.Mismatch].Should().Be(2, "64-bit op values do not survive a FLOAT historian");
            var rehydrator = new EvidenceTraceRehydrator(Reader(), opts, ScratchDb, new EvidenceTraceReadStats());
            foreach (var a in traced.Where(a => a.Trace is not null))
            {
                var built = await rehydrator.ResolveAsync(a, DateTime.UtcNow, CancellationToken.None);
                built.Unavailable.Should().BeNull(built.Unavailable?.Reason);
                EvidenceTraceCodec.Inflate(built.Chunks).Should().Equal(EvidenceTraceCodec.Inflate(set.Single(s => s.Manifest.EvidenceId == a.Manifest.EvidenceId).Chunks));
            }
        }
        finally { await NonQuery($"DELETE DATABASE {ScratchDb}"); }
    }
}
