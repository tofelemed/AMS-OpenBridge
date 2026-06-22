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
            EnableAutoCommit = true,
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
                    if (cr.IsPartitionEOF || string.IsNullOrWhiteSpace(cr.Message.Value))
                        continue;

                    var writeback = JsonSerializer.Deserialize<AckWritebackMessage>(cr.Message.Value, JsonOpts);
                    if (writeback == null) continue;

                    var feedCorrelationId = ResolveFeedCorrelationId(writeback);
                    _logger.LogInformation(
                        "Processing HTTP ACK writeback for AlarmId={AlarmId} FeedCorrelation={FeedCorrelation}",
                        writeback.AlarmId,
                        feedCorrelationId);

                    var payload = new
                    {
                        correlation_ids = new[] { feedCorrelationId },
                        source_event_id = writeback.SourceEventId,
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

                    await _producer.PublishAsync(_kafka.AckResultsTopic, writeback.AlarmId, resultMsg, stoppingToken);
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
