namespace AMS.Infrastructure.Health;

/// <summary>
/// Rolling readiness snapshots for "what changed since last good state?" (§12.0 operator control center).
/// </summary>
public sealed class ReadinessHistoryStore
{
    private readonly object _lock = new();
    private readonly Queue<ReadinessSnapshot> _history = new();
    private ReadinessSnapshot? _lastPass;
    private const int MaxHistory = 48;

    public void Record(ReadinessHealth readiness)
    {
        var snap = new ReadinessSnapshot(
            DateTimeOffset.UtcNow,
            readiness.OverallScore,
            readiness.GateStatus,
            new Dictionary<string, int>(readiness.Subsystems));

        lock (_lock)
        {
            _history.Enqueue(snap);
            while (_history.Count > MaxHistory)
                _history.Dequeue();

            if (readiness.GateStatus == "PASS")
                _lastPass = snap;
        }
    }

    public ReadinessChangeSummary BuildChangeSummary(ReadinessHealth current)
    {
        ReadinessSnapshot? previous;
        ReadinessSnapshot? lastPass;
        lock (_lock)
        {
            var snaps = _history.ToArray();
            previous = snaps.Length >= 2 ? snaps[^2] : null;
            lastPass = _lastPass;
        }

        var regressions = new List<string>();
        if (previous is not null)
        {
            foreach (var (name, score) in current.Subsystems)
            {
                if (previous.Subsystems.TryGetValue(name, out var prevScore) && score < prevScore - 5)
                    regressions.Add($"{Label(name)}: {prevScore} → {score}");
            }
        }

        var delta = previous is not null ? current.OverallScore - previous.Score : 0;
        return new ReadinessChangeSummary(
            previous?.Score,
            delta,
            lastPass?.AtUtc.ToString("o"),
            regressions);
    }

    public IReadOnlyList<ReadinessTimelinePoint> GetTimeline()
    {
        lock (_lock)
        {
            return _history.Select(h => new ReadinessTimelinePoint(
                h.AtUtc.ToString("o"),
                h.Score,
                h.GateStatus)).ToList();
        }
    }

    private static string Label(string id) => id switch
    {
        "ingest" => "Ingest",
        "kafka" => "Kafka",
        "flink" => "Flink",
        "ack" => "ACK pipeline",
        "database" => "Database",
        "uiProjection" => "UI projection",
        "contracts" => "Contracts",
        _ => id,
    };

    private sealed record ReadinessSnapshot(
        DateTimeOffset AtUtc,
        int Score,
        string GateStatus,
        Dictionary<string, int> Subsystems);
}

public sealed record ReadinessTimelinePoint(string AtUtc, int Score, string GateStatus);

public sealed record ReadinessChangeSummary(
    int? PreviousScore,
    int ScoreDelta,
    string? LastPassAtUtc,
    IReadOnlyList<string> Regressions);

public sealed record ReadinessSubsystemDetail(
    string Id,
    string Label,
    int Score,
    int WeightPercent,
    string Status,
    string Detail,
    string? ActionHint);
