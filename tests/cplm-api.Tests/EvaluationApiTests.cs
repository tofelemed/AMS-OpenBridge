// CHG-102 Phase 5c - POST /analysis-runs {purpose: EVALUATE} and GET /analysis-runs/{id} through the controller on the lab
// traverse_cplm: what is refused (off, unknown loop, out-of-scope site, bad window, a key reused for another request) and
// the 202 / 200 bodies the Workbench is built from. The registry is a stub (only GetAsync answers).
using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.OnDemand;
using Xunit;

namespace Traverse.CplmApi.Tests;

/// <summary>An interface stub: GetAsync answers from a dictionary; every other member throws.</summary>
public class RegistryStub : DispatchProxy
{
    public Dictionary<string, CpmLoopDto> Loops { get; } = new(StringComparer.OrdinalIgnoreCase);

    protected override object? Invoke(MethodInfo? m, object?[]? args)
    {
        if (m?.Name == nameof(ICpmLoopRegistryService.GetAsync) && args?[0] is string id)
            return Task.FromResult(Loops.TryGetValue(id, out var l) ? l : null);
        throw new NotSupportedException(m?.Name);
    }

    public static (ICpmLoopRegistryService Service, RegistryStub Stub) Create()
    {
        var p = DispatchProxy.Create<ICpmLoopRegistryService, RegistryStub>();
        return (p, (RegistryStub)(object)p);
    }
}

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class EvaluationApiTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly string _loop = "ZZ_EVALAPI_" + Guid.NewGuid().ToString("N")[..8];
    private readonly FakeEvaluationPublisher _pub = new();
    private static readonly JsonSerializerOptions Camel = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); return Task.CompletedTask; }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.analysis_run WHERE loop_id = @l", new { l = _loop });
        await _db.DisposeAsync();
    }

    private CpmAnalysisRunsController Controller(bool enabled = true, string user = "zz-evalapi-a", string? sites = null, string? key = null)
    {
        var (registry, stub) = RegistryStub.Create();
        stub.Loops[_loop] = new CpmLoopDto(_loop, null, _loop, "hdpe", null, null, "flow", "LOW", true, true,
            new Dictionary<string, string>(), Array.Empty<string>(), Array.Empty<CpmLoopLinkDto>(), false, null);
        var svc = new EvaluationService(new EvaluationRunStore(_db), _pub, new EvaluationOptions { Enabled = enabled },
            new IotDbWriteOptions { LoopRootPrefix = "root.hdpe.cpm" }, NullLogger<EvaluationService>.Instance);
        var c = new CpmAnalysisRunsController(null!, registry, new MethodRunResolver(_db), NullLogger<CpmAnalysisRunsController>.Instance,
            svc, Microsoft.Extensions.Options.Options.Create(new EvidenceArchiveOptions { HistorianRetentionDays = 90 }));
        var http = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("preferred_username", user) }, "test")) };
        if (sites is not null) http.Request.Headers[SiteScope.Header] = sites;
        if (key is not null) http.Request.Headers["Idempotency-Key"] = key;
        c.ControllerContext = new ControllerContext { HttpContext = http };
        return c;
    }

    private static CpmAnalysisRunsController.CreateRequest Eval(string loop, string? kind = null, long? endMs = null)
        => new(loop, "EVALUATE", null, null, WindowKind: kind, EndMs: endMs);

    private static (int Status, JsonElement Body) Unpack(IActionResult r)
    {
        var o = (ObjectResult)r;
        return (o.StatusCode ?? 200, JsonDocument.Parse(JsonSerializer.Serialize(o.Value, Camel)).RootElement);
    }

    [Fact]
    public async Task What_it_refuses()
    {
        Unpack(await Controller(enabled: false).Create(Eval(_loop), default)).Status.Should().Be(503);
        Unpack(await Controller().Create(Eval("ZZ_NOT_REGISTERED"), default)).Status.Should().Be(404);
        Unpack(await Controller().Create(Eval(""), default)).Status.Should().Be(400);
        Unpack(await Controller(sites: "other-site").Create(Eval(_loop), default)).Status.Should().Be(403);
        var (status, body) = Unpack(await Controller().Create(Eval(_loop, "2h"), default));
        status.Should().Be(400);
        body.GetProperty("error").GetString().Should().Be("INVALID_WINDOW");
        Unpack(await Controller().Create(Eval(_loop, "12h", DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeMilliseconds()), default)).Status.Should().Be(400);
        Unpack(await Controller().Create(new(_loop, "NOPE", null, null), default)).Status.Should().Be(400);
        _pub.Sent.Should().BeEmpty();
    }

    [Fact]
    public async Task Accepted_then_the_same_window_returns_the_run_and_get_serves_it()
    {
        var end = DateTimeOffset.UtcNow.AddHours(-1).ToUnixTimeMilliseconds();
        var (status, body) = Unpack(await Controller(sites: "hdpe").Create(Eval(_loop, "4h", end), default));
        status.Should().Be(202);
        var id = body.GetProperty("analysisRunId").GetGuid();
        body.GetProperty("state").GetString().Should().Be("QUEUED");
        body.GetProperty("windowKind").GetString().Should().Be("4h");
        body.GetProperty("fromMs").GetInt64().Should().Be(end - 4 * 3_600_000L);
        body.GetProperty("toMs").GetInt64().Should().Be(end);
        body.GetProperty("statusUrl").GetString().Should().Be($"/api/v1/cpm/analysis-runs/{id}");
        _pub.Sent.Should().ContainSingle().Which.IotDbDevice.Should().Be("root.hdpe.cpm." + _loop);

        var (again, againBody) = Unpack(await Controller(user: "zz-evalapi-b").Create(Eval(_loop, "4h", end), default));
        again.Should().Be(200);
        againBody.GetProperty("analysisRunId").GetGuid().Should().Be(id);
        againBody.GetProperty("cached").GetBoolean().Should().BeFalse("in flight, not cached");
        againBody.GetProperty("purpose").GetString().Should().Be("EVALUATE");

        var (get, getBody) = Unpack(await Controller().Get(id, default));
        get.Should().Be(200);
        getBody.GetProperty("state").GetString().Should().Be("QUEUED");
        getBody.GetProperty("finished").GetBoolean().Should().BeFalse();
        Unpack(await Controller(sites: "other-site").Get(id, default)).Status.Should().Be(403, "GET is site-scoped too");
    }

    [Fact]
    public async Task A_key_reused_for_another_window_is_a_conflict()
    {
        var end = DateTimeOffset.UtcNow.AddHours(-2).ToUnixTimeMilliseconds();
        var key = _loop + "-key";
        Unpack(await Controller(key: key).Create(Eval(_loop, "12h", end), default)).Status.Should().Be(202);
        var (status, body) = Unpack(await Controller(key: key).Create(Eval(_loop, "12h", end), default));
        status.Should().Be(200, "the same request under the same key is that run");
        var (conflict, cBody) = Unpack(await Controller(key: key).Create(Eval(_loop, "24h", end), default));
        conflict.Should().Be(409);
        cBody.GetProperty("error").GetString().Should().Be("IDEMPOTENCY_KEY_REUSED");
        Unpack(await Controller(user: "zz-evalapi-b", key: key).Create(Eval(_loop, "24h", end), default)).Status
            .Should().Be(202, "another user's key is not this user's");
        body.GetProperty("analysisRunId").GetGuid().Should().NotBeEmpty();
    }
}
