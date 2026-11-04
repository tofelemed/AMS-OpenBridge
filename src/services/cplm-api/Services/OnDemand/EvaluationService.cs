using Microsoft.Extensions.Options;
using Npgsql;

namespace Traverse.CplmApi.Services.OnDemand;

public enum EvaluationOutcome { Accepted, Cached, InFlight, Idempotent, IdempotencyKeyReused, TooManyInFlight, PublishFailed }

public sealed record EvaluationStart(EvaluationOutcome Outcome, Guid? AnalysisRunId, EvaluationWindow Window, string? Error = null);

/// <summary>
/// CHG-102 Phase 5c — starts an EVALUATE run: one loop over one window, evaluated by the always-running Flink on-demand
/// job from the historian. No job is submitted per request: the run is registered (QUEUED), the request goes on the
/// request topic, and the job's status records move the run on. A request for a window that is already evaluated (its
/// evidence still held) or in flight returns that run; an Idempotency-Key returns the run it named.
/// </summary>
public sealed class EvaluationService
{
    private readonly EvaluationRunStore _runs;
    private readonly IEvaluationRequestPublisher _publisher;
    private readonly EvaluationOptions _options;
    private readonly IotDbWriteOptions _iotdb;
    private readonly ILogger<EvaluationService> _logger;

    public EvaluationService([FromKeyedServices("cplm")] NpgsqlDataSource db, IEvaluationRequestPublisher publisher,
        IOptions<EvaluationOptions> options, IOptions<IotDbWriteOptions> iotdb, ILogger<EvaluationService> logger)
        : this(new EvaluationRunStore(db), publisher, options.Value, iotdb.Value, logger) { }

    public EvaluationService(EvaluationRunStore runs, IEvaluationRequestPublisher publisher, EvaluationOptions options,
        IotDbWriteOptions iotdb, ILogger<EvaluationService> logger)
    {
        _runs = runs;
        _publisher = publisher;
        _options = options;
        _iotdb = iotdb;
        _logger = logger;
    }

    public EvaluationOptions Options => _options;
    public EvaluationRunStore Runs => _runs;

    /// <summary>The device the historian writer keeps this loop under (IotDb:LoopRootPrefix + SafeNode) - what the job reads.</summary>
    public string DeviceOf(string loopId) => CplmRecomputeOptions.HistorianDevice(_iotdb.LoopRootPrefix, loopId);

