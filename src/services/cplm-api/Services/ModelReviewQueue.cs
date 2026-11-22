// CHG-109 (System Response plan Phase 4, for the CHG-218 review shortlist): about 600 System Response models arrive a day at
// Marun and none has ever been reviewed. The review queue gives one row per active loop and path that has something to
// review: the newest VALIDATED model with no review decision (the candidate), the ACTIVE_BASELINE it would replace (if any),
// how many validated models of that loop / path are still unreviewed, and when it was last reviewed. Loops without a baseline
// come first, then the oldest candidate. Gain / time constant / dead time come from the model's parameters; fit improvement
// and validation RMSE from the metrics of the event the model was estimated on.
using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

public static class ModelReviewQueue
{
    public sealed record ModelSummary(Guid ModelId, int Revision, string Family, string ModelState, DateTime CreatedAt, Guid? CreatedFromEvent,
        double? Gain, double? TimeConstant, double? DeadTime, double? FitImprovement, double? ValidationRmse);

    public sealed record Row(string LoopId, string DisplayName, string LoopType, string Site, string PathId, ModelSummary Candidate,
        ModelSummary? Baseline, int PendingCount, DateTime? LastReviewedAt);

    public const string Sql = """
        WITH cand AS (
            SELECT DISTINCT ON (lower(m.loop_id), m.path_id) m.*
            FROM analytics.system_model m
            WHERE m.model_state = 'VALIDATED' AND m.reviewed_at IS NULL
            ORDER BY lower(m.loop_id), m.path_id, m.created_at DESC
        ), pend AS (
            SELECT lower(loop_id) AS lk, path_id, count(*)::int AS n
            FROM analytics.system_model WHERE model_state = 'VALIDATED' AND reviewed_at IS NULL GROUP BY 1, 2
        ), base AS (
            SELECT DISTINCT ON (lower(m.loop_id), m.path_id) m.*
            FROM analytics.system_model m WHERE m.model_state = 'ACTIVE_BASELINE'
            ORDER BY lower(m.loop_id), m.path_id, m.created_at DESC
        ), rev AS (
            SELECT lower(loop_id) AS lk, path_id, max(reviewed_at) AS last
            FROM analytics.system_model WHERE reviewed_at IS NOT NULL GROUP BY 1, 2
        )
        SELECT lr.loop_id, lr.display_name, lr.loop_type, lr.site, c.path_id,
               c.model_id AS c_id, c.revision AS c_rev, c.family AS c_family, c.model_state AS c_state, c.created_at AS c_created, c.created_from_event AS c_event,
               COALESCE(c.parameters->'process_gain'->>'value', c.parameters->'integrating_gain'->>'value')::float8 AS c_gain,
               (c.parameters->'time_constant'->>'value')::float8 AS c_tau, (c.parameters->'dead_time'->>'value')::float8 AS c_theta,
               (SELECT value::float8 FROM analytics.response_metric WHERE method_run_id = c.method_run_id AND quantity_id = 'fit_improvement') AS c_fit,
               (SELECT value::float8 FROM analytics.response_metric WHERE method_run_id = c.method_run_id AND quantity_id = 'validation_rmse') AS c_rmse,
               b.model_id AS b_id, b.revision AS b_rev, b.family AS b_family, b.model_state AS b_state, b.created_at AS b_created, b.created_from_event AS b_event,
               COALESCE(b.parameters->'process_gain'->>'value', b.parameters->'integrating_gain'->>'value')::float8 AS b_gain,
               (b.parameters->'time_constant'->>'value')::float8 AS b_tau, (b.parameters->'dead_time'->>'value')::float8 AS b_theta,
               (SELECT value::float8 FROM analytics.response_metric WHERE method_run_id = b.method_run_id AND quantity_id = 'fit_improvement') AS b_fit,
               (SELECT value::float8 FROM analytics.response_metric WHERE method_run_id = b.method_run_id AND quantity_id = 'validation_rmse') AS b_rmse,
               COALESCE(p.n, 0) AS pending, r.last AS last_reviewed
        FROM cand c
        JOIN cpm.loop_registry lr ON lower(lr.loop_id) = lower(c.loop_id) AND lr.is_active
        LEFT JOIN pend p ON p.lk = lower(c.loop_id) AND p.path_id = c.path_id
        LEFT JOIN base b ON lower(b.loop_id) = lower(c.loop_id) AND b.path_id = c.path_id
        LEFT JOIN rev r ON r.lk = lower(c.loop_id) AND r.path_id = c.path_id
        WHERE (@site::text IS NULL OR lower(lr.site) = lower(@site))
        ORDER BY (b.model_id IS NULL) DESC, c.created_at ASC, lr.loop_id, c.path_id
        LIMIT @limit
        """;

    public static async Task<IReadOnlyList<Row>> ReadAsync(NpgsqlDataSource db, string? site, int limit, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync<Flat>(new CommandDefinition(Sql, new { site, limit }, cancellationToken: ct, commandTimeout: 30));
        return rows.Select(r => new Row(r.loop_id, r.display_name, r.loop_type, r.site, r.path_id,
            new ModelSummary(r.c_id, r.c_rev, r.c_family, r.c_state, Utc(r.c_created), r.c_event, r.c_gain, r.c_tau, r.c_theta, r.c_fit, r.c_rmse),
            r.b_id is { } bid ? new ModelSummary(bid, r.b_rev ?? 1, r.b_family ?? "", r.b_state ?? "", Utc(r.b_created ?? default), r.b_event, r.b_gain, r.b_tau, r.b_theta, r.b_fit, r.b_rmse) : null,
            r.pending, r.last_reviewed is { } lr ? Utc(lr) : null)).ToList();
    }

    // column names as the query returns them (Dapper maps by name)
    private sealed class Flat
    {
        public string loop_id { get; set; } = ""; public string display_name { get; set; } = ""; public string loop_type { get; set; } = "";
        public string site { get; set; } = ""; public string path_id { get; set; } = "";
        public Guid c_id { get; set; } public int c_rev { get; set; } public string c_family { get; set; } = ""; public string c_state { get; set; } = "";
        public DateTime c_created { get; set; } public Guid? c_event { get; set; }
        public double? c_gain { get; set; } public double? c_tau { get; set; } public double? c_theta { get; set; } public double? c_fit { get; set; } public double? c_rmse { get; set; }
        public Guid? b_id { get; set; } public int? b_rev { get; set; } public string? b_family { get; set; } public string? b_state { get; set; }
        public DateTime? b_created { get; set; } public Guid? b_event { get; set; }
        public double? b_gain { get; set; } public double? b_tau { get; set; } public double? b_theta { get; set; } public double? b_fit { get; set; } public double? b_rmse { get; set; }
        public int pending { get; set; } public DateTime? last_reviewed { get; set; }
    }

    private static DateTime Utc(DateTime d) => DateTime.SpecifyKind(d, DateTimeKind.Utc);
}
