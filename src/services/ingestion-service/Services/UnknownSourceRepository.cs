using Dapper;
using Npgsql;

namespace Traverse.IngestionService.Services;

/// <summary>One aggregated parking row (see 49_ingestion_unknown_sources.sql).</summary>
public sealed record UnknownSourceRow(
    Guid ConfigId, string Reason, string SourceKey,
    DateTime FirstSeen, DateTime LastSeen, long MessageCount,
    string? LastTopic, string? LastPayload);

public sealed class UnknownSourceRepository
{
    private readonly NpgsqlDataSource _db;
    public UnknownSourceRepository(NpgsqlDataSource db) => _db = db;

    /// <summary>Batched upsert — counts accumulate across flushes.</summary>
    public async Task UpsertBatchAsync(IEnumerable<UnknownSourceRow> rows, CancellationToken ct)
    {
        const string sql = """
            INSERT INTO ingestion.unknown_sources
                (config_id, reason, source_key, first_seen, last_seen, message_count, last_topic, last_payload)
            VALUES (@ConfigId, @Reason, @SourceKey, @LastSeen, @LastSeen, @MessageCount, @LastTopic, @LastPayload::jsonb)
            ON CONFLICT (config_id, reason, source_key) DO UPDATE SET
                last_seen     = EXCLUDED.last_seen,
                message_count = ingestion.unknown_sources.message_count + EXCLUDED.message_count,
                last_topic    = EXCLUDED.last_topic,
                last_payload  = EXCLUDED.last_payload
            """;
        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        foreach (var row in rows)
            await conn.ExecuteAsync(new CommandDefinition(sql, row, tx, cancellationToken: ct));
        await tx.CommitAsync(ct);
    }

    public async Task<IReadOnlyList<UnknownSourceRow>> ListAsync(Guid? configId, int limit, CancellationToken ct)
    {
        const string sql = """
            SELECT config_id, reason, source_key, first_seen, last_seen, message_count,
                   last_topic, last_payload::text AS last_payload
            FROM ingestion.unknown_sources
            WHERE (@ConfigId::uuid IS NULL OR config_id = @ConfigId)
            ORDER BY last_seen DESC
            LIMIT @Limit
            """;
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync<UnknownSourceRow>(
            new CommandDefinition(sql, new { ConfigId = configId, Limit = limit }, cancellationToken: ct));
        return rows.AsList();
    }
}
