using AMS.Infrastructure.Kafka;

namespace AMS.Infrastructure.Health;

/// <summary>
/// Live readiness score from runtime probes (verification truth plane → UI).
/// Static CI/E2E checks are assumed PASS when the API is running.
/// </summary>
public static class LiveReadinessScorer
{
    public const int CutoverThreshold = 85;

    public static ReadinessHealth Compute(
        KafkaHealth kafka,
        FlinkHealth flink,
        PostgresHealth postgres,
        SignalRHealth signalR,
        TelemetryIngestSnapshot telemetry)
        => OperatorReadinessBuilder.Build(kafka, flink, postgres, signalR, telemetry);
}

public sealed record ReadinessHealth(
    int OverallScore,
    int CutoverThreshold,
    string Recommendation,
    string GateStatus,
    IReadOnlyDictionary<string, int> Subsystems,
    IReadOnlyList<string> Blockers,
    IReadOnlyList<ReadinessSubsystemDetail> SubsystemDetails,
    ReadinessChangeSummary? Change,
    IReadOnlyList<ReadinessTimelinePoint>? Timeline);
