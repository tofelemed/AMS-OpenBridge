// Extraction Phase 3 COPY of AMS.Api Services/CplmRecomputeService.cs — mechanical transforms only
// (namespace, literal v1 routes, no Asp.Versioning). The AMS.Api original keeps
// serving until Phase 6 deletes it; behavior changes are forbidden in either copy.
using System.Net.Http.Headers;
using System.Text.Json;
using Dapper;
using Microsoft.Extensions.Options;

namespace Traverse.CplmApi.Services;

/// <summary>
/// CPLM Phase 5 (A8) — on-demand recompute of a loop's gates over historical
/// samples, via CplmHistoricalReplayJob.
///
/// Why this exists: the streaming pipeline only emits a verdict when the long
/// job's event-time timers pass a full 12h/24h window, which takes tens of
/// minutes of wall-clock after a backfill. The replay job runs in BATCH mode
/// over a bounded slice of traverse.cpa.loop.samples.v1 and produces the same fused result in
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
    /// <summary>v2.5 (1G.4): start a bounded run under an analysis-run identity (REPLAY | SHADOW | EVIDENCE_RECONSTRUCTION).</summary>
    Task<CplmRecomputeHandle> StartAsync(
        string loopId, bool hasStepTest, bool hasPeerLinks, long windowOffsetMs, string purpose,
        string? createdBy, string? idempotencyKey, CancellationToken ct);
    Task<AnalysisRunView?> GetAnalysisRunAsync(Guid analysisRunId, CancellationToken ct);
    /// <summary>v2.5 (1G.4, NR-056): as above, with the support read from the historian over a bounded range.</summary>
    Task<CplmRecomputeHandle> StartAsync(
        string loopId, bool hasStepTest, bool hasPeerLinks, long windowOffsetMs, string purpose,
        string? createdBy, string? idempotencyKey, ReplaySupport support, CancellationToken ct);
    Task<CplmRecomputeHandle> StartAsync(
        string loopId, bool hasStepTest, bool hasPeerLinks, long windowOffsetMs, CancellationToken ct);
    /// <summary>v2.5 (2C.2, NR-057): rebuild ONE method run's evidence over exactly its support; no result row is written.</summary>
    Task<CplmRecomputeHandle> StartReconstructionAsync(
        string loopId, ReconstructionTarget target, ReplaySupport support, string? createdBy, string? idempotencyKey, CancellationToken ct);
    Task<CplmRecomputeStatus> GetStatusAsync(string replayId, string jobId, CancellationToken ct);
    /// <summary>v2.5 (3B.3): a SHADOW run under a draft bundle's resolved properties - no operational output, isolated by purpose.</summary>
    Task<CplmRecomputeHandle> StartShadowAsync(string loopId, string bundleHash, string resolvedPropertiesJson, long windowOffsetMs, string? createdBy, ReplaySupport support, CancellationToken ct);
    /// <summary>Window-boundary offset that aligns the 24h window to this loop's data.</summary>
    Task<long> GetWindowOffsetMsAsync(string loopId, CancellationToken ct);
}

public sealed record CplmRecomputeHandle(string ReplayId, string JobId, string LoopId, Guid AnalysisRunId, string Purpose);

/// <summary>v2.5 (2C.2): the method run an EVIDENCE_RECONSTRUCTION rebuilds - its gate and window kind; the support is the ReplaySupport.</summary>
public sealed record ReconstructionTarget(Guid MethodRunId, string Gate, string WindowKind);

/// <summary>
/// v2.5 (1G.4): where a bounded run reads its support. KAFKA = the samples topic from its
/// earliest retained offset (the pre-v2.5 behaviour); IOTDB = the historian series
/// root.&lt;site&gt;.cpm.&lt;loop&gt; between FromMs and ToMs (quality is an explicit, flagged assumption).
/// </summary>
public sealed record ReplaySupport(string Source, long FromMs, long ToMs, string? Site, string? LoopType)
{
    public static ReplaySupport Kafka() => new("kafka", 0, 0, null, null);
}

