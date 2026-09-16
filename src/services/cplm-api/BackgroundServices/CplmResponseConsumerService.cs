// v2.5 Task 2B.2: consumes G12 results (traverse.cpa.clpm.response.results.v1) into the
// response tables through ResponseResultStore. Own consumer group (single member, static
// membership); offsets stored only after the rows are written, so a DB outage replays instead
// of skipping. Verbatim persistence: nothing is recomputed here.
using Confluent.Kafka;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.BackgroundServices;

public sealed class CplmResponseConsumerService : BackgroundService
{
    public const string ConsumerName = "response";
    private readonly ILogger<CplmResponseConsumerService> _logger;
    private readonly CplmOptions _options;
    private readonly IConsumer<string, string> _consumer;
    private readonly ConsumerHeartbeat _heartbeat;
    private readonly SingleMemberGuard _guard;
    private readonly ResponseResultStore _store;

    public CplmResponseConsumerService(
        ILogger<CplmResponseConsumerService> logger,
        IOptions<Traverse.CplmApi.Infrastructure.KafkaOptions> kafkaOptions,
        IOptions<CplmOptions> cplmOptions,
        ConsumerHeartbeat heartbeat,
        SingleMemberGuard guard,
        ResponseResultStore store)
    {
        _logger = logger;
        _options = cplmOptions.Value;
        _heartbeat = heartbeat;
        _guard = guard;
        _store = store;
        var group = _options.ConsumerGroupId.Replace("-results", "") + "-response";
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
        _consumer.Subscribe(_options.ResponseTopic);
        _logger.LogInformation("CplmResponseConsumerService subscribed to {Topic}", _options.ResponseTopic);
        while (!stoppingToken.IsCancellationRequested)
        {
            _heartbeat.Report(ConsumerName, "CONSUMING");
            try
            {
                var result = _consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (result is null) continue;
                if (!string.IsNullOrWhiteSpace(result.Message.Value))
                {
                    var ok = await _store.ApplyAsync(result.Message.Value, stoppingToken);
                    if (!ok) _logger.LogWarning("Unparseable response record at offset {Offset} skipped", result.Offset);
                }
                _consumer.StoreOffset(result);
                _heartbeat.ReportLag(ConsumerName, (long)(DateTimeOffset.UtcNow - result.Message.Timestamp.UtcDateTime).TotalMilliseconds);
            }
            catch (ConsumeException ex) { _logger.LogError(ex, "Kafka consume error in CplmResponseConsumerService"); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error persisting response result; offset not stored");
                try { await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken); } catch (OperationCanceledException) { break; }
            }
        }
        _consumer.Close();
    }
}
