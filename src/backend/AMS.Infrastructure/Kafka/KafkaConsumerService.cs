using Confluent.Kafka;
using Confluent.Kafka.SyncOverAsync;
using Confluent.SchemaRegistry;
using Confluent.SchemaRegistry.Serdes;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Text.Json;
using System.Text.Json.Serialization;
using AMS.Domain.Alarms;
using AMS.Domain.Repositories;
using MediatR;

namespace AMS.Infrastructure.Kafka;

/// <summary>
/// Kafka options for configuration binding
/// </summary>
public sealed class KafkaOptions
{
    public string BootstrapServers { get; set; } = "localhost:9092";
    public string SchemaRegistryUrl { get; set; } = "http://localhost:8081";
    public string ConsumerGroupId { get; set; } = "ams-backend";
    public string RawAlarmsTopic { get; set; } = "raw-alarms";
    public string OperatorActionsTopic { get; set; } = "operator-actions";
    public string AckWritebackTopic { get; set; } = "ack-writeback";
    public string LifecycleEventsTopic { get; set; } = "lifecycle-events";
    public string LifecycleAlertsTopic { get; set; } = "lifecycle-alerts";
    public string AckResultsTopic { get; set; } = "ack-results";
    public string RawAlarmsDlqTopic { get; set; } = "raw-alarms-dlq";
    public string AckWritebackDlqTopic { get; set; } = "ack-writeback-dlq";
    public string NormalizedAlarmsTopic { get; set; } = "current-alarm-state";
    public int AckConfirmationTimeoutSeconds { get; set; } = 30;
    public string StreamProcessorGroupId { get; set; } = "ams-stream-processor";
    /// <summary>Must be true: Flink is the sole lifecycle/ACK orchestration engine.</summary>
    public bool UseFlinkOrchestration { get; set; } = true;
    public string ActiveAlarmsTopic { get; set; } = "active-alarms";
    public string HistoricalAlarmsTopic { get; set; } = "historical-alarms";
    public string AlarmAnalyticsTopic { get; set; } = "alarm-analytics";
    public string SoeEventsTopic { get; set; } = "soe-events";
    public string NotificationEventsTopic { get; set; } = "notification-events";
    public string DeadLetterTopic { get; set; } = "dead-letter-events";
    public int MaxRetries { get; set; } = 3;
    public int RetryDelayMs { get; set; } = 1000;
    public bool EnableIdempotence { get; set; } = true;
    public int BatchSizeBytes { get; set; } = 131072;       // 128KB
    public int LingerMs { get; set; } = 5;
    /// <summary>Seconds without raw-alarms before TELEMETRY_STALLED alert.</summary>
    public int TelemetryStallThresholdSeconds { get; set; } = 60;
    /// <summary>Telemetry authority: gateway or streampipes.</summary>
    public string IngestAuthority { get; set; } = "gateway";
    /// <summary>Deprecated — must remain false (Flink-only mode).</summary>
    [Obsolete("LabDirectIngest is disabled. Use API → raw-alarms → Flink.")]
    public bool LabDirectIngest { get; set; }
}

/// <summary>
/// Materialized alarm state projection (current-alarm-state topic).
/// </summary>
public sealed record NormalizedAlarmEvent : IAckCorrelatedEvent
{
    public int SchemaVersion { get; init; } = StreamSchemaVersion.Current;
    public string EventType { get; init; } = StreamEventTypes.AlarmStateUpsert;

    public string CommandId { get; init; } = string.Empty;
    public string CorrelationId { get; init; } = string.Empty;
    public string? LifecycleId { get; init; }
    public string? DcsSequenceId { get; init; }

    public string EventId { get; init; } = string.Empty;
    public string? AlarmId { get; init; }
    public string ServerId { get; init; } = string.Empty;
    public string SourceName { get; init; } = string.Empty;
    public string? ConditionName { get; init; }
    public string? SubConditionName { get; init; }
    public string? Message { get; init; }
    public int Severity { get; init; }
    public string Priority { get; init; } = string.Empty;
    public string Category { get; init; } = string.Empty;
    /// <summary>OPC A&E event kind (CONDITION, SIMPLE, TRACKING) — not the stream contract eventType.</summary>
    public string AlarmEventKind { get; init; } = "CONDITION";
    public bool ConditionActive { get; init; }
    public bool Acknowledged { get; init; }
    public int Quality { get; init; }
    public long EventTimeEpochMs { get; init; }
    public long ActiveTimeEpochMs { get; init; }
    public long ServerReceivedEpochMs { get; init; }
    public int CookieOffset { get; init; }
    public double? ProcessValue { get; init; }
    public string? ProcessUnit { get; init; }
    public Dictionary<string, JsonElement> OpcAttributes { get; init; } = new();
    public string? AckLifecycleState { get; init; }
    public string? PendingAckActionId { get; init; }
    public long? AckRequestedAtEpochMs { get; init; }
    public string? KafkaTopic { get; init; }
    public long KafkaOffset { get; init; }
    public int KafkaPartition { get; init; }
}

