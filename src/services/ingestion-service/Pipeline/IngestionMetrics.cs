using Prometheus;

namespace Traverse.IngestionService.Pipeline;

/// <summary>
/// Prometheus counters for the OT subscriber pipeline. Labels carry the data-source
/// NAME (bounded cardinality) — never individual loop tags; per-loop truth lives in
/// Kafka/IoTDB, per-reason truth in the reason label and the unknown_sources table.
/// </summary>
public static class IngestionMetrics
{
    private static readonly Counter Received = Metrics.CreateCounter(
        "ingestion_mqtt_messages_received_total", "OT MQTT messages received", "source");
    private static readonly Counter DeadLettered = Metrics.CreateCounter(
        "ingestion_ot_deadletter_total", "Messages sent to the OT DLQ", "source", "reason");
    private static readonly Counter Parked = Metrics.CreateCounter(
        "ingestion_ot_parked_total", "Messages parked in the unknown-source inventory", "source", "reason");
    private static readonly Counter Tuples = Metrics.CreateCounter(
        "ingestion_loop_tuples_emitted_total", "Merged loop tuples published", "source");
    private static readonly Counter KafkaFailures = Metrics.CreateCounter(
        "ingestion_kafka_publish_failures_total", "Kafka publish failures (retried)", "source");
    private static readonly Counter Reconnects = Metrics.CreateCounter(
        "ingestion_mqtt_reconnects_total", "MQTT reconnect events", "source");
    private static readonly Counter ClassMismatch = Metrics.CreateCounter(
        "ingestion_class_mismatch_total", "Topic class vs payload line/process_unit disagreements (warn-only)", "source");
    private static readonly Counter UnitMismatch = Metrics.CreateCounter(
        "ingestion_unit_mismatch_total", "Source engineering-unit disagreements (warn-only)", "source");
    private static readonly Counter ModeUnrecognised_ = Metrics.CreateCounter(
        "ingestion_mode_unrecognised_total",
        "MODE values the CPLM engine cannot classify (loop will be excluded on G1)", "source");
    private static readonly Counter TicksSkipped_ = Metrics.CreateCounter(
        "ingestion_loop_ticks_skipped_total",
        "Grid ticks that produced no tuple because no source timestamp advanced", "source");
    private static readonly Gauge LoopsByState = Metrics.CreateGauge(
        "ingestion_loops_by_state",
        "Registered loops by ingestion state (flowing/idle/held/silent)", "source", "state");
    private static readonly Gauge LoopsMissingRole = Metrics.CreateGauge(
        "ingestion_loops_missing_role",
        "Loops that can never emit because this required signal has never been received",
        "source", "role");
    private static readonly Gauge ActiveLoops = Metrics.CreateGauge(
        "ingestion_joiner_active_loops", "Loops currently held in joiner state", "source");
    private static readonly Histogram SourceLatencyMs = Metrics.CreateHistogram(
        "ingestion_source_latency_ms", "Source timestamp → ingestion latency (ms)",
        new HistogramConfiguration
        {
            Buckets = Histogram.ExponentialBuckets(50, 2, 12), // 50 ms … ~102 s
        });

    public static void MessagesReceived(string source) => Received.WithLabels(source).Inc();
    public static void MessagesDeadLettered(string source, string reason) => DeadLettered.WithLabels(source, reason).Inc();
    public static void MessagesParked(string source, string reason) => Parked.WithLabels(source, reason).Inc();
    public static void TuplesEmitted(string source, double count = 1) => Tuples.WithLabels(source).Inc(count);
    public static void KafkaPublishFailure(string source) => KafkaFailures.WithLabels(source).Inc();
    public static void MqttReconnect(string source) => Reconnects.WithLabels(source).Inc();
    public static void ClassMismatchWarning(string source) => ClassMismatch.WithLabels(source).Inc();
    public static void UnitMismatchWarning(string source) => UnitMismatch.WithLabels(source).Inc();
    public static void ModeUnrecognised(string source) => ModeUnrecognised_.WithLabels(source).Inc();
    public static void TicksSkipped(string source, double count) { if (count > 0) TicksSkipped_.WithLabels(source).Inc(count); }
    public static void JoinerActiveLoops(string source, int count) => ActiveLoops.WithLabels(source).Set(count);

    /// <summary>Publish the fleet roll-up. Alert on `held` climbing: it means the OT
    /// side stopped publishing a required signal and those loops are silently lost.</summary>
    public static void LoopHealth(string source, LoopHealthSummary summary)
    {
        LoopsByState.WithLabels(source, LoopHealthState.Flowing).Set(summary.Flowing);
        LoopsByState.WithLabels(source, LoopHealthState.Idle).Set(summary.Idle);
        LoopsByState.WithLabels(source, LoopHealthState.Held).Set(summary.Held);
        LoopsByState.WithLabels(source, LoopHealthState.Silent).Set(summary.Silent);
        foreach (var (role, count) in summary.MissingByRole)
            LoopsMissingRole.WithLabels(source, role).Set(count);
    }
    public static void SourceLatency(double ms) { if (ms >= 0) SourceLatencyMs.Observe(ms); }
}
