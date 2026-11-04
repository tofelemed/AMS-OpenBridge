namespace Traverse.CplmApi.Services.OnDemand;

/// <summary>
/// CHG-102 Phase 5c — "Cplm:OnDemand": POST /analysis-runs {purpose: EVALUATE} asks the always-running Flink on-demand
/// job (CplmOnDemandEvaluationJob) to evaluate one loop over one window read from the historian. The request goes out on
/// <see cref="RequestTopic"/>; the job reports RUNNING / SUCCEEDED / FAILED on <see cref="StatusTopic"/>, which the
/// consumers instance applies to analytics.analysis_run (BackgroundServices.EvaluationStatusConsumerService).
/// </summary>
public sealed class EvaluationOptions
{
    public const string SectionName = "Cplm:OnDemand";
    /// <summary>False = POST EVALUATE answers 503 ON_DEMAND_DISABLED and no status consumer runs.</summary>
    public bool Enabled { get; set; } = true;
    public string RequestTopic { get; set; } = "traverse.cpa.clpm.evaluation.requests.v1";
    public string StatusTopic { get; set; } = "traverse.cpa.clpm.evaluation.status.v1";
    /// <summary>A QUEUED / RUNNING run with no terminal status after this long is FAILED NO_RESPONSE_FROM_EVALUATION_JOB.</summary>
    public int TimeoutMinutes { get; set; } = 5;
    /// <summary>Most QUEUED / RUNNING evaluations one user may hold (429 beyond it).</summary>
    public int MaxPerUserInFlight { get; set; } = 3;
    /// <summary>The status consumer's group (one member: the consumers instance).</summary>
    public string ConsumerGroupId { get; set; } = "traverse-cpa-evaluation-status";
}

/// <summary>CHG-102 5c — the window an EVALUATE run covers: [EndMs - kind, EndMs), validated (pure, tested).</summary>
public sealed record EvaluationWindow(string WindowKind, long FromMs, long ToMs)
{
    public const long QuarterHourMs = 15 * 60_000L;
    public static readonly IReadOnlyDictionary<string, long> Kinds = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase)
    {
        ["4h"] = 4 * 3_600_000L,
        ["12h"] = 12 * 3_600_000L,
        ["24h"] = 24 * 3_600_000L,
    };

    public const string DefaultKind = "12h";

    /// <summary>
    /// The window, or the reason it is refused. <paramref name="endMs"/> null = now floored to 15 min (the live job's grid,
    /// so a default request names the same window as the newest live verdict). The end may not lie in the future and the
    /// start may not precede the historian's retention.
    /// </summary>
    public static (EvaluationWindow? Window, string? Error) Resolve(string? windowKind, long? endMs, long nowMs, int historianRetentionDays)
    {
        var kind = string.IsNullOrWhiteSpace(windowKind) ? DefaultKind : windowKind.Trim().ToLowerInvariant();
        if (!Kinds.TryGetValue(kind, out var span)) return (null, $"windowKind must be one of {string.Join(", ", Kinds.Keys)}");
        var end = endMs ?? nowMs / QuarterHourMs * QuarterHourMs;
        if (end <= 0) return (null, "endMs must be epoch milliseconds");
        if (end > nowMs) return (null, "endMs lies in the future");
        var from = end - span;
        var oldest = nowMs - Math.Max(1, historianRetentionDays) * 86_400_000L;
        if (from < oldest) return (null, $"the window starts before the historian's retention ({historianRetentionDays} d)");
        return (new EvaluationWindow(kind, from, end), null);
    }
}

/// <summary>CHG-102 5c — the analysis_run states an EVALUATE run passes through (no CHECK constrains analysis_run.state).
/// FINISHED is the success state every other run kind uses, so readers that know FINISHED (EvidenceManifestReader, the UI)
/// need nothing new; the job's SUCCEEDED maps onto it.</summary>
public static class EvaluationStates
{
    public const string Queued = "QUEUED";
    public const string Running = "RUNNING";
    public const string Finished = "FINISHED";
    public const string Failed = "FAILED";
    public const string NoResponse = "NO_RESPONSE_FROM_EVALUATION_JOB";

    /// <summary>The job's status word as stored; null = not a state we apply.</summary>
    public static string? FromJob(string? jobState) => jobState?.Trim().ToUpperInvariant() switch
    {
        "RUNNING" => Running,
        "SUCCEEDED" => Finished,
        "FAILED" => Failed,
        _ => null,
    };
}