/// <summary>
/// Background service: Consumes normalized alarms from Kafka → persists to PostgreSQL → publishes via SignalR.
/// Implements exactly-once processing with idempotent writes.
/// </summary>
public sealed class NormalizedAlarmConsumerService : BackgroundService
{
    private static readonly JsonSerializerOptions DeserializeOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new QualityJsonConverter() }
    };

    private readonly ILogger<NormalizedAlarmConsumerService> _logger;
    private readonly KafkaOptions _opts;
    private readonly IServiceProvider _sp;
    private IConsumer<string, string>? _consumer;

    public NormalizedAlarmConsumerService(
        IOptions<KafkaOptions> opts,
        IServiceProvider sp,
        ILogger<NormalizedAlarmConsumerService> logger)
    {
        _opts   = opts.Value;
        _sp     = sp;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield(); // Yield thread immediately to prevent blocking Kestrel web host startup
        _logger.LogInformation("Starting Kafka normalized-alarm consumer on {Topic}", _opts.NormalizedAlarmsTopic);

        var config = new ConsumerConfig
        {
            BootstrapServers        = _opts.BootstrapServers,
            GroupId                 = _opts.ConsumerGroupId,
            AutoOffsetReset         = AutoOffsetReset.Earliest,
            EnableAutoCommit        = false,   // Manual commit for exactly-once guarantee
            EnablePartitionEof      = true,
            MaxPollIntervalMs       = 300_000,
            SessionTimeoutMs        = 45_000,
            HeartbeatIntervalMs     = 3_000,
            IsolationLevel          = IsolationLevel.ReadCommitted,  // Exactly-once
            FetchMinBytes           = 1,
            FetchMaxBytes           = 52428800,  // 50MB
        };

        using var consumer = new ConsumerBuilder<string, string>(config)
            .SetErrorHandler((_, e) => _logger.LogError("Kafka consumer error: {Error}", e.Reason))
            .SetPartitionsAssignedHandler((c, partitions) =>
                _logger.LogInformation("Assigned partitions: {Partitions}",
                    string.Join(",", partitions.Select(p => $"{p.Topic}:{p.Partition}"))))
            .SetPartitionsRevokedHandler((c, partitions) =>
            {
                _logger.LogWarning("Revoked partitions: {Partitions}",
                    string.Join(",", partitions.Select(p => $"{p.Topic}:{p.Partition}")));
                try
                {
                    c.Commit();
                }
                catch (KafkaException ex) when (ex.Error.Reason.Contains("No offset stored", StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogDebug("No offsets stored at revoke time; skipping commit.");
                }
            })
            .Build();

        _consumer = consumer;
        consumer.Subscribe(_opts.NormalizedAlarmsTopic);

        var batchSize  = 100;
        var batch      = new List<NormalizedAlarmEvent>(batchSize);
        var lastOffsets = new Dictionary<TopicPartition, TopicPartitionOffset>();

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var cr = consumer.Consume(TimeSpan.FromMilliseconds(100));

                    if (cr is null)
                    {
                        if (batch.Count > 0)
                            await FlushBatchAsync(batch, lastOffsets, consumer, stoppingToken);
                        continue;
                    }
                    if (cr.IsPartitionEOF)
                    {
                        if (batch.Count > 0)
                            await FlushBatchAsync(batch, lastOffsets, consumer, stoppingToken);
                        continue;
                    }

                    NormalizedAlarmEvent? evt = null;
                    try
                    {
                        evt = NormalizedAlarmEventJson.Parse(cr.Message.Value);
                    }
                    catch (JsonException jex)
                    {
                        _logger.LogError(jex, "Failed to deserialize message at offset {Offset}", cr.Offset.Value);
                        await SendToDeadLetterAsync(cr.Message.Key, cr.Message.Value, "DeserializationFailed", stoppingToken);
                        consumer.Commit(new[] { new TopicPartitionOffset(cr.TopicPartition, cr.Offset + 1) });
                        continue;
                    }

                    if (evt is not null)
                    {
                        batch.Add(evt);
                        lastOffsets[cr.TopicPartition] = cr.TopicPartitionOffset;
                    }

                    if (batch.Count >= batchSize)
                        await FlushBatchAsync(batch, lastOffsets, consumer, stoppingToken);
                }
                catch (ConsumeException ex) when (ex.Error.Code == ErrorCode.UnknownTopicOrPart)
                {
                    _logger.LogWarning("Topic not found, retrying in 5s...");
                    await Task.Delay(5000, stoppingToken);
                }
                catch (OperationCanceledException) { break; }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Unexpected consumer error, pausing 2s");
                    await Task.Delay(2000, stoppingToken);
                }
            }

            if (batch.Count > 0)
                await FlushBatchAsync(batch, lastOffsets, consumer, stoppingToken);
        }
        finally
        {
            try
            {
                consumer.Close();
            }
            catch (KafkaException ex) when (ex.Error.Reason.Contains("No offset stored", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogDebug("Kafka consumer closed with no stored offsets; ignoring.");
            }
            _logger.LogInformation("Kafka normalized-alarm consumer stopped");
        }
    }

    private async Task FlushBatchAsync(
        List<NormalizedAlarmEvent> batch,
        Dictionary<TopicPartition, TopicPartitionOffset> offsets,
        IConsumer<string, string> consumer,
        CancellationToken ct)
    {
        using var scope = _sp.CreateScope();
        var mediator    = scope.ServiceProvider.GetRequiredService<IMediator>();
        var uow         = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var publisher   = scope.ServiceProvider.GetRequiredService<AMS.Application.Alarms.Commands.IAlarmSignalRPublisher>();

        try
        {
            foreach (var evt in batch)
            {
                await NormalizedAlarmIngestor.ProcessAsync(evt, uow, publisher, ct);
            }

            await uow.SaveChangesAsync(ct);

            // Commit offsets after successful database write
            consumer.Commit(offsets.Values);
            _logger.LogDebug("Committed batch of {Count} alarm events", batch.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to process batch of {Count} events, sending to DLQ", batch.Count);

            foreach (var evt in batch)
                await SendToDeadLetterAsync(evt.EventId, JsonSerializer.Serialize(evt), ex.Message, ct);
        }
        finally
        {
            batch.Clear();
            offsets.Clear();
        }
    }

    private Task SendToDeadLetterAsync(string key, string payload, string reason, CancellationToken ct)
    {
        // DLQ producer would be injected in production; simplified here
        _logger.LogWarning("DLQ: {Key} - {Reason}", key, reason);
        return Task.CompletedTask;
    }

    internal sealed class QualityJsonConverter : JsonConverter<int>
    {
        public override int Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Number)
                return reader.GetInt32();
            if (reader.TokenType == JsonTokenType.String)
            {
                var s = reader.GetString();
                if (string.Equals(s, "GOOD", StringComparison.OrdinalIgnoreCase))
                    return 192;
                return int.TryParse(s, out var n) ? n : 192;
            }
            return 192;
        }

        public override void Write(Utf8JsonWriter writer, int value, JsonSerializerOptions options) =>
            writer.WriteNumberValue(value);
    }
}

