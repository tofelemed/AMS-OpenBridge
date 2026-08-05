using System.Net.Http.Headers;
using System.Text.Json;
using Dapper;
using Microsoft.Extensions.Options;

namespace AMS.Api.Services;

/// <summary>
/// CPLM Phase 5 (A8) — on-demand recompute of a loop's gates over historical
/// samples, via CplmHistoricalReplayJob.
///
/// Why this exists: the streaming pipeline only emits a verdict when the long
/// job's event-time timers pass a full 12h/24h window, which takes tens of
/// minutes of wall-clock after a backfill. The replay job runs in BATCH mode
/// over a bounded slice of loop.samples.v1 and produces the same fused result in
/// seconds. That is the difference between an evidence system you can
/// interrogate and one you have to wait on.
///
/// Submission mechanism: the existing FlinkRestClient path (GET /jars then
/// POST /jars/{id}/run) can NEVER work here, because the jar is bind-mounted
/// into the cluster rather than uploaded — /jars is always empty. This service
/// uploads the jar it has mounted read-only, caches the resulting jar id, and
/// then uses the REST run endpoint. No Docker socket required.
/// </summary>
public interface ICplmRecomputeService
{
    Task<CplmRecomputeHandle> StartAsync(string loopId, CancellationToken ct);
    Task<CplmRecomputeHandle> StartAsync(
        string loopId, bool hasStepTest, bool hasPeerLinks, long windowOffsetMs, CancellationToken ct);
    Task<CplmRecomputeStatus> GetStatusAsync(string replayId, string jobId, CancellationToken ct);
    /// <summary>Window-boundary offset that aligns the 24h window to this loop's data.</summary>
    Task<long> GetWindowOffsetMsAsync(string loopId, CancellationToken ct);
}

public sealed record CplmRecomputeHandle(string ReplayId, string JobId, string LoopId);

public sealed record CplmRecomputeStatus(
    string ReplayId, string JobId, string State, bool Finished, bool Succeeded, int GateResults);

public sealed class CplmRecomputeService : ICplmRecomputeService
{
    private const string EntryClass = "com.ams.flink.cplm.CplmHistoricalReplayJob";

    private readonly IHttpClientFactory _httpFactory;
    private readonly Npgsql.NpgsqlDataSource _dataSource;
    private readonly IConfiguration _config;
    private readonly CplmRecomputeOptions _options;
    private readonly ILogger<CplmRecomputeService> _logger;
    private readonly SemaphoreSlim _uploadLock = new(1, 1);
    private string? _cachedJarId;

