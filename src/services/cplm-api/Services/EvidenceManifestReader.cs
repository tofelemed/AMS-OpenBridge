using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>
/// v2.5 (2C.2 + workbench batching): one reader for a method run's evidence manifest, shared by
/// <c>GET /method-runs/{id}/evidence</c>, the batch read and the bundle so the artifact shape, the
/// readiness summary and the ETag can never drift between the three. The ETag is a function of the
/// manifest rows only (ids, readiness, checksums, chunk counts) - never of the clock.
/// </summary>
public sealed class EvidenceManifestReader
{
    public sealed record ArtifactMeta(Guid Id, string Readiness, string Checksum, int ChunkCount);

    public sealed record ManifestRead(
        Guid MethodRunId, string? Site, List<object> Artifacts, List<ArtifactMeta> Metas, string Readiness, string Etag)
    {
        /// <summary>CHG-099 (SME review 2 #18): reconstructions stored BESIDE this run's evidence, newest first. The
        /// original set above stays the run's proof; each reconstruction is shown as one, never mixed into it.</summary>
        public List<object> Reconstructions { get; init; } = new();
        /// <summary>CHG-099: the reconstruction rows' metas (bundle by set; never part of the run's readiness).</summary>
        public Dictionary<Guid, List<ArtifactMeta>> ReconstructionMetas { get; init; } = new();

        /// <summary>The served manifest object (the same shape for the single and the batch read).</summary>
        public object ToResponse() => new
        {
            methodRunId = MethodRunId,
            etag = Etag,
            readiness = Readiness,
            count = Artifacts.Count,
            reconstructable = true,
            reconstruct = new { purpose = "EVIDENCE_RECONSTRUCTION", methodRunId = MethodRunId, endpoint = "/api/v1/cpm/analysis-runs" },
            artifacts = Artifacts,
            reconstructions = Reconstructions,
        };
    }

    private readonly MethodRunResolver _resolver;

    public EvidenceManifestReader(MethodRunResolver resolver) => _resolver = resolver;

    /// <summary>The site the run belongs to: from the manifest's loop, else from the result row that carries the run.</summary>
    public async Task<string?> SiteOfAsync(NpgsqlConnection conn, Guid methodRunId, CancellationToken ct)
    {
        var site = await conn.ExecuteScalarAsync<string?>("""
            SELECT l.site FROM analytics.evidence_manifest m JOIN cpm.loop_registry l ON l.loop_id = m.provenance->>'loop_id'
            WHERE m.method_run_id = @id LIMIT 1
            """, new { id = methodRunId });
        if (site is not null) return site;
        var loc = await _resolver.ResolveAsync(methodRunId, ct);
        return loc?.Site;
    }

