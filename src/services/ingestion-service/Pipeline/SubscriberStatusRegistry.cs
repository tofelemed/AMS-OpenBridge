using System.Collections.Concurrent;

namespace Traverse.IngestionService.Pipeline;

/// <summary>Live counters for one running subscriber — mutated by the pipeline,
/// snapshotted by /stats and /health.</summary>
public sealed class SubscriberStatus
{
    public required Guid ConfigId { get; init; }
    public required string Name { get; init; }
    public string? ProfileType { get; init; }
    public DateTimeOffset StartedAt { get; init; } = DateTimeOffset.UtcNow;

    public volatile bool Connected;
    public string? ConnectionError;
    public long MessagesReceived;
    public long TuplesEmitted;
    public long DeadLettered;
    public long Parked;
    public long KafkaFailures;
    public int ActiveLoops;
    public int RegistryLoops;
    public DateTimeOffset? RegistryRefreshedAt;
    public DateTimeOffset? LastMessageAt;
    /// <summary>The parameter→role map this subscriber actually runs (built-ins +
    /// overlay). Exposed so "is VP mapped?" is one GET away, not a log dive.</summary>
    public IReadOnlyDictionary<string, string>? ParamRoles;
    /// <summary>Per-loop ingestion state, refreshed on the tick loop. `held` rows name
    /// the required signal the OT side is not publishing -- the answer to "why is this
    /// loop dark?", which previously took an MQTT inventory to work out.</summary>
    public volatile IReadOnlyList<LoopHealthRow>? LoopHealth;

    public object Snapshot() => new
    {
        configId = ConfigId,
        name = Name,
        profileType = ProfileType,
        startedAt = StartedAt,
        connected = Connected,
        connectionError = ConnectionError,
        messagesReceived = Interlocked.Read(ref MessagesReceived),
        tuplesEmitted = Interlocked.Read(ref TuplesEmitted),
        deadLettered = Interlocked.Read(ref DeadLettered),
        parked = Interlocked.Read(ref Parked),
        kafkaFailures = Interlocked.Read(ref KafkaFailures),
        activeLoops = ActiveLoops,
        registryLoops = RegistryLoops,
        registryRefreshedAt = RegistryRefreshedAt,
        lastMessageAt = LastMessageAt,
        paramRoles = ParamRoles?
            .OrderBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(kv => kv.Key, kv => kv.Value),
        // Roll-up only; the per-loop detail is GET /loop-health so /stats stays small.
        loopHealth = LoopHealth is { } rows ? LoopHealthSummary.From(rows).ToPayload() : null,
    };
}

/// <summary>Registry of running subscribers + pending reload requests. The host
/// service owns the entries; endpoints and /health only read/signal.</summary>
public sealed class SubscriberStatusRegistry
{
    private readonly ConcurrentDictionary<Guid, SubscriberStatus> _statuses = new();
    private readonly ConcurrentDictionary<Guid, bool> _reloadRequests = new();

    public void Upsert(SubscriberStatus status) => _statuses[status.ConfigId] = status;
    public void Remove(Guid configId) => _statuses.TryRemove(configId, out _);

    public IReadOnlyList<SubscriberStatus> List() => _statuses.Values.ToList();
    public IReadOnlyList<object> Snapshot() => _statuses.Values.Select(s => s.Snapshot()).ToList();

    /// <summary>POST /data-sources/{id}/reload sets this; the host restarts that subscriber
    /// on its next watch cycle (≤ 30 s).</summary>
    public void RequestReload(Guid configId) => _reloadRequests[configId] = true;
    public bool TryConsumeReload(Guid configId) => _reloadRequests.TryRemove(configId, out _);
}
