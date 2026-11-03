using System.IO.Compression;

namespace Traverse.CplmApi.Services;

/// <summary>
/// CHG-102 Phase 5b-2 — a column stored as a reference to the loop's raw historian series: <see cref="Source"/>
/// (<see cref="TraceSource"/>) over the artifact's time range, <see cref="Count"/> rows, and the SHA-256 of the ORIGINAL
/// column's f64le bytes, which the rebuilt column must reproduce. <see cref="Type"/> = the IoTDB data type when it was
/// verified (informational: the read decodes by the type it is served).
/// </summary>
public sealed record TraceRef(string Source, int Count, string Sha, string? Type);

/// <summary>One column of a trace-form artifact: a reference, or inline (its bytes are in the pack).</summary>
public sealed record TraceColumn(string Name, TraceRef? R);

/// <summary>
/// CHG-102 Phase 5b-2 — an artifact archived as decoded columns with the raw-sample ones replaced by references.
/// <see cref="StreamSha"/> = SHA-256 of the artifact's whole uncompressed f64le stream: the proof that the re-assembled
/// columns are the engine's, bit for bit. The historian is asked for <see cref="Query"/> on <see cref="Device"/> (or,
/// after a tree move, the loop's device under today's prefix) with <see cref="FromMs"/> &lt;= time &lt;= <see cref="ToMs"/>.
/// </summary>
public sealed record TraceForm(int N, string StreamSha, string Loop, string Device, long FromMs, long ToMs, string[] Query, TraceColumn[] Cols);

/// <summary>A trace-form artifact as held in memory: the form and, per column, the Brotli-compressed f64le bytes of an
/// inline column (null for a referenced one).</summary>
public sealed record ArchivedTrace(TraceForm Form, IReadOnlyList<byte[]?> Inline)
{
    /// <summary>Brotli quality 6: on f64 columns within ~1 % of quality 11 at a fraction of the CPU (a plant boundary
    /// hour packs ~300 sets at once).</summary>
    public const int Quality = 6;

    public static byte[] Compress(byte[] raw)
    {
        var dest = new byte[BrotliEncoder.GetMaxCompressedLength(raw.Length)];
        if (!BrotliEncoder.TryCompress(raw, dest, out var written, Quality, 22)) throw new InvalidOperationException("brotli failed");
        return dest.AsSpan(0, written).ToArray();
    }

    public static byte[] Decompress(byte[] packed)
    {
        using var input = new BrotliStream(new MemoryStream(packed), CompressionMode.Decompress);
        using var ms = new MemoryStream();
        input.CopyTo(ms);
        return ms.ToArray();
    }
}

/// <summary>Why a trace-form artifact cannot be served now. <see cref="Transient"/> = the historian may answer later.</summary>
public sealed record TraceFailure(string Code, string Reason, bool Transient)
{
    public const string HistorianUnavailable = "TRACE_HISTORIAN_UNAVAILABLE";
    public const string HistorianDiffers = "TRACE_HISTORIAN_DIFFERS";
    public const string HistorianExpired = "TRACE_HISTORIAN_EXPIRED";
    public const string NotConfigured = "TRACE_READER_NOT_CONFIGURED";
}
