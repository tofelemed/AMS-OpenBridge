namespace AMS.Domain.Connectivity;

/// <summary>
/// OT connectivity endpoint managed by AMS and provisioned in Apache StreamPipes.
/// </summary>
public sealed class OpcConnection
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Protocol { get; set; } = "OPC-UA";
    public string Endpoint { get; set; } = string.Empty;
    public string? Username { get; set; }
    public byte[]? PasswordEncrypted { get; set; }
    public bool Enabled { get; set; } = true;
    public string Status { get; set; } = "Disconnected";
    public DateTimeOffset? LastConnectedUtc { get; set; }
    public string? LastError { get; set; }
    public string? StreamPipesAdapterId { get; set; }
    public string? StreamPipesPipelineId { get; set; }
    public string? StreamPipesAckPipelineId { get; set; }
    public string? AuthType { get; set; } = "Anonymous";
    public string PipelineStatus { get; set; } = "Stopped";
    public double EventsPerSec { get; set; }
    public DateTimeOffset? LastEventUtc { get; set; }
    public DateTimeOffset CreatedUtc { get; set; }
    public DateTimeOffset UpdatedUtc { get; set; }
}

public static class OpcConnectionProtocols
{
    public const string OpcUa = "OPC-UA";
    public const string HttpJson = "HTTP-JSON";
    /// <summary>Legacy COM/DCOM — not ingestible via StreamPipes. Migrate to OPC-UA-AC.</summary>
    public const string OpcAe = "OPC-AE";
    public const string Mqtt = "MQTT";
    public const string ModbusTcp = "Modbus TCP";

    /// <summary>Production target: OPC UA Alarms &amp; Conditions (Linux/K8s/cloud-native).</summary>
    public const string OpcUaAc = "OPC-UA-AC";

    /// <summary>Protocols StreamPipes can provision for telemetry ingest.</summary>
    public static readonly string[] IngestSupported = [OpcUa, OpcUaAc];

    /// <summary>All protocols accepted by the API (includes legacy read-only).</summary>
    public static readonly string[] Supported = [OpcUa, OpcUaAc, HttpJson, OpcAe, Mqtt, ModbusTcp];

    public const string OpcAeDeprecatedMessage =
        "OPC-AE (COM/DCOM) cannot be ingested by StreamPipes. " +
        "Migrate the plant source to OPC UA Alarms & Conditions (OPC-UA-AC). " +
        "IntegrationObjects.OPCAEServer.Simulator.1 and similar COM servers require a UA bridge or DCS upgrade.";
}

public static class OpcConnectionAuthTypes
{
    public const string Anonymous = "Anonymous";
    public const string UsernamePassword = "Username/Password";
    public const string Certificate = "Certificate";
}

public static class OpcConnectionPipelineStatus
{
    public const string Running = "Running";
    public const string Stopped = "Stopped";
    public const string Error = "Error";
    public const string Reconnecting = "Reconnecting";
}

public static class OpcConnectionStatus
{
    public const string Connected = "Connected";
    public const string Disconnected = "Disconnected";
    public const string Connecting = "Connecting";
    public const string Error = "Error";
}
