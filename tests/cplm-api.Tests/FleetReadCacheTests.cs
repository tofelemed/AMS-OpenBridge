// CHG-023 (P1-3) — the fleet endpoints' short in-process cache.
//
// Why it exists: one cplm-api process serves every console, and each console polls the
// four fleet reads every 60 s. Without coalescing, N consoles = 4N queries a minute.
// The cache holds a result for a few seconds and makes concurrent misses share ONE
// query (single-flight). Failures must never be cached, and the caller's cancellation
// must never abort a query other callers are waiting on.
using FluentAssertions;
using Microsoft.Extensions.Caching.Memory;
using Traverse.CplmApi.Data;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class FleetReadCacheTests
{
    private static FleetReadCache NewCache(FakeClock? clock = null)
    {
        var options = new MemoryCacheOptions();
#pragma warning disable CS0618 // the 8.0 caching package exposes ISystemClock, not TimeProvider
        if (clock is not null) options.Clock = clock;
#pragma warning restore CS0618
        return new FleetReadCache(new MemoryCache(options));
    }

    [Fact]
    public async Task Concurrent_callers_for_the_same_key_share_one_query()
    {
        var cache = NewCache();
        var calls = 0;
        async Task<int> Query(CancellationToken _)
        {
            Interlocked.Increment(ref calls);
            await Task.Delay(150);
            return 42;
        }

        var results = await Task.WhenAll(Enumerable.Range(0, 20)
            .Select(_ => cache.GetOrCreateAsync("k", TimeSpan.FromSeconds(15), Query, CancellationToken.None)));

        calls.Should().Be(1);
        results.Select(r => r.Value).Should().AllBeEquivalentTo(42);
        results.Count(r => r.Hit).Should().Be(19, "exactly one caller pays for the query");
    }

    [Fact]
    public async Task Different_keys_do_not_share_a_result()
    {
        var cache = NewCache();
        var calls = 0;
        Task<int> Query(CancellationToken _) { Interlocked.Increment(ref calls); return Task.FromResult(calls); }

        var a = await cache.GetOrCreateAsync("a", TimeSpan.FromSeconds(15), Query, CancellationToken.None);
        var b = await cache.GetOrCreateAsync("b", TimeSpan.FromSeconds(15), Query, CancellationToken.None);

        calls.Should().Be(2);
        a.Value.Should().Be(1);
        b.Value.Should().Be(2);
    }

    [Fact]
    public async Task A_second_call_within_the_ttl_is_a_hit_and_after_the_ttl_is_a_miss()
    {
        var clock = new FakeClock(DateTimeOffset.Parse("2026-09-13T10:00:00Z"));
        var cache = NewCache(clock);
        var calls = 0;
        Task<int> Query(CancellationToken _) { Interlocked.Increment(ref calls); return Task.FromResult(calls); }

        var first = await cache.GetOrCreateAsync("k", TimeSpan.FromSeconds(15), Query, CancellationToken.None);
        clock.Advance(TimeSpan.FromSeconds(10));
        var second = await cache.GetOrCreateAsync("k", TimeSpan.FromSeconds(15), Query, CancellationToken.None);
        clock.Advance(TimeSpan.FromSeconds(6));
        var third = await cache.GetOrCreateAsync("k", TimeSpan.FromSeconds(15), Query, CancellationToken.None);

        first.Hit.Should().BeFalse();
        second.Hit.Should().BeTrue();
        second.Value.Should().Be(1);
        third.Hit.Should().BeFalse();
        third.Value.Should().Be(2);
    }

    [Fact]
    public async Task A_failed_query_is_not_cached()
    {
        var cache = NewCache();
        var calls = 0;
        Task<int> Query(CancellationToken _)
        {
            Interlocked.Increment(ref calls);
            return calls == 1 ? Task.FromException<int>(new InvalidOperationException("db down")) : Task.FromResult(7);
        }

        var act = () => cache.GetOrCreateAsync("k", TimeSpan.FromSeconds(15), Query, CancellationToken.None);
        await act.Should().ThrowAsync<InvalidOperationException>();
        var retry = await cache.GetOrCreateAsync("k", TimeSpan.FromSeconds(15), Query, CancellationToken.None);

        calls.Should().Be(2);
        retry.Value.Should().Be(7);
        retry.Hit.Should().BeFalse();
    }

    [Fact]
    public async Task A_cancelled_caller_does_not_abort_the_query_other_callers_wait_on()
    {
        var cache = NewCache();
        using var abandoned = new CancellationTokenSource();
        var queryToken = CancellationToken.None;
        async Task<int> Query(CancellationToken ct)
        {
            queryToken = ct;
            await Task.Delay(150, CancellationToken.None);
            return 9;
        }

        var waiter = cache.GetOrCreateAsync("k", TimeSpan.FromSeconds(15), Query, CancellationToken.None);
        var leaver = cache.GetOrCreateAsync("k", TimeSpan.FromSeconds(15), Query, abandoned.Token);
        abandoned.Cancel();

        (await waiter).Value.Should().Be(9);
        queryToken.CanBeCanceled.Should().BeFalse("the shared query must run to completion for the callers that stayed");
        await ((Func<Task>)(async () => await leaver)).Should().ThrowAsync<OperationCanceledException>();
    }

    [Fact]
    public async Task A_zero_ttl_disables_caching()
    {
        var cache = NewCache();
        var calls = 0;
        Task<int> Query(CancellationToken _) { Interlocked.Increment(ref calls); return Task.FromResult(calls); }

        await cache.GetOrCreateAsync("k", TimeSpan.Zero, Query, CancellationToken.None);
        var second = await cache.GetOrCreateAsync("k", TimeSpan.Zero, Query, CancellationToken.None);

        calls.Should().Be(2);
        second.Hit.Should().BeFalse();
    }

    private sealed class FakeClock(DateTimeOffset start) : Microsoft.Extensions.Internal.ISystemClock
    {
        public DateTimeOffset UtcNow { get; private set; } = start;
        public void Advance(TimeSpan by) => UtcNow += by;
    }
}
