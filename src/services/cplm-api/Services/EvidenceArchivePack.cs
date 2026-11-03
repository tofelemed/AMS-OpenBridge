using System.Dynamic;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;

namespace Traverse.CplmApi.Services;

/// <summary>
/// CHG-102 Phase 5b-1: one evidence_manifest row as it was when archived - every column the workbench read serves
/// (EvidenceManifestReader.ManifestColumns), the jsonb ones as their PostgreSQL text form, so the archived artifact is
/// re-assembled into exactly the JSON the live row produced.
/// </summary>
public sealed record ArchivedManifest(
    Guid EvidenceId, Guid MethodRunId, string GateId, string ArtifactKind, string? RoleOrPath,
    string? XQuantity, string? XUnit, string? YQuantity, string? YUnit, string DataType, string Columns, string Encoding,
    int? CalculationSamples, int? DisplayPoints, int ChunkCount, long TotalBytes, string Sha256, string? ChunkSha256,
    string Readiness, string? ReadinessReason, string Provenance, string RetentionClass, bool Pinned,
    string? SourceCommit, string? JarSha256, DateTime CreatedAt, DateTime? CompletedAt, long? GateResultId,
    Guid? ReconstructionOf, Guid? AnalysisRunId)
{
    /// <summary>From a Dapper row of EvidenceManifestReader.ManifestColumns.</summary>
    public static ArchivedManifest FromRow(dynamic r) => new(
        (Guid)r.evidence_id, (Guid)r.method_run_id, (string)r.gate_id, (string)r.artifact_kind, (string?)r.role_or_path,
        (string?)r.x_quantity, (string?)r.x_unit, (string?)r.y_quantity, (string?)r.y_unit, (string)r.data_type,
        (string)r.columns, (string)r.encoding, (int?)r.calculation_samples, (int?)r.display_points, (int)r.chunk_count,
        (long)r.total_bytes, (string)r.sha256, (string?)r.chunk_sha256, (string)r.readiness, (string?)r.readiness_reason,
        (string)r.provenance, (string)r.retention_class, (bool)r.pinned, (string?)r.source_commit, (string?)r.jar_sha256,
        (DateTime)r.created_at, (DateTime?)r.completed_at, (long?)r.gate_result_id, (Guid?)r.reconstruction_of,
        (Guid?)r.analysis_run_id);

    /// <summary>The same shape as the Dapper row, so EvidenceManifestReader builds the artifact through its one path.</summary>
    public dynamic ToRow()
    {
        IDictionary<string, object?> d = new ExpandoObject();
        d["evidence_id"] = EvidenceId; d["method_run_id"] = MethodRunId; d["gate_id"] = GateId; d["artifact_kind"] = ArtifactKind;
        d["role_or_path"] = RoleOrPath; d["x_quantity"] = XQuantity; d["x_unit"] = XUnit; d["y_quantity"] = YQuantity;
        d["y_unit"] = YUnit; d["data_type"] = DataType; d["columns"] = Columns; d["encoding"] = Encoding;
        d["calculation_samples"] = CalculationSamples; d["display_points"] = DisplayPoints; d["chunk_count"] = ChunkCount;
        d["total_bytes"] = TotalBytes; d["sha256"] = Sha256; d["chunk_sha256"] = ChunkSha256; d["readiness"] = Readiness;
        d["readiness_reason"] = ReadinessReason; d["provenance"] = Provenance; d["retention_class"] = RetentionClass;
        d["pinned"] = Pinned; d["source_commit"] = SourceCommit; d["jar_sha256"] = JarSha256; d["created_at"] = CreatedAt;
        d["completed_at"] = CompletedAt; d["gate_result_id"] = GateResultId; d["reconstruction_of"] = ReconstructionOf;
        d["analysis_run_id"] = AnalysisRunId;
        return d;
    }
}

/// <summary>One archived artifact: its manifest and its chunks (the original bytes, in chunk order).</summary>
public sealed record ArchivedArtifact(ArchivedManifest Manifest, IReadOnlyList<EvidenceChunkSpec> Chunks);

/// <summary>
/// CHG-102 Phase 5b-1 — the archive pack, codec <c>cpax1</c>: ONE bytea per boundary set instead of a manifest row plus
/// chunk rows per artifact (the ~2 KB fixed overhead per artifact the retention analysis measured).
///
/// Layout (little-endian): "CPAX" | u8 version (1) | i32 index length | index | i32 blob count | per blob: i32 length, bytes.
/// The index is Brotli-compressed JSON: per artifact its <see cref="ArchivedManifest"/> and the blob number of each chunk.
/// Blobs are the original chunk bytes, verbatim (already f64le+gzip: compressing them again gains nothing) and stored
/// once per distinct content. Lossless by construction: a served chunk is the original byte for byte, so its SHA-256
/// and the artifact's SHA-256 verify exactly as for live evidence and the frontend decoder does not change.
/// </summary>
public static class EvidenceArchivePack
{
    public const string Codec = "cpax1";
    private static readonly byte[] Magic = "CPAX"u8.ToArray();
    private const byte Version = 1;
    private static readonly JsonSerializerOptions Json = new() { DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull };

