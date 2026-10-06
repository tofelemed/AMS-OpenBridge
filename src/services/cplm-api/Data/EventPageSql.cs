namespace Traverse.CplmApi.Data;

/// <summary>
/// CHG-063 — the Loop Events list filtered, searched and paged on the server. The page used to fetch one 200-row
/// "worst first" slice and filter it in the browser, so its tabs, search, plant scope and `?event=` deep links only
/// reached that slice (lab: 500 episodes, an open low-priority one could not be found or opened).
///
/// The state predicates mirror the frontend's <c>matchesEventFilter</c> (events/shelfState.ts) — keep them in step:
/// condition CLOSED = condition_state CLOSED or closed_at set; an ACTIVE shelf = SHELVED with a future expiry; an
/// EXPIRED shelf = EXPIRED, or SHELVED whose expiry passed before the sweeper marked it (or with none recorded);
/// a row the shelving conversion has not reached (ack_state SHELVED) reads as SHELVED.
/// </summary>
public static class EventPageSql
{
    public static readonly string[] Filters =
        { "all", "open", "unobservable", "unacknowledged", "acknowledged", "shelved", "shelfExpired", "closed" };

    public const string Columns = """
        e.id, e.loop_id, e.window_kind, e.family, e.opened_at, e.closed_at,
        e.peak_diagnosis, e.peak_confidence, e.last_diagnosis, e.last_confidence,
        e.severity, e.window_count, e.ack_state, e.acked_by, e.acked_at,
        e.shelve_until, e.note, e.calculation_version, e.dynamics_profile_version,
        e.availability_state, e.condition_state, e.result_revision, e.qualified_support_ms, e.close_reason,
        e.shelf_state, e.shelved_by, e.shelved_at, e.shelve_reason
        """;

    private const string Closed = "(e.condition_state = 'CLOSED' OR e.closed_at IS NOT NULL)";
    private const string Shelf = "(CASE WHEN e.shelf_state = 'NONE' AND e.ack_state = 'SHELVED' THEN 'SHELVED' ELSE e.shelf_state END)";
    private const string ShelfActive = $"({Shelf} = 'SHELVED' AND e.shelve_until > NOW())";
    private const string ShelfExpired = $"({Shelf} = 'EXPIRED' OR ({Shelf} = 'SHELVED' AND (e.shelve_until IS NULL OR e.shelve_until <= NOW())))";

    /// <summary>The predicate of one state tab (unknown keys never reach here — the controller validates).</summary>
    public static string StatePredicate(string filter) => filter switch
    {
        "open" => $"NOT {Closed}",
        "unobservable" => $"NOT {Closed} AND e.availability_state = 'UNOBSERVABLE'",
        "unacknowledged" => $"NOT {Closed} AND e.ack_state <> 'ACKNOWLEDGED' AND NOT {ShelfActive}",
        "acknowledged" => "e.ack_state = 'ACKNOWLEDGED'",
        "shelved" => ShelfActive,
        "shelfExpired" => ShelfExpired,
        "closed" => Closed,
        _ => "TRUE",
    };

    /// <summary>Loop, plant scope and free text — the part every tab count shares.</summary>
    public const string Scope = """
        (@loopId::text IS NULL OR lower(e.loop_id) = lower(@loopId))
        AND (@site::text IS NULL OR r.site = @site)
        AND (@area::text IS NULL OR r.area = @area)
        AND (@unit::text IS NULL OR r.unit = @unit)
        AND (@q::text IS NULL
             OR e.loop_id ILIKE @q ESCAPE '\' OR e.family ILIKE @q ESCAPE '\'
             OR e.peak_diagnosis ILIKE @q ESCAPE '\' OR r.display_name ILIKE @q ESCAPE '\')
        """;

    // An episode whose loop is not in the registry cannot be placed: under a plant scope it is left out (r.* NULL).
    public const string From = """
        FROM analytics.cplm_event_frames e
        LEFT JOIN cpm.loop_registry r ON lower(r.loop_id) = lower(e.loop_id)
        """;

    public static string OrderBy(string sort) => sort == "recent"
        ? "e.opened_at DESC, e.id DESC"
        : $"{Closed} ASC, e.peak_confidence DESC NULLS LAST, e.opened_at DESC, e.id DESC";

    public static string Page(string filter, string sort) => $"""
        SELECT {Columns}
        {From}
        WHERE {Scope} AND {StatePredicate(filter)}
        ORDER BY {OrderBy(sort)}
        LIMIT @limit OFFSET @offset
        """;

    /// <summary>Every tab's count under the same loop / scope / search, in one pass.</summary>
    public static string Counts() => $"""
        SELECT COUNT(*)::int AS "all",
               {string.Join(",\n       ", Filters.Skip(1).Select(f => $"COUNT(*) FILTER (WHERE {StatePredicate(f)})::int AS \"{f}\""))}
        {From}
        WHERE {Scope}
        """;

    public static string ById => $"""
        SELECT {Columns}
        FROM analytics.cplm_event_frames e
        WHERE e.id = @id
        """;

    /// <summary>Free text → a contains-pattern with LIKE wildcards escaped; blank → null (no search).</summary>
    public static string? Pattern(string? q)
    {
        var t = q?.Trim();
        if (string.IsNullOrEmpty(t)) return null;
        if (t.Length > 100) t = t[..100];
        return "%" + t.Replace(@"\", @"\\").Replace("%", @"\%").Replace("_", @"\_") + "%";
    }
}
