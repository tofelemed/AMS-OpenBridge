using System.Text.Json;
using Confluent.Kafka;

namespace Traverse.DisplayService.Services;

/// <summary>
/// Emits governance audit events to the platform audit trail (Kafka topic <c>traverse.cpa.audit-events</c>), which
/// audit-service consumes into its immutable hash-chained store. Phase 5 — this connects the previously
/// disconnected display-events stream to the real audit log instead of inventing a third path.
///
/// Best-effort by design: an audit emit must never fail a display operation, so produce is fire-and-forget
/// and a Kafka outage is logged, not surfaced. The event shape mirrors AMS.AuditService.Models.AuditEvent
/// (the consumer deserializes case-insensitively and computes the hash chain itself).
/// </summary>
public sealed class AuditEmitter : IDisposable
{
    private readonly IProducer<Null, string>? _producer;
    private readonly ILogger<AuditEmitter> _logger;
    private const string Topic = "traverse.cpa.audit-events";

    public AuditEmitter(IConfiguration config, ILogger<AuditEmitter> logger)
    {
        _logger = logger;
        var bootstrap = config["Kafka:BootstrapServers"];
        if (string.IsNullOrWhiteSpace(bootstrap))
        {
            _logger.LogInformation("Kafka:BootstrapServers not configured — audit emit disabled");
            return;
        }
        try
        {
            _producer = new ProducerBuilder<Null, string>(new ProducerConfig
            {
                BootstrapServers = bootstrap,
                // Never let a slow/absent broker block the request thread.
                MessageTimeoutMs = 5000,
                Acks = Acks.Leader,
            }).Build();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not build Kafka producer — audit emit disabled");
        }
    }

    public void Emit(string eventType, string userId, Guid entityId, string entityName, object? after = null)
    {
        if (_producer is null) return;
        try
        {
            var payload = JsonSerializer.Serialize(new
            {
                EventType = eventType,
                TimestampUtc = DateTimeOffset.UtcNow,
                UserId = userId,
                EntityType = "Display",
                EntityId = entityId.ToString(),
                AfterState = after ?? new { name = entityName },
            });
            _producer.Produce(Topic, new Message<Null, string> { Value = payload }, report =>
            {
                if (report.Error.IsError)
                    _logger.LogWarning("Audit emit failed: {Reason}", report.Error.Reason);
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Audit emit threw for {EventType}/{EntityId}", eventType, entityId);
        }
    }

    public void Dispose() => _producer?.Dispose();
}
