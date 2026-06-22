using AMS.Infrastructure.Health;
using AMS.Infrastructure.Repositories;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AMS.Api.Controllers.V1;

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/health")]
[Produces("application/json")]
public sealed class HealthPipelineController : ControllerBase
{
    private readonly PipelineHealthService _health;
    private readonly IOpcConnectionRepository _opcConnections;
    private readonly IConfiguration _config;

    public HealthPipelineController(
        PipelineHealthService health,
        IOpcConnectionRepository opcConnections,
        IConfiguration config)
    {
        _health = health;
        _opcConnections = opcConnections;
        _config = config;
    }

    [HttpGet("pipeline")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPipeline(CancellationToken ct)
    {
        var report = await _health.GetAsync(ct, _opcConnections);
        return Ok(report);
    }

    [HttpGet("kafka")]
    [AllowAnonymous]
    public async Task<IActionResult> GetKafka(CancellationToken ct)
    {
        var report = await _health.GetAsync(ct, _opcConnections);
        var topic = _config["Kafka:RawAlarmsTopic"] ?? "raw-alarms";
        var healthy = string.Equals(report.Kafka.BrokerHealth, "Healthy", StringComparison.OrdinalIgnoreCase);
        return Ok(new
        {
            status = healthy && report.Kafka.Lag == 0 ? "Healthy" : "Degraded",
            topic,
            messagesPerMinute = (int)Math.Round(report.Kafka.Throughput * 60.0),
            consumerLag = report.Kafka.Lag
        });
    }
}
