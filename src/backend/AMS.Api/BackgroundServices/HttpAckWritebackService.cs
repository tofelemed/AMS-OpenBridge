using AMS.Infrastructure.Kafka;
using Confluent.Kafka;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Text;
using System.Text.Json;

namespace AMS.Api.BackgroundServices;

public class HttpAckWritebackService : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private readonly KafkaOptions _kafka;
    private readonly AlarmIngestionOptions _ingest;
    private readonly AlarmEventProducer _producer;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<HttpAckWritebackService> _logger;

    public HttpAckWritebackService(
        IOptions<KafkaOptions> kafka,
        IOptions<AlarmIngestionOptions> ingest,
        AlarmEventProducer producer,
        IHttpClientFactory httpClientFactory,
        ILogger<HttpAckWritebackService> logger)
    {
        _kafka = kafka.Value;
        _ingest = ingest.Value;
        _producer = producer;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        var ackUrl = _ingest.ResolveAckWritebackUrl();
        _logger.LogInformation(
            "HttpAckWritebackService started, consuming from {Topic}, posting to {AckUrl}",
            _kafka.AckWritebackTopic,
            ackUrl);

        var config = new ConsumerConfig
        {
            BootstrapServers = _kafka.BootstrapServers,
            GroupId = $"{_kafka.ConsumerGroupId}-http-ack-writeback",
            AutoOffsetReset = AutoOffsetReset.Latest,
            // STR-10: manual commit. With auto-commit the offset could advance before the DCS
            // POST and the traverse.alarm.ack-results publish had happened, so a crash in that window silently
            // dropped an operator acknowledgement (at-most-once). We now commit only after the
            // full cycle is durable, making the writeback at-least-once; the DCS payload carries
            // an idempotency key so a redelivered ACK is a no-op rather than a duplicate action.
            EnableAutoCommit = false,
        };

        using var consumer = new ConsumerBuilder<string, string>(config).Build();
        consumer.Subscribe(_kafka.AckWritebackTopic);

        var client = _httpClientFactory.CreateClient("AlarmFeed");

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var cr = consumer.Consume(stoppingToken);
                    if (cr.IsPartitionEOF)
                        continue;

                    if (string.IsNullOrWhiteSpace(cr.Message.Value))
                    {
                        consumer.Commit(cr); // nothing actionable — do not redeliver
                        continue;
                    }

                    AckWritebackMessage? writeback;
                    try
                    {
                        writeback = JsonSerializer.Deserialize<AckWritebackMessage>(cr.Message.Value, JsonOpts);
                    }
                    catch (JsonException jex)
                    {
                        _logger.LogError(jex, "Malformed traverse.alarm.ack-writeback at offset {Offset}; skipping", cr.Offset.Value);
                        consumer.Commit(cr); // poison message would never parse on retry
                        continue;
                    }

                    if (writeback == null)
                    {
                        consumer.Commit(cr);
                        continue;
                    }

                    var feedCorrelationId = ResolveFeedCorrelationId(writeback);
                    _logger.LogInformation(
                        "Processing HTTP ACK writeback for AlarmId={AlarmId} FeedCorrelation={FeedCorrelation}",
                        writeback.AlarmId,
                        feedCorrelationId);

                    // idempotency_key lets the DCS discard a redelivered ACK. Required now that
                    // the consumer is at-least-once (STR-10): the same writeback can legitimately
                    // be POSTed twice if we crash between the POST and the offset commit.
                    var idempotencyKey = !string.IsNullOrWhiteSpace(writeback.CommandId)
                        ? writeback.CommandId
                        : $"{writeback.AlarmId}|{writeback.ActiveTimeEpochMs}|{writeback.CookieOffset}";

                    var payload = new
                    {
                        correlation_ids = new[] { feedCorrelationId },
                        source_event_id = writeback.SourceEventId,
                        idempotency_key = idempotencyKey,
                        action = "ACKNOWLEDGE",
                        @operator = writeback.Username ?? "operator",
                        timestamp = DateTimeOffset.UtcNow.ToString("o")
                    };

                    var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

                    string resultState;
                    string? errorMessage = null;

                    try
                    {
                        var response = await client.PostAsync(ackUrl, content, stoppingToken);
                        if (response.IsSuccessStatusCode)
                        {
                            resultState = AckLifecycleStates.Confirmed;
                            _logger.LogInformation(
                                "HTTP ACK Writeback successful for FeedCorrelation={FeedCorrelation}",
                                feedCorrelationId);
                        }
                        else
                        {
                            resultState = AckLifecycleStates.Failed;
                            var body = await response.Content.ReadAsStringAsync(stoppingToken);
                            errorMessage = $"HTTP {(int)response.StatusCode} {response.StatusCode}: {body}";
                            _logger.LogWarning(
                                "HTTP ACK Writeback failed for FeedCorrelation={FeedCorrelation}. Status: {StatusCode} Body: {Body}",
                                feedCorrelationId, response.StatusCode, body);
                        }
                    }
                    catch (Exception ex)
                    {
                        resultState = AckLifecycleStates.Failed;
                        errorMessage = $"HTTP Exception: {ex.Message}";
                        _logger.LogError(ex, "HTTP ACK Writeback exception for FeedCorrelation={FeedCorrelation}", feedCorrelationId);
                    }

                    var resultMsg = new AckResultMessage
                    {
                        SchemaVersion = StreamSchemaVersion.Current,
                        EventType = StreamEventTypes.AckResult,
                        CommandId = writeback.CommandId,
                        CorrelationId = writeback.CorrelationId,
                        LifecycleId = writeback.LifecycleId,
                        DcsSequenceId = writeback.DcsSequenceId,
                        AlarmId = writeback.AlarmId,
                        ServerId = writeback.ServerId,
                        SourceName = writeback.SourceName,
                        ConditionName = writeback.ConditionName,
                        ActiveTimeEpochMs = writeback.ActiveTimeEpochMs,
                        CookieOffset = writeback.CookieOffset,
                        ResultState = resultState,
                        ErrorMessage = errorMessage,
                        TimestampEpochMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    };

                    // Commit only after the ack-result is durably published. If this publish
                    // fails we leave the offset uncommitted so the whole cycle is retried on
                    // redelivery — the operator's acknowledgement is never silently lost.
                    try
                    {
                        await _producer.PublishAsync(_kafka.AckResultsTopic, writeback.AlarmId, resultMsg, stoppingToken);
                        consumer.Commit(cr);
                    }
                    catch (Exception pubEx)
                    {
                        _logger.LogError(pubEx,
                            "Failed to publish ack-result for AlarmId={AlarmId}; offset not committed, " +
                            "writeback will be retried on redelivery.", writeback.AlarmId);
                        await Task.Delay(2000, stoppingToken);
                    }
                }
                catch (ConsumeException ex)
                {
                    _logger.LogWarning(ex, "HttpAckWritebackService consume error; retrying in 5s");
                    await Task.Delay(5000, stoppingToken);
                }
            }
        }
        catch (OperationCanceledException) { }
        finally
        {
            consumer.Close();
        }
    }

    private static string ResolveFeedCorrelationId(AckWritebackMessage writeback)
    {
        if (!string.IsNullOrWhiteSpace(writeback.SourceAlarmId))
            return writeback.SourceAlarmId.Trim();

        if (!string.IsNullOrWhiteSpace(writeback.SourceName)
            && !string.IsNullOrWhiteSpace(writeback.ConditionName))
        {
            return $"{writeback.SourceName.Trim()}|{writeback.ConditionName.Trim()}";
        }

        return writeback.AlarmId;
    }
}
