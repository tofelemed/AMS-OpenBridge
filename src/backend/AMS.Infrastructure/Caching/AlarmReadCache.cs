// API-tier read cache for the hot alarm-list path (Plan 05 item 5, DATA-08).
//
// Each alarm-list request used to issue list + count (+ stats) straight into
// Postgres on every poll from every console. This cache short-circuits repeats
// within a small TTL, and is INVALIDATED on every projection write so operators
// never see stale alarm state beyond a single in-flight request:
//
//   version stamp ── every Kafka projection write (NormalizedAlarmConsumer,
//   LifecycleEventConsumer) bumps it; cache keys embed the stamp, so a write
//   makes every cached read unreachable immediately (entries then age out).
//
// In-memory by design: ams-api is single-instance (the CPLM consumer-group
// constraint pins it); Plan 06 scale-out moves this to the Redis cache tier
// alongside the SignalR backplane.
using Microsoft.Extensions.Caching.Memory;

namespace AMS.Infrastructure.Caching;

public sealed class AlarmReadCache
{
    public static readonly TimeSpan DefaultTtl = TimeSpan.FromSeconds(3);

    private readonly IMemoryCache _cache;
    private long _version;

    public AlarmReadCache(IMemoryCache cache) => _cache = cache;

    /// <summary>Called by the projection consumers after each successful write.</summary>
    public void Invalidate() => Interlocked.Increment(ref _version);

    public async Task<T> GetOrCreateAsync<T>(string key, Func<Task<T>> factory, TimeSpan? ttl = null)
    {
        var versionedKey = $"alarms:{Interlocked.Read(ref _version)}:{key}";
        if (_cache.TryGetValue(versionedKey, out T? hit) && hit is not null)
            return hit;

        var value = await factory();
        _cache.Set(versionedKey, value, ttl ?? DefaultTtl);
        return value;
    }
}
