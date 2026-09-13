using System.Text.Json;

namespace Traverse.CplmApi.Services;

/// <summary>
/// CHG-023 — GET /pipeline-metrics: per-job runtime metrics proxied from the Flink REST
/// API so the browser never talks to Flink directly. Values Flink does not expose cheaply
/// (per-record watermark lag, events/s) are omitted rather than estimated.
///
/// The walk used to be serial — overview, then per job the checkpoints, the job detail and
/// one metrics call per window vertex, each awaited in turn (1 + J×(2 + V) round trips,
/// 8.7 s cold on the lab). The jobs are independent reads of one JobManager, so they now
/// run concurrently, and inside a job the checkpoint read overlaps the vertex walk.
/// </summary>
public static class FlinkPipelineMetricsCollector
{
    public static async Task<object> CollectAsync(
        HttpClient client, string baseUrl, IReadOnlyList<(string Name, string Role)> requiredJobs,
        ILogger logger, CancellationToken ct)
    {
        var jobs = new List<object>();
        var reachable = false;
        try
        {
            var overviewRes = await client.GetAsync($"{baseUrl}/jobs/overview", ct);
            if (overviewRes.IsSuccessStatusCode)
            {
                reachable = true;
                using var overview = JsonDocument.Parse(await overviewRes.Content.ReadAsStringAsync(ct));
                var live = PickLiveInstancePerName(overview.RootElement, requiredJobs);
                var collected = await Task.WhenAll(live.Select(job => CollectJobAsync(client, baseUrl, job, requiredJobs, logger, ct)));
                jobs.AddRange(collected.Where(j => j is not null)!);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not read Flink metrics");
        }

        return new
        {
            jobManagerReachable = reachable,
            collectedAt = DateTime.UtcNow,
            jobs,
            // Explicit about what is NOT here, so the UI renders honest gaps.
            unavailable = new[] { "watermarkLagMs", "eventsPerSecond", "backpressure" }
        };
    }

    /// <summary>
    /// Flink's overview keeps terminal jobs (CANCELED/FINISHED/FAILED) in the list.
    /// Reporting them alongside the live one made the Pipeline Health screen show phantom
    /// duplicates of every job and made a real duplicate (two RUNNING copies sharing a
    /// consumer group) impossible to spot. Keep the RUNNING instance per name, falling
    /// back to the newest terminal one when nothing is running so a dead required job
    /// still shows up rather than vanishing.
    /// </summary>
    private static List<JsonElement> PickLiveInstancePerName(JsonElement overview, IReadOnlyList<(string Name, string Role)> requiredJobs)
    {
        var byName = new Dictionary<string, JsonElement>();
        foreach (var job in overview.GetProperty("jobs").EnumerateArray())
        {
            var jn = job.TryGetProperty("name", out var nn) ? nn.GetString() : null;
            if (jn is null || !requiredJobs.Any(r => r.Name == jn)) continue;
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
        return byName.Values.ToList();
    }

    private static async Task<object?> CollectJobAsync(
        HttpClient client, string baseUrl, JsonElement job,
        IReadOnlyList<(string Name, string Role)> requiredJobs, ILogger logger, CancellationToken ct)
    {
        var name = job.TryGetProperty("name", out var n) ? n.GetString() : null;
        var jid = job.TryGetProperty("jid", out var j) ? j.GetString() : null;
        if (name is null || jid is null) return null;
        long startTime = job.TryGetProperty("start-time", out var st) ? st.GetInt64() : 0;
        var state = job.TryGetProperty("state", out var s) ? s.GetString() : "UNKNOWN";

        var checkpointTask = ReadCheckpointAsync(client, baseUrl, jid, name, logger, ct);
        var lateTask = ReadLateDroppedAsync(client, baseUrl, jid, name, logger, ct);
        await Task.WhenAll(checkpointTask, lateTask);

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return new
        {
            name,
            jid,
            state,
            role = requiredJobs.First(r => r.Name == name).Role,
            startTime = startTime > 0 ? DateTimeOffset.FromUnixTimeMilliseconds(startTime).UtcDateTime : (DateTime?)null,
            uptimeSec = startTime > 0 ? (long?)Math.Max(0, (nowMs - startTime) / 1000) : null,
            checkpoint = checkpointTask.Result,
            // Max across this job's window operators (each counts the same record
            // independently, so a sum would multiply it).
            lateRecordsDropped = lateTask.Result
        };
    }

    /// <summary>Checkpoint statistics per job (restore/loss risk indicator).</summary>
    private static async Task<object?> ReadCheckpointAsync(
        HttpClient client, string baseUrl, string jid, string name, ILogger logger, CancellationToken ct)
    {
        try
        {
            var cpRes = await client.GetAsync($"{baseUrl}/jobs/{jid}/checkpoints", ct);
            if (!cpRes.IsSuccessStatusCode) return null;
            using var cp = JsonDocument.Parse(await cpRes.Content.ReadAsStringAsync(ct));
            var counts = cp.RootElement.GetProperty("counts");
            var latest = cp.RootElement.TryGetProperty("latest", out var l)
                && l.TryGetProperty("completed", out var comp)
                && comp.ValueKind == JsonValueKind.Object ? comp : (JsonElement?)null;
            return new
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
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Checkpoint stats unavailable for {Job}", name);
            return null;
        }
    }

    /// <summary>
    /// P1-6 — late-dropped record counts per window operator. Windowed jobs discard records
    /// that arrive behind the watermark, with no side output and no log line. Flink has
    /// been counting them all along; nothing surfaced it, so a backfill that vanished
    /// entirely looked like a healthy run. This is the only signal that distinguishes
    /// "no data" from "your data arrived too late to be windowed".
    /// </summary>
    private static async Task<long?> ReadLateDroppedAsync(
        HttpClient client, string baseUrl, string jid, string name, ILogger logger, CancellationToken ct)
    {
        try
        {
            var vertRes = await client.GetAsync($"{baseUrl}/jobs/{jid}", ct);
            if (!vertRes.IsSuccessStatusCode) return null;
            using var vj = JsonDocument.Parse(await vertRes.Content.ReadAsStringAsync(ct));
            if (!vj.RootElement.TryGetProperty("vertices", out var verts)) return null;

            var reads = new List<Task<long?>>();
            foreach (var v in verts.EnumerateArray())
            {
                var vname = v.TryGetProperty("name", out var vn) ? vn.GetString() ?? "" : "";
                var vid = v.TryGetProperty("id", out var vi) ? vi.GetString() : null;
                if (vid is null || !vname.Contains("window", StringComparison.OrdinalIgnoreCase)) continue;
                var metric = $"0.{vname.Split(" ->")[0]}.numLateRecordsDropped";
                reads.Add(ReadVertexMetricAsync(client, $"{baseUrl}/jobs/{jid}/vertices/{vid}/metrics?get={Uri.EscapeDataString(metric)}", ct));
            }
            long? lateDropped = null;
            foreach (var value in await Task.WhenAll(reads))
                if (value is { } lv) lateDropped = Math.Max(lateDropped ?? 0, lv);
            return lateDropped;
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Late-record metrics unavailable for {Job}", name);
            return null;
        }
    }

    private static async Task<long?> ReadVertexMetricAsync(HttpClient client, string url, CancellationToken ct)
    {
        var mRes = await client.GetAsync(url, ct);
        if (!mRes.IsSuccessStatusCode) return null;
        using var md = JsonDocument.Parse(await mRes.Content.ReadAsStringAsync(ct));
        long? max = null;
        foreach (var m in md.RootElement.EnumerateArray())
            if (m.TryGetProperty("value", out var mv) && long.TryParse(mv.GetString(), out var lv))
                max = Math.Max(max ?? 0, lv);
        return max;
    }
}
