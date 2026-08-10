// Per-client, per-route-class rate limiting on Redis counters (Plan 04 item 3, GW-03).
//
// Fixed one-minute windows exactly as the plan's key schema describes:
//   rl:{routeClass}:{clientId}:{windowStart}  → INCR, EXPIRE = window
// clientId = the token's `sub` when authenticated, else the client IP.
//
// Failure semantics (the part that matters in a control room):
//   - READ classes fail OPEN on a Redis outage — operators must never lose alarm
//     visibility because a cache died.
//   - LOGIN and MUTATION classes fail CLOSED — brute-force protection and write
//     protection are never silently dropped.
using StackExchange.Redis;

namespace Traverse.Gateway.RateLimit;

public sealed record RateLimitClass(string Name, int Limit, bool PerIp, bool FailClosed);

public sealed class RedisRateLimiter
{
    private readonly ILogger<RedisRateLimiter> _log;
    private readonly Lazy<Task<IConnectionMultiplexer?>> _redis;
    private readonly int _windowSeconds;

    public RedisRateLimiter(IConfiguration config, ILogger<RedisRateLimiter> log)
    {
        _log = log;
        _windowSeconds = config.GetValue("RateLimiting:WindowSeconds", 60);
        var host = config["Redis:Host"] ?? "redis";
        var port = config.GetValue("Redis:Port", 6379);
        _redis = new Lazy<Task<IConnectionMultiplexer?>>(async () =>
        {
            try
            {
                var options = new ConfigurationOptions
                {
                    EndPoints = { $"{host}:{port}" },
                    AbortOnConnectFail = false,   // gateway must start even if Redis is down
                    ConnectTimeout = 2000,
                    SyncTimeout = 1000,
                    Password = config["Redis:Password"],
                };
                var mux = await ConnectionMultiplexer.ConnectAsync(options);
                _log.LogInformation("Rate-limit Redis connected: {Host}:{Port}", host, port);
                return (IConnectionMultiplexer)mux;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Rate-limit Redis unavailable at {Host}:{Port}", host, port);
                return null;
            }
        });
    }

    /// <summary>
    /// Count this request against a class window. Returns (allowed, retryAfterSeconds).
    /// On a Redis failure: fail-open classes allow, fail-closed classes deny.
    /// </summary>
    public async Task<(bool Allowed, int RetryAfter)> CheckAsync(RateLimitClass cls, string clientId)
    {
        var nowEpoch = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var windowStart = nowEpoch - (nowEpoch % _windowSeconds);
        var retryAfter = (int)(windowStart + _windowSeconds - nowEpoch);

        try
        {
            var mux = await _redis.Value;
            if (mux is null)
            {
                _log.LogWarning("Rate-limit Redis never connected — class {Class} {Mode}",
                    cls.Name, cls.FailClosed ? "failing CLOSED" : "failing OPEN");
                return Fail(cls, retryAfter);
            }

            // Deliberately no IsConnected pre-check: the multiplexer flaps that flag
            // transiently (e.g. idle teardown behind Docker's port proxy) and a silent
            // fail-open here would drop increments without a trace. Attempt the op;
            // a real outage throws and is handled (and logged) below.
            var db = mux.GetDatabase();
            var key = $"rl:{cls.Name}:{clientId}:{windowStart}";
            var count = await db.StringIncrementAsync(key);
            if (count == 1)
                await db.KeyExpireAsync(key, TimeSpan.FromSeconds(_windowSeconds + 5));

            return count <= cls.Limit ? (true, 0) : (false, retryAfter);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Rate-limit check failed for class {Class} — {Mode}",
                cls.Name, cls.FailClosed ? "failing CLOSED" : "failing OPEN");
            return Fail(cls, retryAfter);
        }
    }

    private static (bool, int) Fail(RateLimitClass cls, int retryAfter)
        => cls.FailClosed ? (false, retryAfter) : (true, 0);
}