    public async Task<EvaluationStart> StartAsync(CpmLoopDto loop, EvaluationWindow window, string? createdBy, string? idempotencyKey,
        CancellationToken ct)
    {
        // the key is looked up among the caller's own runs only, and it must name THIS request (loop and window): a key reused
        // for another loop or window is refused, never answered with that other run (security review: IDOR)
        if (!string.IsNullOrWhiteSpace(idempotencyKey) && await _runs.FindByIdempotencyKeyAsync(idempotencyKey, createdBy, ct) is { } named)
            return SameRequest(named, loop.LoopId, window)
                ? new EvaluationStart(EvaluationOutcome.Idempotent, named.Id, window)
                : new EvaluationStart(EvaluationOutcome.IdempotencyKeyReused, null, window,
                    "this Idempotency-Key already names an evaluation of another loop or window");
        await _runs.ExpireStaleAsync(_options.TimeoutMinutes, null, ct);
        if (await _runs.FindReusableAsync(loop.LoopId, window, ct) is { } reuse)
            return new EvaluationStart(reuse.State == EvaluationStates.Finished ? EvaluationOutcome.Cached : EvaluationOutcome.InFlight,
                reuse.Id, window);
        if (!string.IsNullOrWhiteSpace(createdBy) && _options.MaxPerUserInFlight > 0
            && await _runs.CountInFlightAsync(createdBy, ct) >= _options.MaxPerUserInFlight)
            return new EvaluationStart(EvaluationOutcome.TooManyInFlight, null, window,
                $"at most {_options.MaxPerUserInFlight} evaluations may be in flight per user");

        var id = Guid.NewGuid();
        var device = DeviceOf(loop.LoopId);
        await _runs.InsertAsync(id, loop.LoopId, loop.Site, window, device, createdBy,
            string.IsNullOrWhiteSpace(idempotencyKey) ? null : idempotencyKey, ct);
        EvaluationRequest request;
        try
        {
            // the bundle the live run of this window carried, so the evaluation has the live run's identity (3C.1)
            var bundle = await _runs.LiveBundleAsync(loop.LoopId, window.ToMs, ct);
            request = new EvaluationRequest(id, loop.LoopId, loop.Site ?? "", string.IsNullOrWhiteSpace(loop.LoopType) ? null : loop.LoopType,
                window, device, loop.StepTestApproved, loop.Links.Count > 0, bundle?.Hash, bundle?.PropertiesB64,
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            await _publisher.PublishAsync(request, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Evaluation request for {Loop} [{From}, {To}) not published", loop.LoopId, window.FromMs, window.ToMs);
            await _runs.MarkFailedAsync(id, "request publish: " + ex.Message, CancellationToken.None);
            return new EvaluationStart(EvaluationOutcome.PublishFailed, id, window, ex.Message);
        }
        _logger.LogInformation("Evaluation {Run} queued: {Loop} {Kind} [{From}, {To}) from {Device}",
            id, loop.LoopId, window.WindowKind, window.FromMs, window.ToMs, device);
        return new EvaluationStart(EvaluationOutcome.Accepted, id, window);
    }

    internal static bool SameRequest((Guid Id, string LoopId, long FromMs, long ToMs, string? WindowKind) run, string loopId, EvaluationWindow w)
        => string.Equals(run.LoopId, loopId, StringComparison.OrdinalIgnoreCase)
           && run.FromMs == w.FromMs && run.ToMs == w.ToMs && string.Equals(run.WindowKind, w.WindowKind, StringComparison.OrdinalIgnoreCase);

    /// <summary>The run as GET serves it; a run past the timeout is persisted FAILED first (lazily, on read).</summary>
    public async Task<EvaluationRunView?> ReadAsync(Guid id, CancellationToken ct)
    {
        await _runs.ExpireStaleAsync(_options.TimeoutMinutes, id, ct);
        return await _runs.ReadAsync(id, ct);
    }

    /// <summary>The run's GET body (camelCase by the API's serializer): the verdict run is G15, the fused decision.</summary>
    public static object View(EvaluationRunView v, bool? cached = null)
    {
        var verdict = v.MethodRunIds.TryGetValue("G15", out var g15) ? g15 : null;
        return new
        {
            analysisRunId = v.AnalysisRunId,
            loopId = v.LoopId,
            purpose = "EVALUATE",
            state = v.State,
            finished = v.State is EvaluationStates.Finished or EvaluationStates.Failed,
            succeeded = v.State == EvaluationStates.Finished,
            cached,
            createdBy = v.CreatedBy,
            createdAt = v.CreatedAt,
            finishedAt = v.FinishedAt,
            error = v.Error,
            windowKind = v.WindowKind,
            fromMs = v.FromMs,
            toMs = v.ToMs,
            methodRunIds = v.MethodRunIds,
            verdictMethodRunId = verdict,
            evidenceUrl = verdict is null ? null : $"/api/v1/cpm/method-runs/{verdict}/evidence",
            samples = v.Samples,
            artifacts = v.Artifacts,
            elapsedMs = v.ElapsedMs,
            gateResults = v.GateResults,
            evidenceManifests = v.EvidenceManifests,
            evidenceComplete = v.EvidenceComplete,
            evidenceIdentical = v.EvidenceIdentical,
            statusUrl = $"/api/v1/cpm/analysis-runs/{v.AnalysisRunId}",
        };
    }
}
