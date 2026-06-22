using System.Collections.Concurrent;
using System.Text.Json;
using Confluent.Kafka;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AMS.Infrastructure.Kafka;

/// <summary>
/// Legacy .NET ACK SLA watchdog — not registered in Flink-only mode (Flink owns ACK_TIMEOUT).
/// </summary>
[Obsolete("Disabled in Flink-only mode. Flink lifecycle engine owns ACK SLA and timeouts.")]
public sealed class AckSlaWatchdogService : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private readonly KafkaOptions _opts;
    private readonly AlarmEventProducer _producer;
    private readonly LifecycleEventPublisher _lifecyclePublisher;
    private readonly ILogger<AckSlaWatchdogService> _logger;

    private readonly ConcurrentDictionary<string, WatchState> _states = new();

    private static readonly Dictionary<string, (long thresholdMs, string severity)> Sla = new(StringComparer.OrdinalIgnoreCase)
    {
        [AckLifecycleStates.Queued] = (5_000, "WARNING"),
        [AckLifecycleStates.Processing] = (10_000, "WARNING"),
        [AckLifecycleStates.Dispatched] = (15_000, "WARNING"),
        [AckLifecycleStates.PendingDcs] = (30_000, "CRITICAL"),
    };

    public AckSlaWatchdogService(
        IOptions<KafkaOptions> opts,
        AlarmEventProducer producer,
        LifecycleEventPublisher lifecyclePublisher,
        ILogger<AckSlaWatchdogService> logger)
    {
        _opts = opts.Value;
        _producer = producer;
        _lifecyclePublisher = lifecyclePublisher;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();

        var config = new ConsumerConfig
        {
            BootstrapServers = _opts.BootstrapServers,
            GroupId = $"{_opts.ConsumerGroupId}-ack-sla-watchdog",
            AutoOffsetReset = AutoOffsetReset.Latest,
            EnableAutoCommit = true,
        };

        using var consumer = new ConsumerBuilder<string, string>(config).Build();
        consumer.Subscribe(_opts.LifecycleEventsTopic);
        _logger.LogInformation("ACK SLA watchdog consuming {Topic} -> alerts {AlertTopic}",
            _opts.LifecycleEventsTopic, _opts.LifecycleAlertsTopic);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var cr = consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (cr is not null && !cr.IsPartitionEOF && !string.IsNullOrEmpty(cr.Message.Value))
                {
                    var evt = JsonSerializer.Deserialize<LifecycleEventMessage>(cr.Message.Value, JsonOpts);
                    if (evt is not null && !string.IsNullOrWhiteSpace(evt.AlarmId))
                        UpsertState(evt);
                }

                await CheckBreachesAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException) { }
        finally
        {
            consumer.Close();
        }
    }

    private void UpsertState(LifecycleEventMessage evt)
    {
        var key = Key(evt.AlarmId, evt.ResolvedCorrelationId);
        if (AckLifecycleStates.IsTerminal(evt.LifecycleState))
        {
            _states.TryRemove(key, out _);
            return;
        }

        _states.AddOrUpdate(
            key,
            _ => new WatchState(
                evt.AlarmId,
                evt.ResolvedCommandId,
                evt.ResolvedCorrelationId,
                evt.DcsSequenceId,
                evt.LifecycleState,
                evt.TimestampEpochMs),
            (_, old) =>
            {
                if (!string.Equals(old.LifecycleState, evt.LifecycleState, StringComparison.OrdinalIgnoreCase))
                {
                    return old with
                    {
                        CommandId = evt.ResolvedCommandId,
                        CorrelationId = evt.ResolvedCorrelationId,
                        DcsSequenceId = evt.DcsSequenceId,
                        LifecycleState = evt.LifecycleState,
                        StateSinceEpochMs = evt.TimestampEpochMs,
                        LastAlertState = null,
                        LastAlertAtEpochMs = null,
                        TimeoutEmitted = false,
                    };
                }

                return old with
                {
                    CommandId = evt.ResolvedCommandId,
                    CorrelationId = evt.ResolvedCorrelationId,
                    DcsSequenceId = evt.DcsSequenceId,
                };
            });
    }

    private async Task CheckBreachesAsync(CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        foreach (var kvp in _states)
        {
            var watch = kvp.Value;
            if (!Sla.TryGetValue(watch.LifecycleState, out var sla))
                continue;

            var durationMs = now - watch.StateSinceEpochMs;
            if (durationMs < sla.thresholdMs)
                continue;

            var shouldEmitAlert =
                !string.Equals(watch.LastAlertState, watch.LifecycleState, StringComparison.OrdinalIgnoreCase)
                || !watch.LastAlertAtEpochMs.HasValue
                || (now - watch.LastAlertAtEpochMs.Value) >= 30_000;

            if (shouldEmitAlert)
            {
                var alert = new AckLifecycleAlertMessage
                {
                    SchemaVersion = StreamSchemaVersion.Current,
                    EventType = "ACK_SLA_BREACH",
                    AlarmId = watch.AlarmId,
                    CommandId = watch.CommandId,
                    CorrelationId = watch.CorrelationId,
                    DcsSequenceId = watch.DcsSequenceId,
                    LifecycleState = watch.LifecycleState,
                    DurationMs = durationMs,
                    Severity = sla.severity,
                    TimestampEpochMs = now,
                };
                await _producer.PublishAsync(_opts.LifecycleAlertsTopic, watch.AlarmId, alert, ct);
                _states[kvp.Key] = watch with
                {
                    LastAlertState = watch.LifecycleState,
                    LastAlertAtEpochMs = now,
                };
            }

            if (watch.LifecycleState == AckLifecycleStates.PendingDcs && durationMs >= (_opts.AckConfirmationTimeoutSeconds * 1000L))
            {
                if (watch.TimeoutEmitted)
                    continue;

                var ctx = new AckCorrelationContext(watch.CommandId, watch.CorrelationId, watch.DcsSequenceId);
                await _lifecyclePublisher.EmitAsync(
                    ctx,
                    watch.AlarmId,
                    AckLifecycleStates.Timeout,
                    detail: $"ACK timeout watchdog triggered at {durationMs}ms in {AckLifecycleStates.PendingDcs}",
                    previousState: AckLifecycleStates.PendingDcs,
                    ct: ct);

                _states[kvp.Key] = _states[kvp.Key] with { TimeoutEmitted = true };
            }
        }
    }

    private static string Key(string alarmId, string correlationId) => $"{alarmId}:{correlationId}";
}

public sealed record AckLifecycleAlertMessage : IAckCorrelatedEvent
{
    public int SchemaVersion { get; init; } = StreamSchemaVersion.Current;
    public string EventType { get; init; } = "ACK_SLA_BREACH";
    public string CommandId { get; init; } = string.Empty;
    public string CorrelationId { get; init; } = string.Empty;
    public string? LifecycleId { get; init; }
    public string? DcsSequenceId { get; init; }
    public string AlarmId { get; init; } = string.Empty;
    public string LifecycleState { get; init; } = string.Empty;
    public long DurationMs { get; init; }
    public string Severity { get; init; } = "WARNING";
    public long TimestampEpochMs { get; init; }
}

internal sealed record WatchState(
    string AlarmId,
    string CommandId,
    string CorrelationId,
    string? DcsSequenceId,
    string LifecycleState,
    long StateSinceEpochMs,
    string? LastAlertState = null,
    long? LastAlertAtEpochMs = null,
    bool TimeoutEmitted = false);

