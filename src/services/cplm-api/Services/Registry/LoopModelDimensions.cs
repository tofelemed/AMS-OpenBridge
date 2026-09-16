using System.Text.Json;
using System.Text.Json.Serialization;

namespace Traverse.CplmApi.Services.Registry;

/// <summary>
/// v2.5 Task 2G.1 (spec v6 §6.1-6.3, R05 / R25): the loop model as five SEPARATE dimensions plus
/// the acquisition contract. A loop_type only suggests a preset (PRESET_FROM_LOOP_TYPE); a value a
/// person declares is EXPLICIT and a later preset never overwrites it. Pure: the resolution rule,
/// the validation against the registry contract, and the broadcast attribute the engine reads.
/// </summary>
public static class LoopModelDimensions
{
    public sealed record Resolved(string? ServiceFamily, string? DynamicClass, string ObjectiveType, string Topology, string CommandPath,
        CpmAcquisition Acquisition, string ClassificationSource);

    public sealed record ContractView(string[] ServiceFamilies, string[] DynamicClasses, string[] ObjectiveTypes, string[] Topologies,
        string[] CommandPaths, string[] AcquisitionModes, string[] ClassificationSources);

    public static readonly ContractView Contract = new(
        new[] { "FLOW", "PRESSURE_LIQUID", "PRESSURE_GAS", "PRESSURE_VAPOUR", "LEVEL", "TEMPERATURE", "COMPOSITION_ANALYZER", "PH_CONDUCTIVITY", "SPEED_POSITION_POWER", "CASCADE", "SPLIT_RANGE_OVERRIDE_RATIO", "UNKNOWN_UNSTABLE_INVERSE_MIMO" },
        new[] { "FAST_SELF_REG", "SLOW_SELF_REG", "INTEGRATING", "INTEGRATING_LAG", "UNDERDAMPED", "UNKNOWN" },
        new[] { "TIGHT", "AVERAGING", "RATIO", "CONSTRAINT", "RAMP", "BATCH", "QUALITY", "SUPERVISORY", "UNSET" },
        new[] { "SINGLE", "CASCADE_MASTER", "CASCADE_SLAVE", "SPLIT_RANGE", "OVERRIDE", "RATIO", "FEEDFORWARD", "UNKNOWN" },
        new[] { "OP_TO_VALVE", "OP_TO_VFD", "OP_TO_SLAVE_SP", "UNKNOWN" },
        new[] { "PERIODIC", "RBE", "SAMPLE_HOLD" },
        new[] { "PRESET_FROM_LOOP_TYPE", "EXPLICIT" });

    /// <summary>The preset a loop_type suggests (the legacy class packs' assumptions, made visible).</summary>
    public static Resolved PresetFor(string loopType)
    {
        var (family, dyn, objective, path) = loopType.ToUpperInvariant() switch
        {
            "FIC" => ("FLOW", "FAST_SELF_REG", "TIGHT", "OP_TO_VALVE"),
            "PIC" => ("PRESSURE_LIQUID", "FAST_SELF_REG", "TIGHT", "OP_TO_VALVE"),
            "PIC_GAS" => ("PRESSURE_GAS", "INTEGRATING", "AVERAGING", "OP_TO_VALVE"),
            "PIC_VAPOUR" => ("PRESSURE_VAPOUR", "SLOW_SELF_REG", "TIGHT", "OP_TO_VALVE"),
            "LIC" => ("LEVEL", "INTEGRATING", "AVERAGING", "OP_TO_VALVE"),
            "TIC" => ("TEMPERATURE", "SLOW_SELF_REG", "TIGHT", "OP_TO_VALVE"),
            _ => ("UNKNOWN_UNSTABLE_INVERSE_MIMO", "UNKNOWN", "UNSET", "UNKNOWN"),
        };
        return new Resolved(family, dyn, objective, "SINGLE", path, CpmAcquisition.Default, "PRESET_FROM_LOOP_TYPE");
    }

    /// <summary>
    /// The effective dimensions: an explicit request wins field by field over the preset; without a
    /// request, a stored EXPLICIT model is kept verbatim and a stored preset is refreshed from the
    /// current loop_type.
    /// </summary>
    public static Resolved Resolve(string loopType, CpmLoopModel? request, Resolved? stored)
    {
        var preset = PresetFor(loopType);
        if (request is null || request.IsEmpty)
            return stored is { ClassificationSource: "EXPLICIT" } ? stored : preset;
        var baseline = stored is { ClassificationSource: "EXPLICIT" } ? stored : preset;
        return new Resolved(
            Pick(request.ServiceFamily, baseline.ServiceFamily),
            Pick(request.DynamicClass, baseline.DynamicClass),
            Pick(request.ObjectiveType, baseline.ObjectiveType)!,
            Pick(request.Topology, baseline.Topology)!,
            Pick(request.CommandPath, baseline.CommandPath)!,
            request.Acquisition ?? baseline.Acquisition,
            "EXPLICIT");
    }

