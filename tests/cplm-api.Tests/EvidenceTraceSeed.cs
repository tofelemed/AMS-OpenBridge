// CHG-102 Phase 5b-2 - a realistic long-tier boundary set laid out as the Flink builders lay it out (LongArtifacts.java:
// G11 measurement, G9 corners, G10 actuator_limits, G5 preprocessed_signal with the raw sample axis and raw pv / op, plus
// derived-only artifacts G6 psd and G7 cycle_fit), every artifact column-major f64le + gzip as EvidenceChunker.encode, and
// a fake historian holding the same raw samples the engine saw (the raw writer's pv / op / vp of the loop device).
using System.IO.Compression;
using System.Text.Json;
using Npgsql;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Tests;

/// <summary>A fake raw historian: one device per loop, ascending rows, DOUBLE values; <see cref="Down"/> = IoTDB unavailable.</summary>
internal sealed class FakeHistorian : IIotDbSeriesReader
{
    public sealed class Device
    {
        public long[] Ts = Array.Empty<long>();
        public Dictionary<string, double?[]> Values = new();
    }
    public Dictionary<string, Device> Devices { get; } = new(StringComparer.Ordinal);
    public bool Down { get; set; }
    public int Calls { get; private set; }

    public Task<IotDbSeries> ReadSeriesAsync(string device, IReadOnlyList<string> measurements, long fromMs, long toMs, int maxRows, CancellationToken ct)
    {
        Calls++;
        if (Down) return Task.FromResult(IotDbSeries.Fail("HttpRequestException: connection refused"));
        if (!Devices.TryGetValue(device, out var d))
            return Task.FromResult(new IotDbSeries(Array.Empty<long>(), new Dictionary<string, double?[]>(), new Dictionary<string, string>(), false, null));
        var rows = Enumerable.Range(0, d.Ts.Length)
            .Where(i => d.Ts[i] >= fromMs && d.Ts[i] <= toMs && measurements.Any(m => d.Values.TryGetValue(m, out var c) && c[i] is not null))
            .Take(maxRows).ToArray();
        var values = measurements.Where(d.Values.ContainsKey).ToDictionary(m => m, m => rows.Select(i => d.Values[m][i]).ToArray());
        return Task.FromResult(new IotDbSeries(rows.Select(i => d.Ts[i]).ToArray(), values,
            values.Keys.ToDictionary(k => k, _ => "DOUBLE"), false, null));
    }
}

internal sealed record TraceSet(SeededSet Set, Dictionary<Guid, (string Kind, string[] Columns, double[][] Values)> Artifacts,
    long[] Ts, double[] Pv, double[] Op);

internal static class EvidenceTraceSeed
{
    public const string Prefix = "root.tst.cpm";

    /// <summary>The Flink encoding (column after column, gzip). Fastest, so the bytes differ from a .NET Optimal rebuild
    /// the way Java's deflate output would.</summary>
    public static byte[] Encode(double[][] cols)
    {
        using var gzOut = new MemoryStream();
        using (var gz = new GZipStream(gzOut, CompressionLevel.Fastest, leaveOpen: true))
            foreach (var c in cols) gz.Write(EvidenceTraceCodec.ToBytes(c));
        return gzOut.ToArray();
    }

    public static double[][] Decode(byte[] all, int columns, int n)
    {
        var cols = EvidenceTraceCodec.SplitColumns(EvidenceTraceCodec.Inflate(new[] { new EvidenceChunkSpec(0, "", all) }), columns, n)!;
        return cols.Select(EvidenceTraceCodec.ToDoubles).ToArray();
    }

