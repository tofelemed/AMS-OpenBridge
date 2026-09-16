using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace Traverse.IngestionService.Health;

public enum DedupeVerdict { New, Duplicate, Conflict }

/// <summary>
/// v2.5 Task 1H.2 (spec v6 §4.5; NR-039): business idempotency across MQTT→Kafka. Keyed by
/// tenant/site/source/observation_id with a CANONICAL content hash (sorted keys, compact), so a
/// retained re-delivery or a re-serialisation is a Duplicate, while a different payload under
/// the same id is an integrity Conflict. Bounded LRU; a restart forgets, and the downstream
/// ledger's primary key catches what slipped through.
/// </summary>
public sealed class HealthDedupe
{
    private readonly int _capacity;
    private readonly Dictionary<string, LinkedListNode<(string Key, string Hash)>> _index = new(StringComparer.Ordinal);
    private readonly LinkedList<(string Key, string Hash)> _order = new();
    private readonly object _lock = new();

    public HealthDedupe(int capacity = 50_000) => _capacity = Math.Max(16, capacity);

    public static string Key(JsonObject o) =>
        $"{InstrumentalHealthValidator.Str(o, "tenant_id")}|{InstrumentalHealthValidator.Str(o, "site_id")}|" +
        $"{InstrumentalHealthValidator.Str(o, "source_id")}|{InstrumentalHealthValidator.Str(o, "observation_id")}";

    public DedupeVerdict Check(JsonObject observation)
    {
        var key = Key(observation);
        var hash = CanonicalHash(observation);
        lock (_lock)
        {
            if (_index.TryGetValue(key, out var node))
            {
                _order.Remove(node);
                _order.AddFirst(node);
                return node.Value.Hash == hash ? DedupeVerdict.Duplicate : DedupeVerdict.Conflict;
            }
            var added = _order.AddFirst((key, hash));
            _index[key] = added;
            if (_order.Count > _capacity)
            {
                var last = _order.Last!;
                _order.RemoveLast();
                _index.Remove(last.Value.Key);
            }
            return DedupeVerdict.New;
        }
    }

    /// <summary>SHA-256 of the canonical form: object keys sorted ordinally, no whitespace.</summary>
    public static string CanonicalHash(JsonNode node)
    {
        var sb = new StringBuilder();
        Canonical(node, sb);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(sb.ToString()))).ToLowerInvariant();
    }

    private static void Canonical(JsonNode? node, StringBuilder sb)
    {
        switch (node)
        {
            case null: sb.Append("null"); break;
            case JsonObject o:
                sb.Append('{');
                bool first = true;
                foreach (var kv in o.OrderBy(k => k.Key, StringComparer.Ordinal))
                {
                    if (!first) sb.Append(',');
                    first = false;
                    sb.Append(System.Text.Json.JsonSerializer.Serialize(kv.Key)).Append(':');
                    Canonical(kv.Value, sb);
                }
                sb.Append('}');
                break;
            case JsonArray a:
                sb.Append('[');
                for (int i = 0; i < a.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    Canonical(a[i], sb);
                }
                sb.Append(']');
                break;
            default:
                sb.Append(node.ToJsonString());
                break;
        }
    }
}

public enum SequenceAction { Accept, Park, Flag }

public sealed record SequenceVerdict(SequenceAction Action, string? Reason);

/// <summary>
/// v2.5 Task 1H.2 (spec v6 §4.5; NR-040): epoch / sequence discipline per device. A new
/// producer epoch needs a complete verified snapshot before anything from it is applied: an
/// event that arrives first is PARKED (dead-lettered EPOCH_WITHOUT_SNAPSHOT, replayable). Within
/// an epoch a regressed sequence, or a message from an older epoch, is forwarded FLAGGED so the
/// ledger keeps it while the device state machine never lets it overwrite newer state.
/// </summary>
public sealed class EpochTracker
{
    private sealed class DeviceState { public long Epoch; public long LastSeq = -1; public bool SnapshotSeen; }
    private readonly Dictionary<string, DeviceState> _devices = new(StringComparer.Ordinal);
    private readonly object _lock = new();

    public SequenceVerdict Check(JsonObject observation)
    {
        var kind = InstrumentalHealthValidator.Str(observation, "message_kind");
        var key = $"{InstrumentalHealthValidator.Str(observation, "tenant_id")}|{InstrumentalHealthValidator.Str(observation, "site_id")}|{InstrumentalHealthValidator.Str(observation, "device_id")}";
        var epoch = InstrumentalHealthValidator.Long(observation, "producer_epoch") ?? 0;
        var seq = InstrumentalHealthValidator.Long(observation, "sequence") ?? 0;
        var complete = InstrumentalHealthValidator.Bool(observation, "state_complete") ?? false;
        bool snapshot = kind == "STATE_SNAPSHOT";
        lock (_lock)
        {
            if (!_devices.TryGetValue(key, out var d))
            {
                if (!snapshot || !complete)
                    return new SequenceVerdict(SequenceAction.Park, HealthDlqReasons.EpochWithoutSnapshot);
                _devices[key] = new DeviceState { Epoch = epoch, LastSeq = seq, SnapshotSeen = true };
                return new SequenceVerdict(SequenceAction.Accept, null);
            }
            if (epoch > d.Epoch)
            {
                if (!snapshot || !complete)
                    return new SequenceVerdict(SequenceAction.Park, HealthDlqReasons.EpochWithoutSnapshot);
                d.Epoch = epoch; d.LastSeq = seq; d.SnapshotSeen = true;
                return new SequenceVerdict(SequenceAction.Accept, null);
            }
            if (epoch < d.Epoch) return new SequenceVerdict(SequenceAction.Flag, "STALE_EPOCH");
            if (seq <= d.LastSeq) return new SequenceVerdict(SequenceAction.Flag, "SEQUENCE_REGRESSION");
            d.LastSeq = seq;
            if (snapshot && complete) d.SnapshotSeen = true;
            return new SequenceVerdict(SequenceAction.Accept, null);
        }
    }
}
