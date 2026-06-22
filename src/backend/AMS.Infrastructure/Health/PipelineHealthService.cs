using System.Text.Json;
using System.Text.Json.Serialization;
using AMS.Infrastructure.Kafka;
using AMS.Infrastructure.Repositories;
using Confluent.Kafka;
using Confluent.Kafka.Admin;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace AMS.Infrastructure.Health;

public sealed record KafkaHealth(long Lag, double Throughput, string BrokerHealth);
public sealed record FlinkOperatorMetric(
    string Name,
    long RecordsIn,
    long RecordsOut);

public sealed record FlinkHealth(
    long CheckpointLatencyMs,
    int RestartCount,
    long WatermarkDelayMs,
    string Backpressure,
    string Status,
    long OperatorActionsProcessed = 0,
    long AckResultsProcessed = 0,
    long RawAlarmsProcessed = 0,
    long RecordsReceived = 0,
    long RecordsSent = 0,
    IReadOnlyList<FlinkOperatorMetric>? Operators = null);
public sealed record CepHealth(bool RulesActive, string Status);
public sealed record OpcConnectionsHealth(int ActiveConnections, int TotalEnabled, string Status);
public sealed record PostgresHealth(double QueryLatencyMs, int ConnectionPoolUsage);
public sealed record SignalRHealth(int ConnectedClients, string Status);
public sealed record TelemetryIngestHealth(string State, double? SecondsSinceLastEvent, long TotalEventsObserved);

public sealed record PipelineHealthResponse(
    [property: JsonPropertyName("kafka")] KafkaHealth Kafka,
    [property: JsonPropertyName("flink")] FlinkHealth Flink,
    [property: JsonPropertyName("opcConnections")] OpcConnectionsHealth OpcConnections,
    [property: JsonPropertyName("postgres")] PostgresHealth Postgres,
    [property: JsonPropertyName("signalr")] SignalRHealth Signalr,
    [property: JsonPropertyName("cep")] CepHealth Cep,
    [property: JsonPropertyName("telemetryIngest")] TelemetryIngestHealth TelemetryIngest,
    [property: JsonPropertyName("readiness")] ReadinessHealth Readiness
);