    public CplmRecomputeService(
        IHttpClientFactory httpFactory,
        Npgsql.NpgsqlDataSource dataSource,
        IConfiguration config,
        IOptions<CplmRecomputeOptions> options,
        ILogger<CplmRecomputeService> logger)
    {
        _httpFactory = httpFactory;
        _dataSource = dataSource;
        _config = config;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<CplmRecomputeHandle> StartAsync(string loopId, CancellationToken ct)
        => await StartAsync(loopId, false, false, 0L, ct);

    /// <summary>
    /// <paramref name="windowOffsetMs"/> shifts the 24h tumbling boundary onto the
    /// replayed data's own start. Without it an epoch-aligned window splits a
    /// noon-to-noon slice into two half-full windows, both of which fail G0
    /// completeness and return INSUFFICIENT_DATA.
    /// </summary>
    public async Task<CplmRecomputeHandle> StartAsync(
        string loopId, bool hasStepTest, bool hasPeerLinks, long windowOffsetMs, CancellationToken ct)
    {
        var replayId = Guid.NewGuid().ToString("N")[..12];
        var jarId = await EnsureJarUploadedAsync(ct);

        // The job is bounded (earliest -> latest at submit time) and parallelism 1,
        // so it terminates on its own. Its output carries replay_id and
        // calculation_source=flink-historical-replay, which keeps recomputed rows
        // distinguishable from streaming ones in analytics.cplm_gate_results
        // (source is part of the upsert key, so they never overwrite each other).
        var args = string.Join(' ',
            "--input-topic", _options.SamplesTopic,
            "--output-topic", _options.GateResultsTopic,
            "--brokers", _options.BootstrapServers,
            "--loop-id", loopId,
            "--replay-id", replayId,
            // Registry evidence: a BATCH job does not consume the metadata
            // broadcast, so G12/G13 inputs must be passed explicitly or a
            // recomputed window can never evaluate them.
            "--has-step-test", hasStepTest ? "true" : "false",
            "--has-peer-links", hasPeerLinks ? "true" : "false",
            "--window-offset-ms", windowOffsetMs.ToString());

        var client = CreateClient();
        var response = await client.PostAsJsonAsync($"/jars/{jarId}/run",
            new { entryClass = EntryClass, programArgs = args, parallelism = 1 }, ct);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            // A stale cached jar id (cluster restarted, uploads cleared) is the
            // most likely cause; drop it so the next attempt re-uploads.
            _cachedJarId = null;
            throw new InvalidOperationException(
                $"Flink rejected the recompute submission ({(int)response.StatusCode}): {Trim(body)}");
        }

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var jobId = doc.RootElement.TryGetProperty("jobid", out var j) ? j.GetString() : null;
        if (string.IsNullOrWhiteSpace(jobId))
            throw new InvalidOperationException("Flink accepted the run but returned no jobid.");

        _logger.LogInformation("CPLM recompute started for {LoopId}: replayId={ReplayId} jobId={JobId}",
            loopId, replayId, jobId);
        return new CplmRecomputeHandle(replayId, jobId, loopId);
    }

