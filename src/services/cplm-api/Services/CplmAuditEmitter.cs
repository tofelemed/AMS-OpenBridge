// Extraction Phase 3 COPY of AMS.Api Services/CplmAuditEmitter.cs — mechanical transforms only
// (namespace, literal v1 routes, no Asp.Versioning). The AMS.Api original keeps
// serving until Phase 6 deletes it; behavior changes are forbidden in either copy.
using System.Text.Json;
using Confluent.Kafka;

namespace Traverse.CplmApi.Services;

public interface ICplmAuditEmitter
{
    /// <summary>Fire-and-forget governance audit event onto the platform audit trail.</summary>
    void Emit(string eventType, string userId, string entityType, string entityId, object? after = null);
}

/// <summary>
/// A15 — CPLM governance events onto the immutable audit trail (Kafka topic
/// <c>audit-events</c>, consumed by audit-service into its hash-chained store).
/// Mirrors display-service's AuditEmitter: best-effort by design — an audit
/// emit must never fail the operation it records, so produce is fire-and-forget
/// and a Kafka outage is logged, not surfaced. The event shape matches
/// AMS.AuditService.Models.AuditEvent (case-insensitive deserialization; the
/// consumer computes the hash chain itself).
/// </summary>
public sealed class CplmAuditEmitter : ICplmAuditEmitter, IDisposable
{
    private readonly IProducer<Null, string>? _producer;
    private readonly ILogger<CplmAuditEmitter> _logger;
    private const string Topic = "audit-events";

    public CplmAuditEmitter(IConfiguration config, ILogger<CplmAuditEmitter> logger)
    {
        _logger = logger;
        var bootstrap = config["Kafka:BootstrapServers"];
        if (string.IsNullOrWhiteSpace(bootstrap))
        {
            _logger.LogInformation("Kafka:BootstrapServers not configured — CPLM audit emit disabled");
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
            _logger.LogWarning(ex, "Could not build Kafka producer — CPLM audit emit disabled");
        }
    }

    public void Emit(string eventType, string userId, string entityType, string entityId, object? after = null)
    {
        if (_producer is null) return;
        try
        {
            var payload = JsonSerializer.Serialize(new
            {
                EventType = eventType,
                TimestampUtc = DateTimeOffset.UtcNow,
                UserId = userId,
                EntityType = entityType,
                EntityId = entityId,
                AfterState = after,
            });
            _producer.Produce(Topic, new Message<Null, string> { Value = payload }, report =>
            {
                if (report.Error.IsError)
                    _logger.LogWarning("CPLM audit emit failed: {Reason}", report.Error.Reason);
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "CPLM audit emit threw for {EventType}/{EntityId}", eventType, entityId);
        }
    }

    public void Dispose() => _producer?.Dispose();
}
