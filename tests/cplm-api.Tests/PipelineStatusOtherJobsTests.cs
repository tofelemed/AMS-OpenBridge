// CHG-170 (owner answer 3d) - GET /pipeline-status lists the jobs the engine runs that are not on the required list, each with
// its state (`otherJobs`), so Pipeline Health can show them as rows. A finished on-demand run (a name that carries its run id,
// "... [id]", in a terminal state) is history, not a job, and is left out. The existing fields keep their names and meanings:
// `unexpectedJobs` still names every job off the list, finished runs included. No Flink here: a stub answers /jobs/overview.
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
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class PipelineStatusOtherJobsTests
{
    private const string Overview = """
        {"jobs":[
          {"jid":"a1","name":"AMS - CPLM Short Feature Engine","state":"RUNNING","start-time":1},
          {"jid":"a2","name":"AMS - CPLM On-Demand Evaluation","state":"RUNNING","start-time":1},
          {"jid":"a3","name":"AMS - CPLM Historical Replay [7c1e04a29b3d]","state":"FINISHED","start-time":1},
          {"jid":"a4","name":"AMS - CPLM Evidence Reconstruction [5d2f]","state":"RUNNING","start-time":1},
          {"jid":"a5","name":"AMS Alarm Replay Engine [r-9]","state":"FAILED","start-time":1},
          {"jid":"a6","name":"Ad hoc job","state":"CANCELED","start-time":1},
          {"jid":"a7","name":"Ad hoc job","state":"RESTARTING","start-time":2}
        ]}
        """;

    private static CpmReadinessController Build(HttpMessageHandler handler)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Flink:JobManagerUrl"] = "http://flink-stub:8081",
        }).Build();
        var memory = new MemoryCache(new MemoryCacheOptions());
        return new CpmReadinessController(
            NpgsqlDataSource.Create("Host=127.0.0.1;Port=1;Username=x;Password=x;Database=x"),
            new StubFactory(handler), config, memory, NullLogger<CpmReadinessController>.Instance, new FleetReadCache(memory))
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    // the API serialises with the ASP.NET web defaults (camelCase)
    private static JsonElement Body(IActionResult r) =>
        JsonSerializer.SerializeToElement(((OkObjectResult)r).Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

    [Fact]
    public async Task Lists_every_job_off_the_required_list_with_its_state_leaving_out_finished_on_demand_runs()
    {
        var body = Body(await Build(new OverviewStub(Overview)).GetPipelineStatus(CancellationToken.None));

        var other = body.GetProperty("otherJobs").EnumerateArray()
            .Select(j => (j.GetProperty("name").GetString(), j.GetProperty("state").GetString(), j.GetProperty("running").GetBoolean()))
            .ToList();
        other.Should().Equal(
            ("AMS - CPLM Evidence Reconstruction [5d2f]", "RUNNING", true),
            ("AMS - CPLM On-Demand Evaluation", "RUNNING", true),
            ("Ad hoc job", "RESTARTING", false));
    }

    [Fact]
    public async Task Keeps_the_existing_fields_unchanged()
    {
        var body = Body(await Build(new OverviewStub(Overview)).GetPipelineStatus(CancellationToken.None));

        body.GetProperty("unexpectedJobs").EnumerateArray().Select(j => j.GetString()).Should().BeEquivalentTo(new[]
        {
            "AMS - CPLM On-Demand Evaluation", "AMS - CPLM Historical Replay [7c1e04a29b3d]",
            "AMS - CPLM Evidence Reconstruction [5d2f]", "AMS Alarm Replay Engine [r-9]", "Ad hoc job",
        }, "unexpectedJobs still names every job off the list, a finished run included");
        body.GetProperty("jobs").GetArrayLength().Should().Be(CpmReadinessController.RequiredJobNames.Count);
        body.GetProperty("jobManagerReachable").GetBoolean().Should().BeTrue();
        body.GetProperty("allRequiredRunning").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task An_engine_that_does_not_answer_lists_no_other_job()
    {
        var body = Body(await Build(new DownStub()).GetPipelineStatus(CancellationToken.None));

        body.GetProperty("otherJobs").GetArrayLength().Should().Be(0);
        body.GetProperty("jobManagerReachable").GetBoolean().Should().BeFalse();
    }

    [Theory]
    [InlineData("AMS - CPLM Historical Replay [7c1e04a29b3d]", "FINISHED", false)]
    [InlineData("AMS - CPLM Evidence Reconstruction [5d2f]", "FAILED", false)]
    [InlineData("AMS Alarm Replay Engine [r-9]", "CANCELED", false)]
    [InlineData("AMS - CPLM Historical Replay [7c1e04a29b3d]", "RUNNING", true)]
    [InlineData("AMS - CPLM On-Demand Evaluation", "FINISHED", true)]
    [InlineData("Ad hoc job", "FAILED", true)]
    public void A_job_is_listed_unless_it_is_a_finished_on_demand_run(string name, string state, bool listed)
    {
        PipelineOtherJobs.IsListed(name, state).Should().Be(listed);
    }

    // ── fakes ──────────────────────────────────────────────────────────────

    private sealed class StubFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class OverviewStub(string json) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(request.RequestUri!.AbsolutePath == "/jobs/overview"
                ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") }
                : new HttpResponseMessage(HttpStatusCode.NotFound));
    }

    private sealed class DownStub : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
    }
}