/// <summary>v2.5 (1G.4): the analysis_run row plus the rows it has written so far (2C.2: and the evidence manifests a reconstruction produced).</summary>
public sealed record AnalysisRunView(
    Guid AnalysisRunId, string LoopId, string Purpose, string State, string? FlinkJobId, string? CreatedBy,
    DateTime CreatedAt, DateTime? FinishedAt, string? Error, int GateResults, string? JobState,
    Guid? Reconstructs = null, int EvidenceManifests = 0, int EvidenceComplete = 0, int EvidenceAttached = 0)
{
    /// <summary>
    /// ATTACHED: COMPLETE evidence exists under the requested run id (this run's, or an identical earlier emission's).
    /// IDENTITY_MISMATCH_CONFIGURATION_CHANGED: this run produced manifests under a different identity - the registry's
    /// configuration changed since the original run. NO_EVIDENCE_YET: nothing landed (yet).
    /// </summary>
    public string? ReconstructionOutcome => Reconstructs is null ? null
        : EvidenceAttached > 0 ? "ATTACHED"
        : EvidenceManifests > 0 ? "IDENTITY_MISMATCH_CONFIGURATION_CHANGED"
        : "NO_EVIDENCE_YET";
}

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
    private readonly AnalysisRunStore _runs;
    private readonly SemaphoreSlim _uploadLock = new(1, 1);
    private string? _cachedJarId;

    public CplmRecomputeService(
        IHttpClientFactory httpFactory,
        [Microsoft.Extensions.DependencyInjection.FromKeyedServices("cplm")] Npgsql.NpgsqlDataSource dataSource,
        IConfiguration config,
        IOptions<CplmRecomputeOptions> options,
        ILogger<CplmRecomputeService> logger)
    {
        _httpFactory = httpFactory;
        _dataSource = dataSource;
        _config = config;
        _options = options.Value;
        _logger = logger;
        _runs = new AnalysisRunStore(dataSource, logger);
    }

    public async Task<CplmRecomputeHandle> StartAsync(string loopId, CancellationToken ct)
        => await StartAsync(loopId, false, false, 0L, ct);

    /// <summary>
    /// <paramref name="windowOffsetMs"/> shifts the 24h tumbling boundary onto the
    /// replayed data's own start. Without it an epoch-aligned window splits a
    /// noon-to-noon slice into two half-full windows, both of which fail G0
    /// completeness and return INSUFFICIENT_DATA.
    /// </summary>
    public Task<CplmRecomputeHandle> StartAsync(
        string loopId, bool hasStepTest, bool hasPeerLinks, long windowOffsetMs, CancellationToken ct)
        => StartAsync(loopId, hasStepTest, hasPeerLinks, windowOffsetMs, "REPLAY", null, null, ct);

    public Task<CplmRecomputeHandle> StartAsync(
        string loopId, bool hasStepTest, bool hasPeerLinks, long windowOffsetMs, string purpose,
        string? createdBy, string? idempotencyKey, CancellationToken ct)
        => StartAsync(loopId, hasStepTest, hasPeerLinks, windowOffsetMs, purpose, createdBy, idempotencyKey, ReplaySupport.Kafka(), ct);

    public Task<CplmRecomputeHandle> StartReconstructionAsync(
        string loopId, ReconstructionTarget target, ReplaySupport support, string? createdBy, string? idempotencyKey, CancellationToken ct)
        => StartAsync(loopId, false, false, 0L, "EVIDENCE_RECONSTRUCTION", createdBy, idempotencyKey, support, target, ct);

    public Task<CplmRecomputeHandle> StartShadowAsync(string loopId, string bundleHash, string resolvedPropertiesJson, long windowOffsetMs, string? createdBy, ReplaySupport support, CancellationToken ct)
        => StartAsync(loopId, false, false, windowOffsetMs, "SHADOW", createdBy, null, support, null, ct,
            new ShadowBundle(bundleHash, Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(resolvedPropertiesJson))));

    /// <summary>v2.5 (3B.3): the draft bundle a SHADOW run evaluates under (hash + base64 resolved properties, applied by the replay job through BundleProfileMapper).</summary>
    public sealed record ShadowBundle(string Hash, string PropertiesB64);

    public Task<CplmRecomputeHandle> StartAsync(
        string loopId, bool hasStepTest, bool hasPeerLinks, long windowOffsetMs, string purpose,
        string? createdBy, string? idempotencyKey, ReplaySupport support, CancellationToken ct)
        => StartAsync(loopId, hasStepTest, hasPeerLinks, windowOffsetMs, purpose, createdBy, idempotencyKey, support, null, ct);

    private async Task<CplmRecomputeHandle> StartAsync(
        string loopId, bool hasStepTest, bool hasPeerLinks, long windowOffsetMs, string purpose,
        string? createdBy, string? idempotencyKey, ReplaySupport support, ReconstructionTarget? reconstruct, CancellationToken ct, ShadowBundle? shadow = null)
    {
        purpose = purpose is "REPLAY" or "SHADOW" or "EVIDENCE_RECONSTRUCTION" ? purpose : "REPLAY";
        if (reconstruct is not null && support.ToMs <= support.FromMs)
            throw new InvalidOperationException("A reconstruction needs the method run's support (fromMs < toMs).");
        support ??= ReplaySupport.Kafka();
        bool historian = string.Equals(support.Source, "iotdb", StringComparison.OrdinalIgnoreCase);
        if (historian && (support.ToMs <= support.FromMs || string.IsNullOrWhiteSpace(support.Site)))
            throw new InvalidOperationException("A historian-backed run needs fromMs < toMs and the loop's site.");
        // v2.5 (1G.4, R19): the run is registered BEFORE submission so every row it writes
        // carries analysis_run_id and the store isolates it by purpose. An Idempotency-Key
        // that already names a run returns that run instead of starting another.
        if (!string.IsNullOrWhiteSpace(idempotencyKey))
        {
            var existing = await _runs.FindByIdempotencyKeyAsync(idempotencyKey, ct);
            if (existing is not null) return existing;
        }
        var analysisRunId = Guid.NewGuid();
        var replayId = analysisRunId.ToString("N")[..12];
        await _runs.InsertAsync(analysisRunId, loopId, purpose, createdBy, idempotencyKey, reconstruct, ct);
        if (historian || reconstruct is not null) await _runs.SetRequestedRangeAsync(analysisRunId, support.FromMs, support.ToMs, ct);
        string jarId;
        try
        {
            jarId = await EnsureJarUploadedAsync(ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or TimeoutException or Polly.Timeout.TimeoutRejectedException)
        {
            _cachedJarId = null;
            await _runs.MarkAsync(analysisRunId, "SUBMIT_FAILED", null, "jar upload: " + ex.Message, ct);
            throw new InvalidOperationException($"The Flink jar upload did not complete: {ex.Message}", ex);
        }

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
            "--window-offset-ms", windowOffsetMs.ToString(),
            "--purpose", purpose,
            "--analysis-run-id", analysisRunId.ToString(),
            "--source", historian ? "iotdb" : "kafka",
            "--site", support.Site ?? "",
            "--loop-type", support.LoopType ?? "",
            "--from-ms", support.FromMs.ToString(),
            "--to-ms", support.ToMs.ToString(),
            reconstruct is null ? "" : string.Join(' ',
                "--reconstruct-method-run", reconstruct.MethodRunId.ToString(),
                "--reconstruct-gate", reconstruct.Gate,
                "--reconstruct-window-kind", reconstruct.WindowKind),
            shadow is null ? "" : string.Join(' ', "--bundle-hash", shadow.Hash, "--bundle-properties-b64", shadow.PropertiesB64));

        var client = CreateClient();
        // /jars/:id/run blocks while the JobManager builds the job graph; on a busy cluster that is
        // tens of seconds. A timeout or connection failure is a submission failure (502), not a 500.
        HttpResponseMessage response;
        try
        {
            response = await client.PostAsJsonAsync($"/jars/{jarId}/run",
                new { entryClass = EntryClass, programArgs = args, parallelism = 1 }, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or TimeoutException or Polly.Timeout.TimeoutRejectedException)
        {
            _cachedJarId = null;
            await _runs.MarkAsync(analysisRunId, "SUBMIT_FAILED", null, ex.Message, ct);
            throw new InvalidOperationException($"Flink did not accept the submission in time: {ex.Message}", ex);
        }

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            // A stale cached jar id (cluster restarted, uploads cleared) is the
            // most likely cause; drop it so the next attempt re-uploads.
            _cachedJarId = null;
            await _runs.MarkAsync(analysisRunId, "SUBMIT_FAILED", null, Trim(body), ct);
            throw new InvalidOperationException(
                $"Flink rejected the recompute submission ({(int)response.StatusCode}): {Trim(body)}");
        }

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var jobId = doc.RootElement.TryGetProperty("jobid", out var j) ? j.GetString() : null;
        if (string.IsNullOrWhiteSpace(jobId))
            throw new InvalidOperationException("Flink accepted the run but returned no jobid.");

        await _runs.MarkAsync(analysisRunId, "SUBMITTED", jobId, null, ct);
        _logger.LogInformation("CPLM recompute started for {LoopId}: analysisRun={RunId} replayId={ReplayId} jobId={JobId}",
            loopId, analysisRunId, replayId, jobId);
        return new CplmRecomputeHandle(replayId, jobId, loopId, analysisRunId, purpose);
    }

    public async Task<AnalysisRunView?> GetAnalysisRunAsync(Guid analysisRunId, CancellationToken ct)
    {
        var row = await _runs.ReadAsync(analysisRunId, ct);
        if (row is null) return null;
        var state = row.State;
        string? jobState = null;
        if (row.FlinkJobId is not null && state is not ("FINISHED" or "FAILED" or "CANCELED" or "SUBMIT_FAILED"))
        {
            var status = await GetStatusAsync(analysisRunId.ToString("N")[..12], row.FlinkJobId, ct);
            jobState = status.State;
            if (status.Finished)
            {
                state = status.Succeeded ? "FINISHED" : status.State;
                await _runs.MarkAsync(analysisRunId, state, null, null, ct);
            }
        }
        return row with { State = state, JobState = jobState };
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
            else if (res.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                // P2-16 - Flink archives finished jobs; a 404 previously left the
                // state UNKNOWN/finished:false FOREVER and the UI polled endlessly.
                // A 404 for a job we ourselves submitted means it reached a
                // terminal state and aged out of the REST cache. Whether it
                // SUCCEEDED is answered by the evidence store, not by Flink.
                state = "ARCHIVED";
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not read recompute job {JobId}", jobId);
        }

        // P2-16 - gateResults was a hardcoded 0, so the UI reported a successful
        // recompute that "produced nothing". Count the rows this replay actually
        // wrote; for ARCHIVED jobs this is also what decides success.
        var gateResults = 0;
        try
        {
            await using var conn = await _dataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            // v2.5 (1G.4): rows are attributed by the analysis_run_id COLUMN (replayId is its
            // 12-char prefix); pre-v2.5 replays are still found by payload->>'replay_id'.
            cmd.CommandText = """
                SELECT count(*) FROM analytics.cplm_gate_results
                WHERE (analysis_run_id IS NOT NULL AND replace(analysis_run_id::text, '-', '') LIKE @rid || '%')
                   OR payload->>'replay_id' = @rid
                """;
            cmd.Parameters.AddWithValue("rid", replayId);
            gateResults = Convert.ToInt32(await cmd.ExecuteScalarAsync(ct));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not count gate results for replay {ReplayId}", replayId);
        }

        var finished = state is "FINISHED" or "FAILED" or "CANCELED" or "ARCHIVED";
        var succeeded = state == "FINISHED" || (state == "ARCHIVED" && gateResults > 0);
        return new CplmRecomputeStatus(replayId, jobId, state, finished, succeeded, gateResults);
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

    private HttpClient? _jobManagerClient;

    private HttpClient CreateClient()
    {
        // RES-01 / v2.5 (2C.2): a plain client - the factory's default resilience pipeline (10 s attempt,
        // 30 s total) cannot be exempted per client on .NET 8 and aborted both the ~45 MB jar upload and a
        // /jars/:id/run whose job-graph build (the replay's driver-side reads) takes tens of seconds.
        // One upstream, one long-lived client, a six-minute ceiling; failures surface as SUBMIT_FAILED / 502.
        if (_jobManagerClient is null)
        {
            var baseUrl = (_config["Flink:JobManagerUrl"] ?? "http://ams-flink-jobmanager:8081").TrimEnd('/') + "/";
            _jobManagerClient = new HttpClient(new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(10) })
            {
                BaseAddress = new Uri(baseUrl),
                Timeout = TimeSpan.FromMinutes(6),
            };
        }
        return _jobManagerClient;
    }

    private static string Trim(string s) => s.Length <= 400 ? s : s[..400] + "…";
}

public sealed class CplmRecomputeOptions
{
    public const string SectionName = "CplmRecompute";
    /// <summary>Path to the Flink jar inside the ams-api container (bind-mounted).</summary>
    public string JarPath { get; set; } = "/opt/ams/flink/ams-flink.jar";
    public string SamplesTopic { get; set; } = "traverse.cpa.loop.samples.v1";
    public string GateResultsTopic { get; set; } = "traverse.cpa.clpm.gate.results.v1";
    public string BootstrapServers { get; set; } = "kafka:9092";
}
