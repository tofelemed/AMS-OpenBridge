using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Dapper;
using Npgsql;
using NpgsqlTypes;

namespace Traverse.CplmApi.Services;

/// <summary>
/// CHG-099 (SME review 2 #18): a reconstruction is stored BESIDE the evidence it rebuilds, never over it (reverses the
/// CHG-076 in-place replace). The engine emits a rebuilt artifact under the original's evidence id (uuidV5 of run, kind and
/// role), so the split happens here:
///   - original still held (PENDING / COMPLETE) and the bytes DIFFER -> a new row under a derived id
///     (<see cref="ReconstructionId"/>), reconstruction_of = the original, analysis_run_id = the run that asked for it;
///   - original held and the bytes are IDENTICAL -> nothing is stored twice; the analysis run counts it (identical_artifacts);
///   - original gone (no row, EXPIRED, FAILED) or never kept -> ALSO beside it (reconstruction_of = that id): the run's own
///     set only ever holds the live engine's bytes, so a rebuild can never mix into it (the CHG-076 lab case: an uncapped
///     rebuild of a capped run emits artifacts the live run never stored). When nothing is retained the screen shows the
///     rebuild by default, labelled as rebuilt.
/// A reconstruction without an analysis run id (an older engine) takes the legacy path in UpsertManifestAsync.
/// Space: only the newest reconstruction per original is kept (older ones are deleted when a newer one arrives), and a
/// reconstruction is STANDARD (retention_policy days; 3 at the plant), never promoted to EPISODE.
/// Chunks carry only the evidence id, so each chunk is routed by its checksum: a PENDING reconstruction whose
/// chunk_sha256[n] equals the chunk's sha takes it; anything else goes to the original id, as before.
/// </summary>
public sealed partial class PostgresEvidenceBlobStore
{
    /// <summary>A stable id for "this original, rebuilt by this analysis run" (a redelivery lands on the same row).</summary>
    public static Guid ReconstructionId(Guid originalEvidenceId, Guid analysisRunId)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"evidence-reconstruction|{originalEvidenceId:D}|{analysisRunId:D}"));
        var b = hash.AsSpan(0, 16).ToArray();
        b[7] = (byte)((b[7] & 0x0F) | 0x50);   // version 5 (name-based) in the Guid byte layout
        b[8] = (byte)((b[8] & 0x3F) | 0x80);   // RFC 4122 variant
        return new Guid(b);
    }

    internal static Guid? AnalysisRunOf(JsonElement m) =>
        m.TryGetProperty("provenance", out var p) && p.ValueKind == JsonValueKind.Object
        && p.TryGetProperty("analysis_run_id", out var a) && a.ValueKind == JsonValueKind.String
        && Guid.TryParse(a.GetString(), out var g) ? g : null;

    /// <summary>The reconstruction path of UpsertManifestAsync; returns the id the artifact was stored under (or null).</summary>
    private async Task<Guid?> UpsertReconstructionAsync(NpgsqlConnection conn, NpgsqlTransaction tx, JsonElement m,
        Guid evidenceId, Guid? analysisRunId, CancellationToken ct)
    {
        var original = await conn.QueryFirstOrDefaultAsync<(string readiness, string sha256)?>(
            "SELECT readiness, sha256 FROM analytics.evidence_manifest WHERE evidence_id = @id FOR UPDATE",
            new { id = evidenceId }, tx);
        if (analysisRunId is null) return null;   // no run to file it under: the legacy path (revives EXPIRED / FAILED only)
        var held = original is { } o && o.readiness is "PENDING" or "COMPLETE";

        var sha = S(m, "sha256") ?? "";
        if (held && string.Equals(original!.Value.sha256, sha, StringComparison.Ordinal))
        {
            // identical bytes: do not store twice; the run says how many of its artifacts matched the retained proof
            // the identical evidence ids as a set: a redelivered manifest or a retry is not counted twice
            await conn.ExecuteAsync("""
                UPDATE analytics.analysis_run
                SET manifest = manifest || jsonb_build_object('identical_evidence',
                        COALESCE(manifest->'identical_evidence', '[]'::jsonb) || to_jsonb(@eid::text))
                WHERE analysis_run_id = @run AND NOT COALESCE(manifest->'identical_evidence', '[]'::jsonb) ? @eid::text
                """, new { run = analysisRunId, eid = evidenceId.ToString() }, tx);
            return Guid.Empty;
        }

        var reconId = ReconstructionId(evidenceId, analysisRunId.Value);
        // keep only the newest reconstruction of this original (bounded space); chunks go with it (ON DELETE CASCADE)
        await conn.ExecuteAsync("""
            DELETE FROM analytics.evidence_manifest
            WHERE reconstruction_of = @orig AND evidence_id <> @recon AND pinned = FALSE
            """, new { orig = evidenceId, recon = reconId }, tx);
        await using var cmd = new NpgsqlCommand($"""
            INSERT INTO analytics.evidence_manifest
                (evidence_id, method_run_id, gate_id, artifact_kind, role_or_path,
                 x_quantity, x_unit, y_quantity, y_unit, data_type, columns, encoding,
                 calculation_samples, display_points, chunk_count, total_bytes, sha256, chunk_sha256,
                 provenance, source_commit, jar_sha256, retention_class, reconstruction_of, analysis_run_id)
            VALUES (@id, @run, @gate, @kind, @role, @xq, @xu, @yq, @yu, @dt, @cols, @enc,
                    @calc, @disp, @chunks, @bytes, @sha, @chunkShas, @prov, @commit, @jar, 'STANDARD', @orig, @arun)
            ON CONFLICT (evidence_id) DO NOTHING
            """, conn, tx);
        BindManifest(cmd, m, reconId);
        cmd.Parameters.AddWithValue("orig", evidenceId);
        cmd.Parameters.AddWithValue("arun", analysisRunId.Value);
        await cmd.ExecuteNonQueryAsync(ct);
        return reconId;
    }

    /// <summary>The parameters every manifest insert shares (the original path and the reconstruction path).</summary>
    private static void BindManifest(NpgsqlCommand cmd, JsonElement m, Guid id)
    {
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("run", Guid.Parse(S(m, "method_run_id")!));
        cmd.Parameters.AddWithValue("gate", S(m, "gate_id") ?? "");
        cmd.Parameters.AddWithValue("kind", S(m, "artifact_kind") ?? "");
        cmd.Parameters.AddWithValue("role", (object?)S(m, "role_or_path") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("xq", (object?)S(m, "x_quantity") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("xu", (object?)S(m, "x_unit") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("yq", (object?)S(m, "y_quantity") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("yu", (object?)S(m, "y_unit") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("dt", S(m, "data_type") ?? "f64");
        cmd.Parameters.Add(new NpgsqlParameter("cols", NpgsqlDbType.Jsonb) { Value = m.TryGetProperty("columns", out var c) ? c.GetRawText() : "[\"x\",\"y\"]" });
        cmd.Parameters.AddWithValue("enc", S(m, "encoding") ?? "f64le+gzip");
        cmd.Parameters.AddWithValue("calc", (int)L(m, "calculation_samples"));
        cmd.Parameters.AddWithValue("disp", (int)L(m, "display_points"));
        cmd.Parameters.AddWithValue("chunks", (int)L(m, "chunk_count"));
        cmd.Parameters.AddWithValue("bytes", L(m, "total_bytes"));
        cmd.Parameters.AddWithValue("sha", S(m, "sha256") ?? "");
        cmd.Parameters.Add(new NpgsqlParameter("chunkShas", NpgsqlDbType.Jsonb) { Value = m.TryGetProperty("chunk_sha256", out var cs) ? cs.GetRawText() : "[]" });
        cmd.Parameters.Add(new NpgsqlParameter("prov", NpgsqlDbType.Jsonb) { Value = m.TryGetProperty("provenance", out var pv) ? pv.GetRawText() : "{}" });
        cmd.Parameters.AddWithValue("commit", (object?)S(m, "sourceCommit") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("jar", (object?)S(m, "jarSha256") ?? DBNull.Value);
    }

    /// <summary>
    /// Where a chunk belongs: the row (the original or a reconstruction stored beside it) that declares this checksum at this
    /// position and does not hold that chunk yet. Null = no row awaits it (a redelivery of a chunk already stored, a manifest
    /// swept or superseded) - the caller drops it, so a rebuilt chunk can never be appended to the retained proof.
    /// </summary>
    public async Task<Guid?> ResolveChunkTargetAsync(Guid evidenceId, int chunkNo, string sha256, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        return await conn.QueryFirstOrDefaultAsync<Guid?>("""
            SELECT m.evidence_id FROM analytics.evidence_manifest m
            WHERE (m.evidence_id = @id OR m.reconstruction_of = @id)
              AND m.readiness <> 'EXPIRED' AND m.chunk_sha256 ->> @no = @sha
              AND NOT EXISTS (SELECT 1 FROM analytics.evidence_chunk c WHERE c.evidence_id = m.evidence_id AND c.chunk_no = @no)
            ORDER BY (m.readiness = 'PENDING') DESC, (m.evidence_id = @id) DESC, m.created_at DESC
            LIMIT 1
            """, new { id = evidenceId, no = chunkNo, sha = sha256 });
    }
}
