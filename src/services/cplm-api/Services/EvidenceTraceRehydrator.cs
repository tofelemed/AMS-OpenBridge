using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace Traverse.CplmApi.Services;

/// <summary>
/// CHG-102 Phase 5b-2 — "verify, then reference", the read side. A trace-form archived artifact is re-assembled: the
/// referenced columns are re-read from the historian (same query, same range as when they were verified), each must
/// reproduce the SHA-256 of the original column, the whole uncompressed stream must reproduce the original stream's
/// SHA-256, and only then is it re-encoded as the Flink chunker does (f64le columns, gzip, 256 KiB chunks).
///
/// The decoded values are the engine's, bit for bit; the gzip bytes are .NET's and may differ from Java's, so the served
/// manifest carries the REBUILT checksums (artifact, chunks, byte count, chunk count - what the frontend decoder verifies),
/// provenance gains <c>trace_source: "historian"</c> plus the archived original checksum, and the ETag follows.
///
/// A historian that does not answer, a series that no longer reproduces a checksum, or a window past the historian's
/// retention makes THAT artifact unavailable (manifest readiness EXPIRED with the reason, chunk route 503 / 409); the rest
/// of the set is served. Successful rebuilds are kept for a few minutes (a manifest read is followed by the bundle).
/// </summary>
public sealed class EvidenceTraceRehydrator
{
    private readonly IIotDbSeriesReader _reader;
    private readonly EvidenceArchiveOptions _opts;
    private readonly string _prefix;
    private readonly EvidenceTraceReadStats _stats;
    private readonly ILogger? _log;
    private readonly ConcurrentDictionary<Guid, (DateTime At, ArchivedArtifact Artifact)> _cache = new();
    private const int CacheEntries = 64;
    private static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(10);

    public EvidenceTraceRehydrator(IIotDbSeriesReader reader, IOptions<EvidenceArchiveOptions> opts, IOptions<IotDbWriteOptions> iotdb,
        EvidenceTraceReadStats stats, ILogger<EvidenceTraceRehydrator>? log = null)
        : this(reader, opts.Value, iotdb.Value.LoopRootPrefix, stats, log) { }

    public EvidenceTraceRehydrator(IIotDbSeriesReader reader, EvidenceArchiveOptions opts, string loopRootPrefix,
        EvidenceTraceReadStats stats, ILogger? log = null)
    {
        _reader = reader;
        _opts = opts;
        _prefix = loopRootPrefix;
        _stats = stats;
        _log = log;
    }

    public EvidenceTraceReadStats Stats => _stats;

    /// <summary>Every artifact servable: verbatim ones as they are, trace-form ones rebuilt or marked unavailable.</summary>
    public async Task<IReadOnlyList<ArchivedArtifact>> ResolveAllAsync(IEnumerable<ArchivedArtifact> artifacts, CancellationToken ct)
    {
        var list = new List<ArchivedArtifact>();
        foreach (var a in artifacts) list.Add(await ResolveAsync(a, DateTime.UtcNow, ct));
        return list;
    }

    /// <summary>A trace-form artifact with no rehydrator to rebuild it (a caller without the historian).</summary>
    public static ArchivedArtifact NotConfigured(ArchivedArtifact a) => a.Trace is null ? a
        : Unavailable(a, new TraceFailure(TraceFailure.NotConfigured, "this reader has no historian access to rebuild the referenced trace", true));

    public async Task<ArchivedArtifact> ResolveAsync(ArchivedArtifact a, DateTime utcNow, CancellationToken ct)
    {
        if (a.Trace is not { } trace) return a;
        var id = a.Manifest.EvidenceId;
        if (_cache.TryGetValue(id, out var hit) && utcNow - hit.At < CacheFor) { _stats.OnCacheHit(); return hit.Artifact; }
        var built = await RebuildAsync(a, trace, utcNow, ct);
        if (built.Unavailable is { } f)
        {
            _stats.OnFailure(f.Code, f.Reason);
            _log?.LogWarning("Archived evidence {Evidence}: referenced trace not served - {Code}: {Reason}", id, f.Code, f.Reason);
            return built;
        }
        _stats.OnRebuilt();
        if (_cache.Count >= CacheEntries)
            foreach (var old in _cache.OrderBy(kv => kv.Value.At).Take(_cache.Count - CacheEntries + 1)) _cache.TryRemove(old.Key, out _);
        _cache[id] = (utcNow, built);
        return built;
    }

