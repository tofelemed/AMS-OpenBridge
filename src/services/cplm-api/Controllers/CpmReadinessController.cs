// Extraction Phase 3 COPY of AMS.Api Controllers/V1/CpmReadinessController.cs — mechanical transforms only
// (namespace, literal v1 routes, no Asp.Versioning). The AMS.Api original keeps
// serving until Phase 6 deletes it; behavior changes are forbidden in either copy.
using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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
    /// </summary>
    private static readonly (string Name, string Role)[] RequiredJobs =
    {
        ("AMS - Alarm State Machine",         "alarm"),
        ("AMS - IoTDB Alarm Persistence",     "alarm"),
        ("AMS - Live State RBE",              "alarm"),
        ("AMS - CPLM Short Feature Engine",   "cplm"),
        ("AMS - CPLM Long Diagnostics Engine","cplm"),
        ("AMS - CPLM Gate Fusion Engine",     "cplm"),
        ("AMS - Loop Live RBE Engine",        "cplm")
    };

    private readonly NpgsqlDataSource _dataSource;
    private readonly IHttpClientFactory _httpFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<CpmReadinessController> _logger;

    public CpmReadinessController(
        [FromKeyedServices("cplm")] NpgsqlDataSource dataSource,
        IHttpClientFactory httpFactory,
        IConfiguration config,
        ILogger<CpmReadinessController> logger)
    {
        _dataSource = dataSource;
        _httpFactory = httpFactory;
        _config = config;
        _logger = logger;
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
            (counts?.shorts ?? 0) > 0 ? null : "No samples have reached loop.samples.v1 for this loop yet.", false);
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
        var client = _httpFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);
        var baseUrl = FlinkBaseUrl();

        var jobs = new List<object>();
        var reachable = false;
        try
        {
            var overviewRes = await client.GetAsync($"{baseUrl}/jobs/overview", ct);
            if (overviewRes.IsSuccessStatusCode)
            {
                reachable = true;
                using var overview = JsonDocument.Parse(await overviewRes.Content.ReadAsStringAsync(ct));
                // Flink's overview keeps terminal jobs (CANCELED/FINISHED/FAILED)
                // in the list. Reporting them alongside the live one made the
                // Pipeline Health screen show phantom duplicates of every job and
                // made a real duplicate (two RUNNING copies sharing a consumer
                // group) impossible to spot. Keep the RUNNING instance per name,
                // falling back to the newest terminal one when nothing is running
                // so a dead required job still shows up rather than vanishing.
                var byName = new Dictionary<string, JsonElement>();
                foreach (var job in overview.RootElement.GetProperty("jobs").EnumerateArray())
                {
                    var jn = job.TryGetProperty("name", out var nn) ? nn.GetString() : null;
                    if (jn is null || !RequiredJobs.Any(r => r.Name == jn)) continue;
                    var jstate = job.TryGetProperty("state", out var js) ? js.GetString() : null;
                    if (!byName.TryGetValue(jn, out var kept))
                    {
                        byName[jn] = job;
                        continue;
                    }
                    var keptState = kept.TryGetProperty("state", out var ks) ? ks.GetString() : null;
                    var keptStart = kept.TryGetProperty("start-time", out var kst) ? kst.GetInt64() : 0;
                    var thisStart = job.TryGetProperty("start-time", out var tst) ? tst.GetInt64() : 0;
                    var preferThis = (jstate == "RUNNING" && keptState != "RUNNING")
                                     || (jstate == keptState && thisStart > keptStart)
                                     || (keptState != "RUNNING" && jstate != "RUNNING" && thisStart > keptStart);
                    if (preferThis) byName[jn] = job;
                }

                foreach (var job in byName.Values)
                {
                    var name = job.TryGetProperty("name", out var n) ? n.GetString() : null;
                    var jid = job.TryGetProperty("jid", out var j) ? j.GetString() : null;
                    if (name is null || jid is null) continue;

                    long startTime = job.TryGetProperty("start-time", out var st) ? st.GetInt64() : 0;
                    var state = job.TryGetProperty("state", out var s) ? s.GetString() : "UNKNOWN";

                    // Checkpoint statistics per job (restore/loss risk indicator).
                    object? checkpoint = null;
                    try
                    {
                        var cpRes = await client.GetAsync($"{baseUrl}/jobs/{jid}/checkpoints", ct);
                        if (cpRes.IsSuccessStatusCode)
                        {
                            using var cp = JsonDocument.Parse(await cpRes.Content.ReadAsStringAsync(ct));
                            var counts = cp.RootElement.GetProperty("counts");
                            var latest = cp.RootElement.TryGetProperty("latest", out var l)
                                && l.TryGetProperty("completed", out var comp)
                                && comp.ValueKind == JsonValueKind.Object ? comp : (JsonElement?)null;
                            checkpoint = new
                            {
                                completed = counts.TryGetProperty("completed", out var c1) ? c1.GetInt32() : 0,
                                failed = counts.TryGetProperty("failed", out var c2) ? c2.GetInt32() : 0,
                                lastDurationMs = latest?.TryGetProperty("end_to_end_duration", out var d) == true ? d.GetInt64() : (long?)null,
                                lastSizeBytes = latest?.TryGetProperty("state_size", out var sz) == true ? sz.GetInt64() : (long?)null,
                                lastCompletedAgeSec = latest?.TryGetProperty("latest_ack_timestamp", out var ts) == true && ts.GetInt64() > 0
                                    ? (long?)Math.Max(0, (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - ts.GetInt64()) / 1000)
                                    : null
                            };
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Checkpoint stats unavailable for {Job}", name);
                    }

                    // P1-6 — late-dropped record counts per window operator.
                    // Windowed jobs discard records that arrive behind the
                    // watermark, with no side output and no log line. Flink has
                    // been counting them all along; nothing surfaced it, so a
                    // backfill that vanished entirely looked like a healthy run.
                    // This is the only signal that distinguishes "no data" from
                    // "your data arrived too late to be windowed".
                    long? lateDropped = null;
                    try
                    {
                        var vertRes = await client.GetAsync($"{baseUrl}/jobs/{jid}", ct);
                        if (vertRes.IsSuccessStatusCode)
                        {
                            using var vj = JsonDocument.Parse(await vertRes.Content.ReadAsStringAsync(ct));
                            if (vj.RootElement.TryGetProperty("vertices", out var verts))
                            {
                                foreach (var v in verts.EnumerateArray())
                                {
                                    var vname = v.TryGetProperty("name", out var vn) ? vn.GetString() ?? "" : "";
                                    var vid = v.TryGetProperty("id", out var vi) ? vi.GetString() : null;
                                    if (vid is null || !vname.Contains("window", StringComparison.OrdinalIgnoreCase)) continue;
                                    var metric = $"0.{vname.Split(" ->")[0]}.numLateRecordsDropped";
                                    var mRes = await client.GetAsync(
                                        $"{baseUrl}/jobs/{jid}/vertices/{vid}/metrics?get={Uri.EscapeDataString(metric)}", ct);
                                    if (!mRes.IsSuccessStatusCode) continue;
                                    using var md = JsonDocument.Parse(await mRes.Content.ReadAsStringAsync(ct));
                                    foreach (var m in md.RootElement.EnumerateArray())
                                    {
                                        if (m.TryGetProperty("value", out var mv)
                                            && long.TryParse(mv.GetString(), out var lv))
                                        {
                                            lateDropped = Math.Max(lateDropped ?? 0, lv);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Late-record metrics unavailable for {Job}", name);
                    }

                    jobs.Add(new
                    {
                        name,
                        jid,
                        state,
                        role = RequiredJobs.First(r => r.Name == name).Role,
                        startTime = startTime > 0 ? DateTimeOffset.FromUnixTimeMilliseconds(startTime).UtcDateTime : (DateTime?)null,
                        uptimeSec = startTime > 0 ? (long?)Math.Max(0, (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - startTime) / 1000) : null,
                        checkpoint,
                        // Max across this job's window operators (each counts the
                        // same record independently, so a sum would multiply it).
                        lateRecordsDropped = lateDropped
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not read Flink metrics");
        }

        return Ok(new
        {
            jobManagerReachable = reachable,
            collectedAt = DateTime.UtcNow,
            jobs,
            // Explicit about what is NOT here, so the UI renders honest gaps.
            unavailable = new[] { "watermarkLagMs", "eventsPerSecond", "backpressure" }
        });
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private string FlinkBaseUrl() =>
        (_config["Flink:JobManagerUrl"] ?? "http://ams-flink-jobmanager:8081").TrimEnd('/');

    private async Task<Dictionary<string, string>> GetJobStatesAsync(CancellationToken ct)
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
    /// </summary>
    private async Task<(bool Ok, string? Message)> CheckBindingProvenanceAsync(JsonElement tags, CancellationToken ct)
    {
        if (tags.ValueKind != JsonValueKind.Object) return (false, "No signal mappings to check.");
        var baseUrl = (_config["Services:BindingResolver"] ?? "http://binding-resolver:5000").TrimEnd('/');
        var fallbacks = new List<string>();

        foreach (var role in new[] { "pv", "sp", "op", "vp", "mode" })
        {
            if (!tags.TryGetProperty(role, out var t) || t.ValueKind != JsonValueKind.String) continue;
            var path = t.GetString();
            if (string.IsNullOrWhiteSpace(path)) continue;
            try
            {
                var client = _httpFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(5);
                var res = await client.GetAsync($"{baseUrl}/resolve?path={Uri.EscapeDataString(path)}&roles=live", ct);
                if (!res.IsSuccessStatusCode) { fallbacks.Add($"{role} (unreachable)"); continue; }
                using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
                var provenance = doc.RootElement.TryGetProperty("provenance", out var p) ? p.GetString() : null;
                if (!string.Equals(provenance, "asset-model", StringComparison.OrdinalIgnoreCase))
                    fallbacks.Add(role);
            }
            catch
            {
                fallbacks.Add($"{role} (unreachable)");
            }
        }

        return fallbacks.Count == 0
            ? (true, null)
            : (false, $"Resolved by path fallback, not the asset model: {string.Join(", ", fallbacks)}. " +
                      "Register these signals as assets — a fallback binding derives a different device id and may point at nothing.");
    }

    private static JsonElement ParseJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return default;
        try { return JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { return default; }
    }
}
