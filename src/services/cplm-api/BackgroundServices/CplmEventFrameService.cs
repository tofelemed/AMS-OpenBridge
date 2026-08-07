// Extraction Phase 4 COPY of AMS.Api BackgroundServices/CplmEventFrameService.cs — mechanical
// transforms only (namespace, local KafkaOptions, local IotDbWriteClient).
// SAME consumer group id as the AMS.Api original: the two processes must
// NEVER consume simultaneously (partition split = silent half-persistence).
// Gated by Cplm:ConsumersEnabled. AMS.Api original deleted in Phase 6.
using System.Text.Json;
using Confluent.Kafka;
using Dapper;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Traverse.CplmApi.BackgroundServices;

/// <summary>
/// CPLM Phase 5 (A12) — turns the stream of per-window gate verdicts into
/// durable event frames: "loop X had a stiction diagnosis from Tuesday 14:00
/// until Thursday 09:15".
///
/// Frames are keyed on the fault FAMILY, not the banded verdict, because
/// DETECTED -> SUSPECTED -> CONFIRMED of the same family is one episode whose
/// confidence grew, not three events. An operator wants one row that says "this
/// got worse", not three rows to correlate by hand.
///
/// Why CPLM owns this store (decision A-A): the Traverse alarm path hard-deletes
/// the row when a condition clears, so a diagnosis that opened and later closed
/// would leave no record whatsoever — which is precisely the history an event
/// frame exists to preserve.
/// </summary>
public sealed class CplmEventFrameService : BackgroundService
{
    /// <summary>
    /// Diagnoses that do not represent a fault episode. INSUFFICIENT_EVIDENCE and
    /// the EXCLUDED_* family mean "we could not judge", which must not open a
    /// frame — an unjudgeable loop is a readiness problem, not an event.
    /// </summary>
    private static bool IsFault(string? diagnosis) =>
        !string.IsNullOrWhiteSpace(diagnosis)
        && !diagnosis.StartsWith("EXCLUDED", StringComparison.Ordinal)
        && diagnosis is not ("INSUFFICIENT_DATA" or "INSUFFICIENT_EVIDENCE" or "NO_CALL");

    private readonly ILogger<CplmEventFrameService> _logger;
    private readonly NpgsqlDataSource _dataSource;
    private readonly CplmOptions _options;
    private readonly IConsumer<string, string> _consumer;
    private readonly Traverse.CplmApi.Services.ConsumerHeartbeat _heartbeat;
    private static int _schemaEnsured;

