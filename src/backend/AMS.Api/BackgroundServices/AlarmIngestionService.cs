using AMS.Infrastructure.Kafka;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AMS.Api.BackgroundServices;

/// <summary>
/// Authoritative alarm ingestion: polls the source API and publishes delta events to raw-alarms.
/// </summary>
public sealed class AlarmIngestionOptions
{
    public const string SectionName = "AlarmIngestion";
    public static readonly Guid DefaultHttpFeedServerId = Guid.Parse("f0af9a6d-85f6-4c9f-a8ad-6de277d1d110");
    public const string DefaultHttpFeedServerName = "Current Alarms Feed";
    public const string DefaultHttpFeedUrl = "http://192.168.1.51:8010/api/current-alarms";
    public const string DefaultHttpAckWritebackUrl = "http://192.168.1.51:8010/api/alarms/acknowledge";

    public bool Enabled { get; set; } = true;
    public string FeedUrl { get; set; } = DefaultHttpFeedUrl;
    public string AckWritebackUrl { get; set; } = DefaultHttpAckWritebackUrl;
    public int PollIntervalMs { get; set; } = 2000;
    public string ServerId { get; set; } = DefaultHttpFeedServerId.ToString();
    public string ServerName { get; set; } = DefaultHttpFeedServerName;

    public string ResolveAckWritebackUrl()
    {
        if (!string.IsNullOrWhiteSpace(AckWritebackUrl))
            return AckWritebackUrl.Trim();

        var feed = string.IsNullOrWhiteSpace(FeedUrl) ? DefaultHttpFeedUrl : FeedUrl.Trim();
        const string ingestSuffix = "/api/current-alarms";
        if (feed.EndsWith(ingestSuffix, StringComparison.OrdinalIgnoreCase))
            return feed[..^ingestSuffix.Length] + "/api/alarms/acknowledge";

        return DefaultHttpAckWritebackUrl;
    }
}

public sealed class AlarmIngestionService : BackgroundService
{
    private readonly ILogger<AlarmIngestionService> _logger;
    private readonly AlarmEventProducer _producer;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly AlarmIngestionOptions _opts;
    private readonly ConcurrentDictionary<string, AlarmSnapshot> _lastSnapshot = new(StringComparer.OrdinalIgnoreCase);
    private long _eventsPublished;
    private long _pollCount;
    private DateTimeOffset _lastMetricsLog = DateTimeOffset.UtcNow;

    public AlarmIngestionService(
        ILogger<AlarmIngestionService> logger,
        AlarmEventProducer producer,
        IHttpClientFactory httpClientFactory,
        IOptions<AlarmIngestionOptions> opts)
    {
        _logger = logger;
        _producer = producer;
        _httpClientFactory = httpClientFactory;
        _opts = opts.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        if (!_opts.Enabled || string.IsNullOrWhiteSpace(_opts.FeedUrl))
        {
            _logger.LogInformation("AlarmIngestionService disabled.");
            return;
        }

        _logger.LogInformation(
            "AlarmIngestionService polling {Url} every {IntervalMs}ms → traverse.alarm.raw-alarms",
            _opts.FeedUrl, _opts.PollIntervalMs);

        var client = _httpClientFactory.CreateClient("AlarmFeed");

        while (!stoppingToken.IsCancellationRequested)
        {
            var sw = Stopwatch.StartNew();
            try
            {
                var responseStr = await client.GetStringAsync(_opts.FeedUrl, stoppingToken);
                var currentBatch = ParseResponse(responseStr);
                var published = await PublishDeltaAsync(currentBatch, stoppingToken);
                Interlocked.Increment(ref _pollCount);
                Interlocked.Add(ref _eventsPublished, published);
                LogMetricsIfDue(published, sw.ElapsedMilliseconds);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Alarm ingestion poll failed; retrying...");
            }

            await Task.Delay(Math.Clamp(_opts.PollIntervalMs, 1000, 5000), stoppingToken);
        }
    }

    private async Task<int> PublishDeltaAsync(List<HttpFeedAlarmRecord> currentBatch, CancellationToken ct)
    {
        var published = 0;
        var currentIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var record in currentBatch)
        {
            if (string.IsNullOrWhiteSpace(record.TagName) && string.IsNullOrWhiteSpace(record.CorrelationId))
                continue;

            var alarmId = !string.IsNullOrWhiteSpace(record.CorrelationId)
                ? record.CorrelationId
                : $"{record.TagName}|{ResolveConditionName(record)}";
            currentIds.Add(alarmId);

            var snapshot = ToSnapshot(record, alarmId);
            if (_lastSnapshot.TryGetValue(alarmId, out var prev) && prev.Equals(snapshot))
                continue;

            await PublishEventAsync(snapshot, record, ct);
            _lastSnapshot[alarmId] = snapshot;
            published++;
        }

        foreach (var kv in _lastSnapshot)
        {
            if (currentIds.Contains(kv.Key)) continue;
            if (kv.Value.State == "CLEARED") continue;

            var cleared = kv.Value with { State = "CLEARED", Timestamp = DateTimeOffset.UtcNow.ToString("o") };
            await PublishEventAsync(cleared, rawRecord: null, ct);
            _lastSnapshot[kv.Key] = cleared;
            published++;
        }

