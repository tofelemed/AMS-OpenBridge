using System.Text.Json;
using System.Text.Json.Serialization;

namespace Traverse.IngestionService.Models;

/// <summary>
/// The profile_config.mqtt contract (spec §3). Property names are snake_case on the
/// wire and in the stored JSONB — this shape is shared with the phase-2 subscriber,
/// so it must not drift.
/// </summary>
public sealed class MqttTlsConfig
{
    /// <summary>CA certificate inline as PEM text. Preferred — portable, no file mounts.</summary>
    [JsonPropertyName("ca_cert_pem")] public string? CaCertPem { get; set; }
    /// <summary>Path to a CA file on the server running the subscriber AND the tester.</summary>
    [JsonPropertyName("ca_cert_path")] public string? CaCertPath { get; set; }
    /// <summary>Overrides the hostname checked against the certificate's SANs.</summary>
    [JsonPropertyName("servername")] public string? Servername { get; set; }
}

public sealed class MqttConfig
{
    [JsonPropertyName("topics")] public List<string> Topics { get; set; } = new();
    [JsonPropertyName("qos")] public int? Qos { get; set; }
    /// <summary>Blank = derived as ingestion-&lt;config_id&gt;. Must be stable and unique per broker.</summary>
    [JsonPropertyName("client_id")] public string? ClientId { get; set; }
    [JsonPropertyName("clean_session")] public bool? CleanSession { get; set; }
    /// <summary>MQTT 5 defaults this to 0, which discards the offline queue — keep well above the longest restart.</summary>
    [JsonPropertyName("session_expiry_seconds")] public int? SessionExpirySeconds { get; set; }
    [JsonPropertyName("keepalive_seconds")] public int? KeepaliveSeconds { get; set; }
    [JsonPropertyName("tls")] public MqttTlsConfig? Tls { get; set; }
}

public sealed class ProfileConfig
{
    [JsonPropertyName("mqtt")] public MqttConfig? Mqtt { get; set; }

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public string ToJson() => JsonSerializer.Serialize(this, JsonOpts);

    /// <summary>Defensive parse (spec §5 rule 2): tolerate null/empty/malformed stored JSON.</summary>
    public static ProfileConfig FromJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new ProfileConfig();
        try { return JsonSerializer.Deserialize<ProfileConfig>(json, JsonOpts) ?? new ProfileConfig(); }
        catch (JsonException) { return new ProfileConfig(); }
    }
}

/// <summary>ingestion.data_source_configs row (Dapper, MatchNamesWithUnderscores).</summary>
public sealed class DataSourceRow
{
    public Guid ConfigId { get; set; }
    public string SourceType { get; set; } = "MQTT";
    public string? ProfileType { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string ConnectionUrl { get; set; } = "";
    public string Username { get; set; } = "";
    public string PasswordEncrypted { get; set; } = "";
    public int TimeoutSeconds { get; set; } = 30;
    public bool InsecureSkipVerify { get; set; }
    public string? ProfileConfig { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? LastConnectionTest { get; set; }
    public string? LastConnectionStatus { get; set; }
    public string? LastConnectionError { get; set; }
    public DateTime? LastDataReceived { get; set; }
    public DateTime CreatedAt { get; set; }
    public string CreatedBy { get; set; } = "";
    public DateTime UpdatedAt { get; set; }
    public string? UpdatedBy { get; set; }
    public int Version { get; set; }
}

/// <summary>
/// Outbound DTO. INVARIANT: the encrypted password never leaves the service in any
/// form — callers see only hasPassword.
/// </summary>
public sealed record DataSourceDto(
    Guid ConfigId,
    string SourceType,
    string? ProfileType,
    string Name,
    string? Description,
    string ConnectionUrl,
    string Username,
    bool HasPassword,
    int TimeoutSeconds,
    bool InsecureSkipVerify,
    ProfileConfig ProfileConfig,
    bool IsActive,
    DateTime? LastConnectionTest,
    string? LastConnectionStatus,
    string? LastConnectionError,
    DateTime? LastDataReceived,
    string EffectiveClientId,
    DateTime CreatedAt,
    string CreatedBy,
    DateTime UpdatedAt,
    string? UpdatedBy,
    int Version)
{
    /// <summary>
    /// The stable subscriber client id (spec INVARIANT: the broker keys its offline
    /// queue on it). Derived in exactly one place so the UI and the phase-2
    /// subscriber can never disagree.
    /// </summary>
    public static string DeriveClientId(Guid configId, MqttConfig? mqtt) =>
        string.IsNullOrWhiteSpace(mqtt?.ClientId) ? $"ingestion-{configId}" : mqtt!.ClientId!.Trim();

    public static DataSourceDto From(DataSourceRow row)
    {
        var profile = Models.ProfileConfig.FromJson(row.ProfileConfig);
        return new DataSourceDto(
            row.ConfigId, row.SourceType, row.ProfileType, row.Name, row.Description,
            row.ConnectionUrl, row.Username,
            HasPassword: !string.IsNullOrEmpty(row.PasswordEncrypted),
            row.TimeoutSeconds, row.InsecureSkipVerify,
            profile, row.IsActive,
            row.LastConnectionTest, row.LastConnectionStatus, row.LastConnectionError,
            row.LastDataReceived,
            EffectiveClientId: DeriveClientId(row.ConfigId, profile.Mqtt),
            row.CreatedAt, row.CreatedBy, row.UpdatedAt, row.UpdatedBy, row.Version);
    }
}

public sealed class CreateDataSourceRequest
{
    public string? SourceType { get; set; }
    public string? ProfileType { get; set; }
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string? ConnectionUrl { get; set; }
    public string? Username { get; set; }
    public string? Password { get; set; }
    public int? TimeoutSeconds { get; set; }
    public bool? InsecureSkipVerify { get; set; }
    public ProfileConfig? ProfileConfig { get; set; }
}

/// <summary>
/// Partial update: null = leave the column untouched. Password additionally treats
/// "" as "keep the stored password" (spec §5 rule 1 — the edit form sends "" when
/// the field is untouched).
/// </summary>
public sealed class UpdateDataSourceRequest
{
    public string? ProfileType { get; set; }
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string? ConnectionUrl { get; set; }
    public string? Username { get; set; }
    public string? Password { get; set; }
    public int? TimeoutSeconds { get; set; }
    public bool? InsecureSkipVerify { get; set; }
    public ProfileConfig? ProfileConfig { get; set; }
}

public sealed record ConnectionTestResult(bool Ok, string? Error, long LatencyMs);

/// <summary>
/// A registered data-source profile — "what this configuration is for". In phase 2
/// a profile binds the payload parser + the destination Kafka topic (spec §8.2);
/// in phase 1 Module/Destination/DefaultTopics drive the wizard's module picker
/// and topic pre-fill so each module's stream is configured as its own source.
/// </summary>
public sealed record ProfileInfo(
    string ProfileType,
    string DisplayName,
    string Module,
    string Transport,
    string Description,
    string Destination,
    string[] DefaultTopics);
