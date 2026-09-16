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
    Task UpsertManifestAsync(JsonElement manifest, CancellationToken ct);
    Task<bool> PutChunkAsync(Guid evidenceId, int chunkNo, string sha256, byte[] payload, CancellationToken ct);
    Task<StoredManifest?> GetManifestAsync(Guid evidenceId, CancellationToken ct);
    Task<IReadOnlyList<EvidenceChunkSpec>> GetChunksAsync(Guid evidenceId, CancellationToken ct);
    /// <summary>v2.5 (2C.2): one chunk by number, or null when it is not stored.</summary>
    Task<EvidenceChunkSpec?> GetChunkAsync(Guid evidenceId, int chunkNo, CancellationToken ct);
    Task SetReadinessAsync(Guid evidenceId, string readiness, string? reason, CancellationToken ct);
    /// <summary>Links manifests to the v1 result row that carries their method_run_id; returns rows linked.</summary>
    Task<int> ReconcileGateResultIdsAsync(CancellationToken ct);
}

public sealed class PostgresEvidenceBlobStore : IEvidenceBlobStore
{
    private readonly NpgsqlDataSource _db;

    public PostgresEvidenceBlobStore([FromKeyedServices("cplm")] NpgsqlDataSource db) => _db = db;

    private static string? S(JsonElement e, string n) =>
        e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
    private static long L(JsonElement e, string n) =>
        e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt64(out var v) ? v : 0;

    public async Task UpsertManifestAsync(JsonElement m, CancellationToken ct)
    {
        if (!Guid.TryParse(S(m, "evidence_id"), out var evidenceId) || !Guid.TryParse(S(m, "method_run_id"), out var runId))
            throw new ArgumentException("manifest without a valid evidence_id / method_run_id");
        var columns = m.TryGetProperty("columns", out var c) ? c.GetRawText() : "[\"x\",\"y\"]";
        var chunkShas = m.TryGetProperty("chunk_sha256", out var cs) ? cs.GetRawText() : "[]";
        var provenance = m.TryGetProperty("provenance", out var pv) ? pv.GetRawText() : "{}";
        await using var conn = await _db.OpenConnectionAsync(ct);
        // v2.5 (2C.2, NR-060): the same artifact re-emitted by a reconstruction has the same evidence id. An
        // EXPIRED (retention) or FAILED (corrupt chunk) manifest is revived: back to PENDING, stale chunks dropped,
        // the new chunk stream completes it. A live or COMPLETE manifest is never touched by a duplicate.
        await using (var revive = new NpgsqlCommand("""
            DELETE FROM analytics.evidence_chunk c USING analytics.evidence_manifest m
            WHERE c.evidence_id = m.evidence_id AND m.evidence_id = @id AND m.readiness IN ('EXPIRED', 'FAILED')
            """, conn))
        {
            revive.Parameters.AddWithValue("id", evidenceId);
            await revive.ExecuteNonQueryAsync(ct);
        }
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO analytics.evidence_manifest
                (evidence_id, method_run_id, gate_id, artifact_kind, role_or_path,
                 x_quantity, x_unit, y_quantity, y_unit, data_type, columns, encoding,
                 calculation_samples, display_points, chunk_count, total_bytes, sha256, chunk_sha256,
                 provenance, source_commit, jar_sha256)
            VALUES (@id, @run, @gate, @kind, @role, @xq, @xu, @yq, @yu, @dt, @cols, @enc,
                    @calc, @disp, @chunks, @bytes, @sha, @chunkShas, @prov, @commit, @jar)
            ON CONFLICT (evidence_id) DO UPDATE SET
                readiness = 'PENDING', readiness_reason = NULL, completed_at = NULL, created_at = NOW(),
                columns = EXCLUDED.columns, calculation_samples = EXCLUDED.calculation_samples, display_points = EXCLUDED.display_points,
                chunk_count = EXCLUDED.chunk_count, total_bytes = EXCLUDED.total_bytes, sha256 = EXCLUDED.sha256,
                chunk_sha256 = EXCLUDED.chunk_sha256, provenance = EXCLUDED.provenance,
                source_commit = EXCLUDED.source_commit, jar_sha256 = EXCLUDED.jar_sha256
            WHERE analytics.evidence_manifest.readiness IN ('EXPIRED', 'FAILED')
            """, conn);
        cmd.Parameters.AddWithValue("id", evidenceId);
        cmd.Parameters.AddWithValue("run", runId);
        cmd.Parameters.AddWithValue("gate", S(m, "gate_id") ?? "");
        cmd.Parameters.AddWithValue("kind", S(m, "artifact_kind") ?? "");
        cmd.Parameters.AddWithValue("role", (object?)S(m, "role_or_path") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("xq", (object?)S(m, "x_quantity") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("xu", (object?)S(m, "x_unit") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("yq", (object?)S(m, "y_quantity") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("yu", (object?)S(m, "y_unit") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("dt", S(m, "data_type") ?? "f64");
        cmd.Parameters.Add(new NpgsqlParameter("cols", NpgsqlDbType.Jsonb) { Value = columns });
        cmd.Parameters.AddWithValue("enc", S(m, "encoding") ?? "f64le+gzip");
        cmd.Parameters.AddWithValue("calc", (int)L(m, "calculation_samples"));
        cmd.Parameters.AddWithValue("disp", (int)L(m, "display_points"));
        cmd.Parameters.AddWithValue("chunks", (int)L(m, "chunk_count"));
        cmd.Parameters.AddWithValue("bytes", L(m, "total_bytes"));
        cmd.Parameters.AddWithValue("sha", S(m, "sha256") ?? "");
        cmd.Parameters.Add(new NpgsqlParameter("chunkShas", NpgsqlDbType.Jsonb) { Value = chunkShas });
        cmd.Parameters.Add(new NpgsqlParameter("prov", NpgsqlDbType.Jsonb) { Value = provenance });
        cmd.Parameters.AddWithValue("commit", (object?)S(m, "sourceCommit") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("jar", (object?)S(m, "jarSha256") ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync(ct);
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

    public async Task<int> ReconcileGateResultIdsAsync(CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        // Manifests younger than a day with no linked row: find the v1 row whose method_run_ids
        // carries this run under this gate (GIN-served containment probe).
        return await conn.ExecuteAsync("""
            UPDATE analytics.evidence_manifest m
            SET gate_result_id = g.id
            FROM analytics.cplm_gate_results g
            WHERE m.gate_result_id IS NULL AND m.created_at > NOW() - INTERVAL '1 day'
              AND g.method_run_ids @> jsonb_build_object(m.gate_id, m.method_run_id::text)
            """);
    }
}
