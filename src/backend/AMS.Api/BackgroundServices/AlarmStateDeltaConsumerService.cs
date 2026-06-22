using Confluent.Kafka;
using Microsoft.AspNetCore.SignalR;
using System.Text.Json;
using AMS.Api.Hubs;
using System.Threading;

namespace AMS.Api.BackgroundServices;

public sealed class AlarmStateDeltaConsumerService : BackgroundService
{
    private readonly ILogger<AlarmStateDeltaConsumerService> _logger;
    private readonly IConfiguration _config;
    private readonly IHubContext<ObservabilityHub, IObservabilityHubClient> _hub;

    public AlarmStateDeltaConsumerService(
        ILogger<AlarmStateDeltaConsumerService> logger,
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
            GroupId = "ams-delta-consumer-ui",
            AutoOffsetReset = AutoOffsetReset.Latest,
            EnableAutoCommit = true,
            EnablePartitionEof = true
        };

        using var consumer = new ConsumerBuilder<Ignore, string>(config).Build();
        consumer.Subscribe("flink.state.alarm.delta");

        _logger.LogInformation("Started AlarmStateDeltaConsumerService listening to flink.state.alarm.delta");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var consumeResult = consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (consumeResult is null || consumeResult.IsPartitionEOF)
                    continue;

                var json = consumeResult.Message.Value;
                if (string.IsNullOrWhiteSpace(json)) continue;

                var payload = JsonSerializer.Deserialize<AlarmStateDeltaPayload>(json);
                if (payload is not null)
                {
                    await _hub.Clients.All.OnAlarmStateDeltaReceived(payload);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consuming alarm state deltas");
                await Task.Delay(1000, stoppingToken);
            }
        }
    }
}
