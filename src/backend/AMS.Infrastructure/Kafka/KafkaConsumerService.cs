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

    /// <summary>Events routed to the DLQ after all persistence retries failed. Alert on any increase.</summary>
    private static readonly Prometheus.Counter DlqEvents = Prometheus.Metrics.CreateCounter(
        "ams_projection_dlq_events_total",
        "Normalized alarm events routed to the dead-letter topic after exhausting retries.",
        new Prometheus.CounterConfiguration { LabelNames = new[] { "reason" } });

    /// <summary>Batch persistence attempts that failed and were retried.</summary>
    private static readonly Prometheus.Counter FlushRetries = Prometheus.Metrics.CreateCounter(
        "ams_projection_flush_retries_total",
        "Projection batch persistence attempts that failed and were retried.");

    private const int MaxFlushAttempts = 4;

    private readonly ILogger<NormalizedAlarmConsumerService> _logger;
    private readonly KafkaOptions _opts;
    private readonly IServiceProvider _sp;
    private readonly AlarmEventProducer _producer;
    private IConsumer<string, string>? _consumer;

    // Batch state is instance-level so the partitions-revoked handler can drain it before
    // the rebalance completes (STR-09): committing the consume position while records sit
    // un-persisted in this list would acknowledge events that never reached PostgreSQL.
    private readonly List<NormalizedAlarmEvent> _batch = new(100);
    private readonly Dictionary<TopicPartition, TopicPartitionOffset> _offsets = new();
    private readonly SemaphoreSlim _flushLock = new(1, 1);

    public NormalizedAlarmConsumerService(
        IOptions<KafkaOptions> opts,
        IServiceProvider sp,
        AlarmEventProducer producer,
        ILogger<NormalizedAlarmConsumerService> logger)
    {
        _opts     = opts.Value;
        _sp       = sp;
        _producer = producer;
        _logger   = logger;
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

                // STR-09: never bare-Commit() here. A bare commit acknowledges the current
                // consume position, which includes records still sitting un-persisted in
                // _batch — those events would be lost to the incoming owner. Instead drain
                // the batch; FlushBatchAsync commits only after PostgreSQL accepted the write.
                // If the drain fails we deliberately commit nothing and let the new owner
                // re-read from the last durable offset.
                try
                {
                    FlushBatchAsync(c, CancellationToken.None).GetAwaiter().GetResult();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex,
                        "Failed to drain {Count} pending events during partition revoke; " +
                        "offsets left uncommitted for redelivery.", _batch.Count);
                }
            })
            .Build();

        _consumer = consumer;
        consumer.Subscribe(_opts.NormalizedAlarmsTopic);

        const int batchSize = 100;

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var cr = consumer.Consume(TimeSpan.FromMilliseconds(100));

                    if (cr is null || cr.IsPartitionEOF)
                    {
                        if (_batch.Count > 0)
                            await FlushBatchAsync(consumer, stoppingToken);
                        continue;
                    }

                    NormalizedAlarmEvent? evt = null;
                    try
                    {
                        evt = NormalizedAlarmEventJson.Parse(cr.Message.Value);
                    }
                    catch (JsonException jex)
                    {
                        // A message we cannot even parse will never succeed on retry, so it goes
                        // straight to the DLQ. Only skip past it once the DLQ write is durable.
                        _logger.LogError(jex, "Failed to deserialize message at offset {Offset}", cr.Offset.Value);
                        if (await SendToDeadLetterAsync(cr.Message.Key, cr.Message.Value,
                                                        "DeserializationFailed", cr.TopicPartitionOffset, stoppingToken))
                        {
                            consumer.Commit(new[] { new TopicPartitionOffset(cr.TopicPartition, cr.Offset + 1) });
                        }
                        else
                        {
                            _logger.LogError("DLQ write failed for offset {Offset}; not committing so it is redelivered.",
                                cr.Offset.Value);
                            await Task.Delay(2000, stoppingToken);
                        }
                        continue;
                    }

                    if (evt is not null)
                    {
                        _batch.Add(evt);
                        _offsets[cr.TopicPartition] = cr.TopicPartitionOffset;
                    }

                    if (_batch.Count >= batchSize)
                        await FlushBatchAsync(consumer, stoppingToken);
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

            if (_batch.Count > 0)
                await FlushBatchAsync(consumer, stoppingToken);
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

    /// <summary>
    /// Persists the pending batch and commits its offsets only once PostgreSQL has accepted
    /// the write (DOM-01). A transient database failure is retried with exponential backoff;
    /// the batch and its offsets are retained across attempts so nothing is acknowledged early.
    /// Only after every retry is exhausted are the events routed to the dead-letter topic, and
    /// even then the offsets advance only if the DLQ write itself succeeded — otherwise the
    /// batch stays put and is redelivered rather than silently dropped.
    /// </summary>
    private async Task FlushBatchAsync(IConsumer<string, string> consumer, CancellationToken ct)
    {
        await _flushLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (_batch.Count == 0) return;

            for (var attempt = 1; attempt <= MaxFlushAttempts; attempt++)
            {
                try
                {
                    using var scope = _sp.CreateScope();
                    var uow       = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
                    var publisher = scope.ServiceProvider
                        .GetRequiredService<AMS.Application.Alarms.Commands.IAlarmSignalRPublisher>();

                    foreach (var evt in _batch)
                        await NormalizedAlarmIngestor.ProcessAsync(evt, uow, publisher, ct);

                    await uow.SaveChangesAsync(ct);

                    // DATA-08: a projection write makes every cached alarm-list read stale —
                    // bump the read-cache version so the next poll re-reads Postgres.
                    scope.ServiceProvider
                        .GetRequiredService<AMS.Infrastructure.Caching.AlarmReadCache>()
                        .Invalidate();

                    // DATA-06: append to the alarm event log only after the projection write
                    // succeeded, so history never records an event that was rolled back.
                    // Failure here must not fail the batch — history is analytics, the
                    // projection is the system of record.
                    try
                    {
                        await uow.HistoricalAlarms.AppendHistoryAsync(BuildHistoryRecords(_batch), ct);
                    }
                    catch (Exception histEx)
                    {
                        _logger.LogError(histEx,
                            "Failed to append {Count} rows to alarm_history; projection is committed and correct.",
                            _batch.Count);
                    }

                    consumer.Commit(_offsets.Values);
                    _logger.LogDebug("Committed batch of {Count} alarm events", _batch.Count);

                    _batch.Clear();
                    _offsets.Clear();
                    return;
                }
                catch (Exception ex) when (attempt < MaxFlushAttempts && !ct.IsCancellationRequested)
                {
                    FlushRetries.Inc();
                    var delay = TimeSpan.FromMilliseconds(250 * Math.Pow(2, attempt - 1));
                    _logger.LogWarning(ex,
                        "Batch persist attempt {Attempt}/{Max} failed for {Count} events; retrying in {Delay}ms. " +
                        "Offsets remain uncommitted.", attempt, MaxFlushAttempts, _batch.Count, delay.TotalMilliseconds);
                    await Task.Delay(delay, ct).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    // Retries exhausted (or shutting down): route to the DLQ. Commit only if
                    // every event was durably accepted by the dead-letter topic.
                    _logger.LogError(ex,
                        "Batch of {Count} events failed after {Max} attempts; routing to DLQ {Topic}",
                        _batch.Count, MaxFlushAttempts, _opts.RawAlarmsDlqTopic);

                    var allDelivered = true;
                    foreach (var evt in _batch)
                    {
                        var delivered = await SendToDeadLetterAsync(
                            evt.EventId,
                            JsonSerializer.Serialize(evt),
                            ex.GetType().Name + ": " + ex.Message,
                            null,
                            ct).ConfigureAwait(false);
                        allDelivered &= delivered;
                    }

                    if (allDelivered)
                    {
                        consumer.Commit(_offsets.Values);
                        _batch.Clear();
                        _offsets.Clear();
                    }
                    else
                    {
                        _logger.LogCritical(
                            "DLQ write failed for part of a {Count}-event batch; offsets NOT committed. " +
                            "Events will be redelivered — investigate broker availability.", _batch.Count);
                    }
                    return;
                }
            }
        }
        finally
        {
            _flushLock.Release();
        }
    }

    /// <summary>
    /// Publishes a poison/failed event to the dead-letter topic. Returns true only when the
    /// broker acknowledged the write, so callers can decide whether it is safe to advance offsets.
    /// </summary>
    private async Task<bool> SendToDeadLetterAsync(
        string key,
        string payload,
        string reason,
        TopicPartitionOffset? origin,
        CancellationToken ct)
    {
        var envelope = new DeadLetterEnvelope(
            Key: key,
            Reason: reason,
            SourceTopic: origin?.Topic ?? _opts.NormalizedAlarmsTopic,
            SourcePartition: origin?.Partition.Value,
            SourceOffset: origin?.Offset.Value,
            FailedAtUtc: DateTimeOffset.UtcNow,
            Payload: payload);

        try
        {
            await _producer.PublishAsync(_opts.RawAlarmsDlqTopic, key ?? string.Empty, envelope, ct)
                           .ConfigureAwait(false);
            DlqEvents.WithLabels(reason.Split(':')[0]).Inc();
            _logger.LogWarning("DLQ published: key={Key} reason={Reason} topic={Topic}",
                key, reason, _opts.RawAlarmsDlqTopic);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to publish to DLQ topic {Topic} for key {Key}",
                _opts.RawAlarmsDlqTopic, key);
            return false;
        }
    }

    /// <summary>
    /// Projects the processed batch into append-only history rows (DATA-06).
    /// ALARM_STATE_DELETE carries no observable state for the log and is skipped.
    /// </summary>
    private static List<AMS.Domain.Repositories.AlarmHistoryRecord> BuildHistoryRecords(
        IReadOnlyList<NormalizedAlarmEvent> batch)
    {
        var rows = new List<AMS.Domain.Repositories.AlarmHistoryRecord>(batch.Count);
        foreach (var evt in batch)
        {
            if (string.Equals(evt.EventType, "ALARM_STATE_DELETE", StringComparison.OrdinalIgnoreCase))
                continue;

            var eventTime = DateTimeOffset.FromUnixTimeMilliseconds(evt.EventTimeEpochMs);
            var state = !evt.ConditionActive ? "CLEARED"
                      : evt.Acknowledged     ? "ACKNOWLEDGED"
                                             : "ACTIVE";

            rows.Add(new AMS.Domain.Repositories.AlarmHistoryRecord(
                AlarmId:      evt.AlarmId ?? evt.EventId,
                Source:       evt.SourceName,
                Severity:     evt.Severity,
                Message:      evt.Message,
                Condition:    evt.ConditionName,
                SubCondition: evt.SubConditionName,
                EventTime:    eventTime,
                State:        state,
                AckStatus:    evt.Acknowledged,
                ClearedTime:  evt.ConditionActive ? null : eventTime));
        }
        return rows;
    }

    /// <summary>Wrapper written to the dead-letter topic: enough context to replay or diagnose.</summary>
    private sealed record DeadLetterEnvelope(
        string Key,
        string Reason,
        string SourceTopic,
        int? SourcePartition,
        long? SourceOffset,
        DateTimeOffset FailedAtUtc,
        string Payload);

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
