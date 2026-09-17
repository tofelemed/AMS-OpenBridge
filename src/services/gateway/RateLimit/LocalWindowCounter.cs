// In-process fixed-window counters: what the limiter enforces from while Redis is unreachable.
// The gateway is one process, so these are exact for it; only the cross-instance view is lost,
// and the plant runs one gateway. Keys carry their window start, so a new window simply lets the
// old one be swept.
using System.Collections.Concurrent;

namespace Traverse.Gateway.RateLimit;

public sealed class LocalWindowCounter
{
    private readonly ConcurrentDictionary<string, long> _counts = new();
    private long _sweptBelow = long.MinValue;

    /// <summary>Increment the key for its window and return the new count; windows older than the previous one are swept.</summary>
    public long Increment(string key, long windowStart, int windowSeconds = 60)
    {
        SweepBefore(windowStart - windowSeconds);
        return _counts.AddOrUpdate(key, 1, static (_, n) => n + 1);
    }

    public int Size => _counts.Count;

    /// <summary>Drop every key of a window older than <paramref name="windowStart"/> (keys end in ":{windowStart}").</summary>
    private void SweepBefore(long windowStart)
    {
        if (windowStart <= _sweptBelow) return;
        _sweptBelow = windowStart;
        foreach (var key in _counts.Keys)
        {
            var at = key.LastIndexOf(':');
            if (at > 0 && long.TryParse(key.AsSpan(at + 1), out var w) && w < windowStart) _counts.TryRemove(key, out _);
        }
    }
}
