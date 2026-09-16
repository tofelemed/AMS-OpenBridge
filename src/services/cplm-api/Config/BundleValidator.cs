using System.Reflection;
using System.Text.Json;

namespace Traverse.CplmApi.Config;

/// <summary>The installed execution plan (contracts/gate-config/v1/execution-plan.installed.json, embedded) and the compiled capacity it declares.</summary>
public static class ExecutionPlans
{
    private static readonly Lazy<JsonElement> InstalledPlan = new(() =>
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Traverse.CplmApi.Config.execution-plan.installed.json")
            ?? throw new InvalidOperationException("execution-plan.installed.json is not embedded");
        using var doc = JsonDocument.Parse(stream);
        return doc.RootElement.Clone();
    });

    public static JsonElement Installed() => InstalledPlan.Value;
    public static string InstalledHash() => CanonicalJson.Sha256(Installed());
    public const string SchedulerMode = "FIXED_COMPILED";
    public const double MaxRetentionS = 24 * 3600 + 600;
}

/// <summary>
/// v2.5 Task 3B.2 (spec v6 §5.4-5.5; NR-048..050, NR-055): what a draft must satisfy before it can
/// be validated - every value typed and finite against the catalogue (an unknown field is named),
/// fraction vs percent guards, inverted ranges, forbidden combinations (G9 can never be PRIMARY, G8
/// cannot be renamed to an uninstalled method, VP presence is not a proof type), the G5 period
/// capacity of 24 h retention, and the execution plan against the compiled capacity
/// (DEPLOYMENT_REQUIRED, never silently narrowed). Properties no running job reads are REPORTED.
/// </summary>
public static class BundleValidator
{
    public sealed record ValidationReport(IReadOnlyList<string> Errors, IReadOnlyList<string> Warnings, IReadOnlyDictionary<string, string> NotReadByBuild, string ChangeClass);

    private static readonly Dictionary<string, string> RangePairs = new(StringComparer.Ordinal)
    {
        ["G5.period_max_s"] = "G5.period_min_s", ["G6.period_max_s"] = "G6.period_min_s", ["G12.delay_max_s"] = "G12.delay_min_s", ["G12.tau_max_s"] = "G12.tau_min_s",
        ["G2r.pv_region_max"] = "G2r.pv_region_min", ["G2r.applied_input_region_max"] = "G2r.applied_input_region_min", ["G9.area_valid_max"] = "G9.area_valid_min",
        ["G4.activity_high_ratio"] = "G4.activity_warn_ratio", ["G7.shape_score_high"] = "G7.shape_score_warn",
    };

    private static readonly HashSet<string> InstalledG8 = new(StringComparer.Ordinal) { "LAG_ASYMMETRY_V1" };
    private static readonly HashSet<string> InstalledG6 = new(StringComparer.Ordinal) { "WELCH_PSD" };
    private static readonly HashSet<string> ProofTypes = new(StringComparer.Ordinal) { "NON_FOLLOWING_RECORD", "APPROVED_TEST_RECORD" };

