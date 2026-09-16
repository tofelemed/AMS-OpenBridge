using Confluent.Kafka;
using Traverse.IngestionService.Pipeline;

namespace Traverse.IngestionService.Health;

/// <summary>What the health subscriber publishes through — faked in tests.</summary>
public interface IInstrumentalHealthSink
{
    bool Enabled { get; }
    Task PublishAsync(string key, string json, CancellationToken ct);
    Task PublishDeadLetterAsync(string key, DeadLetterRecord record, CancellationToken ct);
}

/// <summary>
/// v2.5 Task 1H.2: durable producer for the instrument-health plane (same profile as the loop
/// plane: acks=all, idempotent, lz4). Observations → traverse.cpa.instrument.health.v1 keyed by
/// device_id (availability by source_id); refused messages → traverse.ingestion.health-dlq — a
/// health-specific DLQ so a bad health feed can never stall OT sample ingestion (spec §4.3).
/// Both topics are pre-created (broker auto-create is OFF).
/// </summary>
public sealed class InstrumentalHealthProducer : IInstrumentalHealthSink, IDisposable
{
    private readonly IProducer<string, string>? _producer;
    private readonly string _topic;
    private readonly string _dlqTopic;

    public InstrumentalHealthProducer(IConfiguration config, ILogger<InstrumentalHealthProducer> logger)
    {
        _topic = Cfg(config["Kafka:InstrumentHealthTopic"], "traverse.cpa.instrument.health.v1");
        _dlqTopic = Cfg(config["Kafka:HealthDlqTopic"], "traverse.ingestion.health-dlq");
        var bootstrap = config["Kafka:BootstrapServers"];
        if (string.IsNullOrWhiteSpace(bootstrap))
        {
            logger.LogWarning("Kafka:BootstrapServers not set — instrument-health publishing disabled");
            return;
        }
        _producer = new ProducerBuilder<string, string>(new ProducerConfig
        {
            BootstrapServers = bootstrap,
            EnableIdempotence = true,
            Acks = Acks.All,
            MessageSendMaxRetries = 3,
            RetryBackoffMs = 1000,
            LingerMs = 5,
            CompressionType = CompressionType.Lz4,
        }).Build();
        logger.LogInformation("Instrument-health producer ready — observations → {Topic}, dead letters → {Dlq}", _topic, _dlqTopic);

        static string Cfg(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }

    public bool Enabled => _producer is not null;

    public Task PublishAsync(string key, string json, CancellationToken ct) =>
        _producer!.ProduceAsync(_topic, new Message<string, string> { Key = key, Value = json }, ct);

    public Task PublishDeadLetterAsync(string key, DeadLetterRecord record, CancellationToken ct) =>
        _producer!.ProduceAsync(_dlqTopic, new Message<string, string> { Key = key, Value = record.ToJson() }, ct);

    public void Dispose()
    {
        try { _producer?.Flush(TimeSpan.FromSeconds(5)); } catch { /* shutting down */ }
        _producer?.Dispose();
    }
}
