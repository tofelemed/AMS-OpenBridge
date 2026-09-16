namespace Traverse.CplmApi.Services;

/// <summary>
/// The window contract the deployed Flink jobs actually implement. Moved out of
/// CpmAnalyticsController in v2.5 (Task 0.4) so /resolutions and /capabilities serve one copy.
///
/// Honest about what this is: a hand-maintained mirror of the job sources, not something
/// the jobs publish (Phase 3 Task 3A.2 makes the jobs publish their capacity). If you change
/// a window, change it here too:
///   • short  — CplmShortFeatureStreamJob (6 branches, .allowedLateness per branch)
///   • long   — CplmLongDiagnosticsStreamJob (TIMER_INTERVAL_MS, WINDOW_*_MS, MIN_SAMPLES)
///   • fusion — CplmGateFusionStreamJob.processElement2 (12h/24h guard)
/// </summary>
public static class WindowCatalog
{
    /// <param name="Assigner">tumbling | sliding | rolling-buffer (the long tier is a
    /// KeyedProcessFunction over a retained buffer, not a Flink window).</param>
    public sealed record WindowSpec(
        string Kind, string Tier, string Assigner, long SizeMs, long? SlideMs,
        long? AllowedLatenessMs, long? CadenceMs, int? MinSamples, string Feeds);

    private const long Min = 60_000L;
    private const long Hour = 60L * Min;

    public static readonly WindowSpec[] Specs =
    {
        // ── short tier: CplmShortFeatureStreamJob ────────────────────────────
        new("1m",  "short", "tumbling",       1 * Min,  null,    30_000,  null, null, "G0–G4 short features"),
        new("5m",  "short", "sliding",        5 * Min,  1 * Min, 60_000,  null, null, "G0–G4 short features"),
        new("10m", "short", "sliding",       10 * Min,  2 * Min, 90_000,  null, null, "G0–G4 short features"),
        new("15m", "short", "sliding",       15 * Min,  5 * Min, 2 * Min, null, null, "G0–G4 short features"),
        new("30m", "short", "sliding",       30 * Min,  5 * Min, 2 * Min, null, null, "G0–G4 short features"),
        new("60m", "short", "sliding",       60 * Min,  5 * Min, 3 * Min, null, null, "G0–G4 short features"),
        // ── long tier: CplmLongDiagnosticsStreamJob ──────────────────────────
        // Event-time timers on a 15-min cadence recompute each slice from the retained
        // buffer; a slice with < MinSamples is not emitted at all.
        new("4h",  "long",  "rolling-buffer",  4 * Hour, null, null, 15 * Min, 32, "G5–G11 long diagnostics"),
        new("12h", "long",  "rolling-buffer", 12 * Hour, null, null, 15 * Min, 32, "G5–G11 long diagnostics"),
        new("24h", "long",  "rolling-buffer", 24 * Hour, null, null, 15 * Min, 32, "G5–G11 long diagnostics"),
    };

    /// <summary>Which long records trigger the fusion engine (G12–G15 → verdict).</summary>
    public static readonly string[] FusionTriggerWindows = { "12h", "24h" };

    public static readonly string[] ShortWindows = Specs.Where(w => w.Tier == "short").Select(w => w.Kind).ToArray();
    public static readonly string[] LongWindows = Specs.Where(w => w.Tier == "long").Select(w => w.Kind).ToArray();

    /// <summary>The GET /resolutions body, also embedded in GET /capabilities.</summary>
    public static object ResolutionsPayload() => new
    {
        shortWindows = ShortWindows,
        longWindows = LongWindows,
        windows = Specs.Select(w => new
        {
            kind = w.Kind,
            tier = w.Tier,
            assigner = w.Assigner,
            sizeMs = w.SizeMs,
            slideMs = w.SlideMs,
            allowedLatenessMs = w.AllowedLatenessMs,
            cadenceMs = w.CadenceMs,
            minSamples = w.MinSamples,
            feeds = w.Feeds,
            // Overlap is the fact the old UI copy got wrong, so state it outright
            // rather than leaving every caller to infer it from slide < size.
            overlapping = w.SlideMs != null && w.SlideMs < w.SizeMs
        }),
        fusion = new
        {
            firesOn = FusionTriggerWindows,
            produces = "G0–G15 fused diagnosis",
            note = "Fusion is triggered by long records, so no verdict exists before a loop completes a 12h slice."
        },
        gates = GateCatalog.Defs.Select(g => new { key = g.Key, name = g.Name, tier = g.Tier }),
        note = "Gate results are produced only for 12h and 24h windows: fusion fires on long records. "
             + "Window values mirror the deployed Flink jobs (CplmShortFeatureStreamJob, "
             + "CplmLongDiagnosticsStreamJob, CplmGateFusionStreamJob)."
    };
}
