using System.Text.Json;
using Confluent.Kafka;
using Microsoft.Extensions.Options;
using Traverse.CplmApi.Infrastructure;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.BackgroundServices;

/// <summary>Counters surfaced by /health (consumers.kpiHistory).</summary>
public sealed class KpiHistoryStats
{
    private long _written, _rejected, _skipped;
    public long Written => Interlocked.Read(ref _written);
    public long Rejected => Interlocked.Read(ref _rejected);
    public long Skipped => Interlocked.Read(ref _skipped);
    public DateTimeOffset? LastWriteUtc { get; private set; }
    public DateTimeOffset? UnavailableSinceUtc { get; private set; }

    public void OnWritten() { Interlocked.Increment(ref _written); LastWriteUtc = DateTimeOffset.UtcNow; UnavailableSinceUtc = null; }
    public void OnRejected() => Interlocked.Increment(ref _rejected);
    public void OnSkipped() => Interlocked.Increment(ref _skipped);
    public void OnUnavailable() => UnavailableSinceUtc ??= DateTimeOffset.UtcNow;
}

/// <summary>
/// CHG-102 Phase 2 — KPI and verdict history into IoTDB, made reliable.
///
/// Replaces the best-effort dual-write inside CplmResultConsumerService (results ignored, not
/// purpose-filtered). Its OWN consumer group over the same three result topics, so the Kafka
/// topics are the retry buffer and an IoTDB outage never stalls the Postgres projection:
///   Ok          → offset stored
///   Rejected    → logged, counted, offset stored (a bad row must not wedge the partition)
///   Unavailable → seek back to the same message, back off, retry (nothing lost while the
///                 topic retention covers the outage)
/// Idempotent: a point is keyed by window end, so a redelivery overwrites the same value.
/// LIVE results only (KpiHistoryMapper). Membership is not exclusive: a split group still writes
/// every partition exactly once between its members.
/// </summary>
public sealed class KpiHistoryConsumerService : BackgroundService
{
    private readonly ILogger<KpiHistoryConsumerService> _logger;
    private readonly CplmOptions _options;
    private readonly IotDbWriteOptions _iotdbOptions;
    private readonly IotDbWriteClient _iotdb;
    private readonly ConsumerHeartbeat _heartbeat;
    private readonly KpiHistoryStats _stats;
    private readonly string _bootstrap;
    private DateTimeOffset _lastRejectLog = DateTimeOffset.MinValue;

    public const string HeartbeatName = "kpi-history";

    public KpiHistoryConsumerService(
        ILogger<KpiHistoryConsumerService> logger,
        IOptions<KafkaOptions> kafka,
        IOptions<CplmOptions> cplm,
        IOptions<IotDbWriteOptions> iotdbOptions,
        IotDbWriteClient iotdb,
        ConsumerHeartbeat heartbeat,
        KpiHistoryStats stats)
    {
        _logger = logger;
        _options = cplm.Value;
        _iotdbOptions = iotdbOptions.Value;
        _iotdb = iotdb;
        _heartbeat = heartbeat;
        _stats = stats;
        _bootstrap = kafka.Value.BootstrapServers;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        if (!_iotdb.Enabled)
        {
            _heartbeat.Report(HeartbeatName, "DISABLED_BY_CONFIG");
            _logger.LogInformation("KPI history consumer idle: IotDb:Enabled=false");
            return;
        }

        var config = new ConsumerConfig
        {
            BootstrapServers = _bootstrap,
            GroupId = _options.KpiHistoryConsumerGroupId,
            // Earliest: on first start the retained results fill the history (idempotent overwrite).
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = true,
            EnableAutoOffsetStore = false,
        };
        using var consumer = new ConsumerBuilder<string, string>(config).Build();
        var topics = new[] { _options.GateResultsTopic, _options.ShortFeatureTopic, _options.LongFeatureTopic };
        consumer.Subscribe(topics);
        _logger.LogInformation("KPI history consumer ({Group}) subscribed to {Topics}; layout {Layout}",
            config.GroupId, string.Join(", ", topics), _iotdbOptions.IsLayoutV2 ? "v2" : "v1");

        var backoff = TimeSpan.FromSeconds(2);
        while (!stoppingToken.IsCancellationRequested)
        {
            _heartbeat.Report(HeartbeatName, "CONSUMING");
            ConsumeResult<string, string>? result = null;
            try
            {
                result = consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (result == null) continue;

                var outcome = await WriteAsync(result.Topic, result.Message.Value, stoppingToken);
                if (outcome == IotDbWriteOutcome.Unavailable)
                {
                    _stats.OnUnavailable();
                    _heartbeat.Report(HeartbeatName, "IOTDB_UNAVAILABLE");
                    consumer.Seek(result.TopicPartitionOffset);   // same message again after the back-off
                    await Task.Delay(backoff, stoppingToken);
                    backoff = TimeSpan.FromSeconds(Math.Min(60, backoff.TotalSeconds * 2));
                    continue;
                }
                backoff = TimeSpan.FromSeconds(2);
                consumer.StoreOffset(result);
                _heartbeat.ReportLag(HeartbeatName,
                    (long)(DateTimeOffset.UtcNow - result.Message.Timestamp.UtcDateTime).TotalMilliseconds);
            }
            catch (ConsumeException ex)
            {
                _logger.LogError(ex, "Kafka consume error in the KPI history consumer");
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                // Unexpected: treat like Unavailable — never skip a message we did not judge.
                _logger.LogError(ex, "KPI history write failed unexpectedly ({Topic}); retrying", result?.Topic ?? "?");
                if (result != null) consumer.Seek(result.TopicPartitionOffset);
                try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
                catch (OperationCanceledException) { break; }
            }
        }
        consumer.Close();
    }

    /// <summary>Maps and writes one message; Ok also for messages that are deliberately not written.</summary>
    internal async Task<IotDbWriteOutcome> WriteAsync(string topic, string? json, CancellationToken ct)
    {
        KpiResultKind kind;
        if (topic == _options.GateResultsTopic) kind = KpiResultKind.Gate;
        else if (topic == _options.ShortFeatureTopic) kind = KpiResultKind.Short;
        else if (topic == _options.LongFeatureTopic) kind = KpiResultKind.Long;
        else { _stats.OnSkipped(); return IotDbWriteOutcome.Ok; }

        if (string.IsNullOrWhiteSpace(json)) { _stats.OnSkipped(); return IotDbWriteOutcome.Ok; }
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { _stats.OnSkipped(); return IotDbWriteOutcome.Ok; }

        var point = KpiHistoryMapper.Map(kind, root, _iotdbOptions, out _);
        if (point is null) { _stats.OnSkipped(); return IotDbWriteOutcome.Ok; }

        if (point.LegacyTypes is not null)
            await _iotdb.EnsureTimeseriesAsync(point.Device, point.LegacyTypes, ct);

        var outcome = await _iotdb.InsertRowAsync(point.Device, point.TimestampMs, point.Fields, ct);
        switch (outcome)
        {
            case IotDbWriteOutcome.Ok:
                _stats.OnWritten();
                break;
            case IotDbWriteOutcome.Rejected:
                _stats.OnRejected();
                if (DateTimeOffset.UtcNow - _lastRejectLog > TimeSpan.FromMinutes(1))
                {
                    _lastRejectLog = DateTimeOffset.UtcNow;
                    _logger.LogError("KPI history row rejected by IoTDB and skipped ({Device} @ {Ts}); {Count} rejected so far",
                        point.Device, point.TimestampMs, _stats.Rejected);
                }
                return IotDbWriteOutcome.Rejected;
        }
        return outcome;
    }
}
