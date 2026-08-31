using System.Text.Json;
using AMS.NotificationService.Models;
using AMS.NotificationService.Orchestrator;
using Confluent.Kafka;
using Prometheus;

namespace AMS.NotificationService.Consumers;

/// <summary>
/// Consumes <c>traverse.alarm.lifecycle-alerts</c> and turns it into something an operator can see (STR-05).
///
/// This topic had two producers and zero consumers: the telemetry deadman and the ACK-SLA
/// watchdog were publishing into a void, so a dead OPC feed raised no alert anywhere. This
/// closes that loop, and exports a Prometheus counter so Alertmanager can page on it rather
/// than relying on someone reading logs.
/// </summary>
public class LifecycleAlertConsumer : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    /// <summary>Alert-rule source: any increase means the pipeline is telling us something is wrong.</summary>
    private static readonly Counter AlertsReceived = Metrics.CreateCounter(
        "ams_lifecycle_alerts_total",
        "Lifecycle alerts consumed from the traverse.alarm.lifecycle-alerts topic.",
        new CounterConfiguration { LabelNames = new[] { "event_type", "severity" } });

    private static readonly Counter DispatchFailures = Metrics.CreateCounter(
        "ams_lifecycle_alert_dispatch_failures_total",
        "Lifecycle alerts that could not be dispatched to any notification channel.");

    private readonly ILogger<LifecycleAlertConsumer> _logger;
    private readonly NotificationOrchestrator _orchestrator;
    private readonly string _bootstrapServers;
    private readonly string _topic;

    public LifecycleAlertConsumer(
        ILogger<LifecycleAlertConsumer> logger,
        NotificationOrchestrator orchestrator,
        IConfiguration config)
    {
        _logger           = logger;
        _orchestrator     = orchestrator;
        _bootstrapServers = config.GetValue<string>("Kafka:BootstrapServers") ?? "localhost:9092";
        _topic            = config.GetValue<string>("Kafka:LifecycleAlertsTopic") ?? "traverse.alarm.lifecycle-alerts";
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Yield before the blocking consume loop, otherwise ExecuteAsync runs inline and
        // Host.StartAsync never returns — Kestrel never binds and the container is
        // permanently unhealthy. audit-service documents this exact failure.
        await Task.Yield();

        var config = new ConsumerConfig
        {
            BootstrapServers = _bootstrapServers,
            GroupId          = "notification-service-lifecycle-alerts",
            // Earliest: an alert raised while this service was restarting still matters.
            AutoOffsetReset  = AutoOffsetReset.Earliest,
            EnableAutoCommit = false,
        };

        using var consumer = new ConsumerBuilder<string, string>(config).Build();
        consumer.Subscribe(_topic);
        _logger.LogInformation("Lifecycle alert consumer listening on {Topic}", _topic);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var cr = consumer.Consume(stoppingToken);
                    if (cr?.Message?.Value is null || cr.IsPartitionEOF)
                        continue;

                    LifecycleAlert? alert;
                    try
                    {
                        alert = JsonSerializer.Deserialize<LifecycleAlert>(cr.Message.Value, JsonOpts);
                    }
                    catch (JsonException jex)
                    {
                        _logger.LogError(jex, "Malformed lifecycle alert at offset {Offset}; skipping", cr.Offset.Value);
                        consumer.Commit(cr);
                        continue;
                    }

                    if (alert is null)
                    {
                        consumer.Commit(cr);
                        continue;
                    }

                    AlertsReceived.WithLabels(alert.EventType, alert.Severity).Inc();

                    if (alert.IsCritical)
                        _logger.LogCritical("LIFECYCLE ALERT [{EventType}] {Description}", alert.EventType, alert.Describe());
                    else
                        _logger.LogWarning("LIFECYCLE ALERT [{EventType}] {Description}", alert.EventType, alert.Describe());

                    try
                    {
                        await _orchestrator.ProcessLifecycleAlertAsync(alert, stoppingToken);
                    }
                    catch (Exception dispatchEx)
                    {
                        // A failed notification must not stall the topic — the counter and
                        // the CRITICAL log above are still visible to Alertmanager.
                        DispatchFailures.Inc();
                        _logger.LogError(dispatchEx, "Failed to dispatch lifecycle alert {EventType}", alert.EventType);
                    }

                    consumer.Commit(cr);
                }
                catch (ConsumeException ex)
                {
                    _logger.LogWarning(ex, "Consume failed on {Topic}; retrying in 5s", _topic);
                    await Task.Delay(5000, stoppingToken);
                }
            }
        }
        catch (OperationCanceledException) { }
        finally
        {
            consumer.Close();
            _logger.LogInformation("Lifecycle alert consumer stopped");
        }
    }
}
