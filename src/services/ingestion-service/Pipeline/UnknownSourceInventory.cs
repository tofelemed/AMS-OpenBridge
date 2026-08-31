using System.Collections.Concurrent;
using Traverse.IngestionService.Services;

namespace Traverse.IngestionService.Pipeline;

/// <summary>
/// In-memory aggregation for parked messages — one counter per (config, reason,
/// source), flushed to ingestion.unknown_sources periodically. Never one DB write
/// per message: a firehose of unregistered loops must not melt Postgres. A failed
/// flush puts the counts back, so nothing is lost across retries.
/// </summary>
public sealed class UnknownSourceInventory
{
    private sealed record Key(Guid ConfigId, string Reason, string SourceKey);

    private sealed class Pending
    {
        public long Count;
        public string? LastTopic;
        public string? LastPayload;
        public DateTime LastSeen;
    }

    private readonly ConcurrentDictionary<Key, Pending> _pending = new();

    public void Record(Guid configId, string reason, string sourceKey, string topic, string payloadJson)
    {
        if (sourceKey.Length > 256) sourceKey = sourceKey[..256];
        var entry = _pending.GetOrAdd(new Key(configId, reason, sourceKey), _ => new Pending());
        lock (entry)
        {
            entry.Count++;
            entry.LastTopic = topic;
            entry.LastPayload = payloadJson;
            entry.LastSeen = DateTime.UtcNow;
        }
    }

    /// <summary>Returns the accumulated rows and clears the buffer.</summary>
    public IReadOnlyList<UnknownSourceRow> DrainPending()
    {
        var rows = new List<UnknownSourceRow>();
        foreach (var key in _pending.Keys.ToArray())
        {
            if (!_pending.TryRemove(key, out var entry)) continue;
            lock (entry)
            {
                rows.Add(new UnknownSourceRow(key.ConfigId, key.Reason, key.SourceKey,
                    entry.LastSeen, entry.LastSeen, entry.Count, entry.LastTopic, entry.LastPayload));
            }
        }
        return rows;
    }

    public async Task FlushAsync(UnknownSourceRepository repo, ILogger logger, CancellationToken ct)
    {
        var rows = DrainPending();
        if (rows.Count == 0) return;
        try
        {
            await repo.UpsertBatchAsync(rows, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning("unknown_sources flush failed ({Count} rows): {Message}", rows.Count, ex.Message);
            foreach (var row in rows) // put the counts back so nothing is lost
            {
                var entry = _pending.GetOrAdd(new Key(row.ConfigId, row.Reason, row.SourceKey), _ => new Pending());
                lock (entry)
                {
                    entry.Count += row.MessageCount;
                    entry.LastTopic ??= row.LastTopic;
                    entry.LastPayload ??= row.LastPayload;
                    if (entry.LastSeen < row.LastSeen) entry.LastSeen = row.LastSeen;
                }
            }
        }
    }
}