    public async Task<CplmRecomputeStatus> GetStatusAsync(string replayId, string jobId, CancellationToken ct)
    {
        var client = CreateClient();
        var state = "UNKNOWN";
        try
        {
            var res = await client.GetAsync($"/jobs/{jobId}", ct);
            if (res.IsSuccessStatusCode)
            {
                using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
                state = doc.RootElement.TryGetProperty("state", out var s) ? s.GetString() ?? "UNKNOWN" : "UNKNOWN";
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not read recompute job {JobId}", jobId);
        }

        var finished = state is "FINISHED" or "FAILED" or "CANCELED";
        return new CplmRecomputeStatus(replayId, jobId, state, finished, state == "FINISHED", 0);
    }

    /// <summary>
    /// Derives the 24h window offset from where this loop's data actually starts,
    /// so one tumbling window covers the replayed slice instead of splitting it.
    ///
    /// The 1-minute short windows are used because they are tumbling and therefore
    /// track the data start to the minute. The long job's 24h window_start is NOT
    /// usable for this: it is derived from an event-time timer minus 24h, so it
    /// sits a full day before the data and produced a useless offset.
    /// Falls back to 0 (epoch-aligned) when the loop has no short-window history.
    /// </summary>
    public async Task<long> GetWindowOffsetMsAsync(string loopId, CancellationToken ct)
    {
        try
        {
            await using var conn = await _dataSource.OpenConnectionAsync(ct);
            var start = await conn.ExecuteScalarAsync<DateTime?>("""
                SELECT MIN(window_start) FROM analytics.cplm_short_feature_results
                WHERE lower(loop_id) = lower(@loopId) AND window_kind = '1m'
                """, new { loopId });
            if (start is null) return 0L;
            var ms = new DateTimeOffset(DateTime.SpecifyKind(start.Value, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
            // TumblingEventTimeWindows requires 0 <= offset < windowSize.
            const long day = 24L * 60 * 60 * 1000;
            return ((ms % day) + day) % day;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not derive window offset for {LoopId}; using epoch alignment", loopId);
            return 0L;
        }
    }

    /// <summary>
    /// Uploads the mounted jar to the JobManager once per process (or after a
    /// cluster restart clears uploads) and caches its id.
    /// </summary>
    private async Task<string> EnsureJarUploadedAsync(CancellationToken ct)
    {
        if (_cachedJarId is not null) return _cachedJarId;
        await _uploadLock.WaitAsync(ct);
        try
        {
            if (_cachedJarId is not null) return _cachedJarId;
            var client = CreateClient();

            if (!File.Exists(_options.JarPath))
                throw new InvalidOperationException(
                    $"Recompute needs the Flink jar mounted at {_options.JarPath}. " +
                    "Add the bind mount to the ams-api service (see docker-compose.yml).");

            // Stamp the upload with the local jar's build time. Reusing whatever
            // "ams-flink" jar happened to be on the cluster silently pins recompute
            // to a stale build: an older jar simply ignores newly added arguments,
            // so the job succeeds while doing the wrong thing — which is exactly
            // how the window-offset fix appeared not to work.
            var stamp = File.GetLastWriteTimeUtc(_options.JarPath).ToString("yyyyMMddHHmmss");
            var expectedName = $"ams-flink-{stamp}.jar";

            try
            {
                var list = await client.GetAsync("/jars", ct);
                if (list.IsSuccessStatusCode)
                {
                    using var doc = JsonDocument.Parse(await list.Content.ReadAsStringAsync(ct));
                    if (doc.RootElement.TryGetProperty("files", out var files))
                    {
                        foreach (var f in files.EnumerateArray())
                        {
                            var name = f.TryGetProperty("name", out var n) ? n.GetString() : null;
                            var id = f.TryGetProperty("id", out var i) ? i.GetString() : null;
                            if (id is not null && string.Equals(name, expectedName, StringComparison.OrdinalIgnoreCase))
                            {
                                _logger.LogInformation("Reusing uploaded Flink jar {Name}", expectedName);
                                return _cachedJarId = id;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Could not list Flink jars; will upload");
            }

            using var content = new MultipartFormDataContent();
            await using var stream = File.OpenRead(_options.JarPath);
            var file = new StreamContent(stream);
            file.Headers.ContentType = new MediaTypeHeaderValue("application/x-java-archive");
            content.Add(file, "jarfile", expectedName);

            var upload = await client.PostAsync("/jars/upload", content, ct);
            upload.EnsureSuccessStatusCode();
            using var uploadDoc = JsonDocument.Parse(await upload.Content.ReadAsStringAsync(ct));
            // filename comes back as a full path; the id is its last segment.
            var filename = uploadDoc.RootElement.TryGetProperty("filename", out var fn) ? fn.GetString() : null;
            var jarId = filename?.Split('/').LastOrDefault();
            if (string.IsNullOrWhiteSpace(jarId))
                throw new InvalidOperationException("Flink accepted the jar upload but returned no filename.");

            _logger.LogInformation("Uploaded Flink jar for recompute: {JarId}", jarId);
            return _cachedJarId = jarId;
        }
        finally
        {
            _uploadLock.Release();
        }
    }

    private HttpClient CreateClient()
    {
        var client = _httpFactory.CreateClient();
        client.BaseAddress = new Uri(
            (_config["Flink:JobManagerUrl"] ?? "http://ams-flink-jobmanager:8081").TrimEnd('/') + "/");
        client.Timeout = TimeSpan.FromMinutes(2); // jar upload is ~40 MB
        return client;
    }

    private static string Trim(string s) => s.Length <= 400 ? s : s[..400] + "…";
}

public sealed class CplmRecomputeOptions
{
    public const string SectionName = "CplmRecompute";
    /// <summary>Path to the Flink jar inside the ams-api container (bind-mounted).</summary>
    public string JarPath { get; set; } = "/opt/ams/flink/ams-flink.jar";
    public string SamplesTopic { get; set; } = "loop.samples.v1";
    public string GateResultsTopic { get; set; } = "clpm.gate.results.v1";
    public string BootstrapServers { get; set; } = "kafka:9092";
}
