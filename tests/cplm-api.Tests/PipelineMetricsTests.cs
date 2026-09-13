// CHG-023 — GET /pipeline-metrics (Windows and Pipeline Health, polled every 20 s).
//
// It walked the Flink REST API in series: overview, then per job the checkpoints, the
// job detail and one metrics call per window vertex — 1 + J×(2 + V) awaited round trips
// (8.7 s cold on the lab). Now the per-job work runs concurrently and the result is held
// for a few seconds behind the same single-flight cache the fleet reads use, so N polling
// consoles cost one Flink walk per TTL. No Flink here: a stub handler answers the routes
// with a fixed delay, which is what makes serial vs concurrent observable.
using System.Diagnostics;
using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Data;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class PipelineMetricsTests
{
    private const int DelayMs = 150;

    private static (CpmReadinessController Controller, FlinkStub Stub) Build(int cacheSeconds = 10)
    {
        var stub = new FlinkStub(DelayMs);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Flink:JobManagerUrl"] = "http://flink-stub:8081",
            ["Cpm:PipelineMetricsCacheSeconds"] = cacheSeconds.ToString(),
        }).Build();
        var memory = new MemoryCache(new MemoryCacheOptions());
        var controller = new CpmReadinessController(
            NpgsqlDataSource.Create("Host=127.0.0.1;Port=1;Username=x;Password=x;Database=x"),
            new StubFactory(stub), config, memory, NullLogger<CpmReadinessController>.Instance,
            new FleetReadCache(memory))
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
        return (controller, stub);
    }

    private static JsonElement Body(IActionResult result)
        => JsonSerializer.SerializeToElement(((OkObjectResult)result).Value);

    [Fact]
    public async Task Collects_every_job_concurrently_instead_of_in_series()
    {
        var (controller, stub) = Build();

        var sw = Stopwatch.StartNew();
        var body = Body(await controller.GetPipelineMetrics(CancellationToken.None));
        sw.Stop();

        var jobs = body.GetProperty("jobs").EnumerateArray().ToList();
        jobs.Select(j => j.GetProperty("name").GetString()).Should().BeEquivalentTo(
            new[] { "AMS - CPLM Short Feature Engine", "AMS - CPLM Gate Fusion Engine" });
        foreach (var j in jobs)
        {
            j.GetProperty("checkpoint").GetProperty("completed").GetInt32().Should().Be(5);
            j.GetProperty("lateRecordsDropped").GetInt64().Should().Be(7);
        }
        body.GetProperty("jobManagerReachable").GetBoolean().Should().BeTrue();

        // overview + 2 jobs × (checkpoints + detail + 1 window-vertex metric) = 7 calls
        stub.Calls.Should().Be(7);
        // Serial: 7 × 150 ms ≈ 1.05 s. Concurrent per job: 150 (overview) + 150 + 150 ≈ 0.45 s.
        sw.ElapsedMilliseconds.Should().BeLessThan(DelayMs * 5, "the per-job walks must overlap");
    }

    [Fact]
    public async Task A_second_call_within_the_ttl_is_served_from_the_cache_without_touching_flink()
    {
        var (controller, stub) = Build();

        var first = Body(await controller.GetPipelineMetrics(CancellationToken.None));
        var callsAfterFirst = stub.Calls;
        var second = Body(await controller.GetPipelineMetrics(CancellationToken.None));

        stub.Calls.Should().Be(callsAfterFirst);
        second.GetProperty("collectedAt").GetDateTime().Should().Be(first.GetProperty("collectedAt").GetDateTime(),
            "a cached result must keep the time it was actually collected");
        controller.Response.Headers["X-Cpm-Cache"].ToString().Should().Be("HIT");
    }

    [Fact]
    public async Task A_zero_ttl_walks_flink_on_every_call()
    {
        var (controller, stub) = Build(cacheSeconds: 0);

        await controller.GetPipelineMetrics(CancellationToken.None);
        await controller.GetPipelineMetrics(CancellationToken.None);

        stub.Calls.Should().Be(14);
    }

    // ── fakes ──────────────────────────────────────────────────────────────

    private sealed class StubFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    /// <summary>Answers the four Flink REST routes GetPipelineMetrics walks, each after a fixed delay.</summary>
    private sealed class FlinkStub(int delayMs) : HttpMessageHandler
    {
        private int _calls;
        public int Calls => _calls;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref _calls);
            await Task.Delay(delayMs, ct);
            var path = request.RequestUri!.AbsolutePath;
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            string json;
            if (path == "/jobs/overview")
                json = """
                    {"jobs":[
                      {"jid":"j1","name":"AMS - CPLM Short Feature Engine","state":"RUNNING","start-time":__START__},
                      {"jid":"j2","name":"AMS - CPLM Gate Fusion Engine","state":"RUNNING","start-time":__START__},
                      {"jid":"j9","name":"Not required","state":"RUNNING","start-time":__NOW__}
                    ]}
                    """.Replace("__START__", (now - 60000).ToString()).Replace("__NOW__", now.ToString());
            else if (path.EndsWith("/checkpoints"))
                json = """{"counts":{"completed":5,"failed":1},"latest":{"completed":{"end_to_end_duration":120,"state_size":1000,"latest_ack_timestamp":__NOW__}}}"""
                    .Replace("__NOW__", now.ToString());
            else if (path.Contains("/vertices/"))
                json = """[{"id":"0.Window(x).numLateRecordsDropped","value":"7"}]""";
            else if (path.StartsWith("/jobs/"))
                json = """{"vertices":[{"id":"v1","name":"Window(TumblingEventTimeWindows) -> Sink"},{"id":"v2","name":"Source: Kafka"}]}""";
            else
                return new HttpResponseMessage(HttpStatusCode.NotFound);
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };
        }
    }
}
