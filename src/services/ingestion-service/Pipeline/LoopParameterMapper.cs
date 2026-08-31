using System.Globalization;
using Traverse.IngestionService.Models;

namespace Traverse.IngestionService.Pipeline;

public sealed record MappedParameter(string Role, bool IsTupleMember, double? NumericValue, string? ModeString);

/// <summary>
/// Source parameter (PV/SP/OP/MODE/P/I/D/GW/…) → canonical role via the per-config
/// param_roles map. pv/sp/op/vp/mode are tuple members; any other mapped role rides
/// the tuple as a numeric extension field (docs/ot-data-integration/09 §2). MODE is
/// numeric on this gateway (e.g. 4.0) and translated via mode_value_map; unmapped
/// values pass through raw — visible degradation, never a silent guess.
/// </summary>
public static class LoopParameterMapper
{
    private static readonly HashSet<string> TupleMembers = new(StringComparer.Ordinal)
    { "pv", "sp", "op", "vp", "mode" };

    public static bool TryMap(string parameter, OtLoopPayload payload, LoopIngestSettings cfg,
        out MappedParameter? mapped, out string? reason)
    {
        mapped = null; reason = null;
        if (!cfg.ParamRoles.TryGetValue(parameter, out var configuredRole))
        {
            reason = DlqReasons.UnknownParameter;
            return false;
        }
        var role = configuredRole.Trim().ToLowerInvariant();

        if (role == "mode")
        {
            mapped = new MappedParameter(role, IsTupleMember: true, payload.NumericValue,
                ResolveMode(payload, cfg.ModeValueMap));
            return true;
        }
        if (payload.NumericValue is null)
        {
            reason = DlqReasons.MissingField; // numeric role received a non-numeric value
            return false;
        }
        mapped = new MappedParameter(role, TupleMembers.Contains(role), payload.NumericValue, null);
        return true;
    }

    /// <summary>Integral numerics key the map by their integer form ("4"); everything
    /// else keys by the raw string. Unmapped keys return themselves.</summary>
    public static string ResolveMode(OtLoopPayload payload, IReadOnlyDictionary<string, string> map)
    {
        string key;
        if (payload.NumericValue is { } n && Math.Abs(n - Math.Round(n)) < 1e-9)
            key = ((long)Math.Round(n)).ToString(CultureInfo.InvariantCulture);
        else
            key = (payload.RawValue ?? "").Trim().Trim('"');
        return map.TryGetValue(key, out var mode) ? mode : key;
    }
}
