// CHG-224 (owner, 23 Nov): GET /configuration/effective says, per catalogue property, the value the system really uses for the loop,
// where that value is set and why, in plain words - no "No value / unset". The kind, the wording and where a value is changed come
// from the source map (PropertySources); the per-loop numbers from the resolved properties the endpoint already computes, the loop's
// registry entry and three small reads (LoopValueReads). Gate Configuration lists only the editable ones (D4); the other pages read
// the rest. This changes what the page says, never what the engine does.
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Traverse.CplmApi.Config;
using Traverse.CplmApi.Services.Registry;

namespace Traverse.CplmApi.Services.Config;

/// <summary>One property of the loop as GET /configuration/effective serves it.</summary>
/// <param name="Value">the value in use for this loop (a number, word, list or, for retention, an object of day counts); null = the basis says it in words</param>
/// <param name="Configured">the value a bundle layer sets (EDITABLE / DECISION only), else null</param>
/// <param name="Level">the layer that sets <paramref name="Configured"/>: FACTORY, PROFILE (the loop type), SITE (plant-wide), LOOP, REGIME; else null</param>
/// <param name="RegistryField">for LOOP_REGISTRY: the registry field to link to</param>
/// <param name="Unit">the loop's PV unit (registry engineering.pvUnit) when the property is in PV units, else null</param>
public sealed record EffectiveEntry(string Property, string Gate, string Kind, bool Editable, object? Value, JsonElement? Configured, string? Level,
    string SetIn, string? RegistryField, string Basis, string? Unit);

public static partial class EffectiveEntries
{
    /// <param name="Resolved">the loop's effective properties and sources (LoopEffective, or FACTORY + PROFILE without an active bundle)</param>
    /// <param name="Bundle">the active bundle the loop runs under; null = none (the class pack and the job defaults govern)</param>
    public sealed record Context(CpmLoopDto Loop, string ProfileId, EffectiveConfigResolver.Result Resolved, BundleView? Bundle, LoopValueFacts Facts);

    /// <summary>A resolver's answer: the value in use, the sentence template and its slots; Configured / Level for Gate Configuration properties.</summary>
    private sealed record Answer(object? Value, string Text, IReadOnlyDictionary<string, string> Slots, JsonElement? Configured = null, string? Level = null);

    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
    private static readonly Regex Slot = new(@"\{(\w+)\}", RegexOptions.Compiled);

    /// <summary>One entry per catalogue property, in catalogue order.</summary>
    public static IReadOnlyList<EffectiveEntry> Build(Context ctx)
    {
        var map = PropertySources.Current;
        var f = new Facts(ctx, map);
        var list = new List<EffectiveEntry>(PropertyCatalogue.Current.Count);
        foreach (var p in PropertyCatalogue.Current.Properties)
        {
            if (!map.TryGet(p.Property, out var src)) continue;                 // the coverage test guarantees an entry
            var a = Resolve(src, p, f);
            var slots = new Dictionary<string, string>(a.Slots, StringComparer.Ordinal);
            slots.TryAdd("u", UnitWord(src, p, f.PvUnit, map));
            slots.TryAdd("value", Display(a.Value, p, map));
            if (a.Level is { } lv) slots.TryAdd("level", map.Levels.GetValueOrDefault(lv, lv.ToLowerInvariant()));
            var basis = Slot.Replace(a.Text, m => slots.TryGetValue(m.Groups[1].Value, out var s) ? s : m.Value);
            list.Add(new EffectiveEntry(p.Property, p.Gate, src.Kind, src.Editable, a.Value, a.Configured, a.Level, src.SetIn, src.RegistryField, basis,
                UnitFor(src, p, f.PvUnit)));
        }
        return list;
    }

