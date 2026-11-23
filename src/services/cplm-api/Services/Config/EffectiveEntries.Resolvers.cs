// CHG-224: how each value worked out per loop is computed - the rules the engine applies, restated (inventory
// docs/next-release/gate-property-sources-inventory.md, sections 4.1-4.14). The engine constants mirrored here are named after
// their Java homes; a change there changes the sentence here.
using System.Text.Json;
using Traverse.CplmApi.Config;

namespace Traverse.CplmApi.Services.Config;

public static partial class EffectiveEntries
{
    /// <summary>ResponseJobConfig.rampMinSlopeEuPerS (job default, on a 0-100 span; ResponseScale scales it).</summary>
    private const double RampMinSlopeEuPerS = 0.02;
    /// <summary>ResponseJobConfig.noiseFloorEu: the model validation's noise floor on a 0-100 span.</summary>
    private const double NoiseFloorEu = 0.05;
    /// <summary>The validation verdict: free-run error within 3 noise floors (or 10 % of the no-model error).</summary>
    private const double ValidationNoiseFloors = 3.0;
    /// <summary>CplmLoopDynamicsProfile.satLimitDwellSamplesWarn: the at-limit dwell when none is decided, in samples.</summary>
    private const int LimitDwellSamples = 30;
    /// <summary>ResponseJobConfig.fallbackSpanEu: the span the step floor's fraction uses without a declared range.</summary>
    private const double FallbackSpanEu = 100.0;
    private static readonly HashSet<string> IntegratingPacks = new(StringComparer.Ordinal) { "LEVEL_INTEGRATING", "PRESSURE_GAS_INTEGRATING" };
    private static readonly HashSet<string> KnownDynamicClasses = new(StringComparer.Ordinal)
        { "FAST_SELF_REG", "SLOW_SELF_REG", "INTEGRATING", "NEAR_INTEGRATING", "INTEGRATING_LAG", "UNDERDAMPED" };
    private static readonly HashSet<string> IntegratingClasses = new(StringComparer.Ordinal) { "INTEGRATING", "NEAR_INTEGRATING", "INTEGRATING_LAG" };

    // ── Gate Configuration properties ───────────────────────────────────────
    private static Answer Generic(string property, Facts f)
    {
        if (f.Raw(property) is not { } stored) return new Answer(null, f.Map.EditableBasis["notSet"], NoSlots);
        return new Answer(stored, f.Map.EditableBasis["default"], NoSlots, stored, f.Level(property));
    }

    /// <summary>A layer's own value counts when the engine uses it; otherwise the configured value is still reported beside the worked-out one.</summary>
    private static (JsonElement? Configured, string? Level) Stored(string property, Facts f) => f.Raw(property) is { } v ? (v, f.Level(property)) : (null, null);

    /// <summary>G2 band: a set band above 0, else the span fraction x the declared PV span, else x 100 (LEGACY_DEFAULT; 1.0 when unusable).</summary>
    private static Answer G2Band(PropertySources.Entry src, string property, Facts f)
    {
        var (configured, level) = Stored(property, f);
        if (f.Num(property) is > 0) return new Answer(configured, f.Map.EditableBasis["default"], NoSlots, configured, level);
        var fraction = f.Num("G2.stability_band_span_fraction") ?? 0.01;
        var band = f.SpanUsable ? fraction * f.Span : 1.0;
        if (band <= 1e-12) band = 1.0;
        return new Answer(Round(band), Text(src, f.Declared ? "default" : "undeclared"), Slots(("pct", Plain(fraction * 100))), configured, level);
    }

    /// <summary>A region limit: as set, else no limit.</summary>
    private static Answer Region(PropertySources.Entry src, string property, Facts f)
    {
        var (configured, level) = Stored(property, f);
        return configured is null ? new Answer(null, Text(src), NoSlots) : new Answer(configured, f.Map.EditableBasis["default"], NoSlots, configured, level);
    }

    /// <summary>CHG-204 ResponseScale: a G12 PV quantity a layer the engine applies sets is in loop units; otherwise the job value x span / 100.</summary>
    private static Answer PvScaled(PropertySources.Entry src, string property, Facts f)
    {
        var (configured, level) = Stored(property, f);
        if (f.Num(property) is not { } v) return new Answer(null, f.Map.EditableBasis["notSet"], NoSlots);
        if (f.BundleSets(property)) return new Answer(configured, f.Map.EditableBasis["default"], NoSlots, configured, level);
        if (!f.Declared) return new Answer(configured, Text(src, "undeclared"), NoSlots, configured, level);
        return new Answer(Round(v * f.K), Text(src), Slots(("configured", Fmt(v))), configured, level);
    }

