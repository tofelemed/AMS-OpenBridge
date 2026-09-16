using System.Text.Json;

namespace Traverse.CplmApi.Services;

/// <summary>One condition record as stored in analytics.condition_event (v2.5 Task 1D.5).</summary>
public sealed record ConditionRow(
    string LoopId, string Gate, string Kind, string State,
    long StartMs, long LastMs, long? EndMs, double DurationS, string CloseReason,
    string Evidence, long EmittedAtMs, string? SourceCommit, string? JarSha256);

/// <summary>
/// The pure parts of the condition-event consumer: parsing the Flink record, the
/// idempotent upsert and the terminal-state rule. Kafka is at-least-once and may reorder a
/// redelivery after a CLOSED, so a stored CLOSED row is never regressed by an OPEN/UPDATE.
/// </summary>
public static class ConditionEventStore
{
    public static ConditionRow? Parse(string json)
    {
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { return null; }
        if (root.ValueKind != JsonValueKind.Object) return null;
        if (Str(root, "eventType") != "CPLM_CONDITION") return null;
        var loopId = Str(root, "loop_id");
        var gate = Str(root, "gate");
        var kind = Str(root, "kind");
        var state = Str(root, "state");
        if (string.IsNullOrWhiteSpace(loopId) || string.IsNullOrWhiteSpace(gate)
            || string.IsNullOrWhiteSpace(kind) || string.IsNullOrWhiteSpace(state)) return null;
        if (!root.TryGetProperty("start_ms", out var startEl) || !startEl.TryGetInt64(out var startMs)) return null;

        long? endMs = root.TryGetProperty("end_ms", out var endEl) && endEl.ValueKind == JsonValueKind.Number && endEl.TryGetInt64(out var e) ? e : null;
        var evidence = root.TryGetProperty("evidence", out var ev) && ev.ValueKind == JsonValueKind.Object ? ev.GetRawText() : "{}";
        return new ConditionRow(
            loopId!, gate!, kind!, state!,
            startMs,
            Long(root, "last_ms") ?? startMs,
            endMs,
            Dbl(root, "duration_s") ?? 0.0,
            Str(root, "close_reason") ?? "",
            evidence,
            Long(root, "emitted_at_ms") ?? 0L,
            Str(root, "sourceCommit"),
            Str(root, "jarSha256"));
    }

    /// <summary>Only a CLOSED incoming record may touch a stored CLOSED row (idempotent redelivery).</summary>
    public static bool ShouldApply(string? existingState, string incomingState) =>
        existingState != "CLOSED" || incomingState == "CLOSED";

    public const string EnsureSchemaSql = """
        CREATE SCHEMA IF NOT EXISTS analytics;
        CREATE TABLE IF NOT EXISTS analytics.condition_event (
            loop_id        VARCHAR(256) NOT NULL,
            gate           VARCHAR(8)   NOT NULL,
            kind           VARCHAR(32)  NOT NULL,
            start_ms       BIGINT       NOT NULL,
            last_ms        BIGINT       NOT NULL,
            end_ms         BIGINT,
            state          VARCHAR(16)  NOT NULL,
            close_reason   VARCHAR(32)  NOT NULL DEFAULT '',
            duration_s     DOUBLE PRECISION NOT NULL DEFAULT 0,
            evidence       JSONB        NOT NULL DEFAULT '{}'::jsonb,
            emitted_at_ms  BIGINT,
            source_commit  VARCHAR(64),
            jar_sha256     VARCHAR(64),
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (loop_id, gate, kind, start_ms));
        CREATE INDEX IF NOT EXISTS idx_condition_event_loop_lower_start
            ON analytics.condition_event (lower(loop_id), start_ms DESC);
        CREATE INDEX IF NOT EXISTS idx_condition_event_open
            ON analytics.condition_event (state) WHERE state <> 'CLOSED';
        """;

    /// <summary>Idempotent upsert keyed on the condition identity; the SQL twin of <see cref="ShouldApply"/>.</summary>
    public const string UpsertSql = """
        INSERT INTO analytics.condition_event
            (loop_id, gate, kind, start_ms, last_ms, end_ms, state, close_reason, duration_s,
             evidence, emitted_at_ms, source_commit, jar_sha256)
        VALUES
            (@LoopId, @Gate, @Kind, @StartMs, @LastMs, @EndMs, @State, @CloseReason, @DurationS,
             @Evidence::jsonb, @EmittedAtMs, @SourceCommit, @JarSha256)
        ON CONFLICT (loop_id, gate, kind, start_ms) DO UPDATE SET
            last_ms       = GREATEST(analytics.condition_event.last_ms, EXCLUDED.last_ms),
            end_ms        = COALESCE(EXCLUDED.end_ms, analytics.condition_event.end_ms),
            state         = EXCLUDED.state,
            close_reason  = CASE WHEN EXCLUDED.state = 'CLOSED' THEN EXCLUDED.close_reason ELSE analytics.condition_event.close_reason END,
            duration_s    = GREATEST(analytics.condition_event.duration_s, EXCLUDED.duration_s),
            evidence      = EXCLUDED.evidence,
            emitted_at_ms = GREATEST(COALESCE(analytics.condition_event.emitted_at_ms, 0), COALESCE(EXCLUDED.emitted_at_ms, 0)),
            source_commit = COALESCE(EXCLUDED.source_commit, analytics.condition_event.source_commit),
            jar_sha256    = COALESCE(EXCLUDED.jar_sha256, analytics.condition_event.jar_sha256),
            updated_at    = NOW()
        WHERE analytics.condition_event.state <> 'CLOSED' OR EXCLUDED.state = 'CLOSED'
        """;

    public const string SelectForLoopSql = """
        SELECT loop_id, gate, kind, state, start_ms, last_ms, end_ms, duration_s, close_reason,
               evidence::text AS evidence, emitted_at_ms, source_commit, jar_sha256, updated_at
        FROM analytics.condition_event
        WHERE lower(loop_id) = lower(@loopId)
          AND (@fromMs::bigint IS NULL OR last_ms >= @fromMs)
          AND (@toMs::bigint IS NULL OR start_ms <= @toMs)
          AND (NOT @openOnly OR state <> 'CLOSED')
        ORDER BY start_ms DESC
        LIMIT @limit
        """;

    private static string? Str(JsonElement r, string name) =>
        r.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    private static long? Long(JsonElement r, string name) =>
        r.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt64(out var v) ? v : null;

    private static double? Dbl(JsonElement r, string name) =>
        r.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetDouble(out var v) ? v : null;
}
