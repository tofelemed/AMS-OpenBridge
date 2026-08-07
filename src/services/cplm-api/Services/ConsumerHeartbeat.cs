using System.Collections.Concurrent;

namespace Traverse.CplmApi.Services;

/// <summary>
/// P3-11 - /health used to prove only Postgres. Both Kafka consumers could be
/// stuck in an unbounded schema-ensure retry loop, or never registered at all
/// (a misspelled Cplm__ConsumersEnabled silently defaults to false), while
/// health stayed green and the topic backlog grew. Each consumer now reports
/// a phase and a heartbeat every poll cycle (the 500 ms Consume timeout makes
/// the loop iterate even when idle), and /health surfaces both consumers with
/// a stalled flag.
/// </summary>
public sealed class ConsumerHeartbeat
{
    public readonly record struct Beat(string Phase, DateTimeOffset At);

    private readonly ConcurrentDictionary<string, Beat> _beats = new();

    public void Report(string consumer, string phase) =>
        _beats[consumer] = new Beat(phase, DateTimeOffset.UtcNow);

    public Beat? Get(string consumer) =>
        _beats.TryGetValue(consumer, out var b) ? b : null;
}
