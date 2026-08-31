using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AMS.NotificationService.Models;
using AMS.NotificationService.Orchestrator;
using Confluent.Kafka;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace AMS.NotificationService.Consumers;

public class RootCauseConsumer : BackgroundService
{
    private readonly ILogger<RootCauseConsumer> _logger;
    private readonly NotificationOrchestrator _orchestrator;
    private readonly string _bootstrapServers;
    private readonly string _topic;

    public RootCauseConsumer(ILogger<RootCauseConsumer> logger, NotificationOrchestrator orchestrator, IConfiguration config)
    {
        _logger = logger;
        _orchestrator = orchestrator;
        _bootstrapServers = config.GetValue<string>("Kafka:BootstrapServers") ?? "localhost:9092";
        _topic = "traverse.alarm.root-cause-events"; // The topic populated by Flink CEP
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Yield before the blocking consume loop: without this ExecuteAsync runs inline,
        // Host.StartAsync never returns, Kestrel never binds and the container stays
        // unhealthy forever — the same boot hang audit-service already documents.
        await Task.Yield();

        var config = new ConsumerConfig
        {
            BootstrapServers = _bootstrapServers,
            GroupId = "notification-service-group",
            AutoOffsetReset = AutoOffsetReset.Latest, // Notifications usually only care about now
            EnableAutoCommit = false 
        };

        using var consumer = new ConsumerBuilder<Ignore, string>(config).Build();
        consumer.Subscribe(_topic);

        _logger.LogInformation("Notification Consumer listening on topic: {Topic}", _topic);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var cr = consumer.Consume(stoppingToken);
                if (cr.Message == null) continue;

                try
                {
                    var rootCause = JsonSerializer.Deserialize<RootCauseEvent>(cr.Message.Value, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (rootCause != null)
                    {
                        // Delegate to orchestrator
                        await _orchestrator.ProcessEventAsync(rootCause, stoppingToken);
                        
                        // Commit offset after successful dispatch
                        consumer.Commit(cr);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to process root cause event at offset {Offset}", cr.Offset);
                    // In production, send to Dead Letter Queue (DLQ) here
                }
            }
        }
        catch (OperationCanceledException)
        {
            consumer.Close();
        }
    }
}
