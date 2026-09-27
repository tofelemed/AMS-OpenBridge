// Extraction Phase 4 COPY of AMS.Api BackgroundServices/CplmEventFrameService.cs — mechanical
// transforms only (namespace, local KafkaOptions, local IotDbWriteClient).
// SAME consumer group id as the AMS.Api original: the two processes must
// NEVER consume simultaneously (partition split = silent half-persistence).
// Gated by Cplm:ConsumersEnabled. AMS.Api original deleted in Phase 6.
//
// v2.5 Task 1F.1 (spec v6 R10; NR-029, NR-030): the lifecycle decision moved to
// Services/EventFrameLifecycle (pure, tested). This class only reads the open frame, applies
// the transition and writes it. Missing evidence marks a frame UNOBSERVABLE and never closes
// it; a clear result closes it only with enough qualified support; overlapping windows add
// only their non-overlapping support.
using System.Text.Json;
using Confluent.Kafka;
using Dapper;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Npgsql;
using Traverse.CplmApi.Services;

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
    private readonly ILogger<CplmEventFrameService> _logger;
    private readonly NpgsqlDataSource _dataSource;
    private readonly CplmOptions _options;
    private readonly IConsumer<string, string> _consumer;
    private readonly ConsumerHeartbeat _heartbeat;
    private readonly SingleMemberGuard _guard;
    /// <summary>CHG-033: OPEN + ESCALATE evidence captures allowed per episode (CLOSE always captures).</summary>
    private readonly int _captureMax;
    private static int _schemaEnsured;

    public CplmEventFrameService(
        ILogger<CplmEventFrameService> logger,
        IOptions<Traverse.CplmApi.Infrastructure.KafkaOptions> kafkaOptions,
        IOptions<CplmOptions> cplmOptions,
        ConsumerHeartbeat heartbeat,
        SingleMemberGuard guard,
        IConfiguration config,
        [FromKeyedServices("cplm")] NpgsqlDataSource dataSource)
    {
        _logger = logger;
        _captureMax = Math.Max(0, config.GetValue("Cplm:EpisodeCaptureMax", 3));
        _dataSource = dataSource;
        _options = cplmOptions.Value;
        _heartbeat = heartbeat;
        _guard = guard;
        _consumer = new ConsumerBuilder<string, string>(new ConsumerConfig
        {
            BootstrapServers = kafkaOptions.Value.BootstrapServers,
            GroupId = _options.ConsumerGroupId + "-frames",
            // STR-06: static membership names the intended sole member.
            GroupInstanceId = _options.ConsumerGroupId + "-frames-sole",
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = true,
            EnableAutoOffsetStore = false
        })
        // STR-06: assert this process holds every partition — a split would have it
        // persisting only some event frames, silently.
        .SetPartitionsAssignedHandler((_, parts) => _guard.VerifySoleMembership("frames", parts))
        .Build();
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

    /// <summary>Parses one fused verdict into what the lifecycle needs; null when it is not ours to apply.</summary>
    internal static GateVerdict? ParseVerdict(JsonElement root)
    {
        var loopId = GetString(root, "loop_id") ?? GetString(root, "tagId");
        if (string.IsNullOrWhiteSpace(loopId)) return null;

        // Recomputed history must not rewrite the operational timeline: a replay
        // of last month should not reopen a frame an operator already closed.
        var source = GetString(root, "calculation_source");
        if (!string.IsNullOrWhiteSpace(source) && source != "flink") return null;
        var purpose = GetString(root, "purpose");
        if (!string.IsNullOrWhiteSpace(purpose) && purpose != "LIVE") return null;

        var windowEnd = GetTimestamp(root, "windowEndMs") ?? DateTime.UtcNow;
        var windowStart = GetTimestamp(root, "windowStartMs") ?? windowEnd;
        long spanMs = Math.Max(0, (long)(windowEnd - windowStart).TotalMilliseconds);
        // Qualified support: the engine's figure when present (v2.5), else accepted samples ×
        // period bounded by the window, else the window span (pre-v2.5 payloads).
        long support = GetLong(root, "qualified_support_ms");
        if (support <= 0)
        {
            var samples = GetLong(root, "sample_count");
            var period = GetDouble(root, "sample_period_sec");
            support = samples > 0 && period > 0 ? Math.Min(spanMs, (long)(samples * period * 1000.0)) : spanMs;
        }
        // CHG-033: the fused verdict names every gate's method run; an episode transition captures them.
        IReadOnlyList<Guid>? runIds = null;
        if (root.TryGetProperty("method_run_ids", out var ids) && ids.ValueKind == JsonValueKind.Object)
        {
            var list = new List<Guid>();
            foreach (var kv in ids.EnumerateObject())
                if (kv.Value.ValueKind == JsonValueKind.String && Guid.TryParse(kv.Value.GetString(), out var g) && !list.Contains(g)) list.Add(g);
            runIds = list;
        }
        return new GateVerdict(
            loopId,
            GetString(root, "window_kind") ?? "24h",
            GetString(root, "diagnosis"),
            GetDouble(root, "confidence"),
            GetString(root, "severity"),
            windowStart, windowEnd, support,
            GetDouble(root, "recovery_support_s"),
            (int)Math.Max(1, GetLong(root, "result_revision")),
            GetString(root, "calculation_version") ?? GetString(root, "calculationVersion"),
            GetString(root, "dynamics_profile_version") ?? GetString(root, "dynamicsProfileVersion"),
            runIds);
    }

    private async Task ApplyAsync(string json, CancellationToken ct)
    {
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { return; }
        var v = ParseVerdict(root);
        if (v is null) return;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        // CHG-033: the frame row and its evidence capture land together or not at all.
        await using var tx = await conn.BeginTransactionAsync(ct);
        var open = await ReadOpenAsync(conn, tx, v);
        var t = EventFrameLifecycle.Apply(open.State, v);
        switch (t.Kind)
        {
            case TransitionKind.Ignore:
                return;
            case TransitionKind.Open:
                await CaptureAsync(conn, tx, await InsertAsync(conn, tx, v, t.Frame!), "OPEN", v);
                break;
            case TransitionKind.CloseAndOpen:
                await UpdateAsync(conn, tx, open.Id, t.Closed!);
                await CaptureAsync(conn, tx, open.Id, "CLOSE", v);
                await CaptureAsync(conn, tx, await InsertAsync(conn, tx, v, t.Frame!), "OPEN", v);
                break;
            case TransitionKind.Close:
                await UpdateAsync(conn, tx, open.Id, t.Frame!);
                await CaptureAsync(conn, tx, open.Id, "CLOSE", v);
                break;
            case TransitionKind.Escalate:
                await UpdateAsync(conn, tx, open.Id, t.Frame!);
                await CaptureAsync(conn, tx, open.Id, "ESCALATE", v);
                break;
            default:
                await UpdateAsync(conn, tx, open.Id, t.Frame!);
                break;
        }
        await tx.CommitAsync(ct);
        if (t.Kind is TransitionKind.Close or TransitionKind.CloseAndOpen or TransitionKind.MarkUnobservable or TransitionKind.Escalate)
            _logger.LogInformation("CPLM event frame {Kind} for {LoopId} ({WindowKind}): {Reason}", t.Kind, v.LoopId, v.WindowKind, t.Reason);
    }

    /// <summary>CHG-033: records the verdict's method runs against the frame; a pre-v2.5 payload without them captures nothing.</summary>
    private async Task CaptureAsync(NpgsqlConnection conn, NpgsqlTransaction tx, long frameId, string kind, GateVerdict v)
    {
        if (v.MethodRunIds is null || v.MethodRunIds.Count == 0) return;
        var taken = await EpisodeCaptureStore.CaptureAsync(conn, tx, frameId, kind, v.MethodRunIds, _captureMax);
        if (!taken) _logger.LogDebug("Episode {Id} capture {Kind} skipped: automatic cap {Cap} reached", frameId, kind, _captureMax);
    }

    private static async Task<(long Id, FrameState? State)> ReadOpenAsync(NpgsqlConnection conn, NpgsqlTransaction tx, GateVerdict v)
    {
        var r = await conn.QueryFirstOrDefaultAsync("""
            SELECT id, family, opened_at, closed_at, peak_diagnosis, peak_confidence, last_diagnosis, last_confidence,
                   severity, window_count, availability_state, condition_state, qualified_support_ms, support_until,
                   result_revision, close_reason
            FROM analytics.cplm_event_frames
            WHERE loop_id = @loopId AND window_kind = @windowKind AND closed_at IS NULL
            ORDER BY opened_at DESC LIMIT 1
            """, new { loopId = v.LoopId, windowKind = v.WindowKind }, tx);
        if (r is null) return (0, null);
        return ((long)r.id, new FrameState(
            (string)r.family, (DateTime)r.opened_at, (DateTime?)r.closed_at, (string)r.peak_diagnosis, (double)r.peak_confidence,
            (string?)r.last_diagnosis, (double?)r.last_confidence, (string?)r.severity, (int)r.window_count,
            (string?)r.availability_state ?? "OBSERVED", (string?)r.condition_state ?? "OPEN",
            (long?)r.qualified_support_ms ?? 0, (DateTime?)r.support_until, (int?)r.result_revision ?? 1, (string?)r.close_reason));
    }

    private static Task<long> InsertAsync(NpgsqlConnection conn, NpgsqlTransaction tx, GateVerdict v, FrameState f) => conn.ExecuteScalarAsync<long>("""
        INSERT INTO analytics.cplm_event_frames
            (loop_id, window_kind, family, opened_at, peak_diagnosis, peak_confidence,
             last_diagnosis, last_confidence, severity, window_count,
             availability_state, condition_state, qualified_support_ms, support_until, result_revision,
             calculation_version, dynamics_profile_version)
        VALUES
            (@loopId, @windowKind, @family, @openedAt, @peak, @peakConfidence,
             @last, @lastConfidence, @severity, @windowCount,
             @availability, @condition, @supportMs, @supportUntil, @revision,
             @calcVersion, @profileVersion)
        ON CONFLICT (loop_id, window_kind, family) WHERE closed_at IS NULL
        DO UPDATE SET
            peak_diagnosis = CASE WHEN EXCLUDED.peak_confidence > analytics.cplm_event_frames.peak_confidence
                                  THEN EXCLUDED.peak_diagnosis ELSE analytics.cplm_event_frames.peak_diagnosis END,
            peak_confidence = GREATEST(analytics.cplm_event_frames.peak_confidence, EXCLUDED.peak_confidence),
            last_diagnosis = EXCLUDED.last_diagnosis, last_confidence = EXCLUDED.last_confidence,
            severity = COALESCE(EXCLUDED.severity, analytics.cplm_event_frames.severity),
            availability_state = 'OBSERVED', result_revision = EXCLUDED.result_revision, updated_at = NOW()
        RETURNING id
        """, new
        {
            loopId = v.LoopId, windowKind = v.WindowKind, family = f.Family, openedAt = f.OpenedAt,
            peak = f.PeakDiagnosis, peakConfidence = f.PeakConfidence, last = f.LastDiagnosis, lastConfidence = f.LastConfidence,
            severity = f.Severity, windowCount = f.WindowCount, availability = f.AvailabilityState, condition = f.ConditionState,
            supportMs = f.QualifiedSupportMs, supportUntil = f.SupportUntil, revision = f.ResultRevision,
            calcVersion = v.CalculationVersion, profileVersion = v.DynamicsProfileVersion
        }, tx);

    private static Task<int> UpdateAsync(NpgsqlConnection conn, NpgsqlTransaction tx, long id, FrameState f) => conn.ExecuteAsync("""
        UPDATE analytics.cplm_event_frames
        SET closed_at = @closedAt, peak_diagnosis = @peak, peak_confidence = @peakConfidence,
            last_diagnosis = @last, last_confidence = @lastConfidence, severity = @severity,
            window_count = @windowCount, availability_state = @availability, condition_state = @condition,
            qualified_support_ms = @supportMs, support_until = @supportUntil, result_revision = @revision,
            close_reason = @closeReason, updated_at = NOW()
        WHERE id = @id
        """, new
        {
            id, closedAt = f.ClosedAt, peak = f.PeakDiagnosis, peakConfidence = f.PeakConfidence,
            last = f.LastDiagnosis, lastConfidence = f.LastConfidence, severity = f.Severity, windowCount = f.WindowCount,
            availability = f.AvailabilityState, condition = f.ConditionState, supportMs = f.QualifiedSupportMs,
            supportUntil = f.SupportUntil, revision = f.ResultRevision, closeReason = f.CloseReason
        }, tx);

    /// <summary>Kept for callers that only need the family (CpmEventsController).</summary>
    internal static string FamilyOf(string diagnosis) => EventFrameLifecycle.FamilyOf(diagnosis);

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
                -- v2.5 (1F.1): availability vs condition, support union, revision (53_cplm_v25 parity).
                ALTER TABLE analytics.cplm_event_frames
                    ADD COLUMN IF NOT EXISTS availability_state VARCHAR(16) NOT NULL DEFAULT 'OBSERVED',
                    ADD COLUMN IF NOT EXISTS condition_state VARCHAR(16) NOT NULL DEFAULT 'OPEN',
                    ADD COLUMN IF NOT EXISTS result_revision INT NOT NULL DEFAULT 1,
                    ADD COLUMN IF NOT EXISTS qualified_support_ms BIGINT NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS support_until TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS close_reason VARCHAR(32);
                UPDATE analytics.cplm_event_frames SET condition_state = 'CLOSED'
                    WHERE closed_at IS NOT NULL AND condition_state = 'OPEN';
                CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_event_frames_open
                    ON analytics.cplm_event_frames (loop_id, window_kind, family) WHERE closed_at IS NULL;
                CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_loop_time
                    ON analytics.cplm_event_frames (loop_id, opened_at DESC);
                CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_open
                    ON analytics.cplm_event_frames (closed_at, ack_state) WHERE closed_at IS NULL;
                -- 42_cplm_event_frames_indexes.sql parity: every CPM read is
                -- lower(loop_id) = lower($1), which none of the above can serve —
                -- without these, a service-healed database seq-scans the events
                -- list on every 30s poll (the exact defect the script fixed).
                CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_loop_lower
                    ON analytics.cplm_event_frames (lower(loop_id));
                CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_loop_lower_opened
                    ON analytics.cplm_event_frames (lower(loop_id), opened_at DESC);
                -- CHG-032 (60_cplm_event_shelving.sql parity): the shelf's own lifecycle + action history.
                ALTER TABLE analytics.cplm_event_frames
                    ADD COLUMN IF NOT EXISTS shelf_state   VARCHAR(16) NOT NULL DEFAULT 'NONE',
                    ADD COLUMN IF NOT EXISTS shelved_by    VARCHAR(128),
                    ADD COLUMN IF NOT EXISTS shelved_at    TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS shelve_reason TEXT;
                CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_shelved
                    ON analytics.cplm_event_frames (shelve_until) WHERE shelf_state = 'SHELVED';
                CREATE TABLE IF NOT EXISTS analytics.cplm_event_actions (
                    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    event_id  BIGINT      NOT NULL REFERENCES analytics.cplm_event_frames (id) ON DELETE CASCADE,
                    action    VARCHAR(24) NOT NULL
                              CHECK (action IN ('ACKNOWLEDGED', 'SHELVED', 'SHELVE_UPDATED', 'UNSHELVED', 'SHELVE_EXPIRED')),
                    actor     VARCHAR(128) NOT NULL,
                    at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    until     TIMESTAMPTZ,
                    reason    TEXT);
                CREATE INDEX IF NOT EXISTS idx_cplm_event_actions_event
                    ON analytics.cplm_event_actions (event_id, at DESC);
                -- legacy shelves (ack_state = 'SHELVED') move to the shelf columns, history row included
                INSERT INTO analytics.cplm_event_actions (event_id, action, actor, at, until, reason)
                SELECT id, 'SHELVED', COALESCE(acked_by, 'unknown'), COALESCE(acked_at, updated_at), shelve_until, note
                FROM analytics.cplm_event_frames WHERE ack_state = 'SHELVED';
                UPDATE analytics.cplm_event_frames
                SET shelf_state = CASE WHEN shelve_until IS NOT NULL AND shelve_until > NOW() THEN 'SHELVED' ELSE 'EXPIRED' END,
                    shelved_by = acked_by, shelved_at = acked_at, shelve_reason = note, note = NULL,
                    ack_state = 'UNACKNOWLEDGED', acked_by = NULL, acked_at = NULL, updated_at = NOW()
                WHERE ack_state = 'SHELVED';
                -- CHG-033 (61_cplm_episode_capture.sql parity): captures at episode transitions. The
                -- EPISODE retention row is ops SQL (cpm-10a); the sweeper falls back to 90 days without it.
                ALTER TABLE analytics.cplm_event_frames
                    ADD COLUMN IF NOT EXISTS capture_count INT NOT NULL DEFAULT 0;
                CREATE TABLE IF NOT EXISTS analytics.cplm_episode_capture (
                    episode_id    BIGINT      NOT NULL REFERENCES analytics.cplm_event_frames (id) ON DELETE CASCADE,
                    method_run_id UUID        NOT NULL,
                    kind          VARCHAR(16) NOT NULL CHECK (kind IN ('OPEN', 'ESCALATE', 'CLOSE')),
                    captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (episode_id, method_run_id));
                CREATE INDEX IF NOT EXISTS ix_cplm_episode_capture_run ON analytics.cplm_episode_capture (method_run_id);
                CREATE INDEX IF NOT EXISTS ix_cplm_episode_capture_at  ON analytics.cplm_episode_capture (captured_at);
                """);
            _logger.LogInformation("CPLM event-frame schema ensured");
        }
        catch { Interlocked.Exchange(ref _schemaEnsured, 0); throw; }
    }

    private static string? GetString(JsonElement r, string n) =>
        r.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
    private static double GetDouble(JsonElement r, string n) =>
        r.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetDouble(out var v) ? v : 0.0;
    private static long GetLong(JsonElement r, string n) =>
        r.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt64(out var v) ? v : 0;
    private static DateTime? GetTimestamp(JsonElement r, string n) =>
        r.TryGetProperty(n, out var p) && p.TryGetInt64(out var ms) && ms > 0
            ? DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime : null;
}
