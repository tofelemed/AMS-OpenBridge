using Confluent.Kafka;
using Microsoft.AspNetCore.SignalR;
using System.Text.Json;
using System.Text.Json.Serialization;
using AMS.Api.Hubs;

namespace AMS.Api.BackgroundServices;

public sealed class ReplayResultConsumerService : BackgroundService
{
    private readonly ILogger<ReplayResultConsumerService> _logger;
    private readonly IConfiguration _config;
    private readonly IHubContext<ObservabilityHub, IObservabilityHubClient> _hub;

    public ReplayResultConsumerService(
        ILogger<ReplayResultConsumerService> logger,
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
            GroupId = "ams-replay-ui-consumer",
            AutoOffsetReset = AutoOffsetReset.Latest,
            EnableAutoCommit = true,
            EnablePartitionEof = true
        };

        using var consumer = new ConsumerBuilder<Ignore, string>(config).Build();
        consumer.Subscribe("traverse.alarm.flink.state.alarm.replay");

        _logger.LogInformation("Started ReplayResultConsumerService listening to traverse.alarm.flink.state.alarm.replay");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var consumeResult = consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (consumeResult is null || consumeResult.IsPartitionEOF)
                    continue;

                var json = consumeResult.Message.Value;
                if (string.IsNullOrWhiteSpace(json)) continue;

                var payload = JsonSerializer.Deserialize<ReplayStateDeltaPayload>(json);
                if (payload is not null && !string.IsNullOrEmpty(payload.ReplayId))
                {
                    await _hub.Clients.All.OnReplayDeltaReceived(payload);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consuming replay results");
                await Task.Delay(1000, stoppingToken);
            }
        }

        // Leave the group cleanly; Dispose alone makes the broker hold the partitions
        // until session timeout, stalling delta delivery after every restart.
        consumer.Close();
    }
}