    public async Task<ManifestRead> ReadAsync(NpgsqlConnection conn, Guid methodRunId, string? site, CancellationToken ct)
    {
        var rows = await conn.QueryAsync("""
            SELECT evidence_id, method_run_id, gate_id, artifact_kind, role_or_path, x_quantity, x_unit, y_quantity, y_unit,
                   data_type, columns::text AS columns, encoding, calculation_samples, display_points, chunk_count, total_bytes,
                   sha256, chunk_sha256::text AS chunk_sha256, readiness, readiness_reason, provenance::text AS provenance, retention_class, pinned,
                   source_commit, jar_sha256, created_at, completed_at, gate_result_id, reconstruction_of, analysis_run_id
            FROM analytics.evidence_manifest WHERE method_run_id = @id ORDER BY artifact_kind, role_or_path, evidence_id
            """, new { id = methodRunId });
        var metas = new List<ArtifactMeta>();
        var artifacts = new List<object>();
        var allMetas = new List<ArtifactMeta>();
        var reconRows = new Dictionary<Guid, List<(object Art, ArtifactMeta Meta, dynamic Row)>>();
        foreach (var r in rows)
        {
            var id = (Guid)r.evidence_id;
            var meta = new ArtifactMeta(id, (string)r.readiness, (string)r.sha256, (int)r.chunk_count);
            allMetas.Add(meta);
            var art = ArtifactOf(r);
            if (r.reconstruction_of is Guid && r.analysis_run_id is Guid run)
            {
                // CHG-099: a rebuild stored beside its original - listed under its reconstruction, never as the proof
                if (!reconRows.TryGetValue(run, out var list)) reconRows[run] = list = new();
                list.Add((art, meta, r));
                continue;
            }
            metas.Add(meta);
            artifacts.Add(art);
        }
        var readiness = metas.Count == 0 ? "NONE"
            : metas.All(a => a.Readiness == "COMPLETE") ? "COMPLETE"
            : metas.Any(a => a.Readiness == "FAILED") ? "FAILED"
            : metas.Any(a => a.Readiness == "PENDING") ? "PENDING"
            : metas.All(a => a.Readiness == "EXPIRED") ? "EXPIRED" : "PARTIAL";
        var runs = await ReconstructionRunsAsync(conn, methodRunId);
        // the ETag covers every row AND every reconstruction run's state / identical count (a run that stored no row yet
        // still changes the served body)
        var etag = "\"" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
            string.Join("|", allMetas.Select(a => $"{a.Id}:{a.Readiness}:{a.Checksum}:{a.ChunkCount}"))
            + "#" + string.Join("|", runs.Select(r => $"{r.Id}:{r.State}:{r.Identical}"))))).ToLowerInvariant() + "\"";
        var reconstructions = new List<object>();
        var newestWithRows = runs.FirstOrDefault(r => reconRows.ContainsKey(r.Id) || r.Identical > 0)?.Id;
        foreach (var run in runs)
        {
            var list = reconRows.TryGetValue(run.Id, out var l) ? l : new();
            var rm = list.Select(x => x.Meta).ToList();
            var first = list.Count > 0 ? list[0].Row : null;
            var terminal = run.State is "FINISHED" or "FAILED" or "CANCELED" or "SUBMIT_FAILED";
            reconstructions.Add(new
            {
                analysisRunId = run.Id,
                state = run.State,
                createdAt = run.CreatedAt,
                source = run.Source,
                // stored only where the bytes differ from the retained proof; identical artifacts are counted, not copied
                differing = list.Count,
                identical = run.Identical,
                // final only once the run ended (rows arrive artifact by artifact); a finished run with nothing left was
                // superseded by a newer one (only the newest reconstruction per original is kept) or produced nothing
                readiness = !terminal ? "PENDING"
                    : run.State != "FINISHED" && rm.Count == 0 ? "FAILED"
                    : rm.Any(a => a.Readiness == "FAILED") ? "FAILED"
                    : rm.Any(a => a.Readiness == "PENDING") ? "PENDING"
                    : rm.Count > 0 ? "COMPLETE"
                    : run.Identical > 0 ? "IDENTICAL"
                    : newestWithRows is { } nw && nw != run.Id ? "SUPERSEDED" : "NONE",
                sourceCommit = (string?)first?.source_commit,
                jarSha256 = (string?)first?.jar_sha256,
                artifacts = list.Select(x => x.Art).ToList(),
            });
        }
        return new ManifestRead(methodRunId, site, artifacts, metas, readiness, etag)
        {
            Reconstructions = reconstructions,
            ReconstructionMetas = reconRows.ToDictionary(kv => kv.Key, kv => kv.Value.Select(x => x.Meta).ToList()),
        };
    }

    private sealed record ReconRun(Guid Id, string State, DateTime CreatedAt, string? Source, int Identical);

    /// <summary>CHG-099: the reconstruction runs asked for this method run, newest first (operator-requested, so few rows).</summary>
    private static async Task<List<ReconRun>> ReconstructionRunsAsync(NpgsqlConnection conn, Guid methodRunId)
    {
        var rows = await conn.QueryAsync("""
            SELECT analysis_run_id, state, created_at, manifest->>'source' AS source,
                   COALESCE(jsonb_array_length(manifest->'identical_evidence'), 0) AS identical
            FROM analytics.analysis_run
            WHERE purpose = 'EVIDENCE_RECONSTRUCTION' AND manifest->>'reconstructs' = @id
            ORDER BY created_at DESC
            LIMIT 5
            """, new { id = methodRunId.ToString() });
        return rows.Select(r => new ReconRun((Guid)r.analysis_run_id, (string)r.state, (DateTime)r.created_at,
            (string?)r.source, (int)r.identical)).ToList();
    }

    private static object ArtifactOf(dynamic r)
    {
        var id = (Guid)r.evidence_id;
        return new
            {
                artifactId = id,
                methodRunId = (Guid)r.method_run_id,
                gate = (string)r.gate_id,
                kind = (string)r.artifact_kind,
                roleOrPath = (string?)r.role_or_path,
                x = new { quantity = (string?)r.x_quantity, unit = (string?)r.x_unit },
                y = new { quantity = (string?)r.y_quantity, unit = (string?)r.y_unit },
                dataType = (string)r.data_type,
                columns = JsonDocument.Parse((string)r.columns).RootElement,
                encoding = (string)r.encoding,
                calculationSamples = (int?)r.calculation_samples,
                displayPoints = (int?)r.display_points,
                chunkCount = (int)r.chunk_count,
                totalBytes = (long)r.total_bytes,
                checksum = (string)r.sha256,
                chunkChecksums = r.chunk_sha256 is null ? JsonDocument.Parse("[]").RootElement : JsonDocument.Parse((string)r.chunk_sha256).RootElement,
                chunksUrl = $"/api/v1/cpm/evidence/{id}/chunks/{{n}}",
                readiness = (string)r.readiness,
                readinessReason = (string?)r.readiness_reason,
                provenance = JsonDocument.Parse((string)r.provenance).RootElement,
                retentionClass = (string)r.retention_class,
                pinned = (bool)r.pinned,
                sourceCommit = (string?)r.source_commit,
                jarSha256 = (string?)r.jar_sha256,
                createdAt = r.created_at,
                completedAt = r.completed_at,
                gateResultId = (long?)r.gate_result_id,
                // CHG-099 (SME review 2 #18): what these bytes are. RETAINED = the live engine's proof; RECONSTRUCTED =
                // rebuilt on request (beside the original, or reviving one no longer held - reconstructionOf null)
                basis = r.analysis_run_id is Guid ? "RECONSTRUCTED" : "RETAINED",
                analysisRunId = (Guid?)r.analysis_run_id,
                reconstructionOf = (Guid?)r.reconstruction_of,
            };
    }

    /// <summary>
    /// The bundle body: every COMPLETE artifact's chunks in one frame, so a gate opens with one request
    /// instead of one per chunk. Framing per artifact: 36 ASCII bytes of the artifact uuid, u32 LE chunk
    /// count, then per chunk u32 LE chunk_no, u32 LE byte_length, the chunk bytes (still individually
    /// f64le+gzip and sha-verified by the client exactly as the per-chunk route).
    /// </summary>
    public static async Task<byte[]> BundleAsync(NpgsqlConnection conn, ManifestRead manifest, CancellationToken ct, Guid? set = null)
    {
        var metas = set is { } s ? manifest.ReconstructionMetas.GetValueOrDefault(s) ?? new() : manifest.Metas;
        var ids = metas.Where(m => m.Readiness == "COMPLETE").Select(m => m.Id).ToArray();
        if (ids.Length == 0) return Array.Empty<byte>();
        var chunks = (await conn.QueryAsync<(Guid evidence_id, int chunk_no, int byte_length, byte[] payload)>("""
            SELECT evidence_id, chunk_no, byte_length, payload FROM analytics.evidence_chunk
            WHERE evidence_id = ANY(@ids) ORDER BY evidence_id, chunk_no
            """, new { ids })).ToList();
        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms);
        foreach (var id in ids)
        {
            var own = chunks.Where(c => c.evidence_id == id).ToList();
            w.Write(Encoding.ASCII.GetBytes(id.ToString("D")));
            w.Write(own.Count);
            foreach (var c in own)
            {
                w.Write(c.chunk_no);
                w.Write(c.payload.Length);
                w.Write(c.payload);
            }
        }
        w.Flush();
        return ms.ToArray();
    }
}
