// CHG-102 Phase 5b-1 - synthetic boundary evidence sets, stored the way CplmEvidenceConsumerService stores them
// (PostgresEvidenceBlobStore: manifest upsert, chunk puts, readiness COMPLETE). The artifacts are realistic in shape:
// f64 little-endian columns (time + values quantised to instrument resolution) gzip-compressed and split into chunks,
// with the per-chunk and whole-artifact SHA-256 the Flink chunker declares.
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using Dapper;
using Npgsql;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Tests;

internal sealed record SeededSet(Guid SetId, string LoopId, string WindowKind, DateTime WindowEnd, Guid[] MethodRuns, Guid[] EvidenceIds, long ChunkBytes);

internal static class EvidenceArchiveSeed
{
    public static string Sha(byte[] b) => Convert.ToHexString(SHA256.HashData(b)).ToLowerInvariant();

    public static async Task RegisterLoopAsync(NpgsqlDataSource db, string loopId, string site)
    {
        await using var conn = await db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            INSERT INTO cpm.loop_registry (loop_id, display_name, loop_type, site, area, unit, monitoring)
            VALUES (@loopId, 'archive probe', 'FIC', @site, 'a', 'u', '{"enabled":true}'::jsonb) ON CONFLICT (loop_id) DO NOTHING
            """, new { loopId, site });
    }

    /// <summary>gzip(f64 LE) of n samples of (time, value[, mask]) - one artifact's byte stream.</summary>
    public static byte[] ArtifactBytes(int n, int columns, int seed)
    {
        var rng = new Random(seed);
        using var raw = new MemoryStream();
        using (var w = new BinaryWriter(raw, System.Text.Encoding.UTF8, leaveOpen: true))
        {
            var t0 = 1_762_000_000_000d;
            for (var i = 0; i < n; i++)
            {
                w.Write(t0 + i * 15_000d);                                                               // time, ms epoch
                w.Write(Math.Round(50 + 5 * Math.Sin(i / 37.0) + rng.NextDouble() * 0.4, 2));           // value, 0.01 EU
                if (columns > 2) w.Write(rng.NextDouble() < 0.02 ? 1d : 0d);                            // sparse mask
            }
        }
        using var gz = new MemoryStream();
        using (var z = new GZipStream(gz, CompressionLevel.Optimal, leaveOpen: true)) z.Write(raw.ToArray());
        return gz.ToArray();
    }

    /// <summary>
    /// One boundary set: <paramref name="runs"/> method runs x <paramref name="perRun"/> artifacts, emission reason as given.
    /// <paramref name="incomplete"/> artifacts keep their last chunk back (PENDING, as a stalled stream would leave them).
    /// </summary>
    public static async Task<SeededSet> SeedSetAsync(NpgsqlDataSource db, string loopId, string windowKind, DateTime windowEnd,
        int runs = 2, int perRun = 3, string emissionReason = "BOUNDARY", int incomplete = 0, int chunkSize = 4096, int seed = 1)
    {
        var store = new PostgresEvidenceBlobStore(db);
        var setId = Guid.NewGuid();
        var hours = windowKind == "24h" ? 24 : 12;
        var endMs = new DateTimeOffset(windowEnd).ToUnixTimeMilliseconds();
        var runIds = Enumerable.Range(0, runs).Select(_ => Guid.NewGuid()).ToArray();
        var ids = new List<Guid>();
        long bytes = 0;
        var rng = new Random(seed);
        var k = 0;
        foreach (var run in runIds)
            for (var a = 0; a < perRun; a++, k++)
            {
                var columns = a % 2 == 0 ? 2 : 3;
                var all = ArtifactBytes(240 + rng.Next(2640), columns, seed * 1000 + k);
                var chunks = all.Chunk(chunkSize).ToArray();
                var id = Guid.NewGuid();
                ids.Add(id);
                bytes += all.Length;
                var provenance = new Dictionary<string, object?>
                {
                    ["loop_id"] = loopId, ["window_kind"] = windowKind, ["purpose"] = "LIVE",
                    ["window_start_ms"] = endMs - hours * 3_600_000L, ["window_end_ms"] = endMs,
                    ["bundle_hash"] = "b:archive", ["dataset_hash"] = "d:" + k, ["emission_reason"] = emissionReason,
                };
                if (emissionReason == "BOUNDARY")
                {
                    provenance["boundary_kind"] = windowKind;
                    provenance["plant_tz"] = "Asia/Tehran";
                    provenance["boundary_local_end"] = new DateTimeOffset(windowEnd).ToOffset(TimeSpan.FromMinutes(210)).ToString("yyyy-MM-dd'T'HH:mm:sszzz");
                    provenance["boundary_set_id"] = setId.ToString();
                }
                var manifest = JsonSerializer.SerializeToElement(new Dictionary<string, object?>
                {
                    ["evidence_id"] = id.ToString(), ["method_run_id"] = run.ToString(), ["gate_id"] = "G" + (9 + a % 3),
                    ["artifact_kind"] = "kind_" + a, ["role_or_path"] = a % 2 == 0 ? "PV" : null,
                    ["x_quantity"] = "sample_time", ["x_unit"] = "ms_epoch", ["y_quantity"] = "pv", ["y_unit"] = "EU",
                    ["data_type"] = "f64", ["columns"] = columns == 2 ? new[] { "x", "y" } : new[] { "x", "y", "mask" },
                    ["encoding"] = "f64le+gzip", ["calculation_samples"] = 2880, ["display_points"] = 1440,
                    ["chunk_count"] = chunks.Length, ["total_bytes"] = all.Length, ["sha256"] = Sha(all),
                    ["chunk_sha256"] = chunks.Select(Sha).ToArray(), ["provenance"] = provenance,
                    ["sourceCommit"] = "abc1234", ["jarSha256"] = "f00d",
                });
                await store.UpsertManifestAsync(manifest, CancellationToken.None);
                var held = k < incomplete ? chunks.Length - 1 : chunks.Length;
                for (var c = 0; c < held; c++) await store.PutChunkAsync(id, c, Sha(chunks[c]), chunks[c], CancellationToken.None);
                if (held == chunks.Length) await store.SetReadinessAsync(id, "COMPLETE", null, CancellationToken.None);
            }
        return new SeededSet(setId, loopId, windowKind, windowEnd, runIds, ids.ToArray(), bytes);
    }

    /// <summary>The live rows of a set, gone (as the TRANSIENT sweep leaves them; chunks cascade).</summary>
    public static async Task SweepLiveAsync(NpgsqlDataSource db, SeededSet set)
    {
        await using var conn = await db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest WHERE evidence_id = ANY(@ids)", new { ids = set.EvidenceIds });
    }

    public static EvidenceArchiver Archiver(NpgsqlDataSource db, EvidenceArchiveStats? stats = null) =>
        new(db, new EvidenceArchiveOptions(), stats ?? new EvidenceArchiveStats());

    /// <summary>A UTC window end on a whole 12 h boundary, <paramref name="daysAgo"/> days back (minus the settle margin).</summary>
    public static DateTime BoundaryEnd(int daysAgo, int hour = 0)
    {
        var d = DateTime.UtcNow.Date.AddDays(-daysAgo).AddHours(hour);
        return DateTime.SpecifyKind(d, DateTimeKind.Utc);
    }
}
