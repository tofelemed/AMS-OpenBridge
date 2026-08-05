using Confluent.Kafka;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using AMS.Infrastructure.Kafka;
using Npgsql;
using NpgsqlTypes;
using System.Text.Json;

namespace AMS.Api.BackgroundServices;

/// <summary>
/// CPLM Phase 3 — persists the three CPLM result streams into Postgres:
///   clpm.gate.results.v1   → analytics.cplm_gate_results
///   clpm.feature.short.v1  → analytics.cplm_short_feature_results
///   clpm.feature.long.v1   → analytics.cplm_long_feature_results
///
/// Ported from the CPA reference KpiConsumerService with deliberate upgrades:
///   * self-healing DDL on startup (same statements as 30_cplm_analytics_schema.sql),
///     so an existing Postgres volume converges without a wipe
///   * at-least-once: offsets are stored only after a successful persist
///     (CPA auto-committed before persisting, silently losing rows on DB errors)
///   * idempotent upsert on (loop_id, window_kind, window_end, source) —
///     replays and redeliveries update in place instead of appending duplicates
///   * parse failures are logged (CPA swallowed them with an empty catch)
///   * topics/group configurable via the Cplm section (CPA hard-coded them)
///
/// Deliberately preserved from CPA: missing/non-numeric JSON values coerce to
/// 0.0 (never SQL NULL) — downstream ranking/readiness logic depends on it.
/// The full raw message goes to the payload JSONB column; the 17 gate statuses
/// and versions are only there.
///
/// Not here (later phases): SignalR loop-stream broadcast (Phase 6 wires
/// gate results into the live plane), IoTDB KPI dual-write (Phase 3 slice 2).
/// </summary>
public sealed class CplmResultConsumerService : BackgroundService
{
    private readonly ILogger<CplmResultConsumerService> _logger;
    private readonly NpgsqlDataSource _dataSource;
    private readonly CplmOptions _options;
    private readonly IConsumer<string, string> _consumer;

    public CplmResultConsumerService(
        ILogger<CplmResultConsumerService> logger,
        IOptions<KafkaOptions> kafkaOptions,
        IOptions<CplmOptions> cplmOptions,
        NpgsqlDataSource dataSource)
    {
        _logger = logger;
        _dataSource = dataSource;
        _options = cplmOptions.Value;

        var config = new ConsumerConfig
        {
            BootstrapServers = kafkaOptions.Value.BootstrapServers,
            GroupId = _options.ConsumerGroupId,
            // Earliest: on first deploy, ingest results already sitting in the
            // topics (30 d retention on gate results) instead of only new ones.
            AutoOffsetReset = AutoOffsetReset.Earliest,
            // At-least-once: auto-commit is fine, but only offsets we explicitly
            // Store() after a successful persist are ever committed.
            EnableAutoCommit = true,
            EnableAutoOffsetStore = false
        };
        _consumer = new ConsumerBuilder<string, string>(config).Build();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();

        try
        {
            await EnsureSchemaAsync(stoppingToken);
        }
        catch (Exception ex)
        {
            // Do not run without the tables: with offsets stored only after
            // persist, failing fast here is safe — messages wait in Kafka.
            _logger.LogError(ex, "CPLM analytics schema could not be ensured; consumer not starting");
            return;
        }

        var topics = new[] { _options.GateResultsTopic, _options.ShortFeatureTopic, _options.LongFeatureTopic };
        _consumer.Subscribe(topics);
        _logger.LogInformation("CplmResultConsumerService subscribed to {Topics}", string.Join(", ", topics));

        while (!stoppingToken.IsCancellationRequested)
        {
            ConsumeResult<string, string>? result = null;
            try
            {
                result = _consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (result == null) continue;

                var json = result.Message.Value;
                if (string.IsNullOrWhiteSpace(json)) { _consumer.StoreOffset(result); continue; }

                var topic = result.Topic;
                bool persisted;
                if (topic == _options.GateResultsTopic)
                    persisted = await PersistGateAsync(json, stoppingToken);
                else if (topic == _options.ShortFeatureTopic)
                    persisted = await PersistFeatureAsync(json, isLong: false, stoppingToken);
                else if (topic == _options.LongFeatureTopic)
                    persisted = await PersistFeatureAsync(json, isLong: true, stoppingToken);
                else
                    persisted = true; // unexpected topic — skip, don't wedge the partition

                // Unparseable messages return true (skip + advance); only DB
                // failures leave the offset unstored so the message is retried.
                if (persisted) _consumer.StoreOffset(result);
            }
            catch (ConsumeException ex)
            {
                _logger.LogError(ex, "Kafka consume error in CplmResultConsumerService");
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Error persisting CPLM message from {Topic}; offset not stored, will retry",
                    result?.Topic ?? "?");
                await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
            }
        }

