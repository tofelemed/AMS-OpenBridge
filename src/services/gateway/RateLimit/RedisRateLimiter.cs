// Per-client, per-route-class rate limiting (Plan 04 item 3, GW-03).
//
// Fixed one-minute windows, keys rl:{routeClass}:{clientId}:{windowStart}; clientId = the token's
// `sub` when authenticated, else the client IP. The shared counters live on Redis; the gateway
// keeps its own counters for the moments Redis cannot answer.
//
// Failure semantics (the part that matters in a control room), rewritten 2026-09-17 after a 1 s
// Redis stall on the lab answered every in-flight token refresh with 429 and stalled every other
// request by ~7 s:
//   - A Redis call is bounded (RateLimiting:RedisTimeoutMs, default 300 ms) and ONE round trip.
//   - After RateLimiting:CircuitFailureThreshold consecutive failures the breaker opens for
//     RateLimiting:CircuitOpenSeconds: no request asks Redis, so a sick Redis costs nothing further.
//   - While Redis is unreachable a fail-CLOSED class (login, mutation) is enforced from the
//     in-process counters - brute-force and write protection never lapse - and a fail-OPEN class
//     (reads, historian, session) passes. "Fail closed" never again means "deny everyone".
using Prometheus;

namespace Traverse.Gateway.RateLimit;

/// <param name="Source">redis | local (Redis unreachable, enforced in-process) | open (Redis unreachable, class passes)</param>
public sealed record RateLimitDecision(bool Allowed, int RetryAfter, string Source, string? LimitedBy);

public sealed class RedisRateLimiter
{
    private static readonly Counter Decisions = Metrics.CreateCounter("gateway_ratelimit_decisions_total",
        "Rate-limit decisions by source (redis / local / open) and outcome (allowed / denied).", new CounterConfiguration { LabelNames = new[] { "source", "outcome" } });
    private static readonly Counter Denied = Metrics.CreateCounter("gateway_ratelimit_denied_total",
        "Requests denied by the rate limiter, by class.", new CounterConfiguration { LabelNames = new[] { "class" } });
    private static readonly Gauge CircuitOpen = Metrics.CreateGauge("gateway_ratelimit_redis_circuit_open",
        "1 while the limiter's Redis circuit breaker is open (deciding from in-process counters).");

    private readonly ILogger<RedisRateLimiter> _log;
    private readonly IRateLimitCounters _counters;
    private readonly LocalWindowCounter _local;
    private readonly RedisCircuit _circuit;
    private readonly RateLimitClass _global;
    private readonly int _windowSeconds;
    private readonly TimeSpan _timeout;
    private readonly TimeProvider _time;
    private long _redisDecisions, _localDecisions, _openDecisions, _denied;

    public RedisRateLimiter(IRateLimitCounters counters, LocalWindowCounter local, RedisCircuit circuit, RateLimitClasses classes,
                            IConfiguration config, ILogger<RedisRateLimiter> log, TimeProvider? time = null)
    {
        _counters = counters;
        _local = local;
        _circuit = circuit;
        _global = classes.Global;
        _log = log;
        _time = time ?? TimeProvider.System;
        _windowSeconds = config.GetValue("RateLimiting:WindowSeconds", 60);
        _timeout = TimeSpan.FromMilliseconds(config.GetValue("RateLimiting:RedisTimeoutMs", 300));
    }

    /// <summary>Count this request against its class window and the global per-IP window; one decision.</summary>
    public async Task<RateLimitDecision> CheckAsync(RateLimitClass cls, string clientId, string ip, CancellationToken ct = default)
    {
        var now = _time.GetUtcNow();
        var nowEpoch = now.ToUnixTimeSeconds();
        var windowStart = nowEpoch - (nowEpoch % _windowSeconds);
        var retryAfter = (int)(windowStart + _windowSeconds - nowEpoch);
        var classKey = $"rl:{cls.Name}:{clientId}:{windowStart}";
        var globalKey = $"rl:{_global.Name}:{ip}:{windowStart}";

        if (!_circuit.IsOpen(now))
        {
            try
            {
                var (a, b) = await _counters.IncrementAsync(classKey, globalKey, _windowSeconds + 5, ct).WaitAsync(_timeout, ct);
                _circuit.RecordSuccess();
                CircuitOpen.Set(0);
                Interlocked.Increment(ref _redisDecisions);
                return Record(Decide(cls, a, b, retryAfter, "redis"));
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
            {
                var tripped = _circuit.RecordFailure(now);
                if (tripped)
                {
                    CircuitOpen.Set(1);
                    _log.LogWarning(ex, "Rate-limit Redis failed {Failures}× in a row - circuit OPEN for {Seconds} s; fail-closed classes are enforced in-process, fail-open classes pass",
                        _circuit.Status(now).ConsecutiveFailures, (int)(_circuit.Status(now).OpenUntil! - now).Value.TotalSeconds);
                }
                else if (!_circuit.IsOpen(now))
                {
                    _log.LogWarning("Rate-limit Redis call failed ({Reason}); this request is decided in-process", ex.GetType().Name);
                }
            }
        }

        // Redis unreachable (or the breaker is open): enforce what must never lapse from our own counters
        if (!cls.FailClosed && !_global.FailClosed)
        {
            Interlocked.Increment(ref _openDecisions);
            return Record(new RateLimitDecision(true, 0, "open", null));
        }
        var la = cls.FailClosed ? _local.Increment(classKey, windowStart, _windowSeconds) : 0;
        var lb = _global.FailClosed ? _local.Increment(globalKey, windowStart, _windowSeconds) : 0;
        Interlocked.Increment(ref _localDecisions);
        return Record(Decide(cls, la, lb, retryAfter, "local"));
    }

    private RateLimitDecision Decide(RateLimitClass cls, long classCount, long globalCount, int retryAfter, string source)
    {
        if (classCount > cls.Limit) return new(false, retryAfter, source, cls.Name);
        if (globalCount > _global.Limit) return new(false, retryAfter, source, _global.Name);
        return new(true, 0, source, null);
    }

    private RateLimitDecision Record(RateLimitDecision d)
    {
        Decisions.WithLabels(d.Source, d.Allowed ? "allowed" : "denied").Inc();
        if (!d.Allowed)
        {
            Denied.WithLabels(d.LimitedBy ?? "unknown").Inc();
            Interlocked.Increment(ref _denied);
        }
        return d;
    }

    /// <summary>What /gw/ratelimit shows: the breaker and the decision counters since start.</summary>
    public object Status()
    {
        var s = _circuit.Status(_time.GetUtcNow());
        return new
        {
            redis = new { circuitOpen = s.Open, consecutiveFailures = s.ConsecutiveFailures, openUntil = s.OpenUntil, lastFailure = s.LastFailure, trips = s.Trips, timeoutMs = (int)_timeout.TotalMilliseconds },
            decisions = new { redis = Interlocked.Read(ref _redisDecisions), local = Interlocked.Read(ref _localDecisions), open = Interlocked.Read(ref _openDecisions), denied = Interlocked.Read(ref _denied) },
            localCounters = _local.Size,
        };
    }
}
