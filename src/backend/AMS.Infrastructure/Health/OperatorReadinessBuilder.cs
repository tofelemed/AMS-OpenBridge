using AMS.Infrastructure.Kafka;

namespace AMS.Infrastructure.Health;

public static class OperatorReadinessBuilder
{
    private static readonly Dictionary<string, (double Weight, string Label)> Weights = new()
    {
        ["kafka"] = (0.25, "Kafka"),
        ["flink"] = (0.25, "Flink"),
        ["ack"] = (0.15, "ACK pipeline"),
        ["database"] = (0.10, "Database"),
        ["uiProjection"] = (0.15, "UI projection"),
        ["contracts"] = (0.10, "Contracts"),
    };

    public static ReadinessHealth Build(
        KafkaHealth kafka,
        FlinkHealth flink,
        PostgresHealth postgres,
        SignalRHealth signalR,
        TelemetryIngestSnapshot telemetry,
        bool labAckSimulatorEnabled = false)
    {
        var ackScore = flink.Status == "Running" ? 85
            : labAckSimulatorEnabled ? 85 : 0;

        var scores = new Dictionary<string, int>
        {
            ["kafka"] = kafka.BrokerHealth == "Healthy" ? 100 : 0,
            ["flink"] = flink.Status == "Running" && flink.RestartCount == 0 ? 100
                : flink.Status == "Running" ? 70 : 0,
            ["ack"] = ackScore,
            ["database"] = postgres.QueryLatencyMs <= 0 ? 50 : postgres.QueryLatencyMs < 200 ? 100 : 70,
            ["uiProjection"] = signalR.Status == "Healthy" ? 100 : signalR.Status == "Idle" ? 75 : 40,
            ["contracts"] = 100,
        };

        var details = new List<ReadinessSubsystemDetail>();
        var blockers = new List<string>();

        foreach (var (id, (weight, label)) in Weights)
        {
            var score = scores[id];
            var status = score >= LiveReadinessScorer.CutoverThreshold ? "OK"
                : score >= 70 ? "WARN" : "FAIL";
            var (detail, hint) = DescribeSubsystem(id, score, kafka, flink, postgres, signalR, telemetry, labAckSimulatorEnabled);
            details.Add(new ReadinessSubsystemDetail(
                id, label, score, (int)Math.Round(weight * 100), status, detail, hint));

            if (status != "OK")
                blockers.Add($"{label}: {detail}");
        }

        double weighted = 0, totalW = 0;
        foreach (var (id, (w, _)) in Weights)
        {
            weighted += w * scores[id];
            totalW += w;
        }

        var overall = totalW > 0 ? (int)Math.Round(weighted / totalW) : 0;
        var gate = overall >= LiveReadinessScorer.CutoverThreshold
            ? "PASS"
            : overall >= 70 ? "WARN" : "FAIL";

        if (overall < LiveReadinessScorer.CutoverThreshold)
            blockers.Insert(0, $"Overall score {overall} is below cutover threshold {LiveReadinessScorer.CutoverThreshold}");

        var recommendation = gate switch
        {
            "PASS" => "READY_FOR_CUTOVER",
            "WARN" => "CONDITIONAL — resolve subsystem gaps before DCS cutover",
            _ => "NOT_READY — subsystem scores below threshold",
        };

        return new ReadinessHealth(
            overall,
            LiveReadinessScorer.CutoverThreshold,
            recommendation,
            gate,
            scores,
            blockers.Distinct().ToList(),
            details,
            null,
            null);
    }

    private static (string Detail, string? Hint) DescribeSubsystem(
        string id,
        int score,
        KafkaHealth kafka,
        FlinkHealth flink,
        PostgresHealth postgres,
        SignalRHealth signalR,
        TelemetryIngestSnapshot telemetry,
        bool labAckSimulatorEnabled)
    {
        return id switch
        {
            "kafka" => (
                $"Broker {kafka.BrokerHealth}, lag {kafka.Lag}",
                kafka.BrokerHealth != "Healthy" ? "Check ams-kafka container and port 9092" : null),
            "flink" => (
                $"{flink.Status}, restarts={flink.RestartCount}, checkpoint={flink.CheckpointLatencyMs}ms, "
                + $"traverse.alarm.raw-alarms={flink.RawAlarmsProcessed}, in={flink.RecordsReceived}, out={flink.RecordsSent}, "
                + $"traverse.alarm.operator-actions={flink.OperatorActionsProcessed}, traverse.alarm.ack-results={flink.AckResultsProcessed}",
                flink.RestartCount > 0 ? "Inspect Flink UI :8082 for failed tasks" :
                flink.Status != "Running" ? "Submit OpcEventStreamJob via stabilize-ams-e2e.ps1" : null),
            "ack" => (
                flink.Status == "Running" ? "ACK orchestration via Flink → HTTP writeback API"
                    : "ACK path unavailable — submit Flink job",
                flink.Status != "Running" ? "Run scripts/start-ams-production.ps1 -ForceResubmit" : null),
            "database" => (
                $"Query latency {postgres.QueryLatencyMs:F1}ms, pool connections {postgres.ConnectionPoolUsage}",
                postgres.QueryLatencyMs > 200 ? "Check Postgres load and connection pool" : null),
            "uiProjection" => (
                $"SignalR {signalR.Status}, clients={signalR.ConnectedClients}",
                signalR.Status == "Idle" ? "Expected before operators connect — not a failure" : null),
            "contracts" => ("Static CI/E2E contracts assumed PASS at runtime", null),
            _ => ($"Score {score}", null),
        };
    }
}
