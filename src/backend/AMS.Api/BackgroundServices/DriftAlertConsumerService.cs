using Confluent.Kafka;
using Microsoft.AspNetCore.SignalR;
using System.Text.Json;
using AMS.Api.Hubs;
using System.Threading;

namespace AMS.Api.BackgroundServices;

public sealed class DriftAlertConsumerService : BackgroundService
{
    private readonly ILogger<DriftAlertConsumerService> _logger;
    private readonly IConfiguration _config;
    private readonly IHubContext<ObservabilityHub, IObservabilityHubClient> _hub;

    public DriftAlertConsumerService(
        ILogger<DriftAlertConsumerService> logger,
        IConfiguration config,
        IHubContext<ObservabilityHub, IObservabilityHubClient> hub)
    {
        _logger = logger;
        _config = config;
        _hub = hub;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        var bootstrap = _config["Kafka:BootstrapServers"] ?? "localhost:9092";
        var config = new ConsumerConfig
        {
            BootstrapServers = bootstrap,
            GroupId = "ams-drift-consumer-ui",
            AutoOffsetReset = AutoOffsetReset.Latest,
            EnableAutoCommit = true,
            EnablePartitionEof = true
        };

        using var consumer = new ConsumerBuilder<Ignore, string>(config).Build();
        consumer.Subscribe("system.state.drift.alerts");

        _logger.LogInformation("Started DriftAlertConsumerService listening to system.state.drift.alerts");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var consumeResult = consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (consumeResult is null || consumeResult.IsPartitionEOF)
                    continue;

                var json = consumeResult.Message.Value;
                if (string.IsNullOrWhiteSpace(json)) continue;

                var payload = JsonSerializer.Deserialize<DriftAlertPayload>(json);
                if (payload is not null)
                {
                    await _hub.Clients.All.OnDriftAlertReceived(payload);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consuming drift alerts");
                await Task.Delay(1000, stoppingToken);
            }
        }

        // Leave the group cleanly; Dispose alone makes the broker hold the partitions
        // until session timeout, stalling delta delivery after every restart.
        consumer.Close();
    }
}
