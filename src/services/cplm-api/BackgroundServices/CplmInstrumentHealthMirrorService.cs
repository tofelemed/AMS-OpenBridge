// v2.5 Task 1H.5: consumes the Instrumental health observations (traverse.cpa.instrument.health.v1)
// and the Flink health contexts (traverse.cpa.context.instrument-health.v1) into the cpm.* mirror
// through InstrumentHealthMirrorWriter. Own consumer group (single member, static membership),
// offsets stored only after the row is written, so a DB outage replays instead of skipping.
using Confluent.Kafka;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.BackgroundServices;

public sealed class CplmInstrumentHealthMirrorService : BackgroundService
{
    public const string ConsumerName = "health";
    private readonly ILogger<CplmInstrumentHealthMirrorService> _logger;
    private readonly CplmOptions _options;
    private readonly IConsumer<string, string> _consumer;
    private readonly ConsumerHeartbeat _heartbeat;
    private readonly SingleMemberGuard _guard;
    private readonly InstrumentHealthMirrorWriter _writer;

    public CplmInstrumentHealthMirrorService(
        ILogger<CplmInstrumentHealthMirrorService> logger,
        IOptions<Traverse.CplmApi.Infrastructure.KafkaOptions> kafkaOptions,
        IOptions<CplmOptions> cplmOptions,
        ConsumerHeartbeat heartbeat,
        SingleMemberGuard guard,
        InstrumentHealthMirrorWriter writer)
    {
        _logger = logger;
        _options = cplmOptions.Value;
        _heartbeat = heartbeat;
        _guard = guard;
        _writer = writer;
        var group = _options.ConsumerGroupId.Replace("-results", "") + "-health";
        _consumer = new ConsumerBuilder<string, string>(new ConsumerConfig
        {
            BootstrapServers = kafkaOptions.Value.BootstrapServers,
            GroupId = group,
            GroupInstanceId = group + "-sole",
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = true,
            EnableAutoOffsetStore = false,
        })
        .SetPartitionsAssignedHandler((_, parts) => _guard.VerifySoleMembership(ConsumerName, parts))
        .Build();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        var topics = new[] { _options.InstrumentHealthTopic, _options.InstrumentHealthContextTopic };
        _consumer.Subscribe(topics);
        _logger.LogInformation("CplmInstrumentHealthMirrorService subscribed to {Topics}", string.Join(", ", topics));
        while (!stoppingToken.IsCancellationRequested)
        {
            _heartbeat.Report(ConsumerName, "CONSUMING");
            try
            {
                var result = _consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (result is null) continue;
                if (!string.IsNullOrWhiteSpace(result.Message.Value))
                {
                    var ok = result.Topic == _options.InstrumentHealthContextTopic
                        ? await _writer.ApplyContextAsync(result.Message.Value, stoppingToken)
                        : await _writer.ApplyObservationAsync(result.Message.Value, stoppingToken);
                    if (!ok) _logger.LogWarning("Unparseable health record on {Topic} offset {Offset} skipped", result.Topic, result.Offset);
                }
                _consumer.StoreOffset(result);
                _heartbeat.ReportLag(ConsumerName, (long)(DateTimeOffset.UtcNow - result.Message.Timestamp.UtcDateTime).TotalMilliseconds);
            }
            catch (ConsumeException ex) { _logger.LogError(ex, "Kafka consume error in CplmInstrumentHealthMirrorService"); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error mirroring instrument health record; offset not stored");
                try { await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken); } catch (OperationCanceledException) { break; }
            }
        }
        _consumer.Close();
    }
}