    /// <summary>G10 at-limit dwell: a decided value above 0, else 30 samples at the loop's sample interval.</summary>
    private static Answer LimitDwell(PropertySources.Entry src, string property, Facts f)
    {
        var (configured, level) = Stored(property, f);
        if (f.Num(property) is > 0) return new Answer(configured, f.Map.DecidedBasis, NoSlots, configured, level);
        if (f.Interval is not { } dt) return new Answer(null, Text(src, "noData"), NoSlots, configured, level);
        return new Answer(Round(LimitDwellSamples * dt), Text(src), Slots(("interval", Fmt(dt))), configured, level);
    }

    /// <summary>G12 tuning target: a decided value above 0, else the latest validated model's dead time (rule DEAD_TIME).</summary>
    private static Answer Lambda(PropertySources.Entry src, string property, Facts f)
    {
        var (configured, level) = Stored(property, f);
        if (f.Num(property) is > 0) return new Answer(configured, f.Map.DecidedBasis, NoSlots, configured, level);
        return f.Ctx.Facts.DeadTimeS is { } theta
            ? new Answer(Round(theta), Text(src), NoSlots, configured, level)
            : new Answer(null, Text(src, "noData"), NoSlots, configured, level);
    }

    // ── Loop Registry ───────────────────────────────────────────────────────
    private static string WordOf(Facts f, string group, string token) =>
        f.Map.Words.TryGetValue(group, out var words) && words.TryGetValue(token, out var w) ? w : token;

    private static Answer Acquisition(PropertySources.Entry src, Facts f)
    {
        var mode = string.IsNullOrWhiteSpace(f.Model.Acquisition?.Mode) ? "PERIODIC" : f.Model.Acquisition!.Mode.Trim().ToUpperInvariant();
        var grid = f.Model.Acquisition?.GridSeconds;
        return new Answer(mode, Text(src, grid is > 0 ? "grid" : "default"), Slots(("mode", WordOf(f, "acquisition", mode)), ("grid", grid?.ToString() ?? "")));
    }

    private static Answer Objective(PropertySources.Entry src, Facts f)
    {
        var objective = string.IsNullOrWhiteSpace(f.Model.ObjectiveType) ? "UNSET" : f.Model.ObjectiveType.Trim().ToUpperInvariant();
        var variant = f.Model.ClassificationSource == "EXPLICIT" ? "default" : "preset";
        return new Answer(objective, Text(src, variant), Slots(("objective", WordOf(f, "objective", objective))));
    }

    /// <summary>G13 peers: the registry's loop links, capped by G13.max_peers.</summary>
    private static Answer Peers(PropertySources.Entry src, Facts f)
    {
        var peers = f.Ctx.Loop.Links.Select(l => l.ToLoopId).Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var max = (int)(f.Num("G13.max_peers") ?? 12);
        var variant = peers.Length == 0 ? "none" : peers.Length > max ? "capped" : "default";
        return new Answer(peers, Text(src, variant), Slots(("peers", string.Join(", ", peers)), ("max", max.ToString())));
    }

    // ── evidence retention (per record class, the same for every loop) ─────
    private static int? Row(Facts f, string recordClass, out bool present)
    {
        present = f.Ctx.Facts.Retention.Days.TryGetValue(recordClass, out var d);
        return d;
    }

    private static Answer RetentionShort(PropertySources.Entry src, Facts f)
    {
        var r = f.Ctx.Facts.Retention;
        var rebuilt = Row(f, "STANDARD", out _);                                 // no row or null days: never expires
        return new Answer(new Dictionary<string, object?> { ["liveHours"] = r.TransientHours, ["liveBudgetBytes"] = r.TransientBudgetBytes, ["rebuiltDays"] = rebuilt },
            Text(src), Slots(("live", Hours(r.TransientHours)), ("rebuilt", Days(rebuilt))));
    }

