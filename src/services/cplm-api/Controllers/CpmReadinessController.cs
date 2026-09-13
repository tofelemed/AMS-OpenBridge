// Extraction Phase 3 COPY of AMS.Api Controllers/V1/CpmReadinessController.cs — mechanical transforms only
// (namespace, literal v1 routes, no Asp.Versioning). The AMS.Api original keeps
// serving until Phase 6 deletes it; behavior changes are forbidden in either copy.
using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Npgsql;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// CPLM Phase 5 — A6 loop readiness and A7/A10 pipeline status.
///
/// Readiness answers one question honestly: "can this loop produce a diagnosis
/// I would act on?" Every check reports what to DO about a failure, and the
/// distinction between blocker (no evidence at all) and warning (degraded
/// evidence) is deliberate — a loop with no VP still produces useful verdicts,
/// just never a CONFIRMED one.
/// </summary>
[ApiController]
[Route("api/v1/cpm")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmReadinessController : ControllerBase
{
    /// <summary>
    /// The jobs CPLM needs. PipelineHealthService historically selected the job
    /// whose name merely CONTAINED "Alarm State Machine", so a healthy alarm job
    /// made the whole pipeline look healthy even with every CPLM job dead.
    ///
    /// This list must match what the launch paths actually submit
    /// (infra/docker/flink-job-supervisor.sh and scripts/ensure_flink_jobs.py —
    /// ten jobs). It listed seven, so the three "platform" jobs below ran happily
    /// and were reported under `unexpectedJobs` — the field whose entire purpose is
    /// to flag a rogue or duplicate submission. Three permanent false entries there
    /// train the reader to ignore it.
    ///
    /// Roles: "alarm" and "cplm" gate the alarmRunning/cplmRunning flags the UI
    /// keys on. "platform" jobs count toward allRequiredRunning (they ARE required
    /// — STR-07/STR-08 added them precisely because their .NET consumers sat idle
    /// forever with nothing producing to their topics) without being miscounted as
    /// part of either pipeline.
    /// </summary>
    private static readonly (string Name, string Role)[] RequiredJobs =
    {
        ("AMS - Alarm State Machine",         "alarm"),
        ("AMS - IoTDB Alarm Persistence",     "alarm"),
        ("AMS - Live State RBE",              "alarm"),
        ("AMS - CPLM Short Feature Engine",   "cplm"),
        ("AMS - CPLM Long Diagnostics Engine","cplm"),
        ("AMS - CPLM Gate Fusion Engine",     "cplm"),
        ("AMS - Loop Live RBE Engine",        "cplm"),
        ("AMS - Analysis Execution Engine",   "platform"),
        ("AMS - Alarm KPI Engine",            "platform"),
        ("AMS Alarm State Export Engine",     "platform")
    };

    /// <summary>
    /// How long a Flink /jobs/overview read is reused. Job states change on the
    /// order of a restart, not a request, so a few seconds costs no accuracy —
    /// and readiness is called per loop, so without this, clicking through the
    /// Explorer's loop tree issued one Flink REST call per click.
    /// </summary>
    private static readonly TimeSpan JobStateTtl = TimeSpan.FromSeconds(5);
    private const string JobStateCacheKey = "cplm:flink:job-states";

    private readonly NpgsqlDataSource _dataSource;
    private readonly IHttpClientFactory _httpFactory;
    private readonly IConfiguration _config;
    private readonly IMemoryCache _cache;
    private readonly ILogger<CpmReadinessController> _logger;

    private readonly Traverse.CplmApi.Data.FleetReadCache _fleetCache;
    private readonly TimeSpan _metricsTtl;

    public CpmReadinessController(
        [FromKeyedServices("cplm")] NpgsqlDataSource dataSource,
        IHttpClientFactory httpFactory,
        IConfiguration config,
        IMemoryCache cache,
        ILogger<CpmReadinessController> logger,
        Traverse.CplmApi.Data.FleetReadCache fleetCache)
    {
        _dataSource = dataSource;
        _httpFactory = httpFactory;
        _config = config;
        _cache = cache;
        _logger = logger;
        _fleetCache = fleetCache;
        // CHG-023: the Flink walk behind /pipeline-metrics is shared by every polling console
        // for this long (0 disables). collectedAt stays the time the walk actually ran.
        _metricsTtl = TimeSpan.FromSeconds(config.GetValue("Cpm:PipelineMetricsCacheSeconds", 10));
    }

    /// <summary>A6 — readiness checklist for one loop.</summary>
    [HttpGet("loops/{loopId}/readiness")]
    public async Task<IActionResult> GetReadiness(string loopId, CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var reg = await conn.QueryFirstOrDefaultAsync("""
            SELECT loop_id, display_name, site, loop_type, asset_id,
                   monitoring::text AS monitoring, tags::text AS tags
            FROM cpm.loop_registry WHERE lower(loop_id) = lower(@loopId)
            """, new { loopId });

        var checks = new List<object>();
        var blockers = new List<string>();
        var warnings = new List<string>();

        if (reg is null)
        {
            return Ok(new
            {
                loopId,
                ready = false,
                checks = new[]
                {
                    new { id = "registry_row", label = "Registered", ok = false,
                          message = "Onboard the loop: POST /api/v1/cpm/loops/activate" }
                },
                blockers = new[] { "Loop is not registered." },
                warnings = Array.Empty<string>()
            });
        }

        var monitoring = ParseJson((string?)reg.monitoring);
        var tags = ParseJson((string?)reg.tags);
        var enabled = monitoring.TryGetProperty("enabled", out var en) && en.ValueKind == JsonValueKind.True;

        void Check(string id, string label, bool ok, string? message, bool blocking, string? failText = null)
        {
            checks.Add(new { id, label, ok, message });
            if (ok) return;
            if (blocking) blockers.Add(failText ?? message ?? label);
            else warnings.Add(failText ?? message ?? label);
        }

        Check("registry_row", "Registered", true, null, true);
        Check("monitoring_enabled", "Monitoring enabled", enabled,
            enabled ? null : "Re-activate with enableMonitoring=true.", true,
            "Monitoring is disabled — CPLM evaluates nothing for this loop.");

        // loop_type drives the dynamics profile. UNKNOWN is accepted by the engine
        // but its geometry prior is 0.0, i.e. geometry-based diagnosis is off.
        var loopType = (string?)reg.loop_type ?? "UNKNOWN";
        Check("loop_type", $"Loop type ({loopType})", loopType != "UNKNOWN",
            loopType == "UNKNOWN" ? "Set a concrete loopType; UNKNOWN disables geometry diagnosis (prior 0.0)." : null,
            false, "loopType is UNKNOWN — geometry-based diagnosis is disabled.");

        foreach (var role in new[] { "pv", "sp", "op", "mode" })
        {
            var present = tags.ValueKind == JsonValueKind.Object
                && tags.TryGetProperty(role, out var t) && t.ValueKind == JsonValueKind.String
                && !string.IsNullOrWhiteSpace(t.GetString());
            Check($"tag_{role}", $"Signal {role.ToUpperInvariant()}", present,
                present ? null : $"Map the {role.ToUpperInvariant()} role at onboarding.", true,
                $"No {role.ToUpperInvariant()} mapping — the gate engine cannot evaluate this loop.");
        }

        var hasVp = tags.ValueKind == JsonValueKind.Object
            && tags.TryGetProperty("vp", out var vp) && vp.ValueKind == JsonValueKind.String
            && !string.IsNullOrWhiteSpace(vp.GetString());
        Check("tag_vp", "Signal VP (enables G14 confirmation)", hasVp,
            hasVp ? null : "Map a VP (valve position) signal to lift the confidence cap.", false,
            "No VP signal — G14 caps confidence at 0.89, so no diagnosis can reach CONFIRMED.");

        // Peer links: derived from the asset graph, not a hand-set flag.
        var linkCount = await conn.ExecuteScalarAsync<int>("""
            SELECT COUNT(*)::int FROM cpm.loop_link
            WHERE from_loop_id = @loopId OR (to_loop_id = @loopId AND rel_type = 'PEER')
            """, new { loopId = (string)reg.loop_id });
        Check("peer_links", "Peer / upstream links (G13)", linkCount > 0,
            linkCount > 0 ? null : "Add asset relationships, then POST /cpm/loops/{id}/republish-evidence.",
            false,
            "No peer links — G13 stays NOT_EVALUATED and stiction cannot be distinguished from an upstream disturbance.");

        // Binding provenance (Phase 4.7): a fallback binding derives a different
        // device id, so it can look resolved while pointing at nothing.
        var (provenanceOk, provenanceMsg) = await CheckBindingProvenanceAsync(tags, ct);
        Check("binding_provenance", "Signal bindings resolve via asset-model", provenanceOk,
            provenanceOk ? null : provenanceMsg, false,
            provenanceMsg ?? "Some signals resolve by path fallback, not the asset model.");

        // Evidence actually produced.
        var counts = await conn.QueryFirstOrDefaultAsync("""
            SELECT
              (SELECT COUNT(*)::int FROM analytics.cplm_short_feature_results WHERE lower(loop_id) = lower(@loopId)) AS shorts,
              (SELECT COUNT(*)::int FROM analytics.cplm_long_feature_results  WHERE lower(loop_id) = lower(@loopId)) AS longs,
              (SELECT COUNT(*)::int FROM analytics.cplm_gate_results          WHERE lower(loop_id) = lower(@loopId)
                 AND diagnosis IS DISTINCT FROM 'INSUFFICIENT_DATA') AS verdicts
            """, new { loopId = (string)reg.loop_id });

        Check("evidence_short", "Short features produced", (counts?.shorts ?? 0) > 0,
            (counts?.shorts ?? 0) > 0 ? null : "No samples have reached traverse.cpa.loop.samples.v1 for this loop yet.", false);
        Check("evidence_verdict", "Diagnosis produced", (counts?.verdicts ?? 0) > 0,
            (counts?.verdicts ?? 0) > 0 ? null
                : "Fusion needs a 12h/24h window; verdicts appear once the long job's timers pass the window end.",
            false);

        var jobs = await GetJobStatesAsync(ct);
        var cplmRunning = RequiredJobs.Where(j => j.Role == "cplm")
            .All(j => jobs.TryGetValue(j.Name, out var s) && s == "RUNNING");
        Check("cplm_jobs", "CPLM Flink jobs running", cplmRunning,
            cplmRunning ? null : "One or more CPLM jobs are not RUNNING — see /cpm/pipeline-status.", true,
            "CPLM Flink jobs are not all running — no new evidence is being produced.");

        return Ok(new
        {
            loopId = (string)reg.loop_id,
            displayName = (string?)reg.display_name,
            ready = blockers.Count == 0,
            // Degraded means: it will produce verdicts, but not the strongest ones.
            degraded = blockers.Count == 0 && warnings.Count > 0,
            checks,
            blockers = blockers.Distinct(),
            warnings = warnings.Distinct(),
            evidence = new { shortFeatures = counts?.shorts ?? 0, longFeatures = counts?.longs ?? 0, verdicts = counts?.verdicts ?? 0 }
        });
    }

    /// <summary>
    /// A7/A10 — pipeline status against the full required-job list, plus
    /// checkpoint health for the CPLM jobs (their state is what a restart loses).
    /// </summary>
    [HttpGet("pipeline-status")]
    public async Task<IActionResult> GetPipelineStatus(CancellationToken ct = default)
    {
        var states = await GetJobStatesAsync(ct);
        var reachable = states.Count > 0;

        var jobs = RequiredJobs.Select(j => new
        {
            name = j.Name,
            role = j.Role,
            state = states.TryGetValue(j.Name, out var s) ? s : "MISSING",
            running = states.TryGetValue(j.Name, out var s2) && s2 == "RUNNING"
        }).ToList();

        return Ok(new
        {
            jobManagerReachable = reachable,
            jobManagerUrl = FlinkBaseUrl(),
            allRequiredRunning = reachable && jobs.All(j => j.running),
            cplmRunning = reachable && jobs.Where(j => j.role == "cplm").All(j => j.running),
            alarmRunning = reachable && jobs.Where(j => j.role == "alarm").All(j => j.running),
            jobs,
            unexpectedJobs = states.Keys.Where(k => !RequiredJobs.Any(r => r.Name == k))
        });
    }

    /// <summary>
    /// A10/DG-1 — per-job runtime metrics proxied from the Flink REST API, so
    /// the browser never talks to Flink directly. Values that Flink does not
    /// expose cheaply (per-record watermark lag, events/s) are omitted rather
    /// than estimated — an omitted metric is honest, an estimated one lies.
    /// </summary>
    [HttpGet("pipeline-metrics")]
    public async Task<IActionResult> GetPipelineMetrics(CancellationToken ct = default)
    {
        // CHG-023: concurrent per-job walk (Services/FlinkPipelineMetricsCollector) behind
        // the single-flight cache, so N consoles polling every 20 s cost one walk per TTL.
        var (body, hit) = await _fleetCache.GetOrCreateAsync("pipeline-metrics", _metricsTtl, async token =>
        {
            var client = _httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            return await Traverse.CplmApi.Services.FlinkPipelineMetricsCollector.CollectAsync(
                client, FlinkBaseUrl(), RequiredJobs, _logger, token);
        }, ct);
        Response.Headers["X-Cpm-Cache"] = hit ? "HIT" : "MISS";
        return Ok(body);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private string FlinkBaseUrl() =>
        (_config["Flink:JobManagerUrl"] ?? "http://ams-flink-jobmanager:8081").TrimEnd('/');

    /// <summary>
    /// Job name → state, cached for <see cref="JobStateTtl"/>. A FAILED read is
    /// never cached: an empty dictionary means "JobManager unreachable", and
    /// caching that would keep reporting a dead pipeline for seconds after it
    /// came back (and vice versa).
    /// </summary>
    private async Task<Dictionary<string, string>> GetJobStatesAsync(CancellationToken ct)
    {
        if (_cache.TryGetValue(JobStateCacheKey, out Dictionary<string, string>? cached) && cached is not null)
            return cached;

        var states = await FetchJobStatesAsync(ct);
        if (states.Count > 0)
            _cache.Set(JobStateCacheKey, states, JobStateTtl);
        return states;
    }

    private async Task<Dictionary<string, string>> FetchJobStatesAsync(CancellationToken ct)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        try
        {
            var client = _httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            var res = await client.GetAsync($"{FlinkBaseUrl()}/jobs/overview", ct);
            if (!res.IsSuccessStatusCode) return result;

            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
            if (!doc.RootElement.TryGetProperty("jobs", out var jobs)) return result;
            foreach (var job in jobs.EnumerateArray())
            {
                var name = job.TryGetProperty("name", out var n) ? n.GetString() : null;
                var state = job.TryGetProperty("state", out var s) ? s.GetString() : null;
                if (name is null || state is null) continue;
                // A cancelled job may linger alongside its RUNNING replacement;
                // RUNNING must win, otherwise a healthy pipeline reports stopped.
                if (!result.TryGetValue(name, out var existing) || state == "RUNNING" || existing != "RUNNING")
                    result[name] = state;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not read Flink job overview");
        }
        return result;
    }

    /// <summary>
    /// Asks binding-resolver whether each mapped signal resolves through the asset
    /// model or by path fallback. Fallback bindings derive a different sparkplug
    /// device id, so "resolved" alone does not mean "points at real data".
    ///
    /// The five role probes run CONCURRENTLY. Sequentially they were up to five
    /// 5s timeouts in series, so on a degraded binding-resolver this single check
    /// took ~25s and the Explorer's Signals tab hung behind it. They are
    /// independent reads of the same service; there is no ordering to preserve.
    /// </summary>
    /// <summary>
    /// CHG-024: the mapped roles are probed in ONE POST /resolve/batch (was one GET per
    /// role) — see Services/BindingProvenanceProbe.cs for the contract and the tests.
    /// </summary>
    private async Task<(bool Ok, string? Message)> CheckBindingProvenanceAsync(JsonElement tags, CancellationToken ct)
    {
        var baseUrl = (_config["Services:BindingResolver"] ?? "http://binding-resolver:5000").TrimEnd('/');
        var client = _httpFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(5);
        // The caller reached this endpoint through the gateway, so these identity headers
        // are present and already authorized; the resolver requires them.
        var forward = Traverse.CplmApi.Services.BindingProvenanceProbe.ForwardedHeaders
            .ToDictionary(h => h, h => Request.Headers[h].ToString());
        return await Traverse.CplmApi.Services.BindingProvenanceProbe.CheckAsync(client, baseUrl, tags, forward, _logger, ct);
    }

    private static JsonElement ParseJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return default;
        try { return JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { return default; }
    }
}