        _consumer.Close();
    }

    // ── Gate results ─────────────────────────────────────────────────────────

    private async Task<bool> PersistGateAsync(string json, CancellationToken ct)
    {
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Unparseable gate result skipped: {Snippet}", Snippet(json));
            return true;
        }

        var loopId = GetString(root, "loop_id") ?? GetString(root, "tagId");
        if (string.IsNullOrWhiteSpace(loopId))
        {
            _logger.LogWarning("Gate result without loop_id/tagId skipped: {Snippet}", Snippet(json));
            return true;
        }

        const string sql = """
            INSERT INTO analytics.cplm_gate_results
                (loop_id, window_kind, window_start, window_end, sample_count,
                 mae, rmse, iae, good_error_pct, acf_period_s, acf_regularity,
                 effort_ratio, triangularity, horch_oddness, phase_area_norm_per_cycle,
                 corner_score, travel_per_day, reversals_per_hour,
                 harmonic_amplitude_ratio, harmonic_energy_ratio,
                 diagnosis, severity, confidence, payload, source)
            VALUES
                (@loopId, @windowKind, @winStart, @winEnd, @samples,
                 @mae, @rmse, @iae, @goodErrorPct, @acfPeriodS, @acfRegularity,
                 @effortRatio, @triangularity, @horchOddness, @phaseArea,
                 @cornerScore, @travelPerDay, @reversalsPerHour,
                 @harmAmpRatio, @harmEnergyRatio,
                 @diagnosis, @severity, @confidence, @payload, @source)
            ON CONFLICT (loop_id, window_kind, window_end, source) DO UPDATE SET
                window_start = EXCLUDED.window_start,
                sample_count = EXCLUDED.sample_count,
                mae = EXCLUDED.mae, rmse = EXCLUDED.rmse, iae = EXCLUDED.iae,
                good_error_pct = EXCLUDED.good_error_pct,
                acf_period_s = EXCLUDED.acf_period_s, acf_regularity = EXCLUDED.acf_regularity,
                effort_ratio = EXCLUDED.effort_ratio, triangularity = EXCLUDED.triangularity,
                horch_oddness = EXCLUDED.horch_oddness,
                phase_area_norm_per_cycle = EXCLUDED.phase_area_norm_per_cycle,
                corner_score = EXCLUDED.corner_score,
                travel_per_day = EXCLUDED.travel_per_day,
                reversals_per_hour = EXCLUDED.reversals_per_hour,
                harmonic_amplitude_ratio = EXCLUDED.harmonic_amplitude_ratio,
                harmonic_energy_ratio = EXCLUDED.harmonic_energy_ratio,
                diagnosis = EXCLUDED.diagnosis, severity = EXCLUDED.severity,
                confidence = EXCLUDED.confidence, payload = EXCLUDED.payload,
                created_at = NOW()
            """;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("loopId", loopId);
        cmd.Parameters.AddWithValue("windowKind", (object?)GetString(root, "window_kind") ?? "24h");
        AddTimestamp(cmd, "winStart", root, "windowStartMs");
        AddTimestamp(cmd, "winEnd", root, "windowEndMs");
        cmd.Parameters.AddWithValue("samples", GetInt(root, "sample_count"));
        cmd.Parameters.AddWithValue("mae", GetDouble(root, "mae"));
        cmd.Parameters.AddWithValue("rmse", GetDouble(root, "rmse"));
        cmd.Parameters.AddWithValue("iae", GetDouble(root, "iae"));
        cmd.Parameters.AddWithValue("goodErrorPct", GetDouble(root, "good_error_pct"));
        cmd.Parameters.AddWithValue("acfPeriodS", GetDouble(root, "acf_period_s"));
        cmd.Parameters.AddWithValue("acfRegularity", GetDouble(root, "acf_regularity"));
        cmd.Parameters.AddWithValue("effortRatio", GetDouble(root, "effort_ratio"));
        cmd.Parameters.AddWithValue("triangularity", GetDouble(root, "triangularity"));
        cmd.Parameters.AddWithValue("horchOddness", GetDouble(root, "horch_oddness"));
        cmd.Parameters.AddWithValue("phaseArea", GetDouble(root, "phase_area_norm_per_cycle"));
        cmd.Parameters.AddWithValue("cornerScore", GetDouble(root, "corner_score"));
        cmd.Parameters.AddWithValue("travelPerDay", GetDouble(root, "travel_per_day"));
        cmd.Parameters.AddWithValue("reversalsPerHour", GetDouble(root, "reversals_per_hour"));
        cmd.Parameters.AddWithValue("harmAmpRatio", GetDouble(root, "harmonic_amplitude_ratio"));
        cmd.Parameters.AddWithValue("harmEnergyRatio", GetDouble(root, "harmonic_energy_ratio"));
        cmd.Parameters.AddWithValue("diagnosis", (object?)GetString(root, "diagnosis") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("severity", (object?)GetString(root, "severity") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("confidence", GetDouble(root, "confidence"));
        cmd.Parameters.Add(new NpgsqlParameter("payload", NpgsqlDbType.Jsonb) { Value = json });
        cmd.Parameters.AddWithValue("source", GetString(root, "calculation_source") ?? "flink");
        await cmd.ExecuteNonQueryAsync(ct);
        return true;
    }

    // ── Short / long features ────────────────────────────────────────────────

    private async Task<bool> PersistFeatureAsync(string json, bool isLong, CancellationToken ct)
    {
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Unparseable {Kind} feature skipped: {Snippet}", isLong ? "long" : "short", Snippet(json));
            return true;
        }

        var loopId = GetString(root, "loop_id") ?? GetString(root, "tagId");
        if (string.IsNullOrWhiteSpace(loopId))
        {
            _logger.LogWarning("{Kind} feature without loop_id skipped: {Snippet}", isLong ? "Long" : "Short", Snippet(json));
            return true;
        }

        string sql = isLong
            ? """
              INSERT INTO analytics.cplm_long_feature_results
                  (loop_id, window_kind, window_start, window_end, sample_count,
                   acf_period_s, acf_regularity, effort_ratio, triangularity, horch_oddness,
                   corner_score, travel_per_day, reversals_per_hour,
                   harmonic_amplitude_ratio, harmonic_energy_ratio, payload, source)
              VALUES
                  (@loopId, @windowKind, @winStart, @winEnd, @samples,
                   @m1, @m2, @m3, @m4, @m5, @m6, @m7, @m8, @m9, @m10, @payload, @source)
              ON CONFLICT (loop_id, window_kind, window_end, source) DO UPDATE SET
                  window_start = EXCLUDED.window_start, sample_count = EXCLUDED.sample_count,
                  acf_period_s = EXCLUDED.acf_period_s, acf_regularity = EXCLUDED.acf_regularity,
                  effort_ratio = EXCLUDED.effort_ratio, triangularity = EXCLUDED.triangularity,
                  horch_oddness = EXCLUDED.horch_oddness, corner_score = EXCLUDED.corner_score,
                  travel_per_day = EXCLUDED.travel_per_day,
                  reversals_per_hour = EXCLUDED.reversals_per_hour,
                  harmonic_amplitude_ratio = EXCLUDED.harmonic_amplitude_ratio,
                  harmonic_energy_ratio = EXCLUDED.harmonic_energy_ratio,
                  payload = EXCLUDED.payload, created_at = NOW()
              """
            : """
              INSERT INTO analytics.cplm_short_feature_results
                  (loop_id, window_kind, window_start, window_end, sample_count,
                   iae, ise, mae, rmse, good_error_pct, effort_ratio,
                   travel_per_day, reversals_per_hour, auto_pct, completeness, payload, source)
              VALUES
                  (@loopId, @windowKind, @winStart, @winEnd, @samples,
                   @m1, @m2, @m3, @m4, @m5, @m6, @m7, @m8, @m9, @m10, @payload, @source)
              ON CONFLICT (loop_id, window_kind, window_end, source) DO UPDATE SET
                  window_start = EXCLUDED.window_start, sample_count = EXCLUDED.sample_count,
                  iae = EXCLUDED.iae, ise = EXCLUDED.ise, mae = EXCLUDED.mae,
                  rmse = EXCLUDED.rmse, good_error_pct = EXCLUDED.good_error_pct,
                  effort_ratio = EXCLUDED.effort_ratio,
                  travel_per_day = EXCLUDED.travel_per_day,
                  reversals_per_hour = EXCLUDED.reversals_per_hour,
                  auto_pct = EXCLUDED.auto_pct, completeness = EXCLUDED.completeness,
                  payload = EXCLUDED.payload, created_at = NOW()
              """;

        string[] fields = isLong
            ? new[] { "acf_period_s", "acf_regularity", "effort_ratio", "triangularity", "horch_oddness",
                      "corner_score", "travel_per_day", "reversals_per_hour",
                      "harmonic_amplitude_ratio", "harmonic_energy_ratio" }
            : new[] { "iae", "ise", "mae", "rmse", "good_error_pct", "effort_ratio",
                      "travel_per_day", "reversals_per_hour", "auto_pct", "completeness" };

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("loopId", loopId);
        cmd.Parameters.AddWithValue("windowKind", (object?)GetString(root, "window_kind") ?? (isLong ? "24h" : "5m"));
        AddTimestamp(cmd, "winStart", root, "windowStartMs");
        AddTimestamp(cmd, "winEnd", root, "windowEndMs");
        cmd.Parameters.AddWithValue("samples", GetInt(root, "sample_count"));
        for (var i = 0; i < fields.Length; i++)
            cmd.Parameters.AddWithValue($"m{i + 1}", GetDouble(root, fields[i]));
        cmd.Parameters.Add(new NpgsqlParameter("payload", NpgsqlDbType.Jsonb) { Value = json });
        cmd.Parameters.AddWithValue("source", "flink");
        await cmd.ExecuteNonQueryAsync(ct);
        return true;
    }

    // ── Self-healing DDL (mirrors database/scripts/30_cplm_analytics_schema.sql) ──

    private async Task EnsureSchemaAsync(CancellationToken ct)
    {
        var ddl = """
            CREATE SCHEMA IF NOT EXISTS analytics;
            CREATE TABLE IF NOT EXISTS analytics.cplm_gate_results (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                loop_id VARCHAR(256) NOT NULL,
                window_kind VARCHAR(16) NOT NULL DEFAULT '24h',
                window_start TIMESTAMPTZ, window_end TIMESTAMPTZ, sample_count INT,
                mae DOUBLE PRECISION, rmse DOUBLE PRECISION, iae DOUBLE PRECISION,
                good_error_pct DOUBLE PRECISION, acf_period_s DOUBLE PRECISION,
                acf_regularity DOUBLE PRECISION, effort_ratio DOUBLE PRECISION,
                triangularity DOUBLE PRECISION, horch_oddness DOUBLE PRECISION,
                phase_area_norm_per_cycle DOUBLE PRECISION, corner_score DOUBLE PRECISION,
                travel_per_day DOUBLE PRECISION, reversals_per_hour DOUBLE PRECISION,
                harmonic_amplitude_ratio DOUBLE PRECISION, harmonic_energy_ratio DOUBLE PRECISION,
                diagnosis VARCHAR(128), severity VARCHAR(32), confidence DOUBLE PRECISION,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                source VARCHAR(32) NOT NULL DEFAULT 'flink',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
            CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_gate_results_window
                ON analytics.cplm_gate_results (loop_id, window_kind, window_end, source);
            CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_loop_time
                ON analytics.cplm_gate_results (loop_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_loop_kind_end
                ON analytics.cplm_gate_results (loop_id, window_kind, window_end DESC);
            CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_loop_lower
                ON analytics.cplm_gate_results (lower(loop_id));
            CREATE OR REPLACE VIEW analytics.cplm_gate_latest AS
                SELECT DISTINCT ON (loop_id, window_kind) * FROM analytics.cplm_gate_results
                ORDER BY loop_id, window_kind,
                         (diagnosis IS NOT NULL AND diagnosis <> 'INSUFFICIENT_DATA') DESC,
                         window_end DESC NULLS LAST,
                         created_at DESC;

            CREATE TABLE IF NOT EXISTS analytics.cplm_short_feature_results (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                loop_id VARCHAR(256) NOT NULL, window_kind VARCHAR(16) NOT NULL,
                window_start TIMESTAMPTZ, window_end TIMESTAMPTZ, sample_count INT,
                iae DOUBLE PRECISION, ise DOUBLE PRECISION, mae DOUBLE PRECISION,
                rmse DOUBLE PRECISION, good_error_pct DOUBLE PRECISION,
                effort_ratio DOUBLE PRECISION, travel_per_day DOUBLE PRECISION,
                reversals_per_hour DOUBLE PRECISION, auto_pct DOUBLE PRECISION,
                completeness DOUBLE PRECISION,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                source VARCHAR(32) NOT NULL DEFAULT 'flink',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
            CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_short_window
                ON analytics.cplm_short_feature_results (loop_id, window_kind, window_end, source);
            CREATE INDEX IF NOT EXISTS idx_cplm_short_loop_kind_time
                ON analytics.cplm_short_feature_results (loop_id, window_kind, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cplm_short_loop_kind_end
                ON analytics.cplm_short_feature_results (loop_id, window_kind, window_end DESC);
            CREATE INDEX IF NOT EXISTS idx_cplm_short_loop_lower
                ON analytics.cplm_short_feature_results (lower(loop_id));
            CREATE OR REPLACE VIEW analytics.cplm_short_feature_latest AS
                SELECT DISTINCT ON (loop_id, window_kind) * FROM analytics.cplm_short_feature_results
                ORDER BY loop_id, window_kind,
                         (COALESCE(completeness, 0) >= 0.95 AND COALESCE(sample_count, 0) >= 10) DESC,
                         created_at DESC;

            CREATE TABLE IF NOT EXISTS analytics.cplm_long_feature_results (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                loop_id VARCHAR(256) NOT NULL, window_kind VARCHAR(16) NOT NULL,
                window_start TIMESTAMPTZ, window_end TIMESTAMPTZ, sample_count INT,
                acf_period_s DOUBLE PRECISION, acf_regularity DOUBLE PRECISION,
                effort_ratio DOUBLE PRECISION, triangularity DOUBLE PRECISION,
                horch_oddness DOUBLE PRECISION, corner_score DOUBLE PRECISION,
                travel_per_day DOUBLE PRECISION, reversals_per_hour DOUBLE PRECISION,
                harmonic_amplitude_ratio DOUBLE PRECISION, harmonic_energy_ratio DOUBLE PRECISION,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                source VARCHAR(32) NOT NULL DEFAULT 'flink',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
            CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_long_window
                ON analytics.cplm_long_feature_results (loop_id, window_kind, window_end, source);
            CREATE INDEX IF NOT EXISTS idx_cplm_long_loop_kind_time
                ON analytics.cplm_long_feature_results (loop_id, window_kind, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cplm_long_loop_kind_end
                ON analytics.cplm_long_feature_results (loop_id, window_kind, window_end DESC);
            CREATE INDEX IF NOT EXISTS idx_cplm_long_loop_lower
                ON analytics.cplm_long_feature_results (lower(loop_id));
            CREATE OR REPLACE VIEW analytics.cplm_long_feature_latest AS
                SELECT DISTINCT ON (loop_id, window_kind) * FROM analytics.cplm_long_feature_results
                ORDER BY loop_id, window_kind, created_at DESC;
            """;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await using var cmd = new NpgsqlCommand(ddl, conn);
        await cmd.ExecuteNonQueryAsync(ct);
        _logger.LogInformation("CPLM analytics schema ensured (3 tables, 3 views)");
    }

    // ── JSON helpers ─────────────────────────────────────────────────────────

    private static string? GetString(JsonElement r, string name)
        => r.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    /// <summary>Missing/null/non-numeric → 0.0, never NULL (CPA-compatible; ranking depends on it).</summary>
    private static double GetDouble(JsonElement r, string name)
        => r.TryGetProperty(name, out var p) && p.TryGetDouble(out var v) ? v : 0.0;

    private static int GetInt(JsonElement r, string name)
        => r.TryGetProperty(name, out var p) && p.TryGetInt32(out var v) ? v : 0;

    private static void AddTimestamp(NpgsqlCommand cmd, string param, JsonElement r, string msField)
    {
        object value = DBNull.Value;
        if (r.TryGetProperty(msField, out var p) && p.TryGetInt64(out var ms) && ms > 0)
            value = DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime;
        cmd.Parameters.AddWithValue(param, value);
    }

    private static string Snippet(string json) => json.Length <= 200 ? json : json[..200] + "…";
}

/// <summary>CPLM consumer configuration ("Cplm" section); defaults match the deployed topics.</summary>
public sealed class CplmOptions
{
    public const string SectionName = "Cplm";
    public string GateResultsTopic { get; set; } = "clpm.gate.results.v1";
    public string ShortFeatureTopic { get; set; } = "clpm.feature.short.v1";
    public string LongFeatureTopic { get; set; } = "clpm.feature.long.v1";
    public string ConsumerGroupId { get; set; } = "ams-api-cplm-results";
}
