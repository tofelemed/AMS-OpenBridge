// Mirrors cplm-api's CplmAuditEmitter (which mirrors display-service): best-effort by
// design — an audit emit must never fail the operation it records, so produce is
// fire-and-forget and a Kafka outage is logged, not surfaced. Event shape matches
// AMS.AuditService.Models.AuditEvent.
using System.Text.Json;
using Confluent.Kafka;

namespace Traverse.IngestionService.Services;

public interface IAuditEmitter
{
    /// <summary>Fire-and-forget governance audit event onto the platform audit trail.</summary>
    void Emit(string eventType, string userId, string entityId, object? after = null);
}

public sealed class AuditEmitter : IAuditEmitter, IDisposable
{
    private readonly IProducer<Null, string>? _producer;
    private readonly ILogger<AuditEmitter> _logger;
    private const string Topic = "traverse.cpa.audit-events";
    private const string EntityType = "data-source-config";

    public AuditEmitter(IConfiguration config, ILogger<AuditEmitter> logger)
    {
        _logger = logger;
        var bootstrap = config["Kafka:BootstrapServers"];
        if (string.IsNullOrWhiteSpace(bootstrap))
        {
            _logger.LogInformation("Kafka:BootstrapServers not configured — ingestion audit emit disabled");
            return;
        }
        try
        {
            _producer = new ProducerBuilder<Null, string>(new ProducerConfig
            {
                BootstrapServers = bootstrap,
                MessageTimeoutMs = 5000,
                Acks = Acks.Leader,
            }).Build();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not build Kafka producer — ingestion audit emit disabled");
        }
    }

    public void Emit(string eventType, string userId, string entityId, object? after = null)
    {
        if (_producer is null) return;
        try
        {
            var payload = JsonSerializer.Serialize(new
            {
                EventType = eventType,
                TimestampUtc = DateTimeOffset.UtcNow,
                UserId = userId,
                EntityType,
                EntityId = entityId,
                AfterState = after,
            });
            _producer.Produce(Topic, new Message<Null, string> { Value = payload }, report =>
            {
                if (report.Error.IsError)
                    _logger.LogWarning("Ingestion audit emit failed: {Reason}", report.Error.Reason);
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Ingestion audit emit threw for {EventType}/{EntityId}", eventType, entityId);
        }
    }

    public void Dispose() => _producer?.Dispose();
}
