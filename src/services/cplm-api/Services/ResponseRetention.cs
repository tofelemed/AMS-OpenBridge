using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>
/// CHG-049: response_event / response_metric had no retention (about 50 MB/day at Marun). Row RESPONSE of retention_policy, batched.
/// CHG-091: every system model pinned its event for ever, and the engine creates ~1,000 models a day (none reviewed at Marun:
/// VALIDATED is set automatically), so the purge never caught up. Unreviewed models now age out with the RESPONSE days, and
/// CENSORED events (rejected captures, ~73 % of all events) keep only row RESPONSE_CENSORED's days.
/// </summary>
public static class ResponseRetention
{
    /// <summary>Deletes events older than <paramref name="days"/> and their metrics (keyed by method_run_id), except events a system
    /// model was created from; <paramref name="censoredOnly"/> limits it to CENSORED captures; returns events deleted.</summary>
    public static async Task<int> PurgeAsync(NpgsqlDataSource db, int days, int batch, CancellationToken ct, bool censoredOnly = false)
    {
        var total = 0;
        while (true)
        {
            await using var conn = await db.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);
            var runs = (await conn.QueryAsync<Guid>(new CommandDefinition("""
                DELETE FROM analytics.response_event WHERE event_id IN (
                    SELECT event_id FROM analytics.response_event e
                    WHERE created_at < NOW() - make_interval(days => @days)
                      AND (NOT @censoredOnly OR capture_state = 'CENSORED')
                      -- CHG-049 (final review I4): keep the events a system model was built from
                      AND NOT EXISTS (SELECT 1 FROM analytics.system_model s WHERE s.created_from_event = e.event_id)
                    ORDER BY created_at LIMIT @batch FOR UPDATE SKIP LOCKED)
                RETURNING method_run_id
                """, new { days, batch, censoredOnly }, tx, 600, cancellationToken: ct))).ToArray();
            if (runs.Length > 0)
                await conn.ExecuteAsync(new CommandDefinition("DELETE FROM analytics.response_metric WHERE method_run_id = ANY(@runs)",
                    new { runs }, tx, 600, cancellationToken: ct));
            await tx.CommitAsync(ct);
            total += runs.Length;
            if (runs.Length < batch) return total;
        }
    }

    /// <summary>
    /// CHG-091: deletes system models older than <paramref name="days"/> nobody reviewed (their model_validation rows cascade), which
    /// frees their events for <see cref="PurgeAsync"/>. Always kept: a reviewed model, an ACTIVE_BASELINE, the newest model and the
    /// newest VALIDATED model of each loop and path (the Response page's current model), and any model another row's
    /// superseded_by names. Returns models deleted.
    /// </summary>
    public static async Task<int> PurgeModelsAsync(NpgsqlDataSource db, int days, int batch, CancellationToken ct)
    {
        var total = 0;
        while (true)
        {
            await using var conn = await db.OpenConnectionAsync(ct);
            var n = await conn.ExecuteAsync(new CommandDefinition("""
                DELETE FROM analytics.system_model WHERE model_id IN (
                    SELECT m.model_id FROM analytics.system_model m
                    WHERE m.created_at < NOW() - make_interval(days => @days)
                      AND m.reviewed_by IS NULL
                      AND m.model_state <> 'ACTIVE_BASELINE'
                      AND m.model_id NOT IN (SELECT DISTINCT ON (lower(loop_id), path_id) model_id FROM analytics.system_model
                                             ORDER BY lower(loop_id), path_id, created_at DESC)
                      AND m.model_id NOT IN (SELECT DISTINCT ON (lower(loop_id), path_id) model_id FROM analytics.system_model
                                             WHERE model_state = 'VALIDATED' ORDER BY lower(loop_id), path_id, created_at DESC)
                      AND NOT EXISTS (SELECT 1 FROM analytics.system_model k WHERE k.superseded_by = m.model_id)
                    ORDER BY m.created_at LIMIT @batch FOR UPDATE SKIP LOCKED)
                """, new { days, batch }, commandTimeout: 600, cancellationToken: ct));
            total += n;
            if (n < batch) return total;
        }
    }
}
