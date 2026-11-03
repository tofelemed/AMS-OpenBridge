using System.Collections.Concurrent;

namespace Traverse.CplmApi.Services;

/// <summary>Why a candidate raw column stayed inline in the archive.</summary>
public static class TraceInlineReason
{
    /// <summary>The historian's series differs from the column (a point, a timestamp, the count, a normalised OP).</summary>
    public const string Mismatch = "mismatch";
    /// <summary>The historian could not be asked or did not answer: the set is archived inline, never held back.</summary>
    public const string Unavailable = "iotdbUnavailable";
    /// <summary>Fewer samples than Cplm:EvidenceArchive:MinTracePoints.</summary>
    public const string TooFewPoints = "tooFewPoints";
    /// <summary>The archive's retention outlives the historian's (HistorianRetentionDays): a reference would dangle.</summary>
    public const string Retention = "retention";
    /// <summary>The artifact's own bytes do not decode as columns x samples f64.</summary>
    public const string Undecodable = "undecodable";
}

/// <summary>CHG-102 Phase 5b-2 — archive-side counters of the trace references, for /health consumers.evidenceArchive.traces.</summary>
public sealed class EvidenceTraceArchiveStats
{
    private long _columns, _artifacts, _saved;
    private readonly ConcurrentDictionary<string, long> _inline = new(StringComparer.Ordinal);
    public long ReferencedColumns => Interlocked.Read(ref _columns);
    public long ReferencedArtifacts => Interlocked.Read(ref _artifacts);
    /// <summary>Original chunk bytes of the referenced artifacts minus what the archive stores for them instead.</summary>
    public long BytesSaved => Interlocked.Read(ref _saved);
    public IReadOnlyDictionary<string, long> InlineByReason => new SortedDictionary<string, long>(_inline);

    public void OnReferenced(int columns, long saved)
    {
        Interlocked.Add(ref _columns, columns);
        Interlocked.Increment(ref _artifacts);
        Interlocked.Add(ref _saved, saved);
    }
    public void OnInline(string reason, int columns = 1) => _inline.AddOrUpdate(reason, columns, (_, v) => v + columns);
}

/// <summary>CHG-102 Phase 5b-2 — read-side counters (rebuilds from the historian), for /health.</summary>
public sealed class EvidenceTraceReadStats
{
    private long _rebuilt, _cacheHits;
    private readonly ConcurrentDictionary<string, long> _failures = new(StringComparer.Ordinal);
    public long Rebuilt => Interlocked.Read(ref _rebuilt);
    public long CacheHits => Interlocked.Read(ref _cacheHits);
    public IReadOnlyDictionary<string, long> FailuresByReason => new SortedDictionary<string, long>(_failures);
    public string? LastFailure { get; private set; }

    public void OnRebuilt() => Interlocked.Increment(ref _rebuilt);
    public void OnCacheHit() => Interlocked.Increment(ref _cacheHits);
    public void OnFailure(string code, string reason)
    {
        _failures.AddOrUpdate(code, 1, (_, v) => v + 1);
        LastFailure = reason;
    }
}
