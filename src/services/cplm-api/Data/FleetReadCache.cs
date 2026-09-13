using System.Collections.Concurrent;
using Microsoft.Extensions.Caching.Memory;

namespace Traverse.CplmApi.Data;

/// <summary>
/// CHG-023 (P1-3) — short in-process cache with single-flight for the fleet reads.
///
/// One cplm-api process serves every console (the CPLM consumer-group rule keeps it
/// single), and each console polls the four fleet endpoints every 60 s. This makes
/// N consoles cost one query per key per TTL instead of 4N a minute, and makes
/// concurrent misses on the same key share ONE query rather than stampede.
///
/// Rules: a failed query is never cached; the shared query runs on
/// <see cref="CancellationToken.None"/> so a caller that leaves cannot abort it for
/// the callers that stayed; a non-positive TTL bypasses the cache entirely.
/// </summary>
public sealed class FleetReadCache(IMemoryCache cache)
{
    private readonly ConcurrentDictionary<string, object> _inflight = new();

    /// <returns>The value and whether it was served without running <paramref name="query"/>.</returns>
    public async Task<(T Value, bool Hit)> GetOrCreateAsync<T>(
        string key, TimeSpan ttl, Func<CancellationToken, Task<T>> query, CancellationToken ct)
    {
        if (ttl <= TimeSpan.Zero) return (await query(ct), false);
        if (cache.TryGetValue(key, out T? cached) && cached is not null) return (cached, true);

        Lazy<Task<T>>? mine = null;
        var lazy = (Lazy<Task<T>>)_inflight.GetOrAdd(key, _ => mine = new Lazy<Task<T>>(
            () => RunAndStoreAsync(key, ttl, query), LazyThreadSafetyMode.ExecutionAndPublication));

        var value = await lazy.Value.WaitAsync(ct);
        return (value, !ReferenceEquals(lazy, mine));
    }

    private async Task<T> RunAndStoreAsync<T>(string key, TimeSpan ttl, Func<CancellationToken, Task<T>> query)
    {
        try
        {
            var value = await query(CancellationToken.None);
            cache.Set(key, value, ttl);
            return value;
        }
        finally
        {
            _inflight.TryRemove(key, out _);
        }
    }
}
