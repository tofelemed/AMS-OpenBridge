// GW-03 rate limiting, rewritten 2026-09-17 after a 1 s Redis stall on the lab answered every in-flight
// token refresh with 429 (refresh was a "mutation", fail-closed = deny) and stalled every other request
// by ~7 s (two unbounded Redis awaits per request). These tests pin the new contract:
//   - a refresh / logout is its own per-IP class and fails OPEN; login and writes stay fail-closed
//   - a Redis call is bounded by RedisTimeoutMs; a hang costs one request one timeout, never more
//   - a fail-closed class is enforced from in-process counters while Redis is away - never deny-all
//   - after N consecutive failures the breaker opens, no request touches Redis until it half-opens,
//     a probe failure re-opens it, a probe success closes it
//   - the in-process counters sweep old windows so they cannot grow without bound
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Traverse.Gateway.RateLimit;
using Xunit;

namespace Traverse.Gateway.Tests;

/// <summary>A Redis stand-in the tests script: answer with counts, throw, or hang.</summary>
internal sealed class ScriptedCounters : IRateLimitCounters
{
    public Func<string, string, Task<(long, long)>> Behaviour = (_, _) => Task.FromResult((1L, 1L));
    public int Calls;
    private readonly Dictionary<string, long> _counts = new();

    public Task<(long ClassCount, long GlobalCount)> IncrementAsync(string classKey, string globalKey, int ttlSeconds, CancellationToken ct)
    {
        Calls++;
        return Behaviour(classKey, globalKey);
    }

    /// <summary>Behaves like Redis: real per-key counting.</summary>
    public Task<(long, long)> Count(string classKey, string globalKey)
    {
        lock (_counts)
        {
            _counts[classKey] = _counts.GetValueOrDefault(classKey) + 1;
            _counts[globalKey] = _counts.GetValueOrDefault(globalKey) + 1;
            return Task.FromResult((_counts[classKey], _counts[globalKey]));
        }
    }

    public static Task<(long, long)> Throw(string _, string __) => Task.FromException<(long, long)>(new TimeoutException("redis away"));
    public static async Task<(long, long)> Hang(string _, string __) { await Task.Delay(5000); return (1, 1); }
}

internal sealed class FakeTime : TimeProvider
{
    public DateTimeOffset Now = new(2026, 9, 17, 12, 0, 0, TimeSpan.Zero);
    public override DateTimeOffset GetUtcNow() => Now;
    public void Advance(TimeSpan by) => Now += by;
}

public sealed class RateLimiterTests
{
    private static IConfiguration Config(params (string key, string value)[] pairs) =>
        new ConfigurationBuilder().AddInMemoryCollection(pairs.Select(p => new KeyValuePair<string, string?>(p.key, p.value))).Build();

    private static (RedisRateLimiter limiter, ScriptedCounters redis, RedisCircuit circuit, FakeTime time, RateLimitClasses classes) Build(int timeoutMs = 100, int threshold = 3, int openSeconds = 30)
    {
        var config = Config(("RateLimiting:RedisTimeoutMs", timeoutMs.ToString()), ("RateLimiting:LoginPerMinutePerIp", "3"), ("RateLimiting:MutationPerMinute", "5"), ("RateLimiting:GlobalPerMinutePerIp", "50"));
        var classes = RateLimitClasses.FromConfig(config);
        var redis = new ScriptedCounters();
        var circuit = new RedisCircuit(threshold, TimeSpan.FromSeconds(openSeconds));
        var time = new FakeTime();
        var limiter = new RedisRateLimiter(redis, new LocalWindowCounter(), circuit, classes, config, NullLogger<RedisRateLimiter>.Instance, time);
        return (limiter, redis, circuit, time, classes);
    }

