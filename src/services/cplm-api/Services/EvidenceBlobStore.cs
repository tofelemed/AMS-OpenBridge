using System.Text.Json;
using Dapper;
using Npgsql;
using NpgsqlTypes;

namespace Traverse.CplmApi.Services;

/// <summary>A manifest as stored (readiness is decided by EvidenceAssembly, never by the caller).</summary>
public sealed record StoredManifest(Guid EvidenceId, Guid MethodRunId, string GateId, string ArtifactKind, int ChunkCount,
    long TotalBytes, string Sha256, string[] ChunkSha256, string Readiness, string? ReadinessReason, long? GateResultId);

/// <summary>
/// v2.5 Task 1G.3: where evidence bytes live. PostgreSQL bytea chunks in this release; the
/// interface exists so a plant that outgrows it can move chunks to object storage without
/// touching the consumer or the API.
/// </summary>
public interface IEvidenceBlobStore
{
    /// <summary>Stores a manifest; returns the id it was stored under (CHG-099: a reconstruction beside a held original gets
    /// its own id; Guid.Empty = identical to the held original, nothing stored; null = not stored).</summary>
    Task<Guid?> UpsertManifestAsync(JsonElement manifest, CancellationToken ct);
    Task<bool> PutChunkAsync(Guid evidenceId, int chunkNo, string sha256, byte[] payload, CancellationToken ct);
    /// <summary>CHG-099: the row a chunk belongs to (a pending reconstruction whose checksum list matches, else the id itself).</summary>
    Task<Guid?> ResolveChunkTargetAsync(Guid evidenceId, int chunkNo, string sha256, CancellationToken ct);
    Task<StoredManifest?> GetManifestAsync(Guid evidenceId, CancellationToken ct);
    /// <summary>CHG-049: how many chunks are stored, without reading any payload.</summary>
    Task<int> CountChunksAsync(Guid evidenceId, CancellationToken ct);
    Task<IReadOnlyList<EvidenceChunkSpec>> GetChunksAsync(Guid evidenceId, CancellationToken ct);
    /// <summary>v2.5 (2C.2): one chunk by number, or null when it is not stored.</summary>
    Task<EvidenceChunkSpec?> GetChunkAsync(Guid evidenceId, int chunkNo, CancellationToken ct);
    Task SetReadinessAsync(Guid evidenceId, string readiness, string? reason, CancellationToken ct);
    /// <summary>Links manifests to the v1 result row that carries their method_run_id; returns rows linked.</summary>
    Task<int> ReconcileGateResultIdsAsync(CancellationToken ct);
}

public sealed partial class PostgresEvidenceBlobStore : IEvidenceBlobStore
{
    private readonly NpgsqlDataSource _db;

    public PostgresEvidenceBlobStore([FromKeyedServices("cplm")] NpgsqlDataSource db) => _db = db;

    private static string? S(JsonElement e, string n) =>
        e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
    private static long L(JsonElement e, string n) =>
        e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt64(out var v) ? v : 0;

