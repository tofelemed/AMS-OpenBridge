using System.Text.Json;
using System.Text.Json.Nodes;
using Confluent.Kafka;
using Microsoft.Extensions.Options;

namespace Traverse.CplmApi.Services.OnDemand;

/// <summary>
/// CHG-102 Phase 5c — the request the on-demand job consumes (schema cplm.evaluation.request.v1, keyed by loop_id).
/// The Flink job (CplmOnDemandEvaluationJob) is built against exactly these field names.
/// </summary>
public sealed record EvaluationRequest(
    Guid AnalysisRunId, string LoopId, string Site, string? LoopType, EvaluationWindow Window, string? IotDbDevice,
    bool HasStepTest, bool HasPeerLinks, string? BundleHash, string? BundlePropertiesB64, long RequestedAtMs)
{
    public const string Schema = "cplm.evaluation.request.v1";

    public string ToJson() => new JsonObject
    {
        ["schema"] = Schema,
        ["analysis_run_id"] = AnalysisRunId.ToString(),
        ["mode"] = "EVALUATE",
        ["loop_id"] = LoopId,
        ["site"] = Site,
        ["loop_type"] = LoopType,
        ["window_kind"] = Window.WindowKind,
        ["from_ms"] = Window.FromMs,
        ["to_ms"] = Window.ToMs,
        ["iotdb_device"] = IotDbDevice,
        ["has_step_test"] = HasStepTest,
        ["has_peer_links"] = HasPeerLinks,
        ["bundle_hash"] = BundleHash,
        ["bundle_properties_b64"] = BundlePropertiesB64,
        ["requested_at_ms"] = RequestedAtMs,
    }.ToJsonString();
}

/// <summary>CHG-102 5c — one record of the job's status topic (schema cplm.evaluation.status.v1, keyed by analysis_run_id).</summary>
public sealed record EvaluationStatus(
    Guid AnalysisRunId, string? LoopId, string State, string? WindowKind, long? WindowStartMs, long? WindowEndMs,
    int? Samples, int? Artifacts, IReadOnlyDictionary<string, string>? MethodRunIds, string? Error, long? ElapsedMs, long AtMs)
{
    public const string Schema = "cplm.evaluation.status.v1";

    /// <summary>Null = not a status record we can apply (unparseable, another schema, no run id, no state).</summary>
    public static EvaluationStatus? Parse(string json)
    {
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { return null; }
        if (root.ValueKind != JsonValueKind.Object) return null;
        var schema = S(root, "schema");
        if (schema is not null && schema != Schema) return null;
        if (!Guid.TryParse(S(root, "analysis_run_id"), out var id)) return null;
        var state = S(root, "state");
        if (string.IsNullOrWhiteSpace(state)) return null;
        Dictionary<string, string>? ids = null;
        if (root.TryGetProperty("method_run_ids", out var m) && m.ValueKind == JsonValueKind.Object)
        {
            ids = new Dictionary<string, string>();
            foreach (var p in m.EnumerateObject())
                if (p.Value.ValueKind == JsonValueKind.String && Guid.TryParse(p.Value.GetString(), out _)) ids[p.Name] = p.Value.GetString()!;
        }
        return new EvaluationStatus(id, S(root, "loop_id"), state.Trim().ToUpperInvariant(), S(root, "window_kind"),
            L(root, "window_start_ms"), L(root, "window_end_ms"), (int?)L(root, "samples"), (int?)L(root, "artifacts"), ids,
            S(root, "error"), L(root, "elapsed_ms"), L(root, "at_ms") ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    }

    private static string? S(JsonElement e, string n) => e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
    private static long? L(JsonElement e, string n) => e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt64(out var v) ? v : null;
}

/// <summary>Puts an evaluation request on the request topic (an interface so the API tests run without Kafka).</summary>
public interface IEvaluationRequestPublisher
{
    Task PublishAsync(EvaluationRequest request, CancellationToken ct);
}

public sealed class KafkaEvaluationRequestPublisher : IEvaluationRequestPublisher, IDisposable
{
    private readonly Lazy<IProducer<string, string>> _producer;
    private readonly EvaluationOptions _options;

    public KafkaEvaluationRequestPublisher(IOptions<Traverse.CplmApi.Infrastructure.KafkaOptions> kafka, IOptions<EvaluationOptions> options)
    {
        _options = options.Value;
        var brokers = kafka.Value.BootstrapServers;
        // built on first use: an instance that never evaluates never opens a producer
        _producer = new Lazy<IProducer<string, string>>(() => new ProducerBuilder<string, string>(new ProducerConfig
        {
            BootstrapServers = brokers, Acks = Acks.All, EnableIdempotence = true, MessageTimeoutMs = 10_000,
        }).Build());
    }

    public async Task PublishAsync(EvaluationRequest request, CancellationToken ct)
        => await _producer.Value.ProduceAsync(_options.RequestTopic,
            new Message<string, string> { Key = request.LoopId, Value = request.ToJson() }, ct);

    public void Dispose()
    {
        if (!_producer.IsValueCreated) return;
        _producer.Value.Flush(TimeSpan.FromSeconds(5));
        _producer.Value.Dispose();
    }
}
