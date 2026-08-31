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
