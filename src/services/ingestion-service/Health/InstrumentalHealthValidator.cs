using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Json.Schema;

namespace Traverse.IngestionService.Health;

/// <summary>Why a message was refused (dead-letter reason) — or Ok.</summary>
public sealed record HealthVerdict(bool Ok, string? Reason, string? Detail)
{
    public static readonly HealthVerdict Accepted = new(true, null, null);
    public static HealthVerdict Refuse(string reason, string? detail = null) => new(false, reason, detail);
}

public static class HealthDlqReasons
{
    public const string TopicShape = "TOPIC_SHAPE";
    public const string TooLarge = "TOO_LARGE";
    public const string NotJson = "NOT_JSON";
    public const string UnsupportedVersion = "UNSUPPORTED_VERSION";
    public const string SchemaInvalid = "SCHEMA_INVALID";
    public const string KindMismatch = "KIND_MISMATCH";
    public const string IdentityMismatch = "IDENTITY_MISMATCH";
    public const string SourceNotAllowed = "SOURCE_NOT_ALLOWED";
    public const string TimestampSkew = "TIMESTAMP_SKEW";
    public const string IntegrityConflict = "INTEGRITY_CONFLICT";
    public const string EpochWithoutSnapshot = "EPOCH_WITHOUT_SNAPSHOT";
    public const string KafkaFailure = "KAFKA_FAILURE";
}

/// <summary>
/// v2.5 Task 1H.2 (spec v6 §4.3-4.4): STRICT validation of an Instrumental health message
/// against the embedded v1 contract (Contracts/instrumental-health/v1, synced from contracts/),
/// then the checks a schema cannot express: the payload's identity must equal the topic
/// captures and the source's configured scope, the producer must be allow-listed, the message
/// must be bounded, and the transport clock must be sane. Observed/verified times are NEVER
/// limited here — an old retained snapshot is valid data whose freshness Flink judges (NR-038).
/// </summary>
public static class InstrumentalHealthValidator
{
    private static readonly Lazy<Dictionary<string, JsonSchema>> Schemas = new(LoadSchemas);
    private static readonly EvaluationOptions Options = new() { OutputFormat = OutputFormat.List };

    private static Dictionary<string, JsonSchema> LoadSchemas()
    {
        var asm = Assembly.GetExecutingAssembly();
        var map = new Dictionary<string, JsonSchema>(StringComparer.Ordinal);
        foreach (var (kind, file) in new[] { ("STATE_SNAPSHOT", "state"), ("STATE_EVENT", "event"), ("SOURCE_AVAILABILITY", "availability") })
        {
            var name = asm.GetManifestResourceNames().Single(n => n.EndsWith($"{file}.schema.json", StringComparison.Ordinal));
            using var stream = asm.GetManifestResourceStream(name)!;
            using var reader = new StreamReader(stream, Encoding.UTF8);
            var schema = JsonSchema.FromText(reader.ReadToEnd());
            // Registering under the schema's own $id makes the cross-document $refs
            // (event/availability -> state.schema.json#/definitions/...) resolvable.
            SchemaRegistry.Global.Register(schema);
            map[kind] = schema;
        }
        return map;
    }

    /// <summary>Forces the embedded schemas to load (startup fail-fast).</summary>
    public static int SchemaCount => Schemas.Value.Count;

