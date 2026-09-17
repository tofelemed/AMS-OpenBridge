// The shared counters on Redis: ONE round trip increments the class window and the global window
// (a Lua script: INCR + EXPIRE on first touch for both keys) - the limiter used to await two calls
// in sequence, doubling every request's exposure to Redis latency.
//
// The connection is bounded: 300 ms per operation, no backlog (a command is never queued behind a
// reconnect - it fails at once and the limiter falls back), so the worst a Redis stall can cost a
// request is one short timeout.
using StackExchange.Redis;

namespace Traverse.Gateway.RateLimit;

public interface IRateLimitCounters
{
    /// <summary>Increment both windows and return their new counts; throws when Redis cannot answer.</summary>
    Task<(long ClassCount, long GlobalCount)> IncrementAsync(string classKey, string globalKey, int ttlSeconds, CancellationToken ct);
}

public sealed class RedisRateLimitCounters : IRateLimitCounters
{
    private const string Script = """
        local a = redis.call('INCR', KEYS[1])
        if a == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
        local b = redis.call('INCR', KEYS[2])
        if b == 1 then redis.call('EXPIRE', KEYS[2], ARGV[1]) end
        return {a, b}
        """;

    private readonly ILogger<RedisRateLimitCounters> _log;
    private readonly Lazy<Task<IConnectionMultiplexer?>> _redis;

    public RedisRateLimitCounters(IConfiguration config, ILogger<RedisRateLimitCounters> log)
    {
        _log = log;
        var host = config["Redis:Host"] ?? "redis";
        var port = config.GetValue("Redis:Port", 6379);
        var timeoutMs = config.GetValue("RateLimiting:RedisTimeoutMs", 300);
        _redis = new Lazy<Task<IConnectionMultiplexer?>>(async () =>
        {
            try
            {
                var options = new ConfigurationOptions
                {
                    EndPoints = { $"{host}:{port}" },
                    AbortOnConnectFail = false,          // the gateway must start even if Redis is down
                    ConnectTimeout = 1000,
                    SyncTimeout = timeoutMs,
                    AsyncTimeout = timeoutMs,
                    BacklogPolicy = BacklogPolicy.FailFast,   // never queue behind a reconnect
                    ReconnectRetryPolicy = new LinearRetry(1000),
                    Password = config["Redis:Password"],
                };
                var mux = await ConnectionMultiplexer.ConnectAsync(options);
                _log.LogInformation("Rate-limit Redis connected: {Host}:{Port} (timeout {Timeout} ms, fail-fast backlog)", host, port, timeoutMs);
                return (IConnectionMultiplexer)mux;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Rate-limit Redis unavailable at {Host}:{Port}", host, port);
                return null;
            }
        });
    }

    public async Task<(long ClassCount, long GlobalCount)> IncrementAsync(string classKey, string globalKey, int ttlSeconds, CancellationToken ct)
    {
        var mux = await _redis.Value ?? throw new InvalidOperationException("rate-limit Redis never connected");
        // Deliberately no IsConnected pre-check: the multiplexer flaps that flag transiently; the
        // operation itself throws (fast, with FailFast) when Redis is really away.
        var result = await mux.GetDatabase().ScriptEvaluateAsync(Script, new RedisKey[] { classKey, globalKey }, new RedisValue[] { ttlSeconds });
        var pair = (RedisResult[])result!;
        return ((long)pair[0], (long)pair[1]);
    }
}
