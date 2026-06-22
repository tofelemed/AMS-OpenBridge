using System.Text.Json;
using AMS.Application.Alarms.Commands;
using AMS.Domain.Repositories;
using Confluent.Kafka;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AMS.Infrastructure.Kafka;

public sealed class LifecycleEventConsumerService : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private readonly KafkaOptions _opts;
    private readonly IServiceProvider _sp;
    private readonly ILogger<LifecycleEventConsumerService> _logger;

    public LifecycleEventConsumerService(
        IOptions<KafkaOptions> opts,
        IServiceProvider sp,
        ILogger<LifecycleEventConsumerService> logger)
    {
        _opts   = opts.Value;
        _sp     = sp;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();

        var config = new ConsumerConfig
        {
            BootstrapServers = _opts.BootstrapServers,
            GroupId          = $"{_opts.ConsumerGroupId}-lifecycle",
            AutoOffsetReset  = AutoOffsetReset.Latest,
            EnableAutoCommit = true,
        };

        using var consumer = new ConsumerBuilder<string, string>(config).Build();
        consumer.Subscribe(_opts.LifecycleEventsTopic);
        _logger.LogInformation("Lifecycle events consumer on {Topic}", _opts.LifecycleEventsTopic);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var cr = consumer.Consume(stoppingToken);
                    if (cr.IsPartitionEOF || string.IsNullOrEmpty(cr.Message.Value))
                        continue;

                    var evt = JsonSerializer.Deserialize<LifecycleEventMessage>(cr.Message.Value, JsonOpts);
                    if (evt is null || !Guid.TryParse(evt.AlarmId, out var alarmId))
                        continue;

                    using var scope = _sp.CreateScope();
                    var publisher = scope.ServiceProvider.GetRequiredService<IAlarmSignalRPublisher>();
                    var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

                    var alarm = await uow.ActiveAlarms.GetByIdAsync(alarmId, stoppingToken);
                    if (alarm is not null)
                    {
                        // Do not regress terminal ACK states due to delayed out-of-order lifecycle events.
                        var currentLifecycle = alarm.GetAckLifecycleState();
                        var incoming = evt.LifecycleState;
                        var terminal = incoming is AckLifecycleStates.Confirmed or AckLifecycleStates.Failed or AckLifecycleStates.Timeout;
                        var alreadyTerminal = currentLifecycle is AckLifecycleStates.Confirmed or AckLifecycleStates.Failed or AckLifecycleStates.Timeout;
                        if (!alreadyTerminal || terminal)
                        {
                            alarm.ApplyAckLifecycle(
                                incoming,
                                evt.ResolvedCommandId,
                                requestedAtEpochMs: incoming is AckLifecycleStates.Requested or AckLifecycleStates.Queued ? evt.TimestampEpochMs : null,
                                detail: evt.Detail,
                                correlationId: evt.ResolvedCorrelationId,
                                lifecycleId: evt.LifecycleId,
                                dcsSequenceId: evt.DcsSequenceId);
                            await uow.ActiveAlarms.UpdateAsync(alarm, stoppingToken);
                            await uow.SaveChangesAsync(stoppingToken);
                        }
                    }

                    long? latencyMs = evt.LifecycleState == AckLifecycleStates.Confirmed
                        ? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - evt.TimestampEpochMs
                        : null;

                    await publisher.PublishAckLifecycleAsync(
                        alarmId,
                        evt.ResolvedCommandId,
                        evt.ResolvedCorrelationId,
                        evt.LifecycleId,
                        evt.DcsSequenceId,
                        evt.LifecycleState,
                        evt.Detail,
                        evt.TimestampEpochMs,
                        latencyMs,
                        stoppingToken);
                }
                catch (ConsumeException ex)
                {
                    _logger.LogWarning(ex, "Consume failed. Topic might not be available yet. Retrying in 5s...");
                    await Task.Delay(5000, stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Unexpected error in LifecycleEventConsumerService");
                    await Task.Delay(1000, stoppingToken);
                }
            }
        }
        catch (OperationCanceledException) { }
        finally { consumer.Close(); }
    }
}