    private sealed record IndexEntry(ArchivedManifest M, int[] C);

    public static string Sha256Hex(ReadOnlySpan<byte> b) => Convert.ToHexString(SHA256.HashData(b)).ToLowerInvariant();

    public static byte[] Pack(IReadOnlyList<ArchivedArtifact> artifacts)
    {
        var blobs = new List<byte[]>();
        var byHash = new Dictionary<string, int>(StringComparer.Ordinal);
        var index = new List<IndexEntry>(artifacts.Count);
        foreach (var a in artifacts)
        {
            var refs = new int[a.Chunks.Count];
            for (var i = 0; i < a.Chunks.Count; i++)
            {
                var payload = a.Chunks[i].Payload;
                var key = Sha256Hex(payload);
                if (!byHash.TryGetValue(key, out var n)) { n = blobs.Count; blobs.Add(payload); byHash[key] = n; }
                refs[i] = n;
            }
            index.Add(new IndexEntry(a.Manifest, refs));
        }
        var indexBytes = Brotli(JsonSerializer.SerializeToUtf8Bytes(index, Json));
        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms);
        w.Write(Magic);
        w.Write(Version);
        w.Write(indexBytes.Length);
        w.Write(indexBytes);
        w.Write(blobs.Count);
        foreach (var b in blobs) { w.Write(b.Length); w.Write(b); }
        w.Flush();
        return ms.ToArray();
    }

    /// <summary>The artifacts of a pack; every chunk is re-checked against the checksum its manifest declares.</summary>
    public static List<ArchivedArtifact> Unpack(byte[] pack)
    {
        using var r = new BinaryReader(new MemoryStream(pack));
        if (!r.ReadBytes(4).AsSpan().SequenceEqual(Magic)) throw new InvalidDataException("not a cpax pack");
        var version = r.ReadByte();
        if (version != Version) throw new InvalidDataException($"cpax version {version} is not supported");
        var index = JsonSerializer.Deserialize<List<IndexEntry>>(Unbrotli(r.ReadBytes(r.ReadInt32())), Json)
                    ?? throw new InvalidDataException("cpax index is empty");
        var blobs = new byte[r.ReadInt32()][];
        for (var i = 0; i < blobs.Length; i++) blobs[i] = r.ReadBytes(r.ReadInt32());
        var result = new List<ArchivedArtifact>(index.Count);
        foreach (var e in index)
        {
            var declared = ChunkShas(e.M.ChunkSha256);
            var chunks = new List<EvidenceChunkSpec>(e.C.Length);
            for (var i = 0; i < e.C.Length; i++)
            {
                var bytes = blobs[e.C[i]];
                var sha = Sha256Hex(bytes);
                if (i < declared.Length && !string.Equals(declared[i], sha, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException($"cpax chunk {i} of {e.M.EvidenceId} does not match its checksum");
                chunks.Add(new EvidenceChunkSpec(i, sha, bytes));
            }
            result.Add(new ArchivedArtifact(e.M, chunks));
        }
        return result;
    }

    /// <summary>The chunk checksums a manifest declares (its chunk_sha256 jsonb text).</summary>
    public static string[] ChunkShas(string? chunkSha256Json) =>
        string.IsNullOrWhiteSpace(chunkSha256Json) ? Array.Empty<string>()
            : JsonSerializer.Deserialize<string[]>(chunkSha256Json) ?? Array.Empty<string>();

    /// <summary>True when the chunks are exactly what the manifest declares: count, each chunk's and the whole artifact's SHA-256.</summary>
    public static bool Verifies(ArchivedManifest m, IReadOnlyList<EvidenceChunkSpec> chunks)
    {
        if (chunks.Count != m.ChunkCount) return false;
        var declared = ChunkShas(m.ChunkSha256);
        using var whole = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        long total = 0;
        for (var i = 0; i < chunks.Count; i++)
        {
            if (chunks[i].ChunkNo != i) return false;
            if (i < declared.Length && !string.Equals(declared[i], Sha256Hex(chunks[i].Payload), StringComparison.OrdinalIgnoreCase)) return false;
            whole.AppendData(chunks[i].Payload);
            total += chunks[i].Payload.Length;
        }
        return total == m.TotalBytes
               && string.Equals(Convert.ToHexString(whole.GetHashAndReset()), m.Sha256, StringComparison.OrdinalIgnoreCase);
    }

    private static byte[] Brotli(byte[] raw)
    {
        using var ms = new MemoryStream();
        using (var b = new BrotliStream(ms, CompressionLevel.SmallestSize, leaveOpen: true)) b.Write(raw);
        return ms.ToArray();
    }

    private static byte[] Unbrotli(byte[] packed)
    {
        using var input = new BrotliStream(new MemoryStream(packed), CompressionMode.Decompress);
        using var ms = new MemoryStream();
        input.CopyTo(ms);
        return ms.ToArray();
    }

    /// <summary>Not used for the chunks (see the summary); exposed for the size report of the tests.</summary>
    internal static int BrotliLength(byte[] raw) => Brotli(raw).Length;
}