    /// <summary>Seeds the set and fills <paramref name="historian"/> with the loop's raw samples (5 s apart).</summary>
    public static async Task<TraceSet> SeedAsync(NpgsqlDataSource db, FakeHistorian historian, string loopId, DateTime windowEnd, int n,
        string windowKind = "12h", int seed = 3, int cycles = 10)
    {
        var rng = new Random(seed);
        var endMs = new DateTimeOffset(windowEnd).ToUnixTimeMilliseconds();
        var t0 = endMs - n * 5_000L;
        var ts = Enumerable.Range(0, n).Select(i => t0 + i * 5_000L + (i % 7 == 0 ? 3 : 0)).ToArray();   // a little jitter
        var pv = Enumerable.Range(0, n).Select(i => 50 + 4 * Math.Sin(i / 41.0) + rng.NextDouble() * 0.7).ToArray();
        var op = Enumerable.Range(0, n).Select(i => 35 + 9 * Math.Sin(i / 41.0 + 0.6) + rng.NextDouble() * 1.3).ToArray();
        historian.Devices[EvidenceTraceReferencer.DeviceOf(Prefix, loopId)] = new FakeHistorian.Device
        {
            Ts = ts.ToArray(),
            Values = new()
            {
                ["pv"] = pv.Select(v => (double?)v).ToArray(), ["op"] = op.Select(v => (double?)v).ToArray(),
                ["vp"] = new double?[n],
            },
        };
        var x = ts.Select(t => (double)t).ToArray();
        var nan = Enumerable.Repeat(EvidenceTraceCodec.JavaNaN, n).ToArray();
        double[] Flags(double p) => Enumerable.Range(0, n).Select(_ => rng.NextDouble() < p ? 1d : 0d).ToArray();
        var mean = pv.Average();
        var specs = new List<(string Gate, string Kind, string Role, string XQ, string XU, string[] Names, double[][] Cols)>
        {
            ("G11", "measurement", "PV", "sample_time", "ms_epoch", new[] { "x", "y", "delta_pv", "spikes" },
                new[] { x, pv, pv.Select((v, i) => i == 0 ? EvidenceTraceCodec.JavaNaN : v - pv[i - 1]).ToArray(), Flags(0.01) }),
            ("G9", "corners", "PV_VS_U", "sample_time", "ms_epoch", new[] { "x", "y", "mask", "qualified" },
                new[] { x, Enumerable.Range(0, n).Select(_ => rng.NextDouble() * Math.PI).ToArray(), Flags(0.05), Flags(0.5) }),
            ("G10", "actuator_limits", "OP", "sample_time", "ms_epoch",
                new[] { "x", "y", "u_requested", "vp", "tracking_error", "active_low", "active_high", "validity" },
                new[] { x, op, op, nan, nan, Flags(0.02), Flags(0.02), Enumerable.Repeat(1d, n).ToArray() }),
            ("G5", "preprocessed_signal", "OP", "sample_time", "ms_epoch", new[] { "x", "y" },
                new[] { x, pv.Select(v => v - mean).ToArray() }),
            ("G6", "psd", "OP", "frequency_hz", "Hz", new[] { "x", "y", "mask" },
                new[] { Enumerable.Range(0, 513).Select(i => i / 1024.0 / 5).ToArray(), Enumerable.Range(0, 513).Select(_ => rng.NextDouble()).ToArray(),
                        Enumerable.Range(0, 513).Select(i => i % 50 == 0 ? 1d : 0d).ToArray() }),
        };
        for (var c = 0; c < cycles; c++)
        {
            var m = 60;
            specs.Add(("G7", "cycle_fit", "CYCLE_" + c, "phase", "cycle_fraction", new[] { "x", "y", "sine_fit", "triangle_fit", "original_indices" },
                new[] { Enumerable.Range(0, m).Select(i => i / (double)m).ToArray(), Enumerable.Range(0, m).Select(_ => rng.NextDouble()).ToArray(),
                        Enumerable.Range(0, m).Select(i => Math.Sin(i / 9.5)).ToArray(), Enumerable.Range(0, m).Select(i => (i % 30) / 30.0).ToArray(),
                        Enumerable.Range(c * m, m).Select(i => (double)i).ToArray() }));
        }

        var store = new PostgresEvidenceBlobStore(db);
        var setId = Guid.NewGuid();
        var runs = specs.Select(s => s.Gate).Distinct().ToDictionary(g => g, _ => Guid.NewGuid());
        var ids = new List<Guid>();
        var artifacts = new Dictionary<Guid, (string, string[], double[][])>();
        long bytes = 0;
        foreach (var s in specs)
        {
            var all = Encode(s.Cols);
            var chunks = all.Chunk(EvidenceTraceCodec.ChunkBytes).ToArray();
            var id = Guid.NewGuid();
            ids.Add(id);
            artifacts[id] = (s.Kind, s.Names, s.Cols);
            bytes += all.Length;
            var provenance = new Dictionary<string, object?>
            {
                ["loop_id"] = loopId, ["window_kind"] = windowKind, ["purpose"] = "LIVE",
                ["window_start_ms"] = endMs - (windowKind == "24h" ? 24 : 12) * 3_600_000L, ["window_end_ms"] = endMs,
                ["emission_reason"] = "BOUNDARY", ["boundary_kind"] = windowKind, ["boundary_set_id"] = setId.ToString(),
            };
            var manifest = JsonSerializer.SerializeToElement(new Dictionary<string, object?>
            {
                ["evidence_id"] = id.ToString(), ["method_run_id"] = runs[s.Gate].ToString(), ["gate_id"] = s.Gate,
                ["artifact_kind"] = s.Kind, ["role_or_path"] = s.Role, ["x_quantity"] = s.XQ, ["x_unit"] = s.XU,
                ["y_quantity"] = "y", ["y_unit"] = "EU", ["data_type"] = "f64", ["columns"] = s.Names, ["encoding"] = "f64le+gzip",
                ["calculation_samples"] = s.Cols[0].Length, ["display_points"] = Math.Min(2000, s.Cols[0].Length),
                ["chunk_count"] = chunks.Length, ["total_bytes"] = all.Length, ["sha256"] = EvidenceArchiveSeed.Sha(all),
                ["chunk_sha256"] = chunks.Select(EvidenceArchiveSeed.Sha).ToArray(), ["provenance"] = provenance,
            });
            await store.UpsertManifestAsync(manifest, CancellationToken.None);
            for (var c = 0; c < chunks.Length; c++) await store.PutChunkAsync(id, c, EvidenceArchiveSeed.Sha(chunks[c]), chunks[c], CancellationToken.None);
            await store.SetReadinessAsync(id, "COMPLETE", null, CancellationToken.None);
        }
        var set = new SeededSet(setId, loopId, windowKind, windowEnd, runs.Values.ToArray(), ids.ToArray(), bytes);
        return new TraceSet(set, artifacts, ts, pv, op);
    }

    public static EvidenceArchiveOptions Options(bool traces = true) => new() { TraceReferences = traces, HistorianRetentionDays = 90 };

    public static EvidenceArchiver Archiver(NpgsqlDataSource db, FakeHistorian h, EvidenceArchiveStats stats, EvidenceArchiveOptions? opts = null)
    {
        var o = opts ?? Options();
        return new EvidenceArchiver(db, o, stats, null, new EvidenceTraceReferencer(h, o, Prefix, stats.Traces));
    }

    public static EvidenceTraceRehydrator Rehydrator(FakeHistorian h, EvidenceTraceReadStats? stats = null) =>
        new(h, Options(), Prefix, stats ?? new EvidenceTraceReadStats());
}
