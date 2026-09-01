using Confluent.Kafka;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using AMS.Application.Alarms.Commands;
using AMS.Infrastructure.Kafka;
using System.Text.Json;
using System.Threading.Tasks;

namespace AMS.Api.BackgroundServices;

/// <summary>
/// Consumes the alarm-KPI topics produced by AlarmKpiStreamJob and forwards them
/// to the alarm hub (OnAlarmKpiUpdate).
///
/// RETIRED subscriptions (audit-jobs.md Phase G, 2026-09-01):
///  - traverse.cpa.loop-kpis-5m       — LoopKpiStreamJob retired (input topic had
///    no producer; CPLM short/long/fusion is the real loop-KPI path).
///  - traverse.alarm.kpi-bad-actors   — the producing branch in AlarmKpiResult
///  - traverse.alarm.kpi-health-scores  was unreachable; nothing ever emitted.
/// </summary>
public sealed class KpiConsumerService : BackgroundService
{
    private readonly ILogger<KpiConsumerService> _logger;
    private readonly IConsumer<string, string> _consumer;
    private readonly IAlarmSignalRPublisher _publisher;
    private readonly string[] _topics = new[]
    {
        "traverse.alarm.kpi-alarm-rates",
        "traverse.alarm.kpi-standing-snapshots",
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

                var json = consumeResult.Message.Value;
                var payload = JsonSerializer.Deserialize<AlarmKpiPayload>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (payload != null)
                    await _publisher.PublishAlarmKpiAsync(payload, stoppingToken);
            }
            catch (ConsumeException ex)
            {
                _logger.LogError(ex, "Kafka consume error in KpiConsumerService");
                // audit-jobs.md F-14: no backoff meant a persistent broker error
                // spun this thread at full rate; every sibling consumer sleeps.
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing KPI message");
                await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
            }
        }

        _consumer.Close();
    }
}

/// <summary>
/// ALARM_RATE / STANDING_ALARM_SNAPSHOT payloads (AlarmKpiResult.toJson).
/// The bad-actor/health-score fields were removed with their unreachable
/// producer branches (Phase G).
/// </summary>
public record AlarmKpiPayload(
    string KpiType,
    long WindowStartMs,
    long WindowEndMs,
    int AlarmCount,
    string? FloodStatus,
    int StandingCount,
    long OldestStandingDurationMs
);