        return published;
    }

    private async Task PublishEventAsync(AlarmSnapshot snapshot, HttpFeedAlarmRecord? rawRecord, CancellationToken ct)
    {
        var payload = new
        {
            alarmId = snapshot.AlarmId,
            sourceName = snapshot.SourceName,
            sourceEventId = snapshot.SourceEventId,
            message = snapshot.Message,
            priority = snapshot.Priority,
            condition = snapshot.Condition,
            state = snapshot.State,
            timestamp = snapshot.Timestamp,
            acknowledged = snapshot.Acknowledged,
            rawPayload = ParseRawPayload(rawRecord?.RawPayload)
        };

        await _producer.PublishAsync("traverse.alarm.raw-alarms", snapshot.AlarmId, payload, ct);
    }

    private static object ParseRawPayload(string? rawPayload)
    {
        if (string.IsNullOrWhiteSpace(rawPayload))
            return new { };

        try
        {
            return JsonSerializer.Deserialize<JsonElement>(rawPayload);
        }
        catch
        {
            return rawPayload;
        }
    }

    private AlarmSnapshot ToSnapshot(HttpFeedAlarmRecord record, string alarmId)
    {
        var priority = !string.IsNullOrWhiteSpace(record.Severity)
            ? MapSeverityString(record.Severity)
            : MapNumericPriority(record.Priority);

        var state = string.Equals(record.State, "cleared", StringComparison.OrdinalIgnoreCase)
            ? "CLEARED"
            : "ACTIVE";

        return new AlarmSnapshot(
            alarmId,
            record.TagName ?? record.Asset ?? record.Area ?? record.Site ?? "HTTP Feed",
            record.SourceEventId ?? "",
            record.Message ?? record.Description ?? "",
            priority,
            ResolveConditionName(record),
            state,
            record.SourceTimestamp ?? DateTimeOffset.UtcNow.ToString("o"),
            record.Acknowledged);
    }

    private static string ResolveConditionName(HttpFeedAlarmRecord record)
    {
        if (!string.IsNullOrWhiteSpace(record.Description))
            return record.Description;

        if (!string.IsNullOrWhiteSpace(record.CorrelationId))
        {
            var parts = record.CorrelationId.Split('|', 2, StringSplitOptions.TrimEntries);
            if (parts.Length == 2 && !string.IsNullOrWhiteSpace(parts[1]))
                return parts[1];
        }

        return record.EventName ?? "Alarm";
    }

    private static string MapNumericPriority(int priority) => priority switch
    {
        <= 1 => "CRITICAL",
        2 => "HIGH",
        3 => "MEDIUM",
        4 => "LOW",
        _ => "LOW"
    };

    private static string MapSeverityString(string? severity) => severity?.ToUpperInvariant() switch
    {
        "CRITICAL" => "CRITICAL",
        "HIGH" => "HIGH",
        "MEDIUM" => "MEDIUM",
        "LOW" => "LOW",
        _ => "LOW"
    };

    private void LogMetricsIfDue(int lastBatchPublished, long pollMs)
    {
        var now = DateTimeOffset.UtcNow;
        if ((now - _lastMetricsLog).TotalSeconds < 30) return;
        _lastMetricsLog = now;

        var polls = Interlocked.Read(ref _pollCount);
        var events = Interlocked.Read(ref _eventsPublished);
        var rate = polls > 0 ? events / (double)polls : 0;
        _logger.LogInformation(
            "Alarm ingestion metrics: polls={Polls} eventsPublished={Events} avgEventsPerPoll={Rate:F2} lastPollMs={PollMs} lastBatch={Batch}",
            polls, events, rate, pollMs, lastBatchPublished);
    }

    private List<HttpFeedAlarmRecord> ParseResponse(string responseStr)
    {
        List<HttpFeedAlarmRecord>? records = null;
        try
        {
            using var doc = JsonDocument.Parse(responseStr);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Object
                && (root.TryGetProperty("items", out var itemsProp) 
                    || root.TryGetProperty("Items", out itemsProp)
                    || root.TryGetProperty("value", out itemsProp)
                    || root.TryGetProperty("Value", out itemsProp)))
            {
                records = JsonSerializer.Deserialize<List<HttpFeedAlarmRecord>>(
                    itemsProp.GetRawText(),
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
        }
        catch { /* fall through */ }

        if (records is null)
        {
            try
            {
                records = JsonSerializer.Deserialize<List<HttpFeedAlarmRecord>>(
                    responseStr,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch { /* empty */ }
        }

        return records ?? new List<HttpFeedAlarmRecord>();
    }

    private sealed record AlarmSnapshot(
        string AlarmId,
        string SourceName,
        string SourceEventId,
        string Message,
        string Priority,
        string Condition,
        string State,
        string Timestamp,
        bool Acknowledged);

    private sealed record HttpFeedAlarmRecord
    {
        [JsonPropertyName("correlation_id")]
        public string? CorrelationId { get; init; }
        [JsonPropertyName("source_event_id")]
        public string? SourceEventId { get; init; }
        [JsonPropertyName("event_name")]
        public string? EventName { get; init; }
        [JsonPropertyName("state")]
        public string? State { get; init; }
        [JsonPropertyName("severity")]
        public string? Severity { get; init; }
        [JsonPropertyName("priority")]
        public int Priority { get; init; }
        [JsonPropertyName("source_timestamp")]
        public string? SourceTimestamp { get; init; }
        [JsonPropertyName("tag_name")]
        public string? TagName { get; init; }
        [JsonPropertyName("description")]
        public string? Description { get; init; }
        [JsonPropertyName("message")]
        public string? Message { get; init; }
        [JsonPropertyName("acknowledged")]
        public bool Acknowledged { get; init; }
        [JsonPropertyName("asset")]
        public string? Asset { get; init; }
        [JsonPropertyName("area")]
        public string? Area { get; init; }
        [JsonPropertyName("site")]
        public string? Site { get; init; }
        [JsonPropertyName("raw_payload")]
        public string? RawPayload { get; init; }
    }
}
