namespace Traverse.BindingResolver.Models;

/// <summary>
/// Resolved binding information for a given path and role(s).
/// </summary>
public record BindingResponse
{
    /// <summary>
    /// The original contextual path.
    /// </summary>
    public required string ContextualPath { get; init; }
    
    /// <summary>
    /// Whether the path was successfully resolved.
    /// </summary>
    public bool Resolved { get; init; }

    /// <summary>
    /// Where this binding came from: "asset-model" (the asset is registered and its
    /// identifiers are authoritative) or "fallback" (derived from the path string
    /// because asset-model returned 404 or was unreachable).
    ///
    /// This distinction is load-bearing. Fallback resolution derives a DIFFERENT
    /// sparkplug device id (crude1_pump101 vs pump101), so a binding can look
    /// resolved while pointing at nothing that publishes. Readiness checks must
    /// treat "fallback" as unresolved rather than trusting <see cref="Resolved"/>.
    /// </summary>
    public string Provenance { get; init; } = "asset-model";
    
    /// <summary>
    /// Error message if resolution failed.
    /// </summary>
    public string? Error { get; init; }
    
    /// <summary>
    /// Live data binding (Sparkplug B + Redis snapshot).
    /// </summary>
    public LiveBinding? Live { get; init; }
    
    /// <summary>
    /// Historical data binding (IoTDB).
    /// </summary>
    public HistoryBinding? History { get; init; }
    
    /// <summary>
    /// Alarm data binding (SignalR + PostgreSQL).
    /// </summary>
    public AlarmBinding? Alarm { get; init; }
}

/// <summary>
/// Binding for live/real-time data via Sparkplug B and Redis.
/// </summary>
public record LiveBinding
{
    /// <summary>
    /// MQTT broker connection info.
    /// </summary>
    public required MqttConnectionInfo Mqtt { get; init; }
    
    /// <summary>
    /// Sparkplug B topic to subscribe to for DDATA messages.
    /// </summary>
    public required string SparkplugTopic { get; init; }
    
    /// <summary>
    /// Sparkplug group identifier.
    /// </summary>
    public required string SparkplugGroup { get; init; }
    
    /// <summary>
    /// Sparkplug edge node identifier.
    /// </summary>
    public required string SparkplugEdgeNode { get; init; }
    
    /// <summary>
    /// Sparkplug device identifier.
    /// </summary>
    public required string SparkplugDevice { get; init; }
    
    /// <summary>
    /// Sparkplug metric name (measurement).
    /// </summary>
    public string? SparkplugMetric { get; init; }
    
    /// <summary>
    /// Redis key for snapshot-on-open (current value).
    /// </summary>
    public string? RedisSnapshotKey { get; init; }
    
    /// <summary>
    /// historian-bff snapshot endpoint for bulk retrieval.
    /// </summary>
    public required string SnapshotEndpoint { get; init; }
}

/// <summary>
/// MQTT broker connection information.
/// </summary>
public record MqttConnectionInfo
{
    public required string Host { get; init; }
    public required int Port { get; init; }
    public required string Protocol { get; init; }  // ws or wss
    public string? Username { get; init; }
}

/// <summary>
/// Binding for historical data via IoTDB.
/// </summary>
public record HistoryBinding
{
    /// <summary>
    /// IoTDB time-series path.
    /// </summary>
    public required string IoTDbPath { get; init; }
    
    /// <summary>
    /// historian-bff endpoint for trend queries.
    /// </summary>
    public required string TrendEndpoint { get; init; }
    
    /// <summary>
    /// historian-bff endpoint for raw data queries.
    /// </summary>
    public required string RawEndpoint { get; init; }
}

/// <summary>
/// Binding for alarm data via SignalR and PostgreSQL.
/// </summary>
public record AlarmBinding
{
    /// <summary>
    /// Alarm source identifier for filtering.
    /// </summary>
    public required string AlarmSource { get; init; }
    
    /// <summary>
    /// SignalR hub URL for real-time alarm updates.
    /// </summary>
    public required string SignalRHub { get; init; }
    
    /// <summary>
    /// SignalR method to call for subscribing to alarm updates.
    /// </summary>
    public required string SubscribeMethod { get; init; }
    
    /// <summary>
    /// Kafka topic for alarm events (for advanced consumers).
    /// </summary>
    public required string KafkaTopic { get; init; }
    
    /// <summary>
    /// AMS API endpoint for alarm queries.
    /// </summary>
    public required string AlarmApiEndpoint { get; init; }
}
