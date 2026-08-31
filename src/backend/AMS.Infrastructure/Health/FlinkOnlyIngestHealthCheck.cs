using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace AMS.Infrastructure.Health;

/// <summary>
/// Enforces Flink-only orchestration: API ingestion → traverse.alarm.raw-alarms → Flink → projection consumers.
/// </summary>
public sealed class FlinkOnlyIngestHealthCheck : IHealthCheck
{
    private readonly IConfiguration _config;

    public FlinkOnlyIngestHealthCheck(IConfiguration config) => _config = config;

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        if (!(_config.GetValue("Kafka:UseFlinkOrchestration", true)))
        {
            return Task.FromResult(HealthCheckResult.Unhealthy(
                "Kafka:UseFlinkOrchestration must be true. .NET stream processing is disabled."));
        }

        if (_config.GetValue("Kafka:LabDirectIngest", false))
        {
            return Task.FromResult(HealthCheckResult.Unhealthy(
                "Kafka:LabDirectIngest is not permitted. Use API → traverse.alarm.raw-alarms → Flink only."));
        }

        var authority = (_config["Kafka:IngestAuthority"] ?? "api").Trim().ToLowerInvariant();
        if (authority != "api")
        {
            return Task.FromResult(HealthCheckResult.Unhealthy(
                $"Kafka:IngestAuthority must be 'api'. Got '{authority}'."));
        }

        if (!_config.GetValue("AlarmIngestion:Enabled", false))
        {
            return Task.FromResult(HealthCheckResult.Unhealthy(
                "AlarmIngestion:Enabled must be true. HTTP current-alarms API is the sole ingest source."));
        }

        return Task.FromResult(HealthCheckResult.Healthy(
            "Flink-only orchestration: API → traverse.alarm.raw-alarms → Flink → traverse.alarm.current-alarm-state → PostgreSQL; API projection consumers only."));
    }
}