    public static HealthVerdict Validate(HealthTopic topic, byte[] payload, InstrumentalHealthSettings settings,
        DateTimeOffset receivedAt, out JsonObject? observation)
    {
        observation = null;
        if (payload.Length > settings.MaxMessageBytes)
            return HealthVerdict.Refuse(HealthDlqReasons.TooLarge, $"{payload.Length} bytes > {settings.MaxMessageBytes}");
        JsonNode? node;
        try { node = JsonNode.Parse(payload); }
        catch (JsonException ex) { return HealthVerdict.Refuse(HealthDlqReasons.NotJson, ex.Message); }
        if (node is not JsonObject obj) return HealthVerdict.Refuse(HealthDlqReasons.NotJson, "root is not an object");

        var version = Str(obj, "schema_version");
        if (version != "1.0") return HealthVerdict.Refuse(HealthDlqReasons.UnsupportedVersion, $"schema_version '{version ?? "(missing)"}'");
        var kind = Str(obj, "message_kind");
        if (kind != topic.ExpectedMessageKind)
            return HealthVerdict.Refuse(HealthDlqReasons.KindMismatch, $"message_kind '{kind ?? "(missing)"}' on a {topic.Kind} topic");

        var results = Schemas.Value[kind].Evaluate(obj, Options);
        if (!results.IsValid)
        {
            var errors = results.Details
                .Where(d => d.HasErrors)
                .SelectMany(d => d.Errors!.Select(e => $"{d.InstanceLocation}: {e.Value}"))
                .Take(5);
            return HealthVerdict.Refuse(HealthDlqReasons.SchemaInvalid, string.Join(" | ", errors));
        }

        // Identity: payload == topic captures == configured scope (spec §4.3, "never a client claim").
        if (Str(obj, "tenant_id") != topic.TenantId || Str(obj, "site_id") != topic.SiteId)
            return HealthVerdict.Refuse(HealthDlqReasons.IdentityMismatch, "tenant_id/site_id differ from the topic");
        if (topic.TenantId != settings.TenantId || topic.SiteId != settings.SiteId)
            return HealthVerdict.Refuse(HealthDlqReasons.IdentityMismatch, "topic scope is not this source's tenant/site");
        if (topic.DeviceId is not null && Str(obj, "device_id") != topic.DeviceId)
            return HealthVerdict.Refuse(HealthDlqReasons.IdentityMismatch, "device_id differs from the topic");
        if (topic.SourceId is not null && Str(obj, "source_id") != topic.SourceId)
            return HealthVerdict.Refuse(HealthDlqReasons.IdentityMismatch, "source_id differs from the topic");
        var source = Str(obj, "source_id") ?? "";
        if (settings.AllowedSourceIds.Count > 0 && !settings.AllowedSourceIds.Contains(source))
            return HealthVerdict.Refuse(HealthDlqReasons.SourceNotAllowed, $"source_id '{source}' is not allow-listed for this data source");

        // Transport clock: published_at must be near receipt; observed/verified may be arbitrarily old.
        if (DateTimeOffset.TryParse(Str(obj, "published_at"), null, System.Globalization.DateTimeStyles.AssumeUniversal, out var published))
        {
            var skew = Math.Abs((receivedAt - published).TotalSeconds);
            if (skew > settings.MaxSkewSeconds)
                return HealthVerdict.Refuse(HealthDlqReasons.TimestampSkew, $"published_at is {skew:F0} s from receipt (max {settings.MaxSkewSeconds})");
        }
        observation = obj;
        return HealthVerdict.Accepted;
    }

    public static string? Str(JsonObject o, string name) =>
        o.TryGetPropertyValue(name, out var v) && v is JsonValue jv && jv.TryGetValue<string>(out var s) ? s : null;

    public static long? Long(JsonObject o, string name) =>
        o.TryGetPropertyValue(name, out var v) && v is JsonValue jv && jv.TryGetValue<long>(out var l) ? l : null;

    public static bool? Bool(JsonObject o, string name) =>
        o.TryGetPropertyValue(name, out var v) && v is JsonValue jv && jv.TryGetValue<bool>(out var b) ? b : null;

    /// <summary>
    /// The Kafka record: the observation verbatim plus what only the gateway can know —
    /// received_at, topic, the MQTT retained indication, the AUTHENTICATED producer (the MQTT
    /// identity this data source connected with, never the payload's own claim), and any
    /// ordering flags the dedupe/epoch stage raised.
    /// </summary>
    public static string Wrap(JsonObject observation, HealthTopic topic, string rawTopic, bool mqttRetained,
        string authenticatedProducer, Guid configId, DateTimeOffset receivedAt, IReadOnlyList<string> flags)
    {
        var gateway = new JsonObject
        {
            ["received_at"] = receivedAt.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'"),
            ["topic"] = rawTopic,
            ["kind"] = topic.Kind.ToString().ToUpperInvariant(),
            ["mqtt_retained"] = mqttRetained,
            ["authenticated_producer"] = authenticatedProducer,
            ["config_id"] = configId.ToString(),
            ["flags"] = new JsonArray(flags.Select(f => (JsonNode)JsonValue.Create(f)!).ToArray()),
        };
        var record = new JsonObject { ["gateway"] = gateway, ["observation"] = observation.DeepClone() };
        return record.ToJsonString();
    }
}
