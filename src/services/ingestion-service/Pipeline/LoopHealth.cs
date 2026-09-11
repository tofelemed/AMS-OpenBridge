namespace Traverse.IngestionService.Pipeline;

/// <summary>
/// Why a registered loop is, or is not, producing tuples.
///
/// This exists because of a two-hour investigation on the plant (2026-09-11): 143 of
/// 175 registered loops were producing nothing, and the only way to find out why was
/// to inventory the MQTT broker by hand. The joiner knew the answer the whole time —
/// it gates emission until pv, sp AND op have each been seen — but it had no way to
/// say so. Silence was correct behaviour reported terribly.
///
/// The gating itself is deliberate and must not be relaxed: without SP there is no
/// control error, and substituting a default produces confident wrong verdicts rather
/// than missing ones (see the P1-12 note in CplmNormalizedSample.java, where a
/// defaulted op=0 once read as "G4 PASS, actuator healthy" for a dead valve).
/// </summary>
public static class LoopHealthState
{
    /// <summary>Complete, and emitting.</summary>
    public const string Flowing = "flowing";
    /// <summary>Complete, but nothing has advanced recently — the source went quiet.</summary>
    public const string Idle = "idle";
    /// <summary>Some signals arriving, but a REQUIRED member has never been seen, so
    /// this loop can never emit. The OT side has to publish the missing signal.</summary>
    public const string Held = "held";
    /// <summary>Registered, but not one message has ever arrived for it.</summary>
    public const string Silent = "silent";
}

/// <summary>One loop's ingestion state. `Missing` names the required members
/// (pv/sp/op) never seen — the actionable field, and the reason a loop is dark.</summary>
public sealed record LoopHealthRow(
    string LoopId,
    string State,
    IReadOnlyList<string> Missing,
    IReadOnlyList<string> Seen,
    bool ModeSeen,
    long? LastSourceTsMs,
    long? LastEmittedTsMs,
    long? SecondsSinceEmit,
    long SkippedTicks,
    string? SourceFcs)
{
    /// <summary>The three the joiner gates on. MODE is tracked but never gates:
    /// a loop with no MODE still emits, carrying "UNKNOWN" (and is then excluded at
    /// G1 downstream, which is a different and visible failure).</summary>
    public static readonly string[] RequiredRoles = { "pv", "sp", "op" };
}

/// <summary>Fleet roll-up for /stats — the glance that answers "how much of the
/// plant is actually reaching us, and what is holding the rest back".</summary>
public sealed record LoopHealthSummary(
    int Total, int Flowing, int Idle, int Held, int Silent,
    IReadOnlyDictionary<string, int> MissingByRole,
    int NoMode)
{
    public static LoopHealthSummary From(IReadOnlyList<LoopHealthRow> rows)
    {
        var missing = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var role in LoopHealthRow.RequiredRoles) missing[role] = 0;
        foreach (var r in rows)
            foreach (var m in r.Missing)
                missing[m] = missing.TryGetValue(m, out var n) ? n + 1 : 1;

        return new LoopHealthSummary(
            Total: rows.Count,
            Flowing: rows.Count(r => r.State == LoopHealthState.Flowing),
            Idle: rows.Count(r => r.State == LoopHealthState.Idle),
            Held: rows.Count(r => r.State == LoopHealthState.Held),
            Silent: rows.Count(r => r.State == LoopHealthState.Silent),
            MissingByRole: missing,
            // Counted ONLY for loops that are otherwise analysable. A held loop's
            // missing MODE is not the actionable fact -- its missing SP is -- and a
            // silent loop has no data at all. On the plant the MODE-less loops were
            // all flowing, which is exactly the set worth chasing: they reach the
            // engine and are then excluded at G1 for want of one signal.
            NoMode: rows.Count(r => !r.ModeSeen &&
                (r.State == LoopHealthState.Flowing || r.State == LoopHealthState.Idle)));
    }

    public object ToPayload() => new
    {
        total = Total,
        flowing = Flowing,
        idle = Idle,
        held = Held,
        silent = Silent,
        missingByRole = MissingByRole,
        noMode = NoMode,
    };
}
