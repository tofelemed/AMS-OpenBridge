namespace Traverse.CplmApi.Services;

/// <summary>CHG-102 Phase 5b-1 — "Cplm:EvidenceArchive" section: the boundary evidence archiver (consumers instance only).</summary>
public sealed class EvidenceArchiveOptions
{
    public const string SectionName = "Cplm:EvidenceArchive";
    public bool Enabled { get; set; } = true;
    /// <summary>How often a pass runs. Minutes (floor 1).</summary>
    public int IntervalMinutes { get; set; } = 5;
    /// <summary>A set is archived this long after its window end: its artifacts (long job + fusion job) have arrived by then.</summary>
    public int SettleMinutes { get; set; } = 15;
    /// <summary>How far back the live manifests are searched (the TRANSIENT lifetime, 6 h, plus margin).</summary>
    public int LookbackHours { get; set; } = 8;
    /// <summary>Most sets packed in one pass (a backlog after an outage is worked off over several passes).</summary>
    public int MaxSetsPerPass { get; set; } = 500;
    /// <summary>Day partitions kept ready ahead of today (UTC).</summary>
    public int LookaheadDays { get; set; } = 2;
    /// <summary>CREATE / DROP of a partition yields to a long reader instead of queuing behind it.</summary>
    public int LockTimeoutSeconds { get; set; } = 5;
    /// <summary>The sweeper's TRANSIENT lifetime (Cplm:EvidenceTransientHours); a pending set this close to it is "at risk".</summary>
    public int TransientHours { get; set; } = 6;

    /// <summary>CHG-102 Phase 5b-2: raw-sample columns proven bit-identical to the loop's historian series are archived as a
    /// verified reference instead of their bytes (Cplm:EvidenceArchive:TraceReferences; false = every artifact verbatim, cpax1).
    /// Unset = AUTO: on only when IotDb:Layout is v2. The v2 move rewrites the raw tree as FLOAT (CHG-101 iotdb_move_v2.py casts),
    /// and a reference made from the DOUBLE tree before that move would fail its hash afterwards (the trace is then lost), so
    /// references start only once the raw tree is in its final form.</summary>
    public bool? TraceReferences { get; set; }

    /// <summary>The effective switch: explicit TraceReferences, else on only for the v2 (post-move) raw layout.</summary>
    public bool TraceReferencesFor(bool rawLayoutV2) => TraceReferences ?? rawLayoutV2;
    /// <summary>How long the raw historian keeps samples (IoTDB TTL of the loop database, RAW_TTL_DAYS). A reference is only
    /// made while the archive's retention (+2 d: a 24 h window's first sample predates its partition day) fits inside it,
    /// and a reference older than this is reported unavailable rather than read.</summary>
    public int HistorianRetentionDays { get; set; } = 90;
    /// <summary>Budget of one historian trace read (archive verify or read-side rebuild). Seconds (floor 1).</summary>
    public int TraceReadTimeoutSeconds { get; set; } = 15;
    /// <summary>Artifacts with fewer samples than this stay inline (a reference would save nothing).</summary>
    public int MinTracePoints { get; set; } = 32;
    /// <summary>Most rows one trace read may return (a 24 h window at 1 s is 86,400).</summary>
    public int TraceMaxRows { get; set; } = 200_000;
}

/// <summary>CHG-102 Phase 5b-1 — what the archiver did since start, for /health (consumers.evidenceArchive).</summary>
public sealed class EvidenceArchiveStats
{
    private long _sets, _artifacts, _missing, _late, _lost, _bytes, _sourceBytes;
    public bool Enabled { get; set; }
    public bool Installed { get; set; }
    public long ArchivedSets => Interlocked.Read(ref _sets);
    public long ArchivedArtifacts => Interlocked.Read(ref _artifacts);
    /// <summary>Artifacts of an archived set that were not COMPLETE (or failed their checksum) when it was packed.</summary>
    public long MissingArtifacts => Interlocked.Read(ref _missing);
    /// <summary>Boundary artifacts that arrived after their set was packed (not in the archive).</summary>
    public long LateArtifacts => Interlocked.Read(ref _late);
    /// <summary>Boundary sets seen pending that the TRANSIENT sweep deleted before they were packed.</summary>
    public long LostToSweep => Interlocked.Read(ref _lost);
    public long PackBytes => Interlocked.Read(ref _bytes);
    public long SourceBytes => Interlocked.Read(ref _sourceBytes);
    public int PendingSets { get; set; }
    public bool Behind { get; set; }
    public DateTimeOffset? LastPassUtc { get; set; }
    public long? ArchiveBytes { get; set; }
    public string? LastError { get; set; }

    public void OnArchived(int artifacts, int missing, long packBytes, long sourceBytes)
    {
        Interlocked.Increment(ref _sets);
        Interlocked.Add(ref _artifacts, artifacts);
        Interlocked.Add(ref _missing, missing);
        Interlocked.Add(ref _bytes, packBytes);
        Interlocked.Add(ref _sourceBytes, sourceBytes);
    }
    /// <summary>CHG-102 Phase 5b-2: what the trace references did (archive side).</summary>
    public EvidenceTraceArchiveStats Traces { get; } = new();

    public void OnLate(long n) => Interlocked.Add(ref _late, n);
    public void OnLost(long n) => Interlocked.Add(ref _lost, n);
}