    private static Answer Resolve(PropertySources.Entry src, PropertyCatalogue.Entry p, Facts f) => src.Resolver switch
    {
        null when src.Kind == "EDITABLE" => Generic(p.Property, f),
        null => new Answer(src.Value, Text(src), NoSlots),
        "G2_BAND" => G2Band(src, p.Property, f),
        "REGION" => Region(src, p.Property, f),
        "PV_SCALED" => PvScaled(src, p.Property, f),
        "LIMIT_DWELL" => LimitDwell(src, p.Property, f),
        "LAMBDA" => Lambda(src, p.Property, f),
        "ACQUISITION" => Acquisition(src, f),
        "OBJECTIVE" => Objective(src, f),
        "PEERS" => Peers(src, f),
        "RETENTION_SHORT" => RetentionShort(src, f),
        "RETENTION_LONG" => RetentionLong(src, f),
        "RETENTION_RESPONSE" => RetentionResponse(src, f),
        "GAP" => PerInterval(src, f, 1.5, "gap"),
        "ALIGNMENT" => PerInterval(src, f, 0.75, "tolerance"),
        "ACF_LAG" => Lag(src, f, 2000),
        "XCORR_LAG" => Lag(src, f, 200),
        "STEP_MIN" => StepMin(src, f),
        "RAMP" => new Answer(Round(RampMinSlopeEuPerS * f.K), Text(src), NoSlots),
        "VALIDATION_RMSE" => new Answer(Round(ValidationNoiseFloors * NoiseFloorEu * f.K), Text(src), NoSlots),
        "ERROR_BAND" => ErrorBand(src, f),
        "PV_FILTER" => PvFilter(src, f),
        "SIGNAL_ROLE" => SignalRole(src, f),
        "SAME_AS_G5" => SameAsG5(src, f),
        "G5_LEAD" => G5Lead(src, p.Property, f),
        "MODEL_FAMILY" => ModelFamily(src, f),
        "PROOF" => Proof(src, f),
        "SHAPE_HIGH" => new Answer(null, Text(src), Slots(("high", Fmt(f.Num("G7.shape_score_high") ?? 0.8)))),
        _ => throw new InvalidOperationException($"property-sources.json: unknown resolver '{src.Resolver}' for {p.Property}"),
    };

    private static readonly IReadOnlyDictionary<string, string> NoSlots = new Dictionary<string, string>();

    private static IReadOnlyDictionary<string, string> Slots(params (string Name, string Text)[] slots) =>
        slots.ToDictionary(s => s.Name, s => s.Text, StringComparer.Ordinal);

    private static string Text(PropertySources.Entry src, string variant = "default") =>
        src.Basis.TryGetValue(variant, out var t) ? t : src.Basis.GetValueOrDefault("default", "");

    // ── the per-loop facts ──────────────────────────────────────────────────
    private sealed class Facts
    {
        public readonly Context Ctx;
        public readonly PropertySources Map;
        public readonly CpmLoopModelDto Model;
        public readonly string? PvUnit;
        /// <summary>The PV span the engine works with: the declared range (a missing bound is 0 / 100, as the registry broadcast sends it), else 0-100.</summary>
        public readonly double Span;
        /// <summary>The loop declared a usable PV range (the engine's pvRangeDeclared).</summary>
        public readonly bool Declared;
        /// <summary>The span is finite and positive (else the engine falls back to its legacy constants).</summary>
        public readonly bool SpanUsable;
        /// <summary>CHG-204 ResponseScale: span / 100 for a declared range, else 1.</summary>
        public readonly double K;

        public Facts(Context ctx, PropertySources map)
        {
            Ctx = ctx;
            Map = map;
            var preset = LoopModelDimensions.PresetFor(ctx.Loop.LoopType);
            Model = ctx.Loop.Model ?? new CpmLoopModelDto(preset.ServiceFamily, preset.DynamicClass, preset.ObjectiveType, preset.Topology, preset.CommandPath,
                preset.Acquisition, preset.ClassificationSource);
            var eng = ctx.Loop.Engineering;
            PvUnit = string.IsNullOrWhiteSpace(eng?.PvUnit) ? null : eng!.PvUnit!.Trim();
            var any = eng?.PvMin is not null || eng?.PvMax is not null;
            Span = any ? (eng!.PvMax ?? 100.0) - (eng.PvMin ?? 0.0) : 100.0;
            SpanUsable = double.IsFinite(Span) && Span > 1e-12;
            Declared = any && SpanUsable;
            K = Declared ? Span / 100.0 : 1.0;
        }

        public double? Interval => Ctx.Facts.SampleIntervalS;

        public JsonElement? Raw(string property) =>
            Ctx.Resolved.Properties.TryGetValue(property, out var v) && v.ValueKind != JsonValueKind.Null ? v : null;

        public double? Num(string property) => Raw(property) is { ValueKind: JsonValueKind.Number } v ? v.GetDouble() : null;

        public string? Level(string property) => Ctx.Resolved.Sources.TryGetValue(property, out var s) && s != "NO_VALUE" ? s : null;

        /// <summary>The SITE, PROFILE and LOOP layer contents of the active bundle, in the order the engine lays them over the class pack.</summary>
        public IEnumerable<JsonElement> EngineLayers()
        {
            if (Ctx.Bundle?.Layers is not { ValueKind: JsonValueKind.Array } layers) yield break;
            foreach (var kind in new[] { "SITE", "PROFILE", "LOOP" })
                foreach (var l in layers.EnumerateArray())
                    if (l.TryGetProperty("kind", out var k) && k.GetString() == kind && l.TryGetProperty("content", out var c) && c.ValueKind == JsonValueKind.Object)
                        yield return c;
        }

        /// <summary>A layer the engine applies sets this property (the engine's bundleEuKeys rule): a value, not null, not RESET_TO_INHERITED.</summary>
        public bool BundleSets(string property) => EngineLayers().Any(c => Stored(c, property) is not null);