    private static Answer RetentionLong(PropertySources.Entry src, Facts f)
    {
        var r = f.Ctx.Facts.Retention;
        var archive = Row(f, "EVIDENCE_ARCHIVE", out var archiveRow);
        if (!archiveRow) archive = EvidenceArchiveRetention.DefaultDays;          // EvidenceArchiveRetention.PolicyAsync's default
        var episode = Row(f, "EPISODE", out _) ?? 90;                            // the sweeper's default when the row (or its days) is missing
        return new Answer(new Dictionary<string, object?>
            {
                ["liveHours"] = r.TransientHours, ["liveBudgetBytes"] = r.TransientBudgetBytes, ["archiveDays"] = archive, ["episodeDaysAfterClose"] = episode,
            },
            Text(src), Slots(("live", Hours(r.TransientHours)), ("archive", Days(archive)), ("episode", Days(episode))));
    }

    private static Answer RetentionResponse(PropertySources.Entry src, Facts f)
    {
        var results = Row(f, "RESPONSE", out _);
        var charts = Row(f, ResponseEvidenceRetention.ChartsPolicy, out var chartsRow);
        if (!chartsRow) charts = results;                                         // no row: the charts live as long as the test
        var rejected = Row(f, "RESPONSE_CENSORED", out var rejectedRow);
        if (!rejectedRow) rejected = results;                                     // no row: rejected tests follow RESPONSE
        return new Answer(new Dictionary<string, object?> { ["chartsDays"] = charts, ["resultsDays"] = results, ["rejectedDays"] = rejected },
            Text(src), Slots(("charts", Days(charts)), ("results", Days(results)), ("rejected", Days(rejected))));
    }

    // ── worked out per loop ─────────────────────────────────────────────────
    /// <summary>A multiple of the loop's sample interval (gap 1.5 x, peer alignment 0.75 x).</summary>
    private static Answer PerInterval(PropertySources.Entry src, Facts f, double factor, string slot)
    {
        if (f.Interval is not { } dt) return new Answer(null, Text(src, "noData"), NoSlots);
        return new Answer(Round(factor * dt), Text(src), Slots((slot, Fmt(factor * dt)), ("interval", Fmt(dt))));
    }

    /// <summary>A lag range in samples (G5 autocorrelation 2,000, G8 cross-correlation 200) at the loop's sample interval.</summary>
    private static Answer Lag(PropertySources.Entry src, Facts f, int samples)
    {
        if (f.Interval is not { } dt) return new Answer(null, Text(src, "noData"), NoSlots);
        return new Answer(Round(samples * dt), Text(src), Slots(("duration", Duration(samples * dt))));
    }

    /// <summary>ResponseScale.refStepFloorEu: the set-point step floor before the noise term.</summary>
    private static Answer StepMin(PropertySources.Entry src, Facts f)
    {
        var step = f.Num("G12.step_min_input_eu") ?? 1.0;
        var fraction = f.Num("G12.step_min_span_fraction") ?? 0.01;
        var today = Math.Max(step, fraction * FallbackSpanEu);
        var floor = !f.Declared ? today : f.BundleSets("G12.step_min_input_eu") ? Math.Max(step, fraction * f.Span) : today * f.K;
        var noise = f.Num("G12.noise_multiplier") ?? 4.0;
        return new Answer(Round(floor), Text(src, f.Declared ? "default" : "undeclared"), Slots(("noise", Plain(noise))));
    }

    /// <summary>CplmLoopDynamicsProfile.goodErrorBand: the fraction x the PV span (0-100 when undeclared), 0.5 when unusable.</summary>
    private static Answer ErrorBand(PropertySources.Entry src, Facts f)
    {
        var fraction = f.Num("G3.error_band_span_fraction") ?? 0.005;
        var band = f.SpanUsable ? fraction * f.Span : 0.5;
        if (band <= 1e-12) band = 0.5;
        return new Answer(Round(band), Text(src, f.Declared ? "default" : "undeclared"), Slots(("pct", Plain(fraction * 100))));
    }

    /// <summary>The class pack's PV filter window (G9 corner detection); alpha = 2 / (window + 1).</summary>
    private static Answer PvFilter(PropertySources.Entry src, Facts f)
    {
        var window = IntegratingPacks.Contains(f.Ctx.ProfileId) ? 7 : 5;
        return new Answer(Round(2.0 / (window + 1)), Text(src), Slots(("window", window.ToString())));
    }

