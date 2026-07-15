using System.Text.Json;
using Confluent.Kafka;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using Traverse.AnalysisService.Data;

namespace Traverse.AnalysisService.Consumers;

/// <summary>
/// Phase 7 — closes the calculation loop. Consumes <c>analysis.results</c> (produced by the Flink
/// AnalysisExecutionJob) and (1) updates the execution row to completed/failed, (2) publishes the
/// derived value to the UNS live plane by writing its Redis snapshot, and (3) registers the derived
/// measurement in asset-model so binding-resolver can resolve it and any symbol can bind it like a tag.
///
/// This is what makes a calculation a real, bindable UNS measurement rather than a value that lands in a
/// topic nobody reads. Best-effort on the publish side — a failed snapshot/registration is logged, never
/// throws, so the execution bookkeeping always completes.
/// </summary>
public class AnalysisResultConsumer : BackgroundService
{
    private readonly ILogger<AnalysisResultConsumer> _logger;
    private readonly IServiceProvider _sp;
    private readonly IConnectionMultiplexer _redis;
    private readonly IHttpClientFactory _httpFactory;
    private readonly string _brokers;

    public AnalysisResultConsumer(ILogger<AnalysisResultConsumer> logger, IServiceProvider sp,
        IConnectionMultiplexer redis, IHttpClientFactory httpFactory, IConfiguration config)
    {
        _logger = logger;
        _sp = sp;
        _redis = redis;
        _httpFactory = httpFactory;
        _brokers = config["Kafka:Brokers"] ?? "kafka:9092";
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Run the blocking Kafka consume loop off the startup thread.
        return Task.Run(() => Consume(stoppingToken), stoppingToken);
    }

    private async Task Consume(CancellationToken ct)
    {
        var config = new ConsumerConfig
        {
            BootstrapServers = _brokers,
            GroupId = "analysis-service-results",
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = true,
        };

        using var consumer = new ConsumerBuilder<Ignore, string>(config).Build();
        try { consumer.Subscribe("analysis.results"); }
        catch (Exception ex) { _logger.LogWarning(ex, "Could not subscribe to analysis.results"); return; }

        _logger.LogInformation("Analysis result consumer listening on analysis.results");
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var cr = consumer.Consume(ct);
                if (cr?.Message?.Value is null) continue;
                await HandleResult(cr.Message.Value);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { _logger.LogWarning(ex, "Error handling analysis result"); }
        }
        consumer.Close();
    }

    private async Task HandleResult(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        if (!root.TryGetProperty("executionId", out var exEl) || !Guid.TryParse(exEl.GetString(), out var executionId))
            return;

        var hasError = root.TryGetProperty("error", out var errEl) && errEl.ValueKind == JsonValueKind.String;
        var skipped = root.TryGetProperty("skipped", out var sk) && sk.ValueKind == JsonValueKind.True;
        double? value = root.TryGetProperty("value", out var vEl) && vEl.TryGetDouble(out var d) ? d : null;
        var outputPath = root.TryGetProperty("outputPath", out var opEl) ? opEl.GetString() : null;
        var unit = root.TryGetProperty("unit", out var uEl) && uEl.ValueKind == JsonValueKind.String ? uEl.GetString() : null;

        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AnalysisDbContext>();
        var execution = await db.Executions.FirstOrDefaultAsync(e => e.Id == executionId);
        if (execution is null) return;

        // A "skipped" result (non-calculation analysis this job doesn't run) is not a success — don't
        // report "completed" for work that never happened.
        execution.Status = hasError ? "failed" : skipped ? "skipped" : "completed";
        execution.ErrorMessage = hasError ? errEl.GetString() : null;
        execution.OutputRecords = (!hasError && !skipped && value.HasValue) ? 1 : 0;
        execution.CompletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();

        if (hasError || skipped || value is null || string.IsNullOrWhiteSpace(outputPath)) return;

        // Publish the derived value to the UNS: live snapshot + asset registration. Best-effort.
        await PublishDerived(outputPath!, value.Value, unit);
    }

    private async Task PublishDerived(string outputPath, double value, string? unit)
    {
        // A calc OutputPath in UNS form (site/…/device.measurement) becomes a bindable derived tag. An
        // IoTDB-style path (root.x.y) is snapshotted under a derived key but not asset-registered.
        try
        {
            var redis = _redis.GetDatabase();
            var payload = JsonSerializer.Serialize(new { value, q = 192, ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
            var snapKey = outputPath.Contains('/') ? SnapshotKeyFor(outputPath) : $"snapshot:derived:{outputPath}";
            if (snapKey is not null)
                await redis.StringSetAsync(snapKey, payload, TimeSpan.FromHours(24));
        }
        catch (Exception ex) { _logger.LogDebug(ex, "derived snapshot write failed for {Path}", outputPath); }

        if (!outputPath.Contains('/')) return;
        try
        {
            var client = _httpFactory.CreateClient("AssetModel");
            var body = JsonSerializer.Serialize(new
            {
                contextualPath = outputPath,
                name = outputPath.Split('/', '.').Last(),
                type = 5, // measurement
                engineeringUnit = unit,
                description = "Derived measurement (calculation result)",
            });
            var content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
            var res = await client.PostAsync("/assets", content);
            if (!res.IsSuccessStatusCode)
                _logger.LogDebug("Derived asset registration returned {Status} for {Path}", res.StatusCode, outputPath);
        }
        catch (Exception ex) { _logger.LogDebug(ex, "derived asset registration failed for {Path}", outputPath); }
    }

    /// <summary>Snapshot key by BARE device (matches the live-plane writers + historian /snapshot).</summary>
    private static string? SnapshotKeyFor(string contextualPath)
    {
        var parts = contextualPath.Split('/');
        if (parts.Length < 2) return null;
        var site = parts[0];
        var edgeNode = $"{site}_edge1";
        var last = parts[^1];
        var dot = last.IndexOf('.');
        if (dot < 0) return null;
        var device = last[..dot];
        var metric = last[(dot + 1)..];
        return $"snapshot:metric:{site}:{edgeNode}:{device}:{metric}";
    }
}
