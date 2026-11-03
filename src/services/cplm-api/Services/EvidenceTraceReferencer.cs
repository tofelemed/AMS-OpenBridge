namespace Traverse.CplmApi.Services;

/// <summary>
/// CHG-102 Phase 5b-2 — "verify, then reference", the archive side. For the artifacts of one boundary set that carry raw
/// sample columns (<see cref="EvidenceTraceMap"/>), the loop's raw series is read from the historian ONCE for the set
/// (<see cref="TraceSource.Query"/> over the union of the artifacts' time ranges) and each candidate column is compared
/// with it: the same number of rows in [x first, x last], every timestamp equal to x, every value - converted to double
/// exactly as stored - bit-equal to the column. Only then is the column replaced by a <see cref="TraceRef"/> carrying the
/// SHA-256 of the original column bytes; anything else keeps the column inline and counts the reason. An artifact with no
/// referenced column stays verbatim (its original chunk bytes, served byte for byte). The historian being unavailable
/// never blocks or fails archiving: the set is archived inline.
/// </summary>
public sealed class EvidenceTraceReferencer
{
    private readonly IIotDbSeriesReader? _reader;
    private readonly EvidenceArchiveOptions _opts;
    private readonly string _prefix;
    private readonly EvidenceTraceArchiveStats _stats;
    private readonly ILogger? _log;

    public EvidenceTraceReferencer(IIotDbSeriesReader? reader, EvidenceArchiveOptions opts, string loopRootPrefix,
        EvidenceTraceArchiveStats stats, ILogger? log = null)
    {
        _reader = reader;
        _opts = opts;
        _prefix = loopRootPrefix;
        _stats = stats;
        _log = log;
    }

    /// <summary>The historian device of a loop under a root prefix (the raw writer's convention).</summary>
    public static string DeviceOf(string prefix, string loopId) => prefix.TrimEnd('.') + "." + IotDbWriteClient.SafeNode(loopId);

    /// <summary>True when the archive's retention fits inside the historian's (a 24 h window's first sample predates its
    /// partition day by up to 1 d, and the partition is dropped a day after it ended).</summary>
    public bool RetentionFits(int? archiveDays) => archiveDays is int d && _opts.HistorianRetentionDays >= d + 2;

    private sealed record Candidate(int Index, ArchivedArtifact Artifact, string[] Names, byte[][] Cols,
        IReadOnlyList<(string Column, string Source)> Map, int N, long FromMs, long ToMs);