        public static JsonElement? Stored(JsonElement content, string property) =>
            content.TryGetProperty(property, out var v) && v.ValueKind != JsonValueKind.Null
            && !(v.ValueKind == JsonValueKind.String && v.GetString() == EffectiveConfigResolver.ResetToInherited) ? v : null;
    }

    // ── wording helpers ─────────────────────────────────────────────────────
    private static double Round(double v) => Math.Round(v, 6);

    /// <summary>A number for a sentence: thousands separated from 100, one decimal kept below 10 ("2.0", "7.5", "3.75").</summary>
    internal static string Fmt(double x)
    {
        var a = Math.Abs(x);
        if (a == 0) return "0";
        if (a >= 100) return x.ToString("#,0", Inv);
        if (a >= 10) return x.ToString("0.#", Inv);
        if (a >= 0.01)
        {
            var s = x.ToString("0.00", Inv).TrimEnd('0');
            return s.EndsWith('.') ? s + "0" : s;
        }
        // Below 0.01: two significant digits as a plain decimal ("0.0035", "0.000000001"), never "1E-09".
        var places = Math.Min(15, (int)Math.Ceiling(-Math.Log10(a)) + 1);
        return Math.Round(x, places).ToString("0." + new string('#', places), Inv);
    }

    /// <summary>A percentage or ratio with no trailing zeros ("1", "0.5").</summary>
    private static string Plain(double x) => Math.Round(x, 6).ToString("0.######", Inv);

    private static string Display(object? value, PropertyCatalogue.Entry p, PropertySources map) => value switch
    {
        null => "",
        JsonElement e => DisplayElement(e, p, map),
        double d => p.Type == "integer" ? Math.Round(d).ToString("#,0", Inv) : Fmt(d),
        int or long => Convert.ToInt64(value, Inv).ToString("#,0", Inv),
        string s => Word(s, p, map),
        IEnumerable<string> list => string.Join(", ", list),
        _ => value.ToString() ?? "",
    };

    private static string DisplayElement(JsonElement e, PropertyCatalogue.Entry p, PropertySources map)
    {
        switch (e.ValueKind)
        {
            case JsonValueKind.Number:
                var raw = e.GetRawText();
                return raw.IndexOfAny(new[] { '.', 'e', 'E' }) < 0 ? e.GetInt64().ToString("#,0", Inv) : Fmt(e.GetDouble());
            case JsonValueKind.String: return Word(e.GetString() ?? "", p, map);
            case JsonValueKind.True: return "Yes";
            case JsonValueKind.False: return "No";
            case JsonValueKind.Array: return string.Join(", ", e.EnumerateArray().Select(x => DisplayElement(x, p, map)));
            default: return "";
        }
    }

    /// <summary>A stored word as a person reads it: the role words, else "SOME_TOKEN" -> "Some token".</summary>
    private static string Word(string token, PropertyCatalogue.Entry p, PropertySources map)
    {
        if (p.Unit == "role" && map.Words.TryGetValue("role", out var roles) && roles.TryGetValue(token, out var w)) return w;
        var s = token.Replace('_', ' ').ToLowerInvariant();
        return s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s[1..];
    }

    private static bool InPv(PropertySources.Entry src, PropertyCatalogue.Entry p) => src.Unit == "PV" || p.Unit.StartsWith("PV_EU", StringComparison.Ordinal);

    /// <summary>The unit after a number in a sentence: the PV unit for PV quantities, else a plain word for the catalogue unit.</summary>
    private static string UnitWord(PropertySources.Entry src, PropertyCatalogue.Entry p, string? pvUnit, PropertySources map)
    {
        if (InPv(src, p)) return pvUnit is null ? "" : " " + pvUnit + (p.Unit == "PV_EU/input_EU" ? " per %" : "");
        return map.UnitWords.GetValueOrDefault(p.Unit, "");
    }

    /// <summary>The entry's unit field: the PV unit for PV quantities (per s for a rate, per % for a gain), else null.</summary>
    private static string? UnitFor(PropertySources.Entry src, PropertyCatalogue.Entry p, string? pvUnit)
    {
        if (pvUnit is null || !InPv(src, p)) return null;
        return p.Unit switch { "PV_EU/s" => pvUnit + "/s", "PV_EU/input_EU" => pvUnit + " per %", _ => pvUnit };
    }

    private static string Hours(int h) => h == 1 ? "1 hour" : $"{h} hours";

    private static string Days(int? d) => d switch { null => "without a time limit", 1 => "1 day", _ => $"{d} days" };

    /// <summary>A span of time as the inventory states it: seconds up to 2 h, then hours with one decimal.</summary>
    private static string Duration(double s) => s >= 7200 ? (s / 3600).ToString("0.#", Inv) + " h" : Fmt(s) + " s";
}