    private async Task<ArchivedArtifact> RebuildAsync(ArchivedArtifact a, ArchivedTrace trace, DateTime utcNow, CancellationToken ct)
    {
        var form = trace.Form;
        var oldest = new DateTimeOffset(utcNow.ToUniversalTime()).AddDays(-Math.Max(1, _opts.HistorianRetentionDays)).ToUnixTimeMilliseconds();
        if (form.FromMs < oldest)
            return Unavailable(a, new TraceFailure(TraceFailure.HistorianExpired,
                $"the window starts before the historian's retention ({_opts.HistorianRetentionDays} d)", false));
        IotDbSeries? series = null;
        string? device = null;
        // the device it was verified on, then the loop's device under today's prefix (a tree move since)
        foreach (var d in new[] { form.Device, EvidenceTraceReferencer.DeviceOf(_prefix, form.Loop) }.Distinct(StringComparer.Ordinal))
        {
            var s = await _reader.ReadSeriesAsync(d, form.Query, form.FromMs, form.ToMs, form.N + 1, ct);
            if (s.Degraded)
                return Unavailable(a, new TraceFailure(TraceFailure.HistorianUnavailable, $"historian read failed on {d}: {s.Error}", true));
            series = s;
            device = d;
            if (s.Timestamps.Length > 0) break;
        }
        if (series!.Timestamps.Length != form.N)
            return Unavailable(a, Differs($"{device} holds {series.Timestamps.Length} row(s) in the window, the archive {form.N}"));
        var columns = new byte[form.Cols.Length][];
        for (var k = 0; k < form.Cols.Length; k++)
        {
            var col = form.Cols[k];
            if (col.R is { } r)
            {
                var rebuilt = EvidenceTraceCodec.Rebuild(series, 0, form.N, r.Source);
                if (rebuilt is null) return Unavailable(a, Differs($"{device} has no {r.Source} series"));
                columns[k] = EvidenceTraceCodec.ToBytes(rebuilt);
                if (!string.Equals(EvidenceArchivePack.Sha256Hex(columns[k]), r.Sha, StringComparison.OrdinalIgnoreCase))
                    return Unavailable(a, Differs($"column {col.Name} ({r.Source} on {device}) no longer matches its archived checksum"));
            }
            else
            {
                columns[k] = trace.Inline[k] is { } packed ? ArchivedTrace.Decompress(packed) : Array.Empty<byte>();
                if (columns[k].Length != form.N * 8) return Unavailable(a, Differs($"inline column {col.Name} is malformed"));
            }
        }
        if (!string.Equals(EvidenceTraceCodec.StreamSha(columns), form.StreamSha, StringComparison.OrdinalIgnoreCase))
            return Unavailable(a, Differs("the re-assembled stream does not match the archived stream checksum"));
        var (chunks, sha, total) = EvidenceTraceCodec.Encode(columns);
        var m = a.Manifest;
        var manifest = m with
        {
            Sha256 = sha,
            ChunkSha256 = JsonSerializer.Serialize(chunks.Select(c => c.Sha256).ToArray()),
            ChunkCount = chunks.Count,
            TotalBytes = total,
            Provenance = Flag(m.Provenance, device!, m.Sha256, m.ChunkCount, m.TotalBytes, sha == m.Sha256, null),
        };
        return new ArchivedArtifact(manifest, chunks);
    }

    private static TraceFailure Differs(string reason) => new(TraceFailure.HistorianDiffers, reason, false);

    private static ArchivedArtifact Unavailable(ArchivedArtifact a, TraceFailure f)
    {
        var m = a.Manifest with
        {
            Readiness = "EXPIRED",
            ReadinessReason = $"{f.Code}: {f.Reason}",
            Provenance = Flag(a.Manifest.Provenance, a.Trace?.Form.Device, a.Manifest.Sha256, a.Manifest.ChunkCount, a.Manifest.TotalBytes, false, f.Code),
        };
        return new ArchivedArtifact(m, Array.Empty<EvidenceChunkSpec>(), a.Trace, f);
    }

    /// <summary>The provenance with the trace marks: where the columns came from and the checksums archived originally.</summary>
    private static string Flag(string provenance, string? device, string archivedSha, int archivedChunks, long archivedBytes, bool byteIdentical, string? error)
    {
        var o = (JsonNode.Parse(provenance) as JsonObject) ?? new JsonObject();
        o["trace_source"] = "historian";
        o["trace_device"] = device;
        o["trace_archived_sha256"] = archivedSha;
        o["trace_archived_chunk_count"] = archivedChunks;
        o["trace_archived_total_bytes"] = archivedBytes;
        o["trace_byte_identical"] = byteIdentical;
        if (error is not null) o["trace_error"] = error;
        return o.ToJsonString();
    }
}