public sealed class PipelineHealthService
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _config;
    private readonly TelemetryIngestState _telemetryIngest;
    private readonly ISignalRHealthProvider? _signalRHealth;
    private readonly ReadinessHistoryStore _readinessHistory;
    private readonly ILogger<PipelineHealthService> _logger;

    public PipelineHealthService(
        IHttpClientFactory http,
        IConfiguration config,
        TelemetryIngestState telemetryIngest,
        ReadinessHistoryStore readinessHistory,
        ILogger<PipelineHealthService> logger,
        ISignalRHealthProvider? signalRHealth = null)
    {
        _http = http;
        _config = config;
        _telemetryIngest = telemetryIngest;
        _readinessHistory = readinessHistory;
        _logger = logger;
        _signalRHealth = signalRHealth;
    }

    public async Task<PipelineHealthResponse> GetAsync(
        CancellationToken ct,
        IOpcConnectionRepository? opcConnections = null)
    {
        double pgLatency = 0;
        int pgPool = 0;
        try
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var connStr = _config.GetConnectionString("AmsDb");
            if (string.IsNullOrEmpty(connStr))
                return EmptyResponse();

            await using var conn = new NpgsqlConnection(connStr + ";Timeout=3;Command Timeout=3");
            using var openCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            openCts.CancelAfter(TimeSpan.FromSeconds(3));
            await conn.OpenAsync(openCts.Token);
            await using var cmd = new NpgsqlCommand("SELECT count(*) FROM pg_stat_activity", conn);
            pgPool = Convert.ToInt32(await cmd.ExecuteScalarAsync(ct));
            sw.Stop();
            pgLatency = sw.Elapsed.TotalMilliseconds;
        }
        catch { /* postgres probe optional */ }

        long cpLatency = 0;
        int restarts = 0;
        long wmDelay = 0;
        long operatorActionsProcessed = 0;
        long ackResultsProcessed = 0;
        long rawAlarmsProcessed = 0;
        long recordsReceived = 0;
        long recordsSent = 0;
        IReadOnlyList<FlinkOperatorMetric> flinkOperators = [];
        string bp = "Unknown";
        string flinkStatus = "Unknown";
        string? runningJobId = null;
        var labAckSimulator = false;
        try
        {
            var client = _http.CreateClient();
            var flinkBase = _config["Flink:JobManagerUrl"] ?? "http://localhost:8082";
            var overview = await client.GetAsync($"{flinkBase.TrimEnd('/')}/jobs/overview", ct);
            if (overview.IsSuccessStatusCode)
            {
                bp = "NONE";
                flinkStatus = "Stopped";
                var json = await overview.Content.ReadAsStringAsync(ct);
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("jobs", out var jobs))
                {
                    JsonElement? selected = null;
                    string? selectedState = null;
                    foreach (var job in jobs.EnumerateArray())
                    {
                        if (!job.TryGetProperty("name", out var nameEl)) continue;
                        if (!(nameEl.GetString() ?? "").Contains("Alarm State Machine", StringComparison.OrdinalIgnoreCase))
                            continue;

                        var state = job.TryGetProperty("state", out var stateEl) ? stateEl.GetString() : null;
                        if (selected is null
                            || string.Equals(state, "RUNNING", StringComparison.OrdinalIgnoreCase)
                            || (string.Equals(selectedState, "CANCELED", StringComparison.OrdinalIgnoreCase)
                                && !string.Equals(state, "CANCELED", StringComparison.OrdinalIgnoreCase)))
                        {
                            selected = job;
                            selectedState = state;
                        }
                        if (string.Equals(state, "RUNNING", StringComparison.OrdinalIgnoreCase))
                            break;
                    }

                    if (selected is JsonElement selectedJob)
                    {
                        flinkStatus = string.Equals(selectedState, "RUNNING", StringComparison.OrdinalIgnoreCase)
                            ? "Running"
                            : selectedState ?? "Stopped";

                        if (selectedJob.TryGetProperty("tasks", out var tasks))
                            restarts = tasks.TryGetProperty("restarting", out var r) ? r.GetInt32() : 0;

                        if (selectedJob.TryGetProperty("jid", out var jidEl))
                        {
                            var jid = jidEl.GetString();
                            runningJobId = jid;
                            if (!string.IsNullOrEmpty(jid))
                            {
                                var cpRes = await client.GetAsync(
                                    $"{flinkBase.TrimEnd('/')}/jobs/{jid}/checkpoints", ct);
                                if (cpRes.IsSuccessStatusCode)
                                {
                                    var cpJson = await cpRes.Content.ReadAsStringAsync(ct);
                                    using var cpDoc = JsonDocument.Parse(cpJson);
                                    if (cpDoc.RootElement.TryGetProperty("latest", out var latest)
                                        && latest.TryGetProperty("completed", out var completed)
                                        && completed.TryGetProperty("end_to_end_duration", out var dur))
                                    {
                                        cpLatency = dur.GetInt64();
                                    }
                                }
                            }
                        }
                    }
                }
                wmDelay = 5;
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Flink health probe failed");
        }

        try
        {
            var bootstrap = _config["Kafka:BootstrapServers"] ?? "localhost:9092";
            operatorActionsProcessed = await SumConsumerGroupOffsetsAsync(
                bootstrap, "flink-ams-operator-actions", "operator-actions", ct);
            ackResultsProcessed = await SumConsumerGroupOffsetsAsync(
                bootstrap, "flink-ams-ack-results", "ack-results", ct);
            rawAlarmsProcessed = await SumConsumerGroupOffsetsAsync(
                bootstrap, "flink-ams-raw-alarms", "raw-alarms", ct);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Flink ACK pipeline offset probe failed");
        }

        if (!string.IsNullOrEmpty(runningJobId))
        {
            try
            {
                var client = _http.CreateClient();
                var flinkBase = _config["Flink:JobManagerUrl"] ?? "http://localhost:8082";
                var (ops, recv, sent) = await FetchFlinkOperatorMetricsAsync(
                    client, flinkBase, runningJobId, ct);
                flinkOperators = ops;
                recordsReceived = recv > 0 ? recv : rawAlarmsProcessed;
                recordsSent = sent > 0 ? sent : rawAlarmsProcessed;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Flink operator metrics probe failed");
            }
        }

        long lag = 0;
        double tput = 0;
        string broker = "Unknown";
        try
        {
            var bootstrap = _config["Kafka:BootstrapServers"] ?? "localhost:9092";
            var rawTopic = _config["Kafka:RawAlarmsTopic"] ?? "raw-alarms";

            var conf = new AdminClientConfig { BootstrapServers = bootstrap, SocketTimeoutMs = 5000 };
            using var adminClient = new AdminClientBuilder(conf).Build();
            var meta = adminClient.GetMetadata(rawTopic, TimeSpan.FromSeconds(5));
            broker = meta.Brokers.Count > 0 ? "Healthy" : "Offline";
            lag = await EstimateConsumerLagAsync(
                bootstrap, "flink-ams-raw-alarms", rawTopic, ct);
            tput = rawAlarmsProcessed > 0 ? rawAlarmsProcessed / 60.0 : 0;
        }
        catch
        {
            try
            {
                var bootstrap = _config["Kafka:BootstrapServers"] ?? "localhost:9092";
                var host = bootstrap.Split(':')[0];
                var port = bootstrap.Contains(':') && int.TryParse(bootstrap.Split(':')[1], out var p) ? p : 9092;
                using var tcp = new System.Net.Sockets.TcpClient();
                await tcp.ConnectAsync(host, port, ct);
                broker = tcp.Connected ? "Healthy" : "Offline";
            }
            catch { broker = "Offline"; }
        }

        var telemetrySnap = _telemetryIngest.GetSnapshot();
        var stallSec = _config.GetValue("Kafka:TelemetryStallThresholdSeconds", 60);

        int activeOpc = 0;
        int enabledOpc = 0;
        string opcStatus = "Unknown";
        if (opcConnections is not null)
        {
            try
            {
                var all = await opcConnections.GetAllAsync(ct);
                enabledOpc = all.Count(c => c.Enabled);
                activeOpc = all.Count(c => c.Enabled && c.Status == "Connected");
                opcStatus = activeOpc > 0 ? "Connected" : enabledOpc > 0 ? "Disconnected" : "None";
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "OPC connections health probe failed");
            }
        }

        var opcHealth = new OpcConnectionsHealth(activeOpc, enabledOpc, opcStatus);

        var signalR = _signalRHealth is not null
            ? new SignalRHealth(_signalRHealth.ActiveConnectionCount, _signalRHealth.ActiveConnectionCount > 0 ? "Healthy" : "Idle")
            : new SignalRHealth(0, "Unknown");

        var kafkaHealth = new KafkaHealth(lag, tput, broker);
        var flinkHealth = new FlinkHealth(
            cpLatency, restarts, wmDelay, bp, flinkStatus,
            operatorActionsProcessed, ackResultsProcessed, rawAlarmsProcessed,
            recordsReceived, recordsSent, flinkOperators);
        var pgHealth = new PostgresHealth(pgLatency, pgPool);
        var telemetryHealth = new TelemetryIngestHealth(
            telemetrySnap.State,
            telemetrySnap.SecondsSinceLastEvent,
            telemetrySnap.TotalEventsObserved);
        var baseReadiness = OperatorReadinessBuilder.Build(
            kafkaHealth, flinkHealth, pgHealth, signalR, telemetrySnap, labAckSimulator);
        var change = _readinessHistory.BuildChangeSummary(baseReadiness);
        _readinessHistory.Record(baseReadiness with { Change = change });
        var readiness = baseReadiness with
        {
            Change = change,
            Timeline = _readinessHistory.GetTimeline(),
        };

        var cepActive = string.Equals(flinkStatus, "Running", StringComparison.OrdinalIgnoreCase);
        var cepHealth = new CepHealth(cepActive, cepActive ? "Active" : "Inactive");

        return new PipelineHealthResponse(
            kafkaHealth,
            flinkHealth,
            opcHealth,
            pgHealth,
            signalR,
            cepHealth,
            telemetryHealth,
            readiness);
    }

    private static PipelineHealthResponse EmptyResponse() => new(
        new KafkaHealth(0, 0, "Offline"),
        new FlinkHealth(0, 0, 0, "Unknown", "Offline", 0, 0, 0, 0, 0, []),
        new OpcConnectionsHealth(0, 0, "Unknown"),
        new PostgresHealth(0, 0),
        new SignalRHealth(0, "Unknown"),
        new CepHealth(false, "Inactive"),
        new TelemetryIngestHealth("UNKNOWN", null, 0),
        new ReadinessHealth(0, LiveReadinessScorer.CutoverThreshold, "NOT_READY", "FAIL",
            new Dictionary<string, int>(), [], [], null, null));

    private static async Task<(IReadOnlyList<FlinkOperatorMetric> Operators, long RecordsIn, long RecordsOut)>
        FetchFlinkOperatorMetricsAsync(
            HttpClient client, string flinkBase, string jobId, CancellationToken ct)
    {
        var verticesRes = await client.GetAsync($"{flinkBase.TrimEnd('/')}/jobs/{jobId}", ct);
        if (!verticesRes.IsSuccessStatusCode)
            return ([], 0, 0);

        var verticesJson = await verticesRes.Content.ReadAsStringAsync(ct);
        using var verticesDoc = JsonDocument.Parse(verticesJson);
        if (!verticesDoc.RootElement.TryGetProperty("vertices", out var vertices))
            return ([], 0, 0);

        var operators = new List<FlinkOperatorMetric>();
        long totalIn = 0;
        long totalOut = 0;

        foreach (var vertex in vertices.EnumerateArray())
        {
            if (!vertex.TryGetProperty("id", out var idEl) || !vertex.TryGetProperty("name", out var nameEl))
                continue;

            var vid = idEl.GetString();
            var name = nameEl.GetString() ?? vid ?? "unknown";
            if (string.IsNullOrEmpty(vid)) continue;

            var metricsRes = await client.GetAsync(
                $"{flinkBase.TrimEnd('/')}/jobs/{jobId}/vertices/{vid}/metrics",
                ct);
            if (!metricsRes.IsSuccessStatusCode) continue;

            var metricsJson = await metricsRes.Content.ReadAsStringAsync(ct);
            using var metricsDoc = JsonDocument.Parse(metricsJson);
            long recordsIn = 0;
            long recordsOut = 0;

            foreach (var metric in metricsDoc.RootElement.EnumerateArray())
            {
                if (!metric.TryGetProperty("id", out var metricId) || !metric.TryGetProperty("value", out var valueEl))
                    continue;
                var id = metricId.GetString() ?? "";
                if (!long.TryParse(valueEl.GetString(), out var val)) continue;

                if (id.EndsWith(".records_in", StringComparison.OrdinalIgnoreCase)
                    || id.EndsWith(".numRecordsIn", StringComparison.OrdinalIgnoreCase))
                    recordsIn = Math.Max(recordsIn, val);
                else if (id.EndsWith(".records_out", StringComparison.OrdinalIgnoreCase)
                         || id.EndsWith(".numRecordsOut", StringComparison.OrdinalIgnoreCase))
                    recordsOut = Math.Max(recordsOut, val);
            }

            operators.Add(new FlinkOperatorMetric(name, recordsIn, recordsOut));
            totalIn += recordsIn;
            totalOut += recordsOut;
        }

        return (operators, totalIn, totalOut);
    }

    private static async Task<long> SumConsumerGroupOffsetsAsync(
        string bootstrap, string groupId, string topic, CancellationToken ct)
    {
        try
        {
            using var admin = new AdminClientBuilder(new AdminClientConfig
            {
                BootstrapServers = bootstrap,
                SocketTimeoutMs = 5000
            }).Build();

            var meta = admin.GetMetadata(topic, TimeSpan.FromSeconds(5));
            var topicMeta = meta.Topics.FirstOrDefault(t => t.Topic == topic);
            if (topicMeta is null) return 0;

            var topicPartitions = topicMeta.Partitions
                .Select(p => new TopicPartition(topic, p.PartitionId))
                .ToList();

            var offsetResults = await admin.ListConsumerGroupOffsetsAsync(
                [new ConsumerGroupTopicPartitions(groupId, topicPartitions)],
                new ListConsumerGroupOffsetsOptions { RequestTimeout = TimeSpan.FromSeconds(5) });

            var groupOffsets = offsetResults.FirstOrDefault(o => o.Group == groupId);
            if (groupOffsets?.Partitions is null) return 0;

            long total = 0;
            foreach (var part in groupOffsets.Partitions)
            {
                ct.ThrowIfCancellationRequested();
                if (part.Error.IsError) continue;
                var offset = part.TopicPartitionOffset.Offset;
                if (!offset.IsSpecial && offset.Value > 0)
                    total += offset.Value;
            }

            return total;
        }
        catch
        {
            return 0;
        }
    }

    private static async Task<long> EstimateConsumerLagAsync(
        string bootstrap, string groupId, string topic, CancellationToken ct)
    {
        try
        {
            using var admin = new AdminClientBuilder(new AdminClientConfig
            {
                BootstrapServers = bootstrap,
                SocketTimeoutMs = 5000
            }).Build();

            var groupResult = await admin.DescribeConsumerGroupsAsync(
                [groupId],
                new DescribeConsumerGroupsOptions { RequestTimeout = TimeSpan.FromSeconds(5) });

            var desc = groupResult.ConsumerGroupDescriptions.FirstOrDefault();
            if (desc is null || desc.State != ConsumerGroupState.Stable)
                return 0;

            var meta = admin.GetMetadata(topic, TimeSpan.FromSeconds(5));
            var topicMeta = meta.Topics.FirstOrDefault(t => t.Topic == topic);
            if (topicMeta is null) return 0;

            var topicPartitions = topicMeta.Partitions
                .Select(p => new TopicPartition(topic, p.PartitionId))
                .ToList();

            var offsetResults = await admin.ListConsumerGroupOffsetsAsync(
                [new ConsumerGroupTopicPartitions(groupId, topicPartitions)],
                new ListConsumerGroupOffsetsOptions { RequestTimeout = TimeSpan.FromSeconds(5) });

            var groupOffsets = offsetResults.FirstOrDefault(o => o.Group == groupId);
            if (groupOffsets?.Partitions is null || groupOffsets.Partitions.Count == 0)
                return 0;

            using var consumer = new ConsumerBuilder<Ignore, Ignore>(new ConsumerConfig
            {
                BootstrapServers = bootstrap,
                GroupId = $"ams-health-lag-{Guid.NewGuid():N}",
                EnableAutoCommit = false
            }).Build();

            long totalLag = 0;
            foreach (var part in groupOffsets.Partitions)
            {
                ct.ThrowIfCancellationRequested();
                if (part.Error.IsError) continue;

                var tpo = part.TopicPartitionOffset;
                if (tpo.TopicPartition.Topic != topic) continue;

                var wm = consumer.QueryWatermarkOffsets(tpo.TopicPartition, TimeSpan.FromSeconds(5));
                if (tpo.Offset.IsSpecial) continue;
                var lagPart = wm.High.Value - tpo.Offset.Value;
                if (lagPart > 0) totalLag += lagPart;
            }

            return totalLag;
        }
        catch
        {
            return 0;
        }
    }
}
