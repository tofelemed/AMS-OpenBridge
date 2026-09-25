namespace Traverse.CplmApi.Services;

/// <summary>The operator state of one episode row as the shelving rules see it.</summary>
public sealed record EpisodeOperatorState(
    bool Closed,
    /// <summary>UNACKNOWLEDGED | ACKNOWLEDGED (legacy rows may still say SHELVED until script 60 converts them).</summary>
    string AckState,
    /// <summary>NONE | SHELVED | EXPIRED.</summary>
    string ShelfState,
    DateTimeOffset? ShelveUntil);

/// <summary>What the store must do after a rule accepted a request.</summary>
public enum ShelfAction { Shelved, ShelveUpdated, Unshelved, Acknowledged }

/// <summary>Accepted → the action and the audited history row; refused → an HTTP status and the reason.</summary>
public sealed record ShelfDecision(bool Accepted, ShelfAction? Action, int Status, string? Error)
{
    public static ShelfDecision Ok(ShelfAction action) => new(true, action, 200, null);
    public static ShelfDecision Refuse(int status, string error) => new(false, null, status, error);
}

/// <summary>
/// CHG-032 — shelving as a lifecycle of its own (ISA-18.2 §12), as a pure function of
/// (episode operator state, request, clock). Shelving and acknowledgement are independent
/// facts: shelving never reviews, acknowledging never ends an active shelf. Every shelf has
/// an expiry inside the site limit; an expired shelf is a returned, unreviewed finding until
/// somebody acknowledges, unshelves or re-shelves it.
/// </summary>
public static class EventShelvingRules
{
    public const int DefaultMaxHours = 168;   // 7 days: ISA-18.2 asks for a site-set maximum shelve duration
    public const int MinReasonLength = 3;

    public static ShelfDecision Shelve(EpisodeOperatorState s, DateTimeOffset until, string? reason, DateTimeOffset now, int maxHours)
    {
        if (s.Closed) return ShelfDecision.Refuse(409, "a closed episode cannot be shelved; acknowledge it instead");
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length < MinReasonLength)
            return ShelfDecision.Refuse(400, "a reason for shelving is required");
        if (until <= now) return ShelfDecision.Refuse(400, "shelve 'until' must be in the future");
        if (until > now.AddHours(maxHours))
            return ShelfDecision.Refuse(400, $"shelve 'until' exceeds the site limit of {maxHours} h");
        return ShelfDecision.Ok(IsActiveShelf(s, now) ? ShelfAction.ShelveUpdated : ShelfAction.Shelved);
    }

    public static ShelfDecision Unshelve(EpisodeOperatorState s, DateTimeOffset now)
    {
        if (!IsShelved(s, now)) return ShelfDecision.Refuse(409, "the episode is not shelved");
        return ShelfDecision.Ok(ShelfAction.Unshelved);
    }

    /// <summary>Acknowledging clears a returned (expired) shelf and leaves an active one in place.</summary>
    public static ShelfDecision Acknowledge(EpisodeOperatorState s)
    {
        if (s.AckState == "ACKNOWLEDGED") return ShelfDecision.Refuse(409, "the episode is already acknowledged");
        return ShelfDecision.Ok(ShelfAction.Acknowledged);
    }

    /// <summary>SHELVED with an expiry still ahead. Legacy rows (ack_state SHELVED) are read the same way.</summary>
    public static bool IsActiveShelf(EpisodeOperatorState s, DateTimeOffset now) =>
        (s.ShelfState == "SHELVED" || s.AckState == "SHELVED") && s.ShelveUntil is { } u && u > now;

    /// <summary>SHELVED or EXPIRED (or a legacy SHELVED row whose expiry passed): something to unshelve.</summary>
    public static bool IsShelved(EpisodeOperatorState s, DateTimeOffset now) =>
        s.ShelfState is "SHELVED" or "EXPIRED" || s.AckState == "SHELVED";
}