    [Theory]
    [InlineData("POST", "/api/auth/login", "login", true, true)]
    [InlineData("POST", "/api/auth/refresh", "session", true, false)]
    [InlineData("POST", "/api/auth/logout", "session", true, false)]
    [InlineData("GET", "/api/auth/me", "read", false, false)]
    [InlineData("GET", "/api/hist/snapshot", "snapshot", false, false)]
    [InlineData("GET", "/api/hist/trend", "historian", false, false)]
    [InlineData("POST", "/api/v1/cpm/loops/x/acknowledge", "mutation", false, true)]
    [InlineData("PUT", "/api/displays/1", "mutation", false, true)]
    [InlineData("GET", "/api/v1/cpm/loops", "read", false, false)]
    [InlineData("HEAD", "/api/v1/cpm/loops", "read", false, false)]
    public void A_request_is_classified_by_route_and_method(string method, string path, string cls, bool perIp, bool failClosed)
    {
        var c = RateLimitClasses.FromConfig(Config()).Classify(method, path);
        c.Name.Should().Be(cls);
        c.PerIp.Should().Be(perIp);
        c.FailClosed.Should().Be(failClosed, "a refresh must never fail closed - the SPA ends the session on a 429");
    }

    [Fact]
    public async Task With_redis_healthy_the_decision_comes_from_redis_in_one_round_trip_and_denies_over_the_limit()
    {
        var (limiter, redis, _, _, classes) = Build();
        redis.Behaviour = redis.Count;
        for (var i = 1; i <= 3; i++) (await limiter.CheckAsync(classes.Login, "10.0.0.1", "10.0.0.1")).Should().BeEquivalentTo(new RateLimitDecision(true, 0, "redis", null));
        var fourth = await limiter.CheckAsync(classes.Login, "10.0.0.1", "10.0.0.1");
        fourth.Allowed.Should().BeFalse();
        fourth.LimitedBy.Should().Be("login");
        fourth.RetryAfter.Should().BeInRange(1, 60);
        redis.Calls.Should().Be(4, "class and global windows are counted in ONE call");
    }

    [Fact]
    public async Task A_hanging_redis_costs_one_request_one_bounded_timeout_and_the_request_still_gets_a_decision()
    {
        var (limiter, redis, _, _, classes) = Build(timeoutMs: 100);
        redis.Behaviour = ScriptedCounters.Hang;
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var d = await limiter.CheckAsync(classes.Session, "10.0.0.1", "10.0.0.1");
        sw.Stop();
        sw.ElapsedMilliseconds.Should().BeLessThan(1500, "the wait is bounded by RedisTimeoutMs, not by Redis");
        d.Should().BeEquivalentTo(new RateLimitDecision(true, 0, "open", null), "a refresh passes while Redis is away");
    }

    [Fact]
    public async Task While_redis_is_away_a_fail_open_class_passes_and_a_fail_closed_class_is_enforced_in_process()
    {
        var (limiter, redis, _, _, classes) = Build();
        redis.Behaviour = ScriptedCounters.Throw;
        (await limiter.CheckAsync(classes.Session, "ip", "ip")).Source.Should().Be("open");
        (await limiter.CheckAsync(classes.Read, "alice", "ip")).Source.Should().Be("open");
        (await limiter.CheckAsync(classes.Historian, "alice", "ip")).Source.Should().Be("open");
        // login: limit 3 per IP - the 4th attempt is denied from the gateway's own counters, never "deny all"
        for (var i = 1; i <= 3; i++) (await limiter.CheckAsync(classes.Login, "ip", "ip")).Should().BeEquivalentTo(new RateLimitDecision(true, 0, "local", null));
        var blocked = await limiter.CheckAsync(classes.Login, "ip", "ip");
        blocked.Allowed.Should().BeFalse();
        blocked.Source.Should().Be("local");
        blocked.LimitedBy.Should().Be("login");
        // writes: limit 5 per user
        for (var i = 1; i <= 5; i++) (await limiter.CheckAsync(classes.Mutation, "bob", "ip")).Allowed.Should().BeTrue();
        (await limiter.CheckAsync(classes.Mutation, "bob", "ip")).Allowed.Should().BeFalse();
        (await limiter.CheckAsync(classes.Mutation, "carol", "ip")).Allowed.Should().BeTrue("counters are per client");
    }

