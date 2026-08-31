using System.Text.Json;
using Confluent.Kafka;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AMS.Infrastructure.Kafka;

/// <summary>
/// Monitors traverse.alarm.raw-alarms for silence and emits TELEMETRY_STALLED lifecycle alerts.
/// </summary>
public sealed class TelemetryDeadmanWatchdogService : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private readonly KafkaOptions _opts;
    private readonly TelemetryIngestState _state;
    private readonly AlarmEventProducer _producer;
    private readonly ILogger<TelemetryDeadmanWatchdogService> _logger;

    private readonly long _serviceStartedEpochMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    private bool _stallAlertEmitted;

    public TelemetryDeadmanWatchdogService(
        IOptions<KafkaOptions> opts,
        TelemetryIngestState state,
        AlarmEventProducer producer,
        ILogger<TelemetryDeadmanWatchdogService> logger)
    {
        _opts = opts.Value;
        _state = state;
        _producer = producer;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();

        var consumerTask = Task.Run(() => ConsumeRawEventsAsync(stoppingToken), stoppingToken);
        var watchdogTask = Task.Run(() => WatchdogLoopAsync(stoppingToken), stoppingToken);

        await Task.WhenAll(consumerTask, watchdogTask);
    }

    private void ConsumeRawEventsAsync(CancellationToken stoppingToken)
    {
        var config = new ConsumerConfig
        {
            BootstrapServers = _opts.BootstrapServers,
            GroupId = $"{_opts.ConsumerGroupId}-telemetry-deadman",
            AutoOffsetReset = AutoOffsetReset.Latest,
            EnableAutoCommit = true,
        };

        using var consumer = new ConsumerBuilder<string, string>(config).Build();
        consumer.Subscribe(_opts.RawAlarmsTopic);
        _logger.LogInformation(
            "Telemetry deadman consuming {Topic} (stall threshold {Seconds}s)",
            _opts.RawAlarmsTopic,
            _opts.TelemetryStallThresholdSeconds);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var cr = consumer.Consume(TimeSpan.FromMilliseconds(500));
                    if (cr is null || cr.IsPartitionEOF || string.IsNullOrEmpty(cr.Message.Value))
                        continue;

                    long eventMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    try
                    {
                        using var doc = JsonDocument.Parse(cr.Message.Value);
                        eventMs = RawAlarmEventParser.ResolveIngestEpochMs(
                            doc.RootElement,
                            RawAlarmEventParser.ResolveEventTimeEpochMs(doc.RootElement));
                    }
                    catch
                    {
                        // keep wall-clock fallback
                    }

                    _state.RecordEvent(eventMs);
                    if (_stallAlertEmitted)
                    {
                        _stallAlertEmitted = false;
                        _logger.LogInformation("Telemetry ingest resumed on {Topic}", _opts.RawAlarmsTopic);
                    }
                }
                catch (ConsumeException ex)
                {
                    _logger.LogWarning(ex, "Consume failed. Topic might not be available yet. Retrying in 5s...");
                    if (!stoppingToken.IsCancellationRequested)
                        System.Threading.Thread.Sleep(5000);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Unexpected error in TelemetryDeadmanWatchdogService consumer loop");
                    if (!stoppingToken.IsCancellationRequested)
                        System.Threading.Thread.Sleep(1000);
                }
            }
        }
        catch (OperationCanceledException) { }
        finally
        {
            consumer.Close();
        }
    }

    private async Task WatchdogLoopAsync(CancellationToken stoppingToken)
    {
        var thresholdMs = _opts.TelemetryStallThresholdSeconds * 1000L;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                var snap = _state.GetSnapshot();
                var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                var stalled = false;
                if (snap.LastRawOpcEventEpochMs.HasValue)
                {
                    stalled = (now - snap.LastRawOpcEventEpochMs.Value) >= thresholdMs;
                }
                else if ((now - _serviceStartedEpochMs) >= thresholdMs)
                {
                    stalled = true;
                }

                if (stalled)
                {
                    _state.MarkStalled(now);
                    if (!_stallAlertEmitted)
                    {
                        var alert = new TelemetryStallAlertMessage
                        {
                            SchemaVersion = StreamSchemaVersion.Current,
                            EventType = "TELEMETRY_STALLED",
                            Topic = _opts.RawAlarmsTopic,
                            IngestAuthority = _opts.IngestAuthority,
                            StallThresholdSeconds = _opts.TelemetryStallThresholdSeconds,
                            SecondsSinceLastEvent = snap.SecondsSinceLastEvent,
                            TimestampEpochMs = now,
                            Severity = "CRITICAL",
                            Detail = "No raw OPC events observed within telemetry stall threshold.",
                        };
                        await _producer.PublishAsync(
                            _opts.LifecycleAlertsTopic,
                            "telemetry-deadman",
                            alert,
                            stoppingToken);
                        _stallAlertEmitted = true;
                        _logger.LogWarning(
                            "TELEMETRY_STALLED: no events on {Topic} for >= {Seconds}s (authority={Authority})",
                            _opts.RawAlarmsTopic,
                            _opts.TelemetryStallThresholdSeconds,
                            _opts.IngestAuthority);
                    }
                }
                else
                {
                    _state.MarkOk();
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Telemetry deadman check failed");
            }
        }
    }
}

public sealed class TelemetryStallAlertMessage
{
    public int SchemaVersion { get; init; } = StreamSchemaVersion.Current;
    public string EventType { get; init; } = "TELEMETRY_STALLED";
    public string Topic { get; init; } = string.Empty;
    public string IngestAuthority { get; init; } = string.Empty;
    public int StallThresholdSeconds { get; init; }
    public double? SecondsSinceLastEvent { get; init; }
    public long TimestampEpochMs { get; init; }
    public string Severity { get; init; } = "CRITICAL";
    public string Detail { get; init; } = string.Empty;
}
