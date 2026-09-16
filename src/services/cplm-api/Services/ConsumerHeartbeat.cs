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

    // v2.5 (1G.3, NR-058): projection lag = persist time - the Kafka record's own timestamp,
    // per consumer; the last value and the worst seen in the current minute.
    private readonly ConcurrentDictionary<string, (long Last, long MaxThisMinute, long Minute)> _lag = new();

    public void ReportLag(string consumer, long lagMs)
    {
        var minute = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 60;
        _lag.AddOrUpdate(consumer, (lagMs, lagMs, minute), (_, prev) =>
            prev.Minute == minute ? (lagMs, Math.Max(prev.MaxThisMinute, lagMs), minute) : (lagMs, lagMs, minute));
    }

    public (long Last, long MaxThisMinute)? Lag(string consumer) =>
        _lag.TryGetValue(consumer, out var l) ? (l.Last, l.MaxThisMinute) : null;

    public Beat? Get(string consumer) =>
        _beats.TryGetValue(consumer, out var b) ? b : null;
}
