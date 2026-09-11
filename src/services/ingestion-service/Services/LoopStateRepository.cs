using System.Text.Json;
using Dapper;
using Npgsql;

namespace Traverse.IngestionService.Services;

/// <summary>One stored member of a loop: the value exactly as it was received.</summary>
public sealed record StoredMember(double V, long Ts, bool Good);

/// <summary>A loop's last-known state (see 51_ingestion_loop_state.sql).</summary>
public sealed record LoopStateRow(
    string LoopId,
    IReadOnlyDictionary<string, StoredMember> Members,
    IReadOnlyDictionary<string, StoredMember> Extras,
    string? ModeToken,
    long? ModeTsMs,
    long LastEmittedTsMs,
    string? SourceFcs);

/// <summary>
/// Durable last-known values, so a restart does not discard what the subscriber has
/// learned.
///
/// The gateway publishes only on change, and MQTT retains exactly one message per
/// topic — so a value not republished and not retained is unobtainable until it next
/// moves. Holding it only in memory meant every restart re-opened that hole.
///
/// Stores nothing that was not actually received: no defaults, no synthesised
/// timestamps. A restored member carries its original ts/quality and is therefore
/// treated exactly as one that arrived while the process was running.
/// </summary>
public sealed class LoopStateRepository
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = null };
    private readonly NpgsqlDataSource _db;
    public LoopStateRepository(NpgsqlDataSource db) => _db = db;

    public async Task<IReadOnlyList<LoopStateRow>> LoadAsync(Guid configId, CancellationToken ct)
    {
        const string sql = """
            SELECT loop_id, members, extras, mode_token, mode_ts_ms, last_emitted_ts_ms, source_fcs
            FROM   ingestion.loop_state
            WHERE  config_id = @configId
            """;
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync(new CommandDefinition(sql, new { configId }, cancellationToken: ct));
        var result = new List<LoopStateRow>();
        foreach (var r in rows)
        {
            result.Add(new LoopStateRow(
                (string)r.loop_id,
                Deserialize((string?)r.members),
                Deserialize((string?)r.extras),
                (string?)r.mode_token,
                (long?)r.mode_ts_ms,
                (long)r.last_emitted_ts_ms,
                (string?)r.source_fcs));
        }
        return result;
    }

    /// <summary>Upsert the whole snapshot. Called on a slow cadence and at shutdown;
    /// a failure is logged and retried next cycle — persistence must never be able to
    /// stall ingestion.</summary>
    public async Task SaveAsync(Guid configId, IEnumerable<LoopStateRow> rows, CancellationToken ct)
    {
        const string sql = """
            INSERT INTO ingestion.loop_state
                (config_id, loop_id, members, extras, mode_token, mode_ts_ms,
                 last_emitted_ts_ms, source_fcs, updated_at)
            VALUES (@configId, @loopId, @members::jsonb, @extras::jsonb, @modeToken, @modeTsMs,
                    @lastEmittedTsMs, @sourceFcs, NOW())
            ON CONFLICT (config_id, loop_id) DO UPDATE SET
                members            = EXCLUDED.members,
                extras             = EXCLUDED.extras,
                mode_token         = EXCLUDED.mode_token,
                mode_ts_ms         = EXCLUDED.mode_ts_ms,
                last_emitted_ts_ms = EXCLUDED.last_emitted_ts_ms,
                source_fcs         = EXCLUDED.source_fcs,
                updated_at         = NOW()
            """;
        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        foreach (var row in rows)
        {
            await conn.ExecuteAsync(new CommandDefinition(sql, new
            {
                configId,
                loopId = row.LoopId,
                members = JsonSerializer.Serialize(row.Members, Json),
                extras = JsonSerializer.Serialize(row.Extras, Json),
                modeToken = row.ModeToken,
                modeTsMs = row.ModeTsMs,
                lastEmittedTsMs = row.LastEmittedTsMs,
                sourceFcs = row.SourceFcs,
            }, tx, cancellationToken: ct));
        }
        await tx.CommitAsync(ct);
    }

    private static IReadOnlyDictionary<string, StoredMember> Deserialize(string? json) =>
        string.IsNullOrWhiteSpace(json)
            ? new Dictionary<string, StoredMember>()
            : JsonSerializer.Deserialize<Dictionary<string, StoredMember>>(json, Json)
              ?? new Dictionary<string, StoredMember>();
}
