namespace AMS.Infrastructure.Kafka;

/// <summary>
/// Shared telemetry ingest heartbeat updated by TelemetryDeadmanWatchdogService
/// and read by pipeline health API.
/// </summary>
public sealed class TelemetryIngestState
{
    private long _lastRawOpcEventEpochMs;
    private long _totalEvents;
    private volatile string _ingestState = "UNKNOWN";
    private volatile string? _lastStallAlertAt;
    private readonly object _lock = new();

    public void RecordEvent(long eventEpochMs)
    {
        Interlocked.Increment(ref _totalEvents);
        var current = Interlocked.Read(ref _lastRawOpcEventEpochMs);
        if (eventEpochMs > current)
            Interlocked.Exchange(ref _lastRawOpcEventEpochMs, eventEpochMs);

        _ingestState = "OK";
    }

    public void MarkStalled(long nowEpochMs)
    {
        _ingestState = "STALLED";
        lock (_lock)
        {
            _lastStallAlertAt = nowEpochMs.ToString();
        }
    }

    public void MarkOk() => _ingestState = "OK";

    public TelemetryIngestSnapshot GetSnapshot()
    {
        var lastMs = Interlocked.Read(ref _lastRawOpcEventEpochMs);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return new TelemetryIngestSnapshot(
            State: _ingestState,
            LastRawOpcEventEpochMs: lastMs > 0 ? lastMs : null,
            SecondsSinceLastEvent: lastMs > 0 ? (now - lastMs) / 1000.0 : null,
            TotalEventsObserved: Interlocked.Read(ref _totalEvents),
            LastStallAlertAtEpochMs: _lastStallAlertAt is not null && long.TryParse(_lastStallAlertAt, out var v) ? v : null);
    }
}

public sealed record TelemetryIngestSnapshot(
    string State,
    long? LastRawOpcEventEpochMs,
    double? SecondsSinceLastEvent,
    long TotalEventsObserved,
    long? LastStallAlertAtEpochMs);