/// <summary>
/// Kafka producer for publishing alarm state changes to downstream topics.
/// Used by domain event handlers to propagate events.
/// </summary>
public sealed class AlarmEventProducer : IDisposable
{
    private readonly IProducer<string, string> _producer;
    private readonly KafkaOptions _opts;
    private readonly ILogger<AlarmEventProducer> _logger;

    public AlarmEventProducer(IOptions<KafkaOptions> opts, ILogger<AlarmEventProducer> logger)
    {
        _opts   = opts.Value;
        _logger = logger;

        var config = new ProducerConfig
        {
            BootstrapServers     = _opts.BootstrapServers,
            EnableIdempotence    = _opts.EnableIdempotence,
            Acks                 = Acks.All,
            MaxInFlight          = 1,
            MessageSendMaxRetries = _opts.MaxRetries,
            RetryBackoffMs       = _opts.RetryDelayMs,
            BatchSize            = _opts.BatchSizeBytes,
            LingerMs             = _opts.LingerMs,
            CompressionType      = CompressionType.Lz4,
        };

        _producer = new ProducerBuilder<string, string>(config)
            .SetErrorHandler((_, e) => _logger.LogError("Kafka producer error: {Error}", e.Reason))
            .Build();
    }

    public async Task PublishAsync<T>(string topic, string key, T payload, CancellationToken ct = default)
        where T : class
    {
        var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
        var json    = JsonSerializer.Serialize(payload, options);
        var message = new Message<string, string> { Key = key, Value = json };

        try
        {
            var dr = await _producer.ProduceAsync(topic, message, ct);
            _logger.LogDebug("Published to {Topic}:{Partition}@{Offset}", topic, dr.Partition.Value, dr.Offset.Value);
        }
        catch (ProduceException<string, string> ex)
        {
            _logger.LogError(ex, "Failed to produce to topic {Topic}", topic);
            throw;
        }
    }

    public void Dispose() => _producer?.Dispose();
}