    public async Task<Guid?> UpsertManifestAsync(JsonElement m, CancellationToken ct)
    {
        if (!Guid.TryParse(S(m, "evidence_id"), out var evidenceId) || !Guid.TryParse(S(m, "method_run_id"), out _))
            throw new ArgumentException("manifest without a valid evidence_id / method_run_id");
        var retentionClass = RetentionClassOf(m);
        var reconstruct = retentionClass == "STANDARD";
        var analysisRunId = AnalysisRunOf(m);
        await using var conn = await _db.OpenConnectionAsync(ct);
        // the stale-chunk DELETE and the upsert are ONE transaction; the manifest row is locked first so a chunk insert
        // (FK key-share lock) cannot slip between them (CHG-076)
        await using var tx = await conn.BeginTransactionAsync(ct);
        if (reconstruct && await UpsertReconstructionAsync(conn, tx, m, evidenceId, analysisRunId, ct) is { } stored)
        {
            // CHG-099: held original kept; the rebuild was stored beside it (or was identical and not stored twice)
            await tx.CommitAsync(ct);
            return stored == Guid.Empty ? Guid.Empty : stored;
        }
        await using (var lockRow = new NpgsqlCommand(
            "SELECT 1 FROM analytics.evidence_manifest WHERE evidence_id = @id FOR UPDATE", conn, tx))
        {
            lockRow.Parameters.AddWithValue("id", evidenceId);
            await lockRow.ExecuteNonQueryAsync(ct);
        }
        // v2.5 (2C.2, NR-060): an EXPIRED (retention) or FAILED (corrupt chunk) manifest is revived by a re-emit of the
        // same artifact: back to PENDING, stale chunks dropped, the new chunk stream completes it. A held row (PENDING /
        // COMPLETE) is never touched here — CHG-099: a reconstruction of a held row is stored beside it, above.
        await using (var revive = new NpgsqlCommand("""
            DELETE FROM analytics.evidence_chunk c USING analytics.evidence_manifest m
            WHERE c.evidence_id = m.evidence_id AND m.evidence_id = @id AND m.readiness IN ('EXPIRED', 'FAILED')
            """, conn, tx))
        {
            revive.Parameters.AddWithValue("id", evidenceId);
            await revive.ExecuteNonQueryAsync(ct);
        }
        // A legacy reconstruction (no analysis run id) reviving an EXPIRED / FAILED row: STANDARD unless EPISODE / PINNED.
        // CHG-099 reconstructions never reach this statement (UpsertReconstructionAsync files them beside the original).
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO analytics.evidence_manifest
                (evidence_id, method_run_id, gate_id, artifact_kind, role_or_path,
                 x_quantity, x_unit, y_quantity, y_unit, data_type, columns, encoding,
                 calculation_samples, display_points, chunk_count, total_bytes, sha256, chunk_sha256,
                 provenance, source_commit, jar_sha256, retention_class, analysis_run_id)
            VALUES (@id, @run, @gate, @kind, @role, @xq, @xu, @yq, @yu, @dt, @cols, @enc,
                    @calc, @disp, @chunks, @bytes, @sha, @chunkShas, @prov, @commit, @jar, @class, @arun)
            ON CONFLICT (evidence_id) DO UPDATE SET
                readiness = 'PENDING', readiness_reason = NULL, completed_at = NULL, created_at = NOW(),
                columns = EXCLUDED.columns, calculation_samples = EXCLUDED.calculation_samples, display_points = EXCLUDED.display_points,
                chunk_count = EXCLUDED.chunk_count, total_bytes = EXCLUDED.total_bytes, sha256 = EXCLUDED.sha256,
                chunk_sha256 = EXCLUDED.chunk_sha256, provenance = EXCLUDED.provenance,
                source_commit = EXCLUDED.source_commit, jar_sha256 = EXCLUDED.jar_sha256,
                analysis_run_id = EXCLUDED.analysis_run_id,
                retention_class = CASE WHEN NOT @reconstruct THEN analytics.evidence_manifest.retention_class
                                       WHEN analytics.evidence_manifest.retention_class IN ('EPISODE', 'PINNED')
                                            THEN analytics.evidence_manifest.retention_class
                                       ELSE 'STANDARD' END
            WHERE analytics.evidence_manifest.readiness IN ('EXPIRED', 'FAILED')
            """, conn, tx);
        BindManifest(cmd, m, evidenceId);
        cmd.Parameters.AddWithValue("class", retentionClass);
        cmd.Parameters.AddWithValue("reconstruct", reconstruct);
        cmd.Parameters.AddWithValue("arun", reconstruct && analysisRunId is { } a ? a : DBNull.Value);
        var n = await cmd.ExecuteNonQueryAsync(ct);
        await tx.CommitAsync(ct);
        return n > 0 ? evidenceId : null;
    }

    /// <summary>
    /// CHG-033: every live artifact is TRANSIENT - bounded by hours and a byte budget in the sweeper, promoted to
    /// EPISODE only when an episode transition captured its method run. An artifact a reconstruction or replay
    /// produced (provenance.purpose other than LIVE, or an analysis_run_id) is STANDARD and lives retention_policy
    /// days: an operator asked for it. A row revived or replaced by a live re-delivery keeps its class; one replaced
    /// by a reconstruction becomes STANDARD (CHG-076), except EPISODE / PINNED, which are never demoted.
    /// </summary>
    internal static string RetentionClassOf(JsonElement m)
    {
        if (!m.TryGetProperty("provenance", out var p) || p.ValueKind != JsonValueKind.Object) return "TRANSIENT";
        var runId = S(p, "analysis_run_id");
        var purpose = S(p, "purpose");
        var requested = !string.IsNullOrEmpty(runId) || (!string.IsNullOrEmpty(purpose) && purpose != "LIVE");
        return requested ? "STANDARD" : "TRANSIENT";
    }

    public async Task<bool> PutChunkAsync(Guid evidenceId, int chunkNo, string sha256, byte[] payload, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        // A chunk for a manifest that has not arrived yet cannot be stored (FK); the caller parks it by retrying.
        var n = await conn.ExecuteAsync("""
            INSERT INTO analytics.evidence_chunk (evidence_id, chunk_no, byte_length, sha256, payload)
            SELECT @id, @no, @len, @sha, @payload
            WHERE EXISTS (SELECT 1 FROM analytics.evidence_manifest WHERE evidence_id = @id)
            ON CONFLICT (evidence_id, chunk_no) DO NOTHING
            """, new { id = evidenceId, no = chunkNo, len = payload.Length, sha = sha256, payload });
        var known = await conn.ExecuteScalarAsync<bool>(
            "SELECT EXISTS (SELECT 1 FROM analytics.evidence_manifest WHERE evidence_id = @id)", new { id = evidenceId });
        return known;
    }

    public async Task<StoredManifest?> GetManifestAsync(Guid evidenceId, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var r = await conn.QueryFirstOrDefaultAsync("""
            SELECT evidence_id, method_run_id, gate_id, artifact_kind, chunk_count, total_bytes, sha256,
                   chunk_sha256::text AS chunk_shas, readiness, readiness_reason, gate_result_id
            FROM analytics.evidence_manifest WHERE evidence_id = @id
            """, new { id = evidenceId });
        if (r is null) return null;
        var shas = JsonSerializer.Deserialize<string[]>((string)r.chunk_shas) ?? Array.Empty<string>();
        return new StoredManifest((Guid)r.evidence_id, (Guid)r.method_run_id, (string)r.gate_id, (string)r.artifact_kind,
            (int)r.chunk_count, (long)r.total_bytes, (string)r.sha256, shas, (string)r.readiness, (string?)r.readiness_reason,
            (long?)r.gate_result_id);
    }

    public async Task<int> CountChunksAsync(Guid evidenceId, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        return await conn.ExecuteScalarAsync<int>(
            "SELECT count(*) FROM analytics.evidence_chunk WHERE evidence_id = @id", new { id = evidenceId });
    }

    public async Task<IReadOnlyList<EvidenceChunkSpec>> GetChunksAsync(Guid evidenceId, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync("SELECT chunk_no, sha256, payload FROM analytics.evidence_chunk WHERE evidence_id = @id ORDER BY chunk_no",
            new { id = evidenceId });
        return rows.Select(r => new EvidenceChunkSpec((int)r.chunk_no, (string)r.sha256, (byte[])r.payload)).ToList();
    }

    public async Task<EvidenceChunkSpec?> GetChunkAsync(Guid evidenceId, int chunkNo, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var r = await conn.QueryFirstOrDefaultAsync("SELECT chunk_no, sha256, payload FROM analytics.evidence_chunk WHERE evidence_id = @id AND chunk_no = @n",
            new { id = evidenceId, n = chunkNo });
        return r is null ? null : new EvidenceChunkSpec((int)r.chunk_no, (string)r.sha256, (byte[])r.payload);
    }

    public async Task SetReadinessAsync(Guid evidenceId, string readiness, string? reason, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync("""
            UPDATE analytics.evidence_manifest
            SET readiness = @readiness, readiness_reason = @reason,
                completed_at = CASE WHEN @readiness = 'COMPLETE' THEN NOW() ELSE completed_at END
            WHERE evidence_id = @id AND readiness <> 'EXPIRED'
            """, new { id = evidenceId, readiness, reason });
    }

    /// <summary>
    /// 2026-09-17: one bounded statement per result table. The rows of the last 20 minutes are expanded to
    /// (gate, run id) and index-joined to the still-unlinked manifests of the last 15 minutes. The previous
    /// form joined every unlinked manifest of the day (108k on the lab: 97 %, because it looked only in the
    /// fusion table while G0-G11 runs live in the short / long tables) with a per-row containment probe -
    /// a three-minute UPDATE re-run every minute, holding locks the evidence reads waited on. gate_result_id
    /// is informational (the manifest says which row carried the run); a row that lands later than 15
    /// minutes after its manifest stays unlinked, which the manifest states as null.
    /// </summary>
    public static string ReconcileSql(string table) => $"""
        UPDATE analytics.evidence_manifest m
        SET gate_result_id = g.id
        FROM (SELECT r.id, kv.key AS gate_id, kv.value AS run
              FROM {table} r, jsonb_each_text(r.method_run_ids) kv
              WHERE r.created_at > NOW() - INTERVAL '20 minutes') g
        WHERE m.gate_result_id IS NULL AND m.created_at > NOW() - INTERVAL '15 minutes'
          AND m.method_run_id::text = g.run AND m.gate_id = g.gate_id
        """;

    public async Task<int> ReconcileGateResultIdsAsync(CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var linked = 0;
        foreach (var (tier, table) in MethodRunResolver.ProbeOrder)
        {
            if (tier == "response") continue;                                        // a G12 run is event-keyed, no result row
            linked += await conn.ExecuteAsync(ReconcileSql(table));
        }
        return linked;
    }
}
