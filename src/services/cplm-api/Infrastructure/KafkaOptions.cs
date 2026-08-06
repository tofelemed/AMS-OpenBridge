namespace Traverse.CplmApi.Infrastructure;

/// <summary>
/// Stand-in for AMS.Infrastructure.Kafka.KafkaOptions (extraction plan 2.3):
/// the CPLM consumers read exactly ONE property from that class —
/// BootstrapServers — so this replaces a project reference on the AMS backend.
/// Bound to the "Kafka" section for config-key parity with AMS.Api.
/// </summary>
public sealed class KafkaOptions
{
    public string BootstrapServers { get; set; } = "kafka:9092";
}