    public static IReadOnlyList<string> ValidateProperties(JsonElement resolved)
    {
        var errors = new List<string>();
        if (resolved.ValueKind != JsonValueKind.Object) return new[] { "resolved properties must be an object" };
        var c = PropertyCatalogue.Current;
        var values = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var p in resolved.EnumerateObject())
        {
            if (!c.TryGet(p.Name, out var entry))
            {
                errors.Add($"'{p.Name}' is not a catalogue property");
                continue;
            }
            if (p.Value.ValueKind == JsonValueKind.Null) continue;                    // NO_VALUE is stated, not an error
            values[p.Name] = p.Value;
            ValidateOne(entry, p.Value, errors);
        }
        foreach (var (hi, lo) in RangePairs)
        {
            if (values.TryGetValue(hi, out var h) && values.TryGetValue(lo, out var l) && h.ValueKind == JsonValueKind.Number && l.ValueKind == JsonValueKind.Number && h.GetDouble() < l.GetDouble())
                errors.Add($"'{hi}' ({h.GetDouble()}) is below '{lo}' ({l.GetDouble()}): an inverted range");
        }
        // forbidden combinations (spec §5.5 / R07 / R02)
        if (values.TryGetValue("G9.role", out var g9) && g9.ValueKind == JsonValueKind.String && g9.GetString() == "PRIMARY")
            errors.Add("'G9.role' PRIMARY is forbidden: phase geometry can never be decisive on its own (R07)");
        if (values.TryGetValue("G8.method", out var g8) && g8.ValueKind == JsonValueKind.String && !InstalledG8.Contains(g8.GetString() ?? ""))
            errors.Add($"'G8.method' {g8.GetString()}: DEPLOYMENT_REQUIRED - this build installs {string.Join(", ", InstalledG8)} only");
        if (values.TryGetValue("G6.estimator", out var g6) && g6.ValueKind == JsonValueKind.String && !InstalledG6.Contains(g6.GetString() ?? ""))
            errors.Add($"'G6.estimator' {g6.GetString()}: DEPLOYMENT_REQUIRED - this build computes {string.Join(", ", InstalledG6)} only");
        if (values.TryGetValue("G14.allowed_evidence_types", out var g14) && g14.ValueKind == JsonValueKind.Array)
        {
            foreach (var t in g14.EnumerateArray())
            {
                var s = t.GetString() ?? "";
                if (!ProofTypes.Contains(s)) errors.Add($"'G14.allowed_evidence_types' {s} is not a proof type (allowed: {string.Join(", ", ProofTypes)}); VP presence is never a proof (R02)");
            }
        }
        // G5 capacity (spec §6.3): cycles x period_max must fit the 24 h retention
        if (values.TryGetValue("G5.period_max_s", out var pmax) && pmax.ValueKind == JsonValueKind.Number)
        {
            var cycles = values.TryGetValue("G5.min_complete_cycles", out var mc) && mc.ValueKind == JsonValueKind.Number ? mc.GetDouble() : 5;
            var needed = pmax.GetDouble() * Math.Max(1, cycles);
            if (needed > ExecutionPlans.MaxRetentionS)
                errors.Add($"G5 UNSUPPORTED_CAPACITY: {cycles} cycles of {pmax.GetDouble()} s need {needed} s of retention; this build retains {ExecutionPlans.MaxRetentionS} s (24 h)");
        }
        return errors;
    }

    private static void ValidateOne(PropertyCatalogue.Entry e, JsonElement v, List<string> errors)
    {
        switch (e.Type)
        {
            case "number":
            case "integer":
                if (v.ValueKind != JsonValueKind.Number) { errors.Add($"'{e.Property}' must be a finite number, got {v.ValueKind}"); return; }
                var d = v.GetDouble();
                if (!double.IsFinite(d)) { errors.Add($"'{e.Property}' must be a finite number"); return; }
                if (e.Type == "integer" && Math.Abs(d - Math.Round(d)) > 1e-9) { errors.Add($"'{e.Property}' must be an integer, got {d}"); return; }
                if (e.Unit == "fraction" && d > 1.0) { errors.Add($"'{e.Property}' is a fraction (0..1), got {d} - a percent is not a fraction"); return; }
                if (e.Minimum is { } min && d < min) errors.Add($"'{e.Property}' {d} is below the minimum {min}");
                if (e.Maximum is { } max && d > max) errors.Add($"'{e.Property}' {d} is above the maximum {max}");
                break;
            case "boolean":
                if (v.ValueKind != JsonValueKind.True && v.ValueKind != JsonValueKind.False) errors.Add($"'{e.Property}' must be a boolean, got {v.ValueKind}");
                break;
            case "enum":
                if (v.ValueKind != JsonValueKind.String) { errors.Add($"'{e.Property}' must be one of {string.Join(", ", e.EnumValues)}, got {v.ValueKind}"); return; }
                if (!e.EnumValues.Contains(v.GetString() ?? "", StringComparer.Ordinal)) errors.Add($"'{e.Property}' {v.GetString()} is not one of {string.Join(", ", e.EnumValues)}");
                break;
            case "string_array":
                if (v.ValueKind != JsonValueKind.Array) { errors.Add($"'{e.Property}' must be an array of strings"); return; }
                var n = v.GetArrayLength();
                if (v.EnumerateArray().Any(x => x.ValueKind != JsonValueKind.String)) errors.Add($"'{e.Property}' must contain strings only");
                if (e.MinItems is { } lo && n < lo) errors.Add($"'{e.Property}' needs at least {lo} item(s)");
                if (e.MaxItems is { } hi && n > hi) errors.Add($"'{e.Property}' allows at most {hi} item(s)");
                break;
        }
    }

    /// <summary>The requested execution plan against the compiled capacity (mirror of the jar's ExecutionPlanCapacity.validate).</summary>
    public static IReadOnlyList<string> ValidateExecutionPlan(JsonElement plan)
    {
        var reasons = new List<string>();
        if (plan.ValueKind != JsonValueKind.Object) return new[] { "INVALID: execution_plan must be an object" };
        var installed = ExecutionPlans.Installed();
        var mode = plan.TryGetProperty("scheduler_mode", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString()! : ExecutionPlans.SchedulerMode;
        if (mode != ExecutionPlans.SchedulerMode) reasons.Add($"DEPLOYMENT_REQUIRED: scheduler_mode {mode} (this build runs {ExecutionPlans.SchedulerMode})");
        var compiled = installed.GetProperty("horizons").EnumerateArray().ToDictionary(h => h.GetProperty("horizon_id").GetString()!, h => h, StringComparer.Ordinal);
        var requested = new HashSet<string>(StringComparer.Ordinal);
        if (plan.TryGetProperty("horizons", out var hs) && hs.ValueKind == JsonValueKind.Array)
        {
            foreach (var h in hs.EnumerateArray())
            {
                var id = h.TryGetProperty("horizon_id", out var hid) ? hid.GetString() ?? "" : "";
                requested.Add(id);
                if (!compiled.TryGetValue(id, out var c)) { reasons.Add($"DEPLOYMENT_REQUIRED: horizon '{id}' is not compiled into this build ({string.Join(", ", compiled.Keys)})"); continue; }
                var dur = h.TryGetProperty("duration_s", out var dd) && dd.ValueKind == JsonValueKind.Number ? dd.GetDouble() : c.GetProperty("duration_s").GetDouble();
                var slide = h.TryGetProperty("slide_s", out var ss) && ss.ValueKind == JsonValueKind.Number ? ss.GetDouble() : c.GetProperty("slide_s").GetDouble();
                if (Math.Abs(dur - c.GetProperty("duration_s").GetDouble()) > 1e-9) reasons.Add($"DEPLOYMENT_REQUIRED: horizon '{id}' duration {dur} s (compiled {c.GetProperty("duration_s").GetDouble()} s)");
                if (Math.Abs(slide - c.GetProperty("slide_s").GetDouble()) > 1e-9) reasons.Add($"DEPLOYMENT_REQUIRED: horizon '{id}' slide {slide} s (compiled {c.GetProperty("slide_s").GetDouble()} s)");
                if (h.TryGetProperty("retention_s", out var rs) && rs.ValueKind == JsonValueKind.Number && rs.GetDouble() > ExecutionPlans.MaxRetentionS)
                    reasons.Add($"DEPLOYMENT_REQUIRED: horizon '{id}' retention {rs.GetDouble()} s exceeds the {ExecutionPlans.MaxRetentionS} s buffer");
            }
        }
        var maxActive = installed.GetProperty("capacity_identity").GetProperty("max_active_horizons").GetInt32();
        if (requested.Count > maxActive) reasons.Add($"DEPLOYMENT_REQUIRED: {requested.Count} horizons requested, capacity {maxActive}");
        var compiledAssignments = installed.GetProperty("assignments").EnumerateArray().ToDictionary(a => a.GetProperty("gate").GetString()!, a => a, StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        if (plan.TryGetProperty("assignments", out var asg) && asg.ValueKind == JsonValueKind.Array)
        {
            foreach (var a in asg.EnumerateArray())
            {
                var gate = a.TryGetProperty("gate", out var g) ? g.GetString() ?? "" : "";
                if (!compiledAssignments.TryGetValue(gate, out var c)) { reasons.Add($"INVALID: unknown gate '{gate}'"); continue; }
                if (!seen.Add(gate)) reasons.Add($"INVALID: gate {gate} assigned twice");
                var horizon = a.TryGetProperty("horizon_id", out var ah) ? ah.GetString() ?? "" : "";
                var trigger = a.TryGetProperty("trigger", out var at) ? at.GetString() ?? "" : "";
                if (horizon != c.GetProperty("horizon_id").GetString()) reasons.Add($"DEPLOYMENT_REQUIRED: {gate} on horizon '{horizon}' (compiled {c.GetProperty("horizon_id").GetString()})");
                if (trigger != c.GetProperty("trigger").GetString()) reasons.Add($"DEPLOYMENT_REQUIRED: {gate} trigger {trigger} (compiled {c.GetProperty("trigger").GetString()})");
            }
            foreach (var gate in compiledAssignments.Keys) if (!seen.Contains(gate)) reasons.Add($"INVALID: gate {gate} has no assignment");
        }
        return reasons;
    }

    /// <summary>The full report: property errors + plan reasons, the properties no running job reads (from the build's declaration), the change class of the non-null properties.</summary>
    public static ValidationReport Report(JsonElement resolved, JsonElement executionPlan, IEnumerable<string>? editedProperties = null)
    {
        var errors = new List<string>(ValidateProperties(resolved));
        errors.AddRange(ValidateExecutionPlan(executionPlan));
        var notRead = new SortedDictionary<string, string>(StringComparer.Ordinal);
        var unsupported = UnsupportedInBuild.Reasons;
        if (resolved.ValueKind == JsonValueKind.Object)
        {
            foreach (var p in resolved.EnumerateObject())
                if (p.Value.ValueKind != JsonValueKind.Null && unsupported.TryGetValue(p.Name, out var reason)) notRead[p.Name] = reason;
        }
        var edited = editedProperties?.ToList() ?? (resolved.ValueKind == JsonValueKind.Object ? resolved.EnumerateObject().Where(p => p.Value.ValueKind != JsonValueKind.Null).Select(p => p.Name).ToList() : new List<string>());
        return new ValidationReport(errors, Array.Empty<string>(), notRead, ChangeClassifier.Classify(edited));
    }
}

/// <summary>The build's own declaration of catalogue properties no job reads (contracts/gate-config/v1/unsupported-in-build.json, embedded).</summary>
public static class UnsupportedInBuild
{
    private static readonly Lazy<IReadOnlyDictionary<string, string>> Loaded = new(() =>
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Traverse.CplmApi.Config.unsupported-in-build.json");
        if (stream is null) return new Dictionary<string, string>();
        using var doc = JsonDocument.Parse(stream);
        return doc.RootElement.GetProperty("unsupported").EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString() ?? "", StringComparer.Ordinal);
    });

    public static IReadOnlyDictionary<string, string> Reasons => Loaded.Value;
}
