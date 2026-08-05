using System.Text.Json;
using AMS.AuditService.Models;
using AMS.AuditService.Persistence;
using Confluent.Kafka;
using Microsoft.Extensions.Hosting;

namespace AMS.AuditService.Consumers;

public class AuditEventConsumer : BackgroundService
{
    private readonly ILogger<AuditEventConsumer> _logger;
    private readonly IServiceProvider _sp;
    private readonly string _bootstrapServers;
    private readonly string _topic;

    public AuditEventConsumer(ILogger<AuditEventConsumer> logger, IServiceProvider sp, IConfiguration config)
    {
        _logger = logger;
        _sp = sp;
        _bootstrapServers = config.GetValue<string>("Kafka:BootstrapServers") ?? "localhost:9092";
        _topic = "audit-events";
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Yield before the blocking Consume loop: without this, Host.StartAsync
        // waits on the synchronous section, Kestrel never binds, and a broker
        // hiccup at boot takes the whole host down instead of just this consumer.
        await Task.Yield();

        var config = new ConsumerConfig
        {
            BootstrapServers = _bootstrapServers,
            GroupId = "audit-service-group",
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = false // Manual commit after DB persistence
        };

        using var consumer = new ConsumerBuilder<Ignore, string>(config).Build();
        consumer.Subscribe(_topic);

        _logger.LogInformation("Audit Consumer listening on topic: {Topic}", _topic);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var cr = consumer.Consume(stoppingToken);
                    if (cr.Message == null) continue;

                    var evt = JsonSerializer.Deserialize<AuditEvent>(cr.Message.Value, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (evt == null) continue;

                    using var scope = _sp.CreateScope();
                    var repo = scope.ServiceProvider.GetRequiredService<ImmutableAuditRepository>();

                    // Append to DB with hash chaining
                    await repo.AppendAsync(evt, stoppingToken);

                    // Acknowledge Kafka message only AFTER successful immutable DB write
                    consumer.Commit(cr);
                }
                catch (ConsumeException ex)
                {
                    // Transient broker/DNS trouble (seen at stack boot) — retry,
                    // never let it kill the consumer or the host.
                    _logger.LogWarning(ex, "Kafka consume failed; retrying in 5s");
                    await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // shutdown
        }
        finally
        {
            consumer.Close();
        }
    }
}
