using System.Text.Json;
using Confluent.Kafka;

namespace Traverse.IngestionService.Pipeline;

/// <summary>DLQ envelope on traverse.ingestion.ot-dlq (docs/ot-data-integration/09 §5).</summary>
public sealed record DeadLetterRecord(
    string Reason, Guid ConfigId, string MqttTopic, string Payload, long ReceivedAtMs, string? Detail)
{
    public string ToJson() => JsonSerializer.Serialize(new
    {
        reason = Reason,
        config_id = ConfigId,
        mqtt_topic = MqttTopic,
        payload = Payload,
        received_at_ms = ReceivedAtMs,
        detail = Detail,
    });
}

/// <summary>What the subscriber publishes through — faked in integration tests.</summary>
public interface ILoopSampleSink
{
    bool Enabled { get; }
    Task PublishTupleAsync(LoopTuple tuple, CancellationToken ct);
    Task PublishDeadLetterAsync(string key, DeadLetterRecord record, CancellationToken ct);
}

/// <summary>
/// Durable producer for the loop plane: acks=all + idempotent + lz4 — the profile the
/// platform's durable path uses (AMS.Infrastructure KafkaConsumerService), matching the
/// topic's compression and the acks=all/min-ISR HA contract. One producer serves tuples
/// and dead letters; both topics are pre-created (broker auto-create is OFF). Empty
/// bootstrap = pipeline disabled (same convention as AuditEmitter).
/// </summary>
public sealed class LoopSamplePipelineProducer : ILoopSampleSink, IDisposable
{
    private readonly IProducer<string, string>? _producer;
    private readonly string _samplesTopic;
    private readonly string _dlqTopic;

    public LoopSamplePipelineProducer(IConfiguration config, ILogger<LoopSamplePipelineProducer> logger)
    {
        _samplesTopic = Cfg(config["Kafka:LoopSamplesTopic"], "traverse.cpa.loop.samples.v1");
        _dlqTopic = Cfg(config["Kafka:OtDlqTopic"], "traverse.ingestion.ot-dlq");
        var bootstrap = config["Kafka:BootstrapServers"];
        if (string.IsNullOrWhiteSpace(bootstrap))
        {
            logger.LogWarning("Kafka:BootstrapServers not set — loop-sample publishing disabled");
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
        logger.LogInformation("Loop-sample producer ready — tuples → {Samples}, dead letters → {Dlq}",
            _samplesTopic, _dlqTopic);

        static string Cfg(string? value, string fallback) =>
            string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }

    public bool Enabled => _producer is not null;

    /// <summary>Key = loop_id with registry casing — Flink keyBy and per-loop partition
    /// ordering depend on it. Awaits the delivery report: the caller's retry loop IS the
    /// backpressure (QoS-1 messages queue at the MQTT broker while we block).</summary>
    public Task PublishTupleAsync(LoopTuple tuple, CancellationToken ct) =>
        _producer!.ProduceAsync(_samplesTopic,
            new Message<string, string> { Key = tuple.LoopId, Value = tuple.ToJson() }, ct);

    public Task PublishDeadLetterAsync(string key, DeadLetterRecord record, CancellationToken ct) =>
        _producer!.ProduceAsync(_dlqTopic,
            new Message<string, string> { Key = key, Value = record.ToJson() }, ct);

    public void Dispose()
    {
        try { _producer?.Flush(TimeSpan.FromSeconds(5)); } catch { /* shutting down */ }
        _producer?.Dispose();
    }
}
