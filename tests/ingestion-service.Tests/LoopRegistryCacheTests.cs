using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class LoopRegistryCacheTests
{
    // The real cplm-api shape: GET /api/v1/cpm/loops returns { loops: [...], count: N }
    // (CpmLoopsController.GetAll — NOT a bare array).
    private const string LoopsJson = """
        {"loops":[
          {"loopId":"FIC10302","assetId":"11111111-2222-3333-4444-555555555555","site":"hdpe",
           "area":"section_100","unit":"u1001_polymerization_reactor_1","loopType":"FIC","isActive":true},
          {"loopId":"TIC10101","assetId":null,"site":"hdpe","area":null,"unit":null,"loopType":"TIC","isActive":true},
          {"loopId":"FIC90000","site":"hdpe","loopType":"FIC","isActive":false}
        ],"count":3}
        """;

    [Fact]
    public void ParseLoops_reads_the_cplm_wrapper_shape()
    {
        var loops = CplmRegistryClient.ParseLoops(LoopsJson);
        Assert.Equal(3, loops.Count);
        var fic = loops[0];
        Assert.Equal("FIC10302", fic.LoopId);
        Assert.Equal("11111111-2222-3333-4444-555555555555", fic.AssetUuid);
        Assert.Equal("hdpe", fic.Site);
        Assert.Equal("section_100", fic.Area);
        Assert.Equal("u1001_polymerization_reactor_1", fic.Unit);
        Assert.Equal("FIC", fic.LoopType);
        Assert.True(fic.IsActive);
        Assert.Null(loops[1].AssetUuid);
    }

    [Fact]
    public void ParseLoops_tolerates_a_bare_array()
    {
        var loops = CplmRegistryClient.ParseLoops("""[{"loopId":"PIC1","site":"hdpe","loopType":"PIC"}]""");
        Assert.Single(loops);
        Assert.True(loops[0].IsActive); // absent isActive defaults true
    }

    [Fact]
    public void Cache_resolves_case_insensitively_with_registry_casing()
    {
        var cache = new LoopRegistryCache(CplmRegistryClient.ParseLoops(LoopsJson));
        Assert.True(cache.TryResolve("fic10302", out var loop));
        Assert.Equal("FIC10302", loop.LoopId); // registry casing wins — the engine keys by exact string
    }

    [Fact]
    public void Inactive_loops_do_not_resolve()
    {
        var cache = new LoopRegistryCache(CplmRegistryClient.ParseLoops(LoopsJson));
        Assert.False(cache.TryResolve("FIC90000", out _));
    }

    [Fact]
    public void Unknown_loop_does_not_resolve()
    {
        var cache = new LoopRegistryCache(CplmRegistryClient.ParseLoops(LoopsJson));
        Assert.False(cache.TryResolve("FIC99999", out _));
        Assert.Equal(3, cache.Count);
    }

    // ── CHG-103: a timed-out fetch must not end the refresh loop ─────────────

    private sealed class StubHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send)
        : HttpMessageHandler
    {
        public int Calls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            Calls++;
            return send(r, ct);
        }
    }

    private static CplmRegistryClient Client(HttpMessageHandler h) =>
        new(new HttpClient(h), new ConfigurationBuilder().Build());

    private static Task<HttpResponseMessage> Ok() =>
        Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(LoopsJson) });

    [Fact]
    public async Task Refresh_survives_an_HttpClient_timeout_and_recovers_on_the_next_tick()
    {
        var fail = true;
        var handler = new StubHandler((_, _) => fail
            // what HttpClient throws when its own Timeout elapses: TaskCanceledException, caller token NOT cancelled
            ? Task.FromException<HttpResponseMessage>(new TaskCanceledException(
                "The request was canceled due to the configured HttpClient.Timeout of 15 seconds elapsing.",
                new TimeoutException()))
            : Ok());
        var client = Client(handler);
        var cache = new LoopRegistryCache();

        Assert.False(await cache.RefreshAsync(client, NullLogger.Instance, CancellationToken.None));
        Assert.Equal(0, cache.Count);

        fail = false;
        Assert.True(await cache.RefreshAsync(client, NullLogger.Instance, CancellationToken.None));
        Assert.Equal(3, cache.Count);
        Assert.Equal(2, handler.Calls);
    }

    [Fact]
    public async Task Refresh_keeps_the_previous_map_when_a_later_fetch_times_out()
    {
        var fail = false;
        var handler = new StubHandler((_, _) => fail
            ? Task.FromException<HttpResponseMessage>(new TaskCanceledException("timeout"))
            : Ok());
        var client = Client(handler);
        var cache = new LoopRegistryCache();
        Assert.True(await cache.RefreshAsync(client, NullLogger.Instance, CancellationToken.None));

        fail = true;
        Assert.False(await cache.RefreshAsync(client, NullLogger.Instance, CancellationToken.None));
        Assert.Equal(3, cache.Count);
        Assert.True(cache.TryResolve("FIC10302", out _));
    }

    [Fact]
    public async Task Refresh_still_propagates_a_real_shutdown()
    {
        using var cts = new CancellationTokenSource();
        var handler = new StubHandler((_, ct) =>
        {
            cts.Cancel();
            ct.ThrowIfCancellationRequested();
            return Ok();
        });
        var cache = new LoopRegistryCache();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => cache.RefreshAsync(Client(handler), NullLogger.Instance, cts.Token));
    }
}
