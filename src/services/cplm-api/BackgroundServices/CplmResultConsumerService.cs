// Extraction Phase 4 COPY of AMS.Api BackgroundServices/CplmResultConsumerService.cs — mechanical
// transforms only (namespace, local KafkaOptions, local IotDbWriteClient).
// SAME consumer group id as the AMS.Api original: the two processes must
// NEVER consume simultaneously (partition split = silent half-persistence).
// Gated by Cplm:ConsumersEnabled. AMS.Api original deleted in Phase 6.
using Confluent.Kafka;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Traverse.CplmApi.Infrastructure;
using Npgsql;
using NpgsqlTypes;
using System.Text.Json;

namespace Traverse.CplmApi.BackgroundServices;

using static Traverse.CplmApi.Services.ResultPayloadReader;

/// <summary>
/// CPLM Phase 3 — persists the three CPLM result streams into Postgres:
///   traverse.cpa.clpm.gate.results.v1   → analytics.cplm_gate_results
///   traverse.cpa.clpm.feature.short.v1  → analytics.cplm_short_feature_results
///   traverse.cpa.clpm.feature.long.v1   → analytics.cplm_long_feature_results
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
    private readonly Traverse.CplmApi.Services.IotDbWriteClient _iotdb;
    private readonly Traverse.CplmApi.Services.ConsumerHeartbeat _heartbeat;
    private readonly Traverse.CplmApi.Services.SingleMemberGuard _guard;
    private readonly IConsumer<string, string> _consumer;

    public CplmResultConsumerService(
        ILogger<CplmResultConsumerService> logger,
        IOptions<KafkaOptions> kafkaOptions,
        IOptions<CplmOptions> cplmOptions,
        Traverse.CplmApi.Services.IotDbWriteClient iotdb,
        Traverse.CplmApi.Services.ConsumerHeartbeat heartbeat,
        Traverse.CplmApi.Services.SingleMemberGuard guard,
        [FromKeyedServices("cplm")] NpgsqlDataSource dataSource)
    {
        _logger = logger;
        _dataSource = dataSource;
        _options = cplmOptions.Value;
        _iotdb = iotdb;
        _heartbeat = heartbeat;
        _guard = guard;

        var config = new ConsumerConfig
        {
            BootstrapServers = kafkaOptions.Value.BootstrapServers,
            GroupId = _options.ConsumerGroupId,
            // STR-06: static membership. Names the intended sole member explicitly and
            // avoids a full rebalance on every restart of this service.
            GroupInstanceId = _options.ConsumerGroupId + "-sole",
            // Earliest: on first deploy, ingest results already sitting in the
            // topics (30 d retention on gate results) instead of only new ones.
            AutoOffsetReset = AutoOffsetReset.Earliest,
            // At-least-once: auto-commit is fine, but only offsets we explicitly
            // Store() after a successful persist are ever committed.
            EnableAutoCommit = true,
            EnableAutoOffsetStore = false
        };
        _consumer = new ConsumerBuilder<string, string>(config)
            // STR-06: a second member would silently take half the partitions and
            // persist half the windows. Assert we hold all of them.
            .SetPartitionsAssignedHandler((_, parts) =>
                _guard.VerifySoleMembership("results", parts))
            .Build();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();

        // Do not run without the tables. Postgres may still be starting when this
        // service comes up (57P03 on a cold stack), so retry with backoff instead
        // of failing fast — messages wait in Kafka either way.
        while (!stoppingToken.IsCancellationRequested)
        {
            _heartbeat.Report("results", "ENSURING_SCHEMA"); // P3-11
            try
            {
                await EnsureSchemaAsync(stoppingToken);
                break;
            }
            catch (OperationCanceledException) { return; }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "CPLM analytics schema not ensured yet; retrying in 10s");
                try { await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken); }
                catch (OperationCanceledException) { return; }
            }
        }
        if (stoppingToken.IsCancellationRequested) return;

        var topics = new[] { _options.GateResultsTopic, _options.ShortFeatureTopic, _options.LongFeatureTopic };
        _consumer.Subscribe(topics);
        _logger.LogInformation("CplmResultConsumerService subscribed to {Topics}", string.Join(", ", topics));

        while (!stoppingToken.IsCancellationRequested)
        {
            _heartbeat.Report("results", "CONSUMING"); // P3-11: beats even when idle (500 ms poll)
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
                if (persisted)
                {
                    _consumer.StoreOffset(result);
                    _heartbeat.ReportLag("results", (long)(DateTimeOffset.UtcNow - result.Message.Timestamp.UtcDateTime).TotalMilliseconds);
                }
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

        // Poison-pill guard: window_end is the hypertable partition column
        // (NOT NULL). Without this check a missing/zero windowEndMs threw on
        // insert, the offset was never stored, and the 2s retry loop wedged all
        // three result streams on one message. Skip + advance, loudly.
        if (!HasUsableWindowEnd(root))
        {
            _logger.LogError("Gate result with missing/invalid windowEndMs skipped (loop {LoopId}): {Snippet}",
                loopId, Snippet(json));
            return true;
        }

        const string sql = GateUpsertSql;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await using var cmd = new NpgsqlCommand(sql, conn);
        BindGateParameters(cmd, root, loopId, json);
        await cmd.ExecuteNonQueryAsync(ct);
        await AfterGatePersistedAsync(loopId, root, ct);
        return true;
    }

    /// <summary>
    /// v2.5 (1G.3, spec §1.6): the conflict target includes bundle_hash - the same window under
    /// the SAME configuration is refined in place (late data, sample_count guard), under a
    /// DIFFERENT configuration it is a new row. Public so ResultUpsertTests runs it verbatim.
    /// </summary>
    public const string GateUpsertSql = """
            INSERT INTO analytics.cplm_gate_results
                (loop_id, window_kind, window_start, window_end, sample_count,
                 mae, rmse, iae, good_error_pct, acf_period_s, acf_regularity,
                 effort_ratio, triangularity, horch_oddness, phase_area_norm_per_cycle,
                 corner_score, travel_per_day, reversals_per_hour,
                 harmonic_amplitude_ratio, harmonic_energy_ratio,
                 diagnosis, severity, confidence, payload, source,
                 method_run_ids, bundle_hash, context_revision, result_revision, purpose,
                 analysis_run_id, source_commit, jar_sha256, dataset_hash)
            VALUES
                (@loopId, @windowKind, @winStart, @winEnd, @samples,
                 @mae, @rmse, @iae, @goodErrorPct, @acfPeriodS, @acfRegularity,
                 @effortRatio, @triangularity, @horchOddness, @phaseArea,
                 @cornerScore, @travelPerDay, @reversalsPerHour,
                 @harmAmpRatio, @harmEnergyRatio,
                 @diagnosis, @severity, @confidence, @payload, @source,
                 @methodRunIds, @bundleHash, @contextRevision, @resultRevision, @purpose,
                 @analysisRunId, @sourceCommit, @jarSha256, @datasetHash)
            ON CONFLICT (loop_id, window_kind, window_end, source, bundle_hash) DO UPDATE SET
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
                method_run_ids = EXCLUDED.method_run_ids, context_revision = EXCLUDED.context_revision,
                result_revision = EXCLUDED.result_revision, purpose = EXCLUDED.purpose,
                analysis_run_id = EXCLUDED.analysis_run_id, source_commit = EXCLUDED.source_commit,
                jar_sha256 = EXCLUDED.jar_sha256, dataset_hash = EXCLUDED.dataset_hash,
                created_at = NOW()
            WHERE EXCLUDED.sample_count >= analytics.cplm_gate_results.sample_count
            """;

    private static void BindGateParameters(NpgsqlCommand cmd, JsonElement root, string loopId, string json)
    {
        cmd.Parameters.AddWithValue("loopId", loopId);
        cmd.Parameters.AddWithValue("windowKind", (object?)GetString(root, "window_kind") ?? "24h");
        AddTimestamp(cmd, "winStart", root, "windowStartMs");
        AddTimestamp(cmd, "winEnd", root, "windowEndMs");
        cmd.Parameters.AddWithValue("samples", GetInt(root, "sample_count"));
        cmd.Parameters.AddWithValue("mae", GetDoubleOrNull(root, "mae"));
        cmd.Parameters.AddWithValue("rmse", GetDoubleOrNull(root, "rmse"));
        cmd.Parameters.AddWithValue("iae", GetDoubleOrNull(root, "iae"));
        cmd.Parameters.AddWithValue("goodErrorPct", GetDoubleOrNull(root, "good_error_pct"));
        cmd.Parameters.AddWithValue("acfPeriodS", GetDoubleOrNull(root, "acf_period_s"));
        cmd.Parameters.AddWithValue("acfRegularity", GetDoubleOrNull(root, "acf_regularity"));
        cmd.Parameters.AddWithValue("effortRatio", GetDoubleOrNull(root, "effort_ratio"));
        cmd.Parameters.AddWithValue("triangularity", GetDoubleOrNull(root, "triangularity"));
        cmd.Parameters.AddWithValue("horchOddness", GetDoubleOrNull(root, "horch_oddness"));
        cmd.Parameters.AddWithValue("phaseArea", GetDoubleOrNull(root, "phase_area_norm_per_cycle"));
        cmd.Parameters.AddWithValue("cornerScore", GetDoubleOrNull(root, "corner_score"));
        cmd.Parameters.AddWithValue("travelPerDay", GetDoubleOrNull(root, "travel_per_day"));
        cmd.Parameters.AddWithValue("reversalsPerHour", GetDoubleOrNull(root, "reversals_per_hour"));
        cmd.Parameters.AddWithValue("harmAmpRatio", GetDoubleOrNull(root, "harmonic_amplitude_ratio"));
        cmd.Parameters.AddWithValue("harmEnergyRatio", GetDoubleOrNull(root, "harmonic_energy_ratio"));
        cmd.Parameters.AddWithValue("diagnosis", (object?)GetString(root, "diagnosis") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("severity", (object?)GetString(root, "severity") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("confidence", GetDouble(root, "confidence"));
        cmd.Parameters.Add(new NpgsqlParameter("payload", NpgsqlDbType.Jsonb) { Value = json });
        cmd.Parameters.AddWithValue("source", GetString(root, "calculation_source") ?? "flink");
        AddIdentityParameters(cmd, root);
    }

    /// <summary>v2.5 (1G.3): the run identity every result carries (pre-v2.5 payloads: legacy defaults).</summary>
    private static void AddIdentityParameters(NpgsqlCommand cmd, JsonElement root)
    {
        var ids = root.TryGetProperty("method_run_ids", out var m) && m.ValueKind == JsonValueKind.Object ? m.GetRawText() : "{}";
        cmd.Parameters.Add(new NpgsqlParameter("methodRunIds", NpgsqlDbType.Jsonb) { Value = ids });
        cmd.Parameters.AddWithValue("bundleHash", GetString(root, "bundle_hash") ?? "legacy");
        cmd.Parameters.AddWithValue("contextRevision", GetInt(root, "context_revision"));
        cmd.Parameters.AddWithValue("resultRevision", Math.Max(1, GetInt(root, "result_revision")));
        cmd.Parameters.AddWithValue("purpose", GetString(root, "purpose") ?? "LIVE");
        cmd.Parameters.Add(new NpgsqlParameter("analysisRunId", NpgsqlDbType.Uuid)
            { Value = Guid.TryParse(GetString(root, "analysis_run_id"), out var g) ? g : DBNull.Value });
        cmd.Parameters.AddWithValue("sourceCommit", (object?)GetString(root, "sourceCommit") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("jarSha256", (object?)GetString(root, "jarSha256") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("datasetHash", (object?)GetString(root, "dataset_hash") ?? DBNull.Value);
    }

    private async Task AfterGatePersistedAsync(string loopId, JsonElement root, CancellationToken ct)
    {
        // Phase 3.6 — KPI series dual-write. Timestamp = window end, so replays
        // overwrite the same point (idempotent by window). Failure is logged by
        // the client and never fails the message: Postgres is the evidence store.
        await WriteKpiSeriesAsync(loopId, "gate_" + (GetString(root, "window_kind") ?? "24h"), root,
            new[] { "mae", "rmse", "iae", "good_error_pct", "acf_period_s", "acf_regularity",
                    "effort_ratio", "triangularity", "horch_oddness", "phase_area_norm_per_cycle",
                    "corner_score", "travel_per_day", "reversals_per_hour",
                    "harmonic_amplitude_ratio", "harmonic_energy_ratio", "confidence" },
            new[] { "diagnosis", "severity" }, ct);
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

        // Poison-pill guard — see PersistGateAsync; same NOT NULL partition column.
        if (!HasUsableWindowEnd(root))
        {
            _logger.LogError("{Kind} feature with missing/invalid windowEndMs skipped (loop {LoopId}): {Snippet}",
                isLong ? "Long" : "Short", loopId, Snippet(json));
            return true;
        }

        string sql = isLong ? Traverse.CplmApi.Data.CplmFeatureUpsertSql.Long : Traverse.CplmApi.Data.CplmFeatureUpsertSql.Short;

        string[] fields = isLong
            ? new[] { "acf_period_s", "acf_regularity", "effort_ratio", "triangularity", "horch_oddness",
                      "corner_score", "travel_per_day", "reversals_per_hour",
                      "harmonic_amplitude_ratio", "harmonic_energy_ratio" }
            // P1-9: sufficient_data rides in the payload (added to the column list
            // below) so a consumer can tell "declined to evaluate" from "measured
            // zero" - previously mae=0 on an unevaluated window drew as perfect control.
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
            cmd.Parameters.AddWithValue($"m{i + 1}", GetDoubleOrNull(root, fields[i]));
        cmd.Parameters.Add(new NpgsqlParameter("payload", NpgsqlDbType.Jsonb) { Value = json });
        // P2-7 - gate rows kept calculation_source but feature rows hardcoded
        // "flink", so an A8 recompute overwrote streaming KPI rows in place with
        // no trace, and /gates returned the same windowEnd twice (different
        // sources) while the feature tables could not represent that at all.
        cmd.Parameters.AddWithValue("source", GetString(root, "calculation_source") ?? "flink");
        AddIdentityParameters(cmd, root);
        await cmd.ExecuteNonQueryAsync(ct);

        var family = (isLong ? "long_" : "short_") + (GetString(root, "window_kind") ?? (isLong ? "24h" : "5m"));
        await WriteKpiSeriesAsync(loopId, family, root, fields, textFields: null, ct);
        return true;
    }

    /// <summary>
    /// Phase 3.6 — write a KPI aggregate row into IoTDB at
    /// root.&lt;site&gt;.cpm.&lt;loop&gt;.kpi.&lt;family&gt; with explicitly declared timeseries.
    /// NOTE: sample_count is the measurement name everywhere (CPA used "samples"
    /// for features but "sample_count" for gates — unified here; Phase 5 readers
    /// must use sample_count).
    /// </summary>
    private async Task WriteKpiSeriesAsync(string loopId, string family, JsonElement root,
        string[] numericFields, string[]? textFields, CancellationToken ct)
    {
        if (!_iotdb.Enabled) return;
        long endMs = root.TryGetProperty("windowEndMs", out var p) && p.TryGetInt64(out var v) && v > 0
            ? v : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var device = $"{_iotdb.LoopRootPrefix}.{Traverse.CplmApi.Services.IotDbWriteClient.SafeNode(loopId)}.kpi.{family}";

        var types = new Dictionary<string, string> { ["sample_count"] = "DOUBLE" };
        foreach (var f in numericFields) types[f] = "DOUBLE";
        if (textFields != null) foreach (var f in textFields) types[f] = "TEXT";
        await _iotdb.EnsureTimeseriesAsync(device, types, ct);

        var kv = new List<KeyValuePair<string, object?>> { new("sample_count", (double)GetInt(root, "sample_count")) };
        // P1-8: skip metrics the engine did not compute rather than writing 0.0.
        // InsertAsync drops null entries, so the KPI series gets a genuine gap
        // instead of a zero that a trend chart would draw as perfect performance.
        foreach (var f in numericFields)
        {
            var val = GetDoubleOrNull(root, f);
            kv.Add(new(f, val is DBNull ? null : val));
        }
        if (textFields != null) foreach (var f in textFields) kv.Add(new(f, GetString(root, f)));
        await _iotdb.InsertAsync(device, endMs, kv, ct);
    }

    // ── Self-healing DDL (mirrors database/scripts/30_cplm_analytics_schema.sql) ──

    private async Task EnsureSchemaAsync(CancellationToken ct)
    {
        var ddl = Traverse.CplmApi.Data.CplmResultSchema.Ddl;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await using var cmd = new NpgsqlCommand(ddl, conn);
        await cmd.ExecuteNonQueryAsync(ct);
        _logger.LogInformation("CPLM analytics schema ensured (3 tables, 3 views)");
        // CHG-033: on the plant's partitioned tables, today's partitions must exist before the first insert
        // (a restart after an outage longer than the lookahead); a no-op on the lab's hypertables.
        try
        {
            var r = await Traverse.CplmApi.Services.FeaturePartitions.MaintainOnceAsync(_dataSource, DateTime.UtcNow,
                new Traverse.CplmApi.Services.FeaturePartitionOptions(), _logger, ct);
            if (r.Created + r.Relocated > 0)
                _logger.LogInformation("Partitions at startup: {Created} created, {Relocated} row(s) relocated from DEFAULT", r.Created, r.Relocated);
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Partition maintenance at startup failed; the maintenance service retries"); }
    }

    // ── JSON helpers ─────────────────────────────────────────────────────────
}