    [Fact]
    public async Task After_the_threshold_the_breaker_opens_and_no_request_touches_redis_until_it_half_opens()
    {
        var (limiter, redis, circuit, time, classes) = Build(threshold: 3, openSeconds: 30);
        redis.Behaviour = ScriptedCounters.Throw;
        for (var i = 0; i < 3; i++) await limiter.CheckAsync(classes.Read, "a", "ip");
        circuit.IsOpen(time.Now).Should().BeTrue();
        redis.Calls.Should().Be(3);
        for (var i = 0; i < 20; i++) await limiter.CheckAsync(classes.Read, "a", "ip");
        redis.Calls.Should().Be(3, "an open breaker asks Redis nothing");

        // half-open: the first request after the open period probes Redis; a failure re-opens at once
        time.Advance(TimeSpan.FromSeconds(31));
        await limiter.CheckAsync(classes.Read, "a", "ip");
        redis.Calls.Should().Be(4);
        circuit.IsOpen(time.Now).Should().BeTrue("the probe failed");
        await limiter.CheckAsync(classes.Read, "a", "ip");
        redis.Calls.Should().Be(4);

        // ... and a successful probe closes it: decisions come from Redis again
        time.Advance(TimeSpan.FromSeconds(31));
        redis.Behaviour = redis.Count;
        var d = await limiter.CheckAsync(classes.Read, "a", "ip");
        d.Source.Should().Be("redis");
        circuit.IsOpen(time.Now).Should().BeFalse();
        circuit.Status(time.Now).ConsecutiveFailures.Should().Be(0);
        circuit.Status(time.Now).Trips.Should().Be(2);
    }

    [Fact]
    public async Task A_single_failure_does_not_open_the_breaker_and_the_next_request_asks_redis_again()
    {
        var (limiter, redis, circuit, time, classes) = Build(threshold: 3);
        var calls = 0;
        redis.Behaviour = (a, b) => ++calls == 1 ? ScriptedCounters.Throw(a, b) : redis.Count(a, b);
        (await limiter.CheckAsync(classes.Read, "a", "ip")).Source.Should().Be("open");
        (await limiter.CheckAsync(classes.Read, "a", "ip")).Source.Should().Be("redis");
        circuit.IsOpen(time.Now).Should().BeFalse();
        circuit.Status(time.Now).ConsecutiveFailures.Should().Be(0, "a success resets the count");
    }

    [Fact]
    public void The_in_process_counters_sweep_windows_that_have_passed()
    {
        var local = new LocalWindowCounter();
        for (var i = 0; i < 100; i++) local.Increment($"rl:login:10.0.0.{i}:1000", 1000);
        local.Size.Should().Be(100);
        local.Increment("rl:login:x:1060", 1060);
        local.Size.Should().Be(101, "the previous window is kept until the next one starts");
        local.Increment("rl:login:x:1120", 1120);
        local.Size.Should().Be(2, "windows older than the previous one are gone");
        local.Increment("rl:login:x:1120", 1120).Should().Be(2);
    }

    [Fact]
    public void Status_reports_the_breaker_and_the_decision_counters()
    {
        var (limiter, _, _, _, _) = Build();
        var json = System.Text.Json.JsonSerializer.SerializeToElement(limiter.Status());
        json.GetProperty("redis").GetProperty("circuitOpen").GetBoolean().Should().BeFalse();
        json.GetProperty("redis").GetProperty("timeoutMs").GetInt32().Should().Be(100);
        json.GetProperty("decisions").GetProperty("redis").GetInt64().Should().Be(0);
    }
}
