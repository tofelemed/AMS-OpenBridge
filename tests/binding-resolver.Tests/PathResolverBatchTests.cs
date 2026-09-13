// CHG-024 (batch 2) — POST /resolve/batch resolves every path with ONE asset-model call.
//
// The batch endpoint used to fan out one GET /assets/by-path/{path} per binding (N EF queries,
// N round trips). asset-model's POST /assets/by-paths already answers up to 2,000 paths in one
// query, with missing paths simply absent. ResolveManyAsync uses it and keeps the per-path
// contract: found → authoritative binding (provenance "asset-model"); absent → path-derived
// fallback for that path only; asset-model unreachable → every path falls back, as today.
// No Redis and no real asset-model: a stub handler answers the one route.
using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Traverse.BindingResolver.Services;
using Xunit;

namespace Traverse.BindingResolver.Tests;

public sealed class PathResolverBatchTests
{
    private static PathResolver Resolver(AssetModelStub stub)
        => new(redis: null!,            // never dereferenced by the resolution paths
               new StubFactory(stub),
               new ConfigurationBuilder().Build(),
               NullLogger<PathResolver>.Instance);

    [Fact]
    public async Task Resolves_every_path_with_one_by_paths_request_and_keeps_input_order()
    {
        var stub = new AssetModelStub(known: new[] { "site/unit/pumpA.pv", "site/unit/pumpC.op" });
        var resolver = Resolver(stub);

        var results = await resolver.ResolveManyAsync(new[]
        {
            ("site/unit/pumpA.pv", new[] { "live" }),
            ("site/unit/pumpB.sp", new[] { "live" }),
            ("site/unit/pumpC.op", new[] { "all" }),
        });

        stub.Requests.Should().HaveCount(1);
        stub.Requests[0].Path.Should().Be("/assets/by-paths");
        stub.Requests[0].Paths.Should().BeEquivalentTo(new[] { "site/unit/pumpA.pv", "site/unit/pumpB.sp", "site/unit/pumpC.op" });

        results.Select(r => r.ContextualPath).Should().Equal("site/unit/pumpA.pv", "site/unit/pumpB.sp", "site/unit/pumpC.op");
        results[0].Provenance.Should().Be("asset-model");
        results[0].Resolved.Should().BeTrue();
        results[0].Live.Should().NotBeNull();
        results[1].Provenance.Should().Be("fallback", "the asset is not registered, so that path alone falls back");
        results[2].Provenance.Should().Be("asset-model");
        results[2].History.Should().NotBeNull("roles=all resolves history too");
    }

    [Fact]
    public async Task Duplicate_paths_are_sent_once_and_answered_for_each_input()
    {
        var stub = new AssetModelStub(known: new[] { "s/u/x.pv" });
        var results = await Resolver(stub).ResolveManyAsync(new[] { ("s/u/x.pv", new[] { "live" }), ("s/u/x.pv", new[] { "history" }) });

        stub.Requests.Single().Paths.Should().Equal("s/u/x.pv");
        results.Should().HaveCount(2);
        results[0].Live.Should().NotBeNull(); results[0].History.Should().BeNull();
        results[1].History.Should().NotBeNull(); results[1].Live.Should().BeNull();
    }

    [Fact]
    public async Task When_asset_model_is_unreachable_every_path_falls_back_like_the_single_resolver()
    {
        var stub = new AssetModelStub(known: Array.Empty<string>(), status: HttpStatusCode.ServiceUnavailable);
        var results = await Resolver(stub).ResolveManyAsync(new[] { ("s/u/a.pv", new[] { "live" }), ("s/u/b.pv", new[] { "live" }) });

        results.Should().HaveCount(2);
        results.Should().OnlyContain(r => r.Provenance == "fallback");
    }

    [Fact]
    public async Task An_empty_batch_makes_no_request()
    {
        var stub = new AssetModelStub(known: Array.Empty<string>());
        var results = await Resolver(stub).ResolveManyAsync(Array.Empty<(string, string[])>());

        results.Should().BeEmpty();
        stub.Requests.Should().BeEmpty();
    }

    [Fact]
    public async Task Batch_and_single_resolution_agree_for_a_registered_and_an_unregistered_path()
    {
        var stub = new AssetModelStub(known: new[] { "s/u/reg.pv" });
        var resolver = Resolver(stub);

        var single = new[] { await resolver.ResolveAsync("s/u/reg.pv", new[] { "all" }), await resolver.ResolveAsync("s/u/none.pv", new[] { "all" }) };
        var batch = await resolver.ResolveManyAsync(new[] { ("s/u/reg.pv", new[] { "all" }), ("s/u/none.pv", new[] { "all" }) });

        for (var i = 0; i < 2; i++)
        {
            batch[i].Provenance.Should().Be(single[i].Provenance);
            batch[i].Resolved.Should().Be(single[i].Resolved);
            JsonSerializer.Serialize(batch[i].Live).Should().Be(JsonSerializer.Serialize(single[i].Live));
            JsonSerializer.Serialize(batch[i].History).Should().Be(JsonSerializer.Serialize(single[i].History));
        }
    }

    // ── fakes ──────────────────────────────────────────────────────────────

    private sealed class StubFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false) { BaseAddress = new Uri("http://asset-model") };
    }

    public sealed record Captured(string Path, List<string> Paths);

    /// <summary>Answers GET /assets/by-path/{path} (single) and POST /assets/by-paths (batch) for the known paths.</summary>
    private sealed class AssetModelStub(string[] known, HttpStatusCode status = HttpStatusCode.OK) : HttpMessageHandler
    {
        public List<Captured> Requests { get; } = new();

        private static string AssetJson(string path)
        {
            var device = path.Split('/')[^1].Split('.')[0];
            var metric = path.Contains('.') ? path.Split('.')[^1] : null;
            return $$"""
                {"id":"{{Guid.NewGuid()}}","contextualPath":"{{path}}","name":"{{device}}","ioTDbPath":"root.site.unit.{{device}}",
                 "sparkplugGroup":"site","sparkplugEdgeNode":"site_edge1","sparkplugDevice":"unit_{{device}}",
                 "sparkplugMetric":{{(metric is null ? "null" : $"\"{metric}\"")}},"sparkplugTopic":"spBv1.0/site/DDATA/site_edge1/unit_{{device}}",
                 "alarmSource":"{{device}}","redisSnapshotKey":null}
                """;
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var path = Uri.UnescapeDataString(request.RequestUri!.AbsolutePath);
            if (request.Method == HttpMethod.Post && path == "/assets/by-paths")
            {
                using var doc = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
                var paths = doc.RootElement.GetProperty("paths").EnumerateArray().Select(p => p.GetString()!).ToList();
                Requests.Add(new Captured(path, paths));
                if (status != HttpStatusCode.OK) return new HttpResponseMessage(status);
                var found = paths.Distinct().Where(known.Contains).Select(AssetJson);
                return Json("[" + string.Join(",", found) + "]");
            }
            if (request.Method == HttpMethod.Get && path.StartsWith("/assets/by-path/"))
            {
                var p = path["/assets/by-path/".Length..];
                Requests.Add(new Captured("/assets/by-path", new List<string> { p }));
                if (status != HttpStatusCode.OK) return new HttpResponseMessage(status);
                return known.Contains(p) ? Json(AssetJson(p)) : new HttpResponseMessage(HttpStatusCode.NotFound);
            }
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        }

        private static HttpResponseMessage Json(string body) =>
            new(HttpStatusCode.OK) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") };
    }
}
