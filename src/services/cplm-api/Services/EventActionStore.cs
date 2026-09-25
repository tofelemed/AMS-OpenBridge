using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>One row of analytics.cplm_event_actions.</summary>
public sealed record EventActionRow(long Id, long EventId, string Action, string Actor, DateTimeOffset At, DateTimeOffset? Until, string? Reason);

/// <summary>
/// CHG-032 — the writes behind acknowledge / shelve / unshelve and the per-episode action
/// history. Every mutation runs in one transaction: the frame row and its history row land
/// together or not at all. The rules live in <see cref="EventShelvingRules"/>; this class
/// only reads the operator state, applies an accepted decision and records it.
/// </summary>
public sealed class EventActionStore
{
    private readonly NpgsqlDataSource _db;
    public EventActionStore([FromKeyedServices("cplm")] NpgsqlDataSource db) => _db = db;

    public async Task<EpisodeOperatorState?> ReadAsync(long id, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var row = await conn.QueryFirstOrDefaultAsync<(DateTime? closedAt, string ackState, string shelfState, DateTime? shelveUntil)>("""
            SELECT closed_at, ack_state, shelf_state, shelve_until
            FROM analytics.cplm_event_frames WHERE id = @id
            """, new { id });
        if (row == default) return null;
        return new EpisodeOperatorState(row.closedAt is not null, row.ackState, row.shelfState,
            row.shelveUntil is { } u ? new DateTimeOffset(DateTime.SpecifyKind(u, DateTimeKind.Utc)) : null);
    }

    public async Task ShelveAsync(long id, string actor, DateTimeOffset until, string reason, bool update, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync("""
            UPDATE analytics.cplm_event_frames
            SET shelf_state = 'SHELVED', shelved_by = @actor, shelved_at = NOW(), shelve_until = @until,
                shelve_reason = @reason,
                -- legacy rows: the shelf no longer lives in ack_state
                ack_state = CASE WHEN ack_state = 'SHELVED' THEN 'UNACKNOWLEDGED' ELSE ack_state END,
                updated_at = NOW()
            WHERE id = @id
            """, new { id, actor, until, reason }, tx);
        await RecordAsync(conn, tx, id, update ? "SHELVE_UPDATED" : "SHELVED", actor, until, reason);
        await tx.CommitAsync(ct);
    }

    public async Task UnshelveAsync(long id, string actor, string? reason, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync("""
            UPDATE analytics.cplm_event_frames
            SET shelf_state = 'NONE', shelved_by = NULL, shelved_at = NULL, shelve_until = NULL, shelve_reason = NULL,
                ack_state = CASE WHEN ack_state = 'SHELVED' THEN 'UNACKNOWLEDGED' ELSE ack_state END,
                updated_at = NOW()
            WHERE id = @id
            """, new { id }, tx);
        await RecordAsync(conn, tx, id, "UNSHELVED", actor, null, reason);
        await tx.CommitAsync(ct);
    }

    /// <summary>Acknowledge: records the review; an EXPIRED shelf is cleared by it, an active one is kept.</summary>
    public async Task AcknowledgeAsync(long id, string actor, string? note, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync("""
            UPDATE analytics.cplm_event_frames
            SET ack_state = 'ACKNOWLEDGED', acked_by = @actor, acked_at = NOW(), note = COALESCE(@note, note),
                shelf_state   = CASE WHEN shelf_state = 'EXPIRED' THEN 'NONE' ELSE shelf_state END,
                shelved_by    = CASE WHEN shelf_state = 'EXPIRED' THEN NULL ELSE shelved_by END,
                shelved_at    = CASE WHEN shelf_state = 'EXPIRED' THEN NULL ELSE shelved_at END,
                shelve_until  = CASE WHEN shelf_state = 'EXPIRED' THEN NULL ELSE shelve_until END,
                shelve_reason = CASE WHEN shelf_state = 'EXPIRED' THEN NULL ELSE shelve_reason END,
                updated_at = NOW()
            WHERE id = @id
            """, new { id, actor, note }, tx);
        await RecordAsync(conn, tx, id, "ACKNOWLEDGED", actor, null, note);
        await tx.CommitAsync(ct);
    }

    /// <summary>The sweeper's step: every shelf whose expiry passed becomes EXPIRED, once, with its history row.</summary>
    public static async Task<IReadOnlyList<(long Id, DateTimeOffset Until)>> ExpireDueAsync(NpgsqlDataSource db, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        var due = (await conn.QueryAsync<(long id, DateTime until)>("""
            UPDATE analytics.cplm_event_frames
            SET shelf_state = 'EXPIRED', updated_at = NOW()
            WHERE shelf_state = 'SHELVED' AND shelve_until IS NOT NULL AND shelve_until <= NOW()
            RETURNING id, shelve_until
            """, transaction: tx)).ToList();
        foreach (var (id, until) in due)
            await RecordAsync(conn, tx, id, "SHELVE_EXPIRED", "system", new DateTimeOffset(DateTime.SpecifyKind(until, DateTimeKind.Utc)), "Shelve period expired");
        await tx.CommitAsync(ct);
        return due.Select(d => (d.id, new DateTimeOffset(DateTime.SpecifyKind(d.until, DateTimeKind.Utc)))).ToList();
    }

    public async Task<IReadOnlyList<EventActionRow>> HistoryAsync(long id, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        return (await conn.QueryAsync<EventActionRow>("""
            SELECT id AS Id, event_id AS EventId, action AS Action, actor AS Actor, at AS At, until AS Until, reason AS Reason
            FROM analytics.cplm_event_actions WHERE event_id = @id
            ORDER BY at DESC, id DESC
            """, new { id })).ToList();
    }

    private static Task RecordAsync(NpgsqlConnection conn, NpgsqlTransaction tx, long id, string action, string actor, DateTimeOffset? until, string? reason) =>
        conn.ExecuteAsync("""
            INSERT INTO analytics.cplm_event_actions (event_id, action, actor, until, reason)
            VALUES (@id, @action, @actor, @until, @reason)
            """, new { id, action, actor, until, reason }, tx);
}
