using Confluent.Kafka;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using AMS.Application.Alarms.Commands;
using AMS.Infrastructure.Kafka;
using System.Text.Json;
using System.Threading.Tasks;

namespace AMS.Api.BackgroundServices;

public sealed class KpiConsumerService : BackgroundService
{
    private readonly ILogger<KpiConsumerService> _logger;
    private readonly IConsumer<string, string> _consumer;
    private readonly IAlarmSignalRPublisher _publisher;
    private readonly string[] _topics = new[] 
    { 
        "traverse.cpa.loop-kpis-5m", 
        "traverse.alarm.kpi-alarm-rates", 
        "traverse.alarm.kpi-standing-snapshots", 
        "traverse.alarm.kpi-bad-actors", 
        "traverse.alarm.kpi-health-scores" 
    };

    public KpiConsumerService(
        ILogger<KpiConsumerService> logger,
        IOptions<KafkaOptions> opts,
        IAlarmSignalRPublisher publisher)
    {
        _logger = logger;
        _publisher = publisher;

        var config = new ConsumerConfig
        {
            BootstrapServers = opts.Value.BootstrapServers,
            GroupId = "ams-api-kpi-consumer",
            AutoOffsetReset = AutoOffsetReset.Latest,
            EnableAutoCommit = true
        };
        _consumer = new ConsumerBuilder<string, string>(config).Build();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _consumer.Subscribe(_topics);
        _logger.LogInformation("KpiConsumerService started, subscribed to KPI topics.");

        await Task.Yield(); // Free synchronous startup

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var consumeResult = _consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (consumeResult == null) continue;

                var topic = consumeResult.Topic;
                var json = consumeResult.Message.Value;

                if (topic == "traverse.cpa.loop-kpis-5m")
                {
                    var payload = JsonSerializer.Deserialize<LoopKpiPayload>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (payload != null)
                        await _publisher.PublishLoopKpiAsync(payload, stoppingToken);
                }
                else
                {
                    // It's one of the Alarm KPIs
                    var payload = JsonSerializer.Deserialize<AlarmKpiPayload>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (payload != null)
                        await _publisher.PublishAlarmKpiAsync(payload, stoppingToken);
                }
            }
            catch (ConsumeException ex)
            {
                _logger.LogError(ex, "Kafka consume error in KpiConsumerService");
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing KPI message");
            }
        }

        _consumer.Close();
    }
}

public record LoopKpiPayload(
    string TagId,
    long WindowStartMs,
    long WindowEndMs,
    double Iae,
    double Ise,
    string DominantMode,
    int SampleCount
);

public record AlarmKpiPayload(
    string KpiType,
    long WindowStartMs,
    long WindowEndMs,
    int AlarmCount,
    string? FloodStatus,
    int StandingCount,
    long OldestStandingDurationMs,
    string? AlarmId,
    string? NuisanceType,
    int Occurrences,
    double HealthScore,
    string? Area,
    string? Priority
);