    /// <summary>The set's artifacts with verified raw columns referenced (the rest unchanged).</summary>
    public async Task<IReadOnlyList<ArchivedArtifact>> ApplyAsync(string loopId, IReadOnlyList<ArchivedArtifact> kept, int? archiveDays,
        CancellationToken ct)
    {
        if (_opts.TraceReferences == false || _reader is null) return kept;   // built only when the job enabled it (auto = layout v2)
        var candidates = new List<Candidate>();
        var retentionFits = RetentionFits(archiveDays);
        for (var i = 0; i < kept.Count; i++)
        {
            var a = kept[i];
            var names = EvidenceTraceCodec.ColumnNames(a.Manifest.Columns);
            var map = EvidenceTraceMap.Candidates(a.Manifest, names);
            if (map.Count == 0) continue;
            if (!retentionFits) { _stats.OnInline(TraceInlineReason.Retention, map.Count); continue; }
            var n = a.Manifest.CalculationSamples ?? -1;
            byte[][]? cols;
            try { cols = EvidenceTraceCodec.SplitColumns(EvidenceTraceCodec.Inflate(a.Chunks), names.Length, n); }
            catch (InvalidDataException) { cols = null; }
            if (cols is null) { _stats.OnInline(TraceInlineReason.Undecodable, map.Count); continue; }
            if (n < Math.Max(2, _opts.MinTracePoints)) { _stats.OnInline(TraceInlineReason.TooFewPoints, map.Count); continue; }
            var x = EvidenceTraceCodec.ToDoubles(cols[Array.IndexOf(names, "x")]);
            if (!IsMsAxis(x)) { _stats.OnInline(TraceInlineReason.Mismatch, map.Count); continue; }
            candidates.Add(new Candidate(i, a, names, cols, map, n, (long)x[0], (long)x[^1]));
        }
        if (candidates.Count == 0) return kept;

        var device = DeviceOf(_prefix, loopId);
        var series = await _reader.ReadSeriesAsync(device, TraceSource.Query, candidates.Min(c => c.FromMs), candidates.Max(c => c.ToMs),
            Math.Max(1, _opts.TraceMaxRows), ct);
        if (series.Degraded)
        {
            foreach (var c in candidates) _stats.OnInline(TraceInlineReason.Unavailable, c.Map.Count);
            _log?.LogInformation("Evidence archive: historian unavailable for {Loop} ({Error}); the set is archived inline", loopId, series.Error);
            return kept;
        }
        var truncated = series.Timestamps.Length >= Math.Max(1, _opts.TraceMaxRows);
        var result = kept.ToArray();
        foreach (var c in candidates)
        {
            var refs = truncated ? null : Verify(c, series);
            if (refs is null) { _stats.OnInline(TraceInlineReason.Mismatch, c.Map.Count); continue; }
            var referenced = refs.Count(r => r is not null);
            var mismatched = c.Map.Count - referenced;
            if (mismatched > 0) _stats.OnInline(TraceInlineReason.Mismatch, mismatched);
            if (referenced == 0) continue;
            var inline = new byte[]?[c.Names.Length];
            var columns = new TraceColumn[c.Names.Length];
            var stored = new Dictionary<string, long>(StringComparer.Ordinal);
            for (var k = 0; k < c.Names.Length; k++)
            {
                columns[k] = new TraceColumn(c.Names[k], refs[k]);
                if (refs[k] is not null) continue;
                inline[k] = ArchivedTrace.Compress(c.Cols[k]);
                stored.TryAdd(EvidenceArchivePack.Sha256Hex(inline[k]), inline[k]!.Length);       // the pack stores a blob once
            }
            var form = new TraceForm(c.N, EvidenceTraceCodec.StreamSha(c.Cols), loopId, device, c.FromMs, c.ToMs, TraceSource.Query, columns);
            result[c.Index] = c.Artifact with { Trace = new ArchivedTrace(form, inline) };
            _stats.OnReferenced(referenced, c.Artifact.Manifest.TotalBytes - stored.Values.Sum());
        }
        return result;
    }

    /// <summary>Per column: its reference when it verified, else null; null overall when the rows do not line up with x.</summary>
    private static TraceRef?[]? Verify(Candidate c, IotDbSeries s)
    {
        var lo = LowerBound(s.Timestamps, c.FromMs);
        var hi = LowerBound(s.Timestamps, c.ToMs + 1);
        if (hi - lo != c.N) return null;
        var refs = new TraceRef?[c.Names.Length];
        // the rows must BE the axis: the timestamps first, every value column is aligned through them
        var time = EvidenceTraceCodec.ToBytes(EvidenceTraceCodec.Rebuild(s, lo, c.N, TraceSource.Time)!);
        if (EvidenceTraceCodec.FirstDifference(time, c.Cols[Array.IndexOf(c.Names, "x")]) != -1) return null;
        foreach (var (column, source) in c.Map)
        {
            var k = Array.IndexOf(c.Names, column);
            var rebuilt = EvidenceTraceCodec.Rebuild(s, lo, c.N, source);
            if (rebuilt is null) continue;
            if (EvidenceTraceCodec.FirstDifference(EvidenceTraceCodec.ToBytes(rebuilt), c.Cols[k]) != -1) continue;
            refs[k] = new TraceRef(source, c.N, EvidenceArchivePack.Sha256Hex(c.Cols[k]),
                source == TraceSource.Time ? null : s.Types.GetValueOrDefault(source));
        }
        return refs;
    }

    /// <summary>Whole, finite, strictly increasing millisecond timestamps (else the axis cannot be a historian row set).</summary>
    private static bool IsMsAxis(double[] x)
    {
        if (x.Length == 0) return false;
        for (var i = 0; i < x.Length; i++)
        {
            if (!double.IsFinite(x[i]) || x[i] != Math.Floor(x[i]) || Math.Abs(x[i]) > 9e15) return false;
            if (i > 0 && x[i] <= x[i - 1]) return false;
        }
        return true;
    }

    internal static int LowerBound(long[] a, long v)
    {
        int lo = 0, hi = a.Length;
        while (lo < hi) { var mid = (lo + hi) >>> 1; if (a[mid] < v) lo = mid + 1; else hi = mid; }
        return lo;
    }
}
