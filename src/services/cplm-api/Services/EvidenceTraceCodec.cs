using System.Buffers.Binary;
using System.IO.Compression;
using System.Text.Json;

namespace Traverse.CplmApi.Services;

/// <summary>
/// CHG-102 Phase 5b-2 — the evidence wire encoding seen from .NET, mirroring the Flink EvidenceChunker
/// (src/flink/src/main/java/com/ams/flink/cplm/evidence/EvidenceChunker.java:28-45, 75-88): every column as f64
/// little-endian, column after column (x, y, mask?, named columns in manifest order), ONE gzip stream over the
/// concatenation, split into 256 KiB chunks. Decoding is exact; re-encoding yields the same decoded bytes, but the gzip
/// bytes of .NET may differ from Java's (a different deflate implementation), so a rebuilt artifact carries its own
/// SHA-256s.
/// </summary>
public static class EvidenceTraceCodec
{
    /// <summary>EvidenceChunker.DEFAULT_CHUNK_BYTES.</summary>
    public const int ChunkBytes = 256 * 1024;

    /// <summary>Java's Double.NaN (0x7ff8000000000000): what ByteBuffer.putDouble writes for a NaN the engine produced.
    /// .NET's double.NaN has the sign bit set, so it must never be written in its place.</summary>
    public static readonly double JavaNaN = BitConverter.Int64BitsToDouble(0x7ff8000000000000L);

    /// <summary>The manifest's column names (its columns jsonb text).</summary>
    public static string[] ColumnNames(string columnsJson) =>
        JsonSerializer.Deserialize<string[]>(columnsJson) ?? Array.Empty<string>();

    /// <summary>The uncompressed f64le stream of an artifact (its chunks joined and gunzipped).</summary>
    public static byte[] Inflate(IReadOnlyList<EvidenceChunkSpec> chunks)
    {
        using var joined = new MemoryStream();
        foreach (var c in chunks) joined.Write(c.Payload);
        joined.Position = 0;
        using var gz = new GZipStream(joined, CompressionMode.Decompress);
        using var raw = new MemoryStream();
        gz.CopyTo(raw);
        return raw.ToArray();
    }

    /// <summary>The raw f64le bytes of each column, or null when the stream is not columns x n doubles.</summary>
    public static byte[][]? SplitColumns(byte[] raw, int columns, int n)
    {
        if (columns <= 0 || n < 0 || raw.Length != (long)columns * n * 8) return null;
        var outCols = new byte[columns][];
        for (var c = 0; c < columns; c++) outCols[c] = raw.AsSpan(c * n * 8, n * 8).ToArray();
        return outCols;
    }

    public static double[] ToDoubles(byte[] column)
    {
        var v = new double[column.Length / 8];
        for (var i = 0; i < v.Length; i++) v[i] = BinaryPrimitives.ReadDoubleLittleEndian(column.AsSpan(i * 8, 8));
        return v;
    }

    /// <summary>f64le bytes, bit for bit (a NaN keeps its payload and sign).</summary>
    public static byte[] ToBytes(IReadOnlyList<double> values)
    {
        var b = new byte[values.Count * 8];
        for (var i = 0; i < values.Count; i++) BinaryPrimitives.WriteInt64LittleEndian(b.AsSpan(i * 8, 8), BitConverter.DoubleToInt64Bits(values[i]));
        return b;
    }

    /// <summary>gzip of the concatenated columns, split as the Flink chunker splits; each chunk with its SHA-256.</summary>
    public static (List<EvidenceChunkSpec> Chunks, string Sha256, long TotalBytes) Encode(IReadOnlyList<byte[]> columns)
    {
        using var gzOut = new MemoryStream();
        using (var gz = new GZipStream(gzOut, CompressionLevel.Optimal, leaveOpen: true))
            foreach (var c in columns) gz.Write(c);
        var all = gzOut.ToArray();
        var chunks = new List<EvidenceChunkSpec>();
        if (all.Length == 0) chunks.Add(new EvidenceChunkSpec(0, EvidenceArchivePack.Sha256Hex(Array.Empty<byte>()), Array.Empty<byte>()));
        for (int off = 0, no = 0; off < all.Length; off += ChunkBytes, no++)
        {
            var piece = all.AsSpan(off, Math.Min(ChunkBytes, all.Length - off)).ToArray();
            chunks.Add(new EvidenceChunkSpec(no, EvidenceArchivePack.Sha256Hex(piece), piece));
        }
        return (chunks, EvidenceArchivePack.Sha256Hex(all), all.Length);
    }

    /// <summary>SHA-256 over the concatenation of the columns (the artifact's uncompressed stream).</summary>
    public static string StreamSha(IReadOnlyList<byte[]> columns)
    {
        using var h = System.Security.Cryptography.IncrementalHash.CreateHash(System.Security.Cryptography.HashAlgorithmName.SHA256);
        foreach (var c in columns) h.AppendData(c);
        return Convert.ToHexString(h.GetHashAndReset()).ToLowerInvariant();
    }

    /// <summary>
    /// The column a historian source gives over <paramref name="rows"/> (ascending), as the engine would have written it:
    /// time = the f64 timestamps, a measurement = its value with a missing point as Java's NaN. Null when a measurement
    /// was not returned at all.
    /// </summary>
    public static double[]? Rebuild(IotDbSeries s, int from, int count, string source)
    {
        var v = new double[count];
        if (source == TraceSource.Time)
        {
            for (var i = 0; i < count; i++) v[i] = s.Timestamps[from + i];
            return v;
        }
        if (!s.Values.TryGetValue(source, out var col)) return null;
        for (var i = 0; i < count; i++) v[i] = col[from + i] ?? JavaNaN;
        return v;
    }

    /// <summary>The first index where two columns differ bit for bit (-1 = identical, -2 = lengths differ).</summary>
    public static int FirstDifference(byte[] a, byte[] b)
    {
        if (a.Length != b.Length) return -2;
        var m = a.AsSpan().CommonPrefixLength(b);
        return m == a.Length ? -1 : m / 8;
    }
}
