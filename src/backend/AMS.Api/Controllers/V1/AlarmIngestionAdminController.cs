using AMS.Api.BackgroundServices;
using AMS.Infrastructure.Kafka;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace AMS.Api.Controllers.V1;

/// <summary>HTTP alarm feed configuration and health (sole production ingest source).</summary>
[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/admin/alarm-feed")]
[Produces("application/json")]
public sealed class AlarmIngestionAdminController : ControllerBase
{
    private readonly AlarmIngestionOptions _opts;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly TelemetryIngestState _telemetry;
    private readonly IConfiguration _config;

    public AlarmIngestionAdminController(
        IOptions<AlarmIngestionOptions> opts,
        IHttpClientFactory httpClientFactory,
        TelemetryIngestState telemetry,
        IConfiguration config)
    {
        _opts = opts.Value;
        _httpClientFactory = httpClientFactory;
        _telemetry = telemetry;
        _config = config;
    }

    [HttpGet]
    [Authorize(Policy = "alarm.view")]
    public async Task<IActionResult> GetStatus(CancellationToken ct)
    {
        var feedUrl = string.IsNullOrWhiteSpace(_opts.FeedUrl)
            ? AlarmIngestionOptions.DefaultHttpFeedUrl
            : _opts.FeedUrl;
        var probe = _opts.Enabled
            ? await ProbeFeedAsync(feedUrl, ct)
            : (Success: false, Message: "Alarm ingestion disabled", StatusCode: (int?)null);

        var snap = _telemetry.GetSnapshot();
        return Ok(new AlarmFeedStatusDto(
            Enabled: _opts.Enabled,
            FeedUrl: feedUrl,
            PollIntervalMs: _opts.PollIntervalMs,
            ServerId: _opts.ServerId,
            ServerName: _opts.ServerName,
            Protocol: "HTTP-JSON",
            KafkaTopic: _config["Kafka:RawAlarmsTopic"] ?? "raw-alarms",
            Status: !_opts.Enabled ? "Disabled" : probe.Success ? "Connected" : "Error",
            LastError: probe.Success ? null : probe.Message,
            HttpStatusCode: probe.StatusCode,
            TelemetryState: snap.State,
            SecondsSinceLastEvent: snap.SecondsSinceLastEvent,
            TotalEventsObserved: snap.TotalEventsObserved,
            PipelinePath: "API → raw-alarms → Flink → current-alarm-state → PostgreSQL → SignalR → UI",
            ConfigNote: "Update AlarmIngestion in appsettings or docker-compose and restart ams-api to change the feed URL."));
    }

    [HttpPost("test")]
    [Authorize(Policy = "admin.users.edit")]
    public async Task<IActionResult> TestFeed([FromBody] TestAlarmFeedRequest? request, CancellationToken ct)
    {
        var url = string.IsNullOrWhiteSpace(request?.FeedUrl) ? _opts.FeedUrl : request!.FeedUrl!.Trim();
        if (string.IsNullOrWhiteSpace(url))
            return BadRequest(new { success = false, message = "Feed URL is required." });

        var probe = await ProbeFeedAsync(url, ct);
        return Ok(new { success = probe.Success, message = probe.Message, statusCode = probe.StatusCode });
    }

    private async Task<(bool Success, string Message, int? StatusCode)> ProbeFeedAsync(string url, CancellationToken ct)
    {
        try
        {
            var client = _httpClientFactory.CreateClient("AlarmFeed");
            client.Timeout = TimeSpan.FromSeconds(8);
            using var response = await client.GetAsync(url, ct);
            if (response.IsSuccessStatusCode)
                return (true, $"Feed reachable — HTTP {(int)response.StatusCode}", (int)response.StatusCode);
            var body = await response.Content.ReadAsStringAsync(ct);
            return (false, $"HTTP {(int)response.StatusCode}: {body}", (int)response.StatusCode);
        }
        catch (Exception ex)
        {
            return (false, ex.Message, null);
        }
    }

    public sealed record AlarmFeedStatusDto(
        bool Enabled,
        string FeedUrl,
        int PollIntervalMs,
        string ServerId,
        string ServerName,
        string Protocol,
        string KafkaTopic,
        string Status,
        string? LastError,
        int? HttpStatusCode,
        string TelemetryState,
        double? SecondsSinceLastEvent,
        long TotalEventsObserved,
        string PipelinePath,
        string ConfigNote);

    public sealed record TestAlarmFeedRequest(string? FeedUrl);
}