    private static string? Pick(string? requested, string? fallback) => string.IsNullOrWhiteSpace(requested) ? fallback : requested.Trim().ToUpperInvariant();

    /// <summary>Every enum against the contract, the acquisition contract typed and bounded; one message per field.</summary>
    public static IReadOnlyList<string> Validate(CpmLoopModel? m)
    {
        var errors = new List<string>();
        if (m is null) return errors;
        Check(errors, "serviceFamily", m.ServiceFamily, Contract.ServiceFamilies);
        Check(errors, "dynamicClass", m.DynamicClass, Contract.DynamicClasses);
        Check(errors, "objectiveType", m.ObjectiveType, Contract.ObjectiveTypes);
        Check(errors, "topology", m.Topology, Contract.Topologies);
        Check(errors, "commandPath", m.CommandPath, Contract.CommandPaths);
        if (m.Acquisition is { } a)
        {
            if (!Contract.AcquisitionModes.Contains(a.Mode.ToUpperInvariant(), StringComparer.Ordinal))
                errors.Add($"acquisition.mode '{a.Mode}' is not one of {string.Join(", ", Contract.AcquisitionModes)}");
            if (a.GridSeconds is <= 0 or > 86_400) errors.Add("acquisition.grid_seconds must be in (0, 86400]");
            if (a.SourceFilterS is < 0) errors.Add("acquisition.source_filter_s must be >= 0");
            if (a.TimestampQuantizationMs is < 0) errors.Add("acquisition.timestamp_quantization_ms must be >= 0");
            if (a.DeclaredScanS is <= 0) errors.Add("acquisition.declared_scan_s must be > 0");
        }
        return errors;
    }

    private static void Check(List<string> errors, string field, string? value, string[] allowed)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        if (!allowed.Contains(value.Trim().ToUpperInvariant(), StringComparer.Ordinal))
            errors.Add($"{field} '{value}' is not one of {string.Join(", ", allowed)}");
    }

    private static readonly JsonSerializerOptions Snake = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    /// <summary>The cplm.loop.model broadcast attribute (snake_case, what the Flink profile resolution and MethodEligibility read).</summary>
    public static string BroadcastJson(Resolved d) => JsonSerializer.Serialize(new
    {
        service_family = d.ServiceFamily, dynamic_class = d.DynamicClass, objective_type = d.ObjectiveType, topology = d.Topology, command_path = d.CommandPath,
        acquisition = new { mode = d.Acquisition.Mode, grid_seconds = d.Acquisition.GridSeconds, source_filter_s = d.Acquisition.SourceFilterS, timestamp_quantization_ms = d.Acquisition.TimestampQuantizationMs, declared_scan_s = d.Acquisition.DeclaredScanS },
        classification_source = d.ClassificationSource,
    }, Snake);

    public static string AcquisitionJson(CpmAcquisition a) => JsonSerializer.Serialize(new
    {
        mode = a.Mode, grid_seconds = a.GridSeconds, source_filter_s = a.SourceFilterS, timestamp_quantization_ms = a.TimestampQuantizationMs, declared_scan_s = a.DeclaredScanS,
    }, Snake);

    public static CpmAcquisition ReadAcquisition(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return CpmAcquisition.Default;
        try
        {
            using var doc = JsonDocument.Parse(json);
            var r = doc.RootElement;
            if (r.ValueKind != JsonValueKind.Object) return CpmAcquisition.Default;
            return new CpmAcquisition(
                r.TryGetProperty("mode", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString()! : "PERIODIC",
                Num(r, "grid_seconds") is { } g ? (int)g : null, Num(r, "source_filter_s"), Num(r, "timestamp_quantization_ms") is { } q ? (int)q : null, Num(r, "declared_scan_s"));
        }
        catch (JsonException) { return CpmAcquisition.Default; }
    }

    private static double? Num(JsonElement r, string name) => r.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;

    /// <summary>A registry row's columns as the stored model (null when the row predates 2G.1).</summary>
    public static Resolved? FromRow(string? serviceFamily, string? dynamicClass, string? objectiveType, string? topology, string? commandPath, string? acquisitionJson, string? classificationSource)
    {
        if (classificationSource is null) return null;
        return new Resolved(serviceFamily, dynamicClass, objectiveType ?? "UNSET", topology ?? "UNKNOWN", commandPath ?? "UNKNOWN", ReadAcquisition(acquisitionJson), classificationSource);
    }
}