    /// <summary>The declared (EXPLICIT) process behaviour when known, else null.</summary>
    private static bool? DeclaredIntegrating(Facts f)
    {
        var dc = (f.Model.DynamicClass ?? "").Trim().ToUpperInvariant();
        return f.Model.ClassificationSource == "EXPLICIT" && KnownDynamicClasses.Contains(dc) ? IntegratingClasses.Contains(dc) : null;
    }

    /// <summary>LongDiagnosticsCalculator: the oscillation signal is PV for an integrating loop, else OP.</summary>
    private static Answer SignalRole(PropertySources.Entry src, Facts f)
    {
        var declared = DeclaredIntegrating(f);
        var integrating = declared ?? IntegratingPacks.Contains(f.Ctx.ProfileId);
        var variant = (integrating ? "pv" : "op") + (declared is null ? "Type" : "Registry");
        return new Answer(integrating ? "PV" : "OP", Text(src, variant), NoSlots);
    }

    /// <summary>CplmResponseAnalysisJob.familyFor: the declared process behaviour, else integrating for LIC, else first order with dead time.</summary>
    private static Answer ModelFamily(PropertySources.Entry src, Facts f)
    {
        var declared = DeclaredIntegrating(f);
        var integrating = declared ?? f.Ctx.Loop.LoopType.ToUpperInvariant().StartsWith("LIC", StringComparison.Ordinal);
        var variant = (integrating ? "ipdt" : "fopdt") + (declared is null ? "Type" : "Registry");
        return new Answer(new[] { integrating ? "IPDT" : "FOPDT" }, Text(src, variant), NoSlots);
    }

    /// <summary>
    /// G6 periods and G7 / G9 cycles feed the same engine setting as G5 (BundleProfileMapper): the value in use is the last one the
    /// engine applies - layers SITE, PROFILE, LOOP in turn, within a layer in stored (jsonb) key order - over the class pack's G5 value.
    /// </summary>
    private static Answer SameAsG5(PropertySources.Entry src, Facts f) => new(EngineValue(src.Follows!, f), Text(src), NoSlots);

    /// <summary>A G5 period / cycle setting: as set, unless an older bundle still stores a G6 / G7 / G9 copy the engine applies after it.</summary>
    private static Answer G5Lead(PropertySources.Entry src, string property, Facts f)
    {
        var generic = Generic(property, f);
        var used = EngineValue(property, f);
        if (used is not { } u || generic.Configured is not { } set || u.GetRawText() == set.GetRawText()) return generic;
        return generic with { Value = u, Text = Text(src, "copy"), Slots = Slots(("configured", DisplayNumber(set))) };
    }

    private static JsonElement? EngineValue(string lead, Facts f)
    {
        var keys = f.Map.Entries.Values.Where(e => e.Follows == lead).Select(e => e.Property).Append(lead)
            .OrderBy(k => k.Length).ThenBy(k => k, StringComparer.Ordinal).ToList();
        var value = f.Raw(lead);
        foreach (var content in f.EngineLayers())
            foreach (var key in keys)
                if (Facts.Stored(content, key) is { ValueKind: JsonValueKind.Number } v) value = v;
        return value;
    }

    private static string DisplayNumber(JsonElement e) =>
        e.GetRawText().IndexOfAny(new[] { '.', 'e', 'E' }) < 0 ? e.GetInt64().ToString("#,0", System.Globalization.CultureInfo.InvariantCulture) : Fmt(e.GetDouble());

    /// <summary>G14 Confirmation: a measured valve non-following period (the two G10 values); no valve position declared = not applicable.</summary>
    private static Answer Proof(PropertySources.Entry src, Facts f)
    {
        var declared = (f.Ctx.Loop.Engineering?.VpApplicability ?? "").Trim().ToUpperInvariant();
        var path = (f.Model.CommandPath ?? "").Trim().ToUpperInvariant();
        var applicability = declared is "EXPECTED" or "NOT_INSTALLED" or "NOT_APPLICABLE" ? declared : path is "OP_TO_VFD" or "OP_TO_PV" ? "NOT_APPLICABLE" : "EXPECTED";
        if (applicability != "EXPECTED") return new Answer(null, Text(src, "noValve"), NoSlots);
        return new Answer(null, Text(src), Slots(("error", Plain(f.Num("G10.nonfollowing_error_pp") ?? 5.0)), ("dwell", Fmt(f.Num("G10.nonfollowing_dwell_s") ?? 60.0))));
    }
}
