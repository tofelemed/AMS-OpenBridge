using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>CHG-049: response_event / response_metric had no retention (about 50 MB/day at Marun). Row RESPONSE of retention_policy, batched.</summary>
public static class ResponseRetention
{
    /// <summary>Deletes events older than <paramref name="days"/> and their metrics (keyed by method_run_id), except events a system model was created from; returns events deleted.</summary>
    public static async Task<int> PurgeAsync(NpgsqlDataSource db, int days, int batch, CancellationToken ct)
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
                      -- CHG-049 (final review I4): keep the events a governed system model was built from
                      AND NOT EXISTS (SELECT 1 FROM analytics.system_model s WHERE s.created_from_event = e.event_id)
                    ORDER BY created_at LIMIT @batch FOR UPDATE SKIP LOCKED)
                RETURNING method_run_id
                """, new { days, batch }, tx, 600, cancellationToken: ct))).ToArray();
            if (runs.Length > 0)
                await conn.ExecuteAsync(new CommandDefinition("DELETE FROM analytics.response_metric WHERE method_run_id = ANY(@runs)",
                    new { runs }, tx, 600, cancellationToken: ct));
            await tx.CommitAsync(ct);
            total += runs.Length;
            if (runs.Length < batch) return total;
        }
    }
}
