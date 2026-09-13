// CHG-024 (batch 1) — readiness's binding-provenance check.
//
// It used to issue one GET /resolve per mapped role (pv, sp, op, vp, mode) to
// binding-resolver, five awaited round trips with a 5 s budget each, on every loop click in
// the Explorer. The resolver's POST /resolve/batch already answers many paths in one call,
// aligned by index. The check now sends the mapped roles in one request and reads
// `provenance` per index; the labels, their order and the message text are unchanged.
using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class BindingProvenanceProbeTests
{
    private static JsonElement Tags(params (string Role, string Path)[] pairs)
    {
        var obj = string.Join(",", pairs.Select(p => $"\"{p.Role}\":\"{p.Path}\""));
        return JsonDocument.Parse("{" + obj + "}").RootElement.Clone();
    }

    private static readonly Dictionary<string, string> Headers = new()
    {
        ["X-Auth-Subject"] = "u1", ["X-Auth-Username"] = "eng", ["X-Auth-Role"] = "engineer", ["X-Auth-Permissions"] = "analytics.view",
    };

    [Fact]
    public async Task Sends_every_mapped_role_in_one_batch_request_in_role_order()
    {
        var stub = new ResolverStub(provenanceByPath: new() { ["s/u/pv"] = "asset-model", ["s/u/sp"] = "asset-model", ["s/u/op"] = "asset-model", ["s/u/vp"] = "asset-model", ["s/u/mode"] = "asset-model" });
        var tags = Tags(("mode", "s/u/mode"), ("pv", "s/u/pv"), ("sp", "s/u/sp"), ("op", "s/u/op"), ("vp", "s/u/vp"));

        var (ok, message) = await BindingProvenanceProbe.CheckAsync(new HttpClient(stub), "http://resolver", tags, Headers, NullLogger.Instance, CancellationToken.None);

        ok.Should().BeTrue();
        message.Should().BeNull();
        stub.Requests.Should().HaveCount(1);
        stub.Requests[0].Method.Should().Be(HttpMethod.Post);
        stub.Requests[0].Path.Should().Be("/resolve/batch");
        stub.Requests[0].Paths.Should().Equal("s/u/pv", "s/u/sp", "s/u/op", "s/u/vp", "s/u/mode");
        stub.Requests[0].Roles.Should().AllBeEquivalentTo(new[] { "live" });
        stub.Requests[0].Headers.Should().Contain(Headers);
    }

    [Fact]
    public async Task Reports_the_roles_that_resolved_by_fallback_in_role_order()
    {
        var stub = new ResolverStub(provenanceByPath: new() { ["p1"] = "asset-model", ["p2"] = "fallback", ["p3"] = "asset-model", ["p4"] = "fallback" });
        var tags = Tags(("pv", "p1"), ("sp", "p2"), ("op", "p3"), ("mode", "p4"));

        var (ok, message) = await BindingProvenanceProbe.CheckAsync(new HttpClient(stub), "http://resolver", tags, Headers, NullLogger.Instance, CancellationToken.None);

        ok.Should().BeFalse();
        message.Should().StartWith("Resolved by path fallback, not the asset model: sp, mode.");
    }

    [Fact]
    public async Task Skips_roles_without_a_mapping_and_passes_when_nothing_is_mapped()
    {
        var stub = new ResolverStub(provenanceByPath: new());
        var (ok, message) = await BindingProvenanceProbe.CheckAsync(new HttpClient(stub), "http://resolver", Tags(), Headers, NullLogger.Instance, CancellationToken.None);

        ok.Should().BeTrue();        // no mapped roles → nothing can be wrong (unchanged behaviour)
        message.Should().BeNull();
        stub.Requests.Should().BeEmpty("there is nothing to ask");
    }

    [Fact]
    public async Task A_non_object_tags_value_is_reported_as_no_mappings()
    {
        var stub = new ResolverStub(provenanceByPath: new());
        var (ok, message) = await BindingProvenanceProbe.CheckAsync(new HttpClient(stub), "http://resolver", JsonDocument.Parse("null").RootElement.Clone(), Headers, NullLogger.Instance, CancellationToken.None);

        ok.Should().BeFalse();
        message.Should().Be("No signal mappings to check.");
    }

    [Fact]
    public async Task A_failed_batch_marks_every_probed_role_unreachable_with_the_status()
    {
        var stub = new ResolverStub(provenanceByPath: new(), status: HttpStatusCode.ServiceUnavailable);
        var tags = Tags(("pv", "p1"), ("op", "p3"));

        var (ok, message) = await BindingProvenanceProbe.CheckAsync(new HttpClient(stub), "http://resolver", tags, Headers, NullLogger.Instance, CancellationToken.None);

        ok.Should().BeFalse();
        message.Should().Contain("pv (unreachable: HTTP 503), op (unreachable: HTTP 503)");
    }

    [Fact]
    public async Task A_missing_binding_in_the_response_counts_as_fallback_for_that_role_only()
    {
        // The resolver aligns by index; a short or malformed answer must not be trusted for the
        // roles it does not cover, and must not hide the ones it does.
        var stub = new ResolverStub(provenanceByPath: new() { ["p1"] = "asset-model" }, truncateTo: 1);
        var tags = Tags(("pv", "p1"), ("sp", "p2"));

        var (ok, message) = await BindingProvenanceProbe.CheckAsync(new HttpClient(stub), "http://resolver", tags, Headers, NullLogger.Instance, CancellationToken.None);

        ok.Should().BeFalse();
        message.Should().StartWith("Resolved by path fallback, not the asset model: sp.");
    }

    // ── stub ───────────────────────────────────────────────────────────────

    public sealed record Captured(HttpMethod Method, string Path, List<string> Paths, List<string[]> Roles, Dictionary<string, string> Headers);

    private sealed class ResolverStub(Dictionary<string, string> provenanceByPath, HttpStatusCode status = HttpStatusCode.OK, int? truncateTo = null) : HttpMessageHandler
    {
        public List<Captured> Requests { get; } = new();

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var body = request.Content is null ? "{}" : await request.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(body);
            var paths = new List<string>(); var roles = new List<string[]>();
            if (doc.RootElement.TryGetProperty("bindings", out var b))
                foreach (var item in b.EnumerateArray())
                {
                    paths.Add(item.GetProperty("path").GetString()!);
                    roles.Add(item.GetProperty("roles").EnumerateArray().Select(r => r.GetString()!).ToArray());
                }
            var headers = request.Headers.Where(h => h.Key.StartsWith("X-Auth-")).ToDictionary(h => h.Key, h => string.Join(",", h.Value));
            Requests.Add(new Captured(request.Method, request.RequestUri!.AbsolutePath, paths, roles, headers));

            if (status != HttpStatusCode.OK) return new HttpResponseMessage(status);
            var answered = truncateTo is { } n ? paths.Take(n) : paths;
            var bindings = answered.Select(p => provenanceByPath.TryGetValue(p, out var prov)
                ? $"{{\"contextualPath\":\"{p}\",\"resolved\":true,\"provenance\":\"{prov}\"}}"
                : $"{{\"contextualPath\":\"{p}\",\"resolved\":false,\"provenance\":\"fallback\"}}");
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"bindings\":[" + string.Join(",", bindings) + "]}", System.Text.Encoding.UTF8, "application/json"),
            };
        }
    }
}