    public CplmEventFrameService(
        ILogger<CplmEventFrameService> logger,
        IOptions<Traverse.CplmApi.Infrastructure.KafkaOptions> kafkaOptions,
        IOptions<CplmOptions> cplmOptions,
        Traverse.CplmApi.Services.ConsumerHeartbeat heartbeat,
        [FromKeyedServices("cplm")] NpgsqlDataSource dataSource)
    {
        _logger = logger;
        _dataSource = dataSource;
        _options = cplmOptions.Value;
        _heartbeat = heartbeat;
        _consumer = new ConsumerBuilder<string, string>(new ConsumerConfig
        {
            BootstrapServers = kafkaOptions.Value.BootstrapServers,
            GroupId = _options.ConsumerGroupId + "-frames",
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = true,
            EnableAutoOffsetStore = false
        }).Build();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        while (!stoppingToken.IsCancellationRequested)
        {
            _heartbeat.Report("frames", "ENSURING_SCHEMA"); // P3-11
            try { await EnsureSchemaAsync(stoppingToken); break; }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Event-frame schema not ensured yet; retrying in 10s");
                try { await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken); }
                catch (OperationCanceledException) { return; }
            }
        }
        if (stoppingToken.IsCancellationRequested) return;

        _consumer.Subscribe(_options.GateResultsTopic);
        _logger.LogInformation("CplmEventFrameService subscribed to {Topic}", _options.GateResultsTopic);

        while (!stoppingToken.IsCancellationRequested)
        {
            _heartbeat.Report("frames", "CONSUMING"); // P3-11: beats even when idle (500 ms poll)
            ConsumeResult<string, string>? result = null;
            try
            {
                result = _consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (result is null) continue;
                if (!string.IsNullOrWhiteSpace(result.Message.Value))
                    await ApplyAsync(result.Message.Value, stoppingToken);
                _consumer.StoreOffset(result);
            }
            catch (ConsumeException ex) { _logger.LogError(ex, "Kafka consume error in CplmEventFrameService"); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error applying gate result to event frames; offset not stored");
                await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
            }
        }
        _consumer.Close();
    }

    private async Task ApplyAsync(string json, CancellationToken ct)
    {
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { return; }

        var loopId = GetString(root, "loop_id") ?? GetString(root, "tagId");
        if (string.IsNullOrWhiteSpace(loopId)) return;

        // Recomputed history must not rewrite the operational timeline: a replay
        // of last month should not reopen a frame an operator already closed.
        var source = GetString(root, "calculation_source");
        if (!string.IsNullOrWhiteSpace(source) && source != "flink") return;

        var windowKind = GetString(root, "window_kind") ?? "24h";
        var diagnosis = GetString(root, "diagnosis");
        var confidence = GetDouble(root, "confidence");
        var windowEnd = GetTimestamp(root, "windowEndMs") ?? DateTime.UtcNow;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        if (!IsFault(diagnosis))
        {
            // Close any open frame for this loop/resolution — the fault stopped
            // being reported. Closure is the event; the row stays forever.
            var closed = await conn.ExecuteAsync("""
                UPDATE analytics.cplm_event_frames
                SET closed_at = @windowEnd, last_diagnosis = @diagnosis,
                    last_confidence = @confidence, updated_at = NOW()
                WHERE loop_id = @loopId AND window_kind = @windowKind AND closed_at IS NULL
                """, new { loopId, windowKind, windowEnd, diagnosis, confidence });
            if (closed > 0)
                _logger.LogInformation("Closed {Count} CPLM event frame(s) for {LoopId} ({WindowKind})",
                    closed, loopId, windowKind);
            return;
        }

        var family = FamilyOf(diagnosis!);

        // A different family means the previous episode ended and a new one began.
        await conn.ExecuteAsync("""
            UPDATE analytics.cplm_event_frames
            SET closed_at = @windowEnd, updated_at = NOW()
            WHERE loop_id = @loopId AND window_kind = @windowKind
              AND closed_at IS NULL AND family <> @family
            """, new { loopId, windowKind, family, windowEnd });

        // Open or extend. peak_* only ever ratchets upward: an episode that
        // reached CONFIRMED stays reported as having reached CONFIRMED even if
        // later windows soften.
        await conn.ExecuteAsync("""
            INSERT INTO analytics.cplm_event_frames
                (loop_id, window_kind, family, opened_at, peak_diagnosis, peak_confidence,
                 last_diagnosis, last_confidence, severity, window_count,
                 calculation_version, dynamics_profile_version)
            VALUES
                (@loopId, @windowKind, @family, @windowEnd, @diagnosis, @confidence,
                 @diagnosis, @confidence, @severity, 1, @calcVersion, @profileVersion)
            ON CONFLICT (loop_id, window_kind, family) WHERE closed_at IS NULL
            DO UPDATE SET
                peak_diagnosis = CASE WHEN EXCLUDED.peak_confidence > analytics.cplm_event_frames.peak_confidence
                                      THEN EXCLUDED.peak_diagnosis ELSE analytics.cplm_event_frames.peak_diagnosis END,
                peak_confidence = GREATEST(analytics.cplm_event_frames.peak_confidence, EXCLUDED.peak_confidence),
                last_diagnosis = EXCLUDED.last_diagnosis,
                last_confidence = EXCLUDED.last_confidence,
                severity = COALESCE(EXCLUDED.severity, analytics.cplm_event_frames.severity),
                window_count = analytics.cplm_event_frames.window_count + 1,
                calculation_version = COALESCE(EXCLUDED.calculation_version, analytics.cplm_event_frames.calculation_version),
                updated_at = NOW()
            """,
            new
            {
                loopId, windowKind, family, windowEnd, diagnosis, confidence,
                severity = GetString(root, "severity"),
                calcVersion = GetString(root, "calculation_version") ?? GetString(root, "calculationVersion"),
                profileVersion = GetString(root, "dynamics_profile_version") ?? GetString(root, "dynamicsProfileVersion")
            });
    }

    /// <summary>
    /// Strips the DETECTED_/SUSPECTED_/CONFIRMED_ band prefix, leaving the fault
    /// family that identifies the episode.
    /// </summary>
    internal static string FamilyOf(string diagnosis)
    {
        foreach (var band in new[] { "CONFIRMED_", "SUSPECTED_", "DETECTED_", "CLASSIFIED_" })
            if (diagnosis.StartsWith(band, StringComparison.Ordinal))
                return diagnosis[band.Length..];
        return diagnosis;
    }

    private async Task EnsureSchemaAsync(CancellationToken ct)
    {
        if (Interlocked.CompareExchange(ref _schemaEnsured, 1, 0) != 0) return;
        try
        {
            await using var conn = await _dataSource.OpenConnectionAsync(ct);
            await conn.ExecuteAsync("""
                CREATE SCHEMA IF NOT EXISTS analytics;
                CREATE TABLE IF NOT EXISTS analytics.cplm_event_frames (
                    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    loop_id VARCHAR(256) NOT NULL,
                    window_kind VARCHAR(16) NOT NULL,
                    family VARCHAR(64) NOT NULL,
                    opened_at TIMESTAMPTZ NOT NULL,
                    closed_at TIMESTAMPTZ,
                    peak_diagnosis VARCHAR(128) NOT NULL,
                    peak_confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
                    last_diagnosis VARCHAR(128),
                    last_confidence DOUBLE PRECISION,
                    severity VARCHAR(32),
                    window_count INT NOT NULL DEFAULT 1,
                    ack_state VARCHAR(24) NOT NULL DEFAULT 'UNACKNOWLEDGED',
                    acked_by VARCHAR(128),
                    acked_at TIMESTAMPTZ,
                    shelve_until TIMESTAMPTZ,
                    note TEXT,
                    calculation_version VARCHAR(32),
                    dynamics_profile_version VARCHAR(32),
                    mirrored_alarm_id VARCHAR(128),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
                CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_event_frames_open
                    ON analytics.cplm_event_frames (loop_id, window_kind, family) WHERE closed_at IS NULL;
                CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_loop_time
                    ON analytics.cplm_event_frames (loop_id, opened_at DESC);
                CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_open
                    ON analytics.cplm_event_frames (closed_at, ack_state) WHERE closed_at IS NULL;
                """);
            _logger.LogInformation("CPLM event-frame schema ensured");
        }
        catch { Interlocked.Exchange(ref _schemaEnsured, 0); throw; }
    }

    private static string? GetString(JsonElement r, string n) =>
        r.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
    private static double GetDouble(JsonElement r, string n) =>
        r.TryGetProperty(n, out var p) && p.TryGetDouble(out var v) ? v : 0.0;
    private static DateTime? GetTimestamp(JsonElement r, string n) =>
        r.TryGetProperty(n, out var p) && p.TryGetInt64(out var ms) && ms > 0
            ? DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime : null;
}
