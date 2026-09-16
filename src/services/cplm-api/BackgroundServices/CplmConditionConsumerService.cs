using Confluent.Kafka;
using Dapper;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Npgsql;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.BackgroundServices;

/// <summary>
/// v2.5 Task 1D.5 (spec v6 R11) — persists the fast-path G10/G11 condition events
/// (traverse.cpa.clpm.condition.v1) verbatim into analytics.condition_event, so a valve
/// pinned at its limit or a frozen sensor is visible to the API within the dwell time,
/// not at the next 12 h fusion. Own consumer group (single member, STR-06), at-least-once
/// with an idempotent upsert that never regresses a CLOSED condition.
/// </summary>
public sealed class CplmConditionConsumerService : BackgroundService
{
    private const string Name = "conditions";
    private readonly ILogger<CplmConditionConsumerService> _logger;
    private readonly NpgsqlDataSource _dataSource;
    private readonly CplmOptions _options;
    private readonly IConsumer<string, string> _consumer;
    private readonly ConsumerHeartbeat _heartbeat;
    private readonly SingleMemberGuard _guard;
    private static int _schemaEnsured;

    public CplmConditionConsumerService(
        ILogger<CplmConditionConsumerService> logger,
        IOptions<Traverse.CplmApi.Infrastructure.KafkaOptions> kafkaOptions,
        IOptions<CplmOptions> cplmOptions,
        ConsumerHeartbeat heartbeat,
        SingleMemberGuard guard,
        [FromKeyedServices("cplm")] NpgsqlDataSource dataSource)
    {
        _logger = logger;
        _dataSource = dataSource;
        _options = cplmOptions.Value;
        _heartbeat = heartbeat;
        _guard = guard;
        _consumer = new ConsumerBuilder<string, string>(new ConsumerConfig
        {
            BootstrapServers = kafkaOptions.Value.BootstrapServers,
            GroupId = _options.ConsumerGroupId + "-" + Name,
            GroupInstanceId = _options.ConsumerGroupId + "-" + Name + "-sole",
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = true,
            EnableAutoOffsetStore = false
        })
        .SetPartitionsAssignedHandler((_, parts) => _guard.VerifySoleMembership(Name, parts))
        .Build();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        while (!stoppingToken.IsCancellationRequested)
        {
            _heartbeat.Report(Name, "ENSURING_SCHEMA");
            try { await EnsureSchemaAsync(stoppingToken); break; }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Condition-event schema not ensured yet; retrying in 10s");
                try { await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken); }
                catch (OperationCanceledException) { return; }
            }
        }
        if (stoppingToken.IsCancellationRequested) return;

        _consumer.Subscribe(_options.ConditionTopic);
        _logger.LogInformation("CplmConditionConsumerService subscribed to {Topic}", _options.ConditionTopic);

        while (!stoppingToken.IsCancellationRequested)
        {
            _heartbeat.Report(Name, "CONSUMING");
            ConsumeResult<string, string>? result = null;
            try
            {
                result = _consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (result is null) continue;
                if (!string.IsNullOrWhiteSpace(result.Message.Value))
                    await ApplyAsync(result.Message.Value, stoppingToken);
                _consumer.StoreOffset(result);
            }
            catch (ConsumeException ex) { _logger.LogError(ex, "Kafka consume error in CplmConditionConsumerService"); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error persisting condition event; offset not stored");
                await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
            }
        }
        _consumer.Close();
    }

    private async Task ApplyAsync(string json, CancellationToken ct)
    {
        var row = ConditionEventStore.Parse(json);
        if (row is null)
        {
            // Not a condition record (or unusable): skip and advance — a poison pill must
            // not block the partition. Logged so a producer change is not silent.
            _logger.LogWarning("Skipping unparseable condition record: {Snippet}", json.Length <= 160 ? json : json[..160] + "…");
            return;
        }
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await conn.ExecuteAsync(ConditionEventStore.UpsertSql, row);
    }

    private async Task EnsureSchemaAsync(CancellationToken ct)
    {
        if (Interlocked.CompareExchange(ref _schemaEnsured, 1, 0) != 0) return;
        try
        {
            await using var conn = await _dataSource.OpenConnectionAsync(ct);
            await conn.ExecuteAsync(ConditionEventStore.EnsureSchemaSql);
            _logger.LogInformation("CPLM condition-event schema ensured");
        }
        catch { Interlocked.Exchange(ref _schemaEnsured, 0); throw; }
    }
}
