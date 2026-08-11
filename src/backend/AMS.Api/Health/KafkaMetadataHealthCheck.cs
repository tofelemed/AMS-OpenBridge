// Kafka health via AdminClient METADATA (Plan 10 C1).
//
// The previous check was produce-based: every probe PUBLISHED a synthetic message to
// the server-status topic — a health check that writes into the data plane, forever,
// on a 15s cadence. This one asks the broker for cluster metadata instead: same
// connectivity signal, zero messages.
//
// Results are cached for 5 seconds so stacked probes (readiness + liveness + a human
// hitting /health) cannot pile up broker round-trips or multiply timeout waits.
using Confluent.Kafka;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace AMS.Api.Health;

public sealed class KafkaMetadataHealthCheck : IHealthCheck, IDisposable
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan MetadataTimeout = TimeSpan.FromSeconds(2);

    private readonly IAdminClient _admin;
    private readonly object _gate = new();
    private HealthCheckResult _lastResult = HealthCheckResult.Unhealthy("not probed yet");
    private DateTimeOffset _lastProbe = DateTimeOffset.MinValue;

    public KafkaMetadataHealthCheck(IConfiguration config)
    {
        _admin = new AdminClientBuilder(new AdminClientConfig
        {
            BootstrapServers = config["Kafka:BootstrapServers"] ?? "localhost:9092",
        }).Build();
    }

    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default)
    {
        lock (_gate)
        {
            if (DateTimeOffset.UtcNow - _lastProbe < CacheTtl)
                return Task.FromResult(_lastResult);

            try
            {
                var meta = _admin.GetMetadata(MetadataTimeout);
                _lastResult = HealthCheckResult.Healthy($"{meta.Brokers.Count} broker(s)");
            }
            catch (Exception ex)
            {
                _lastResult = HealthCheckResult.Unhealthy("Kafka metadata unavailable", ex);
            }
            _lastProbe = DateTimeOffset.UtcNow;
            return Task.FromResult(_lastResult);
        }
    }

    public void Dispose() => _admin.Dispose();
}
