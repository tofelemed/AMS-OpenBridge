using System.Text.Json;

namespace Traverse.CplmApi.Services.Registry;

/// <summary>Whether an optional input is expected on a loop at all (SME review #23, CHG-059).</summary>
public enum InputApplicability { Expected, NotInstalled, NotApplicable }

/// <summary>What the optional input IS right now — one state per real situation, instead of one "missing".</summary>
public enum InputState { Available, ExpectedUnmapped, NotInstalled, NotApplicable, TemporarilyUnavailable }

/// <summary>
/// SME review #23 (CHG-059): an optional input (valve position VP, peer links for G13) used to have one reading —
/// "not there" — so a loop driving a variable-speed drive, a valve without positioner feedback, a positioner whose tag
/// nobody mapped and a mapped tag that went quiet all showed the same configuration warning (lab: 225 of 230 loops).
/// The applicability is the engineer's statement per loop (registry <c>engineering.vpApplicability</c> /
/// <c>engineering.peerApplicability</c>), defaulting from the loop model's command path; the state combines it with
/// whether the input is mapped and whether the latest window saw it. Only <see cref="InputState.ExpectedUnmapped"/>
/// is a configuration gap; <see cref="InputState.TemporarilyUnavailable"/> is a data problem; the other two are facts.
/// </summary>
public static class OptionalInputs
{
    public static readonly string[] ApplicabilityValues = { "EXPECTED", "NOT_INSTALLED", "NOT_APPLICABLE" };

    public static bool IsApplicability(string? value) =>
        value is not null && ApplicabilityValues.Contains(value.Trim().ToUpperInvariant());

    public static string Code(InputApplicability a) => a switch
    {
        InputApplicability.NotInstalled => "NOT_INSTALLED",
        InputApplicability.NotApplicable => "NOT_APPLICABLE",
        _ => "EXPECTED",
    };

    public static string Code(InputState s) => s switch
    {
        InputState.Available => "AVAILABLE",
        InputState.ExpectedUnmapped => "EXPECTED_UNMAPPED",
        InputState.NotInstalled => "NOT_INSTALLED",
        InputState.NotApplicable => "NOT_APPLICABLE",
        _ => "TEMPORARILY_UNAVAILABLE",
    };

    private static InputApplicability? Declared(JsonElement engineering, string key)
    {
        if (engineering.ValueKind != JsonValueKind.Object || !engineering.TryGetProperty(key, out var v) || v.ValueKind != JsonValueKind.String) return null;
        return (v.GetString() ?? "").Trim().ToUpperInvariant() switch
        {
            "EXPECTED" => InputApplicability.Expected,
            "NOT_INSTALLED" => InputApplicability.NotInstalled,
            "NOT_APPLICABLE" => InputApplicability.NotApplicable,
            _ => null,
        };
    }

    /// <summary>VP: the declared value, else from the command path — a valve expects it; a drive or a direct
    /// action on the PV has no valve to report; an unknown path keeps it expected.</summary>
    public static InputApplicability VpApplicability(JsonElement engineering, string? commandPath) =>
        Declared(engineering, "vpApplicability") ?? ((commandPath ?? "").Trim().ToUpperInvariant() switch
        {
            "OP_TO_VFD" or "OP_TO_PV" => InputApplicability.NotApplicable,
            _ => InputApplicability.Expected,
        });

    /// <summary>Peer links: the declared value, else expected.</summary>
    public static InputApplicability PeerApplicability(JsonElement engineering) =>
        Declared(engineering, "peerApplicability") ?? InputApplicability.Expected;

    /// <param name="mapped">The tag (VP) / the links (peers) exist.</param>
    /// <param name="seenInLatestWindow">Whether the latest evaluated window carried it; null when not known.</param>
    public static InputState State(InputApplicability applicability, bool mapped, bool? seenInLatestWindow)
    {
        if (mapped) return seenInLatestWindow == false ? InputState.TemporarilyUnavailable : InputState.Available;
        return applicability switch
        {
            InputApplicability.NotApplicable => InputState.NotApplicable,
            InputApplicability.NotInstalled => InputState.NotInstalled,
            _ => InputState.ExpectedUnmapped,
        };
    }
}
