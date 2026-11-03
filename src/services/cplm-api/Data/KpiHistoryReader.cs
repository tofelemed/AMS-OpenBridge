using Microsoft.Extensions.Options;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Data;

/// <summary>Merged newest-first rows; <see cref="Degraded"/> = the historian part was asked for and failed.</summary>
public sealed record TieredRows(List<object> Rows, bool Degraded, int HistorianCount);

/// <summary>
/// CHG-102 Phase 3 — one API, tiered behind it (plan-iotdb-postgres.md §2.3). Postgres keeps the hot window
/// (short 6 h, long 24–48 h, gate verdicts 14 d); with IoTDB layout v2 the older KPI history lives only in
/// the historian. The controller runs today's Postgres query unchanged, then this extends the page:
///
///   if layout v2 AND Postgres returned fewer than <c>limit</c> rows AND the range reaches older than the
///   edge, fetch the remainder from IoTDB, newest first, with  from ≤ time &lt; edge,  limit = remaining.
///
/// The edge is the oldest window_end Postgres returned (strictly older → no duplicate at the seam), or —
/// when Postgres returned nothing — the request's own upper bound (<c>before</c> exclusive, <c>to</c>
/// inclusive), or none. Because Postgres returned a short page it holds nothing older inside the range,
/// so the historian rows cannot repeat a Postgres window. The keyset cursor (<c>nextBefore</c> = oldest
/// window_end of a full page) therefore works across the seam: the next page's Postgres query is empty and
/// the edge becomes that cursor. Layout v1, a window kind with no history family, or a non-LIVE purpose:
/// Postgres only. A historian failure never fails the request: Postgres rows + <c>Degraded</c>.
/// </summary>
public sealed class KpiHistoryReader
{
    /// <summary>Gate verdict rows the summary picker hides unless asked (same rule as the Postgres query).</summary>
    public const string ExcludeInsufficient = "diagnosis != 'INSUFFICIENT_DATA' or diagnosis is null";

    private readonly IIotDbReader _iotdb;
    private readonly IotDbWriteOptions _opts;

    public KpiHistoryReader(IIotDbReader iotdb, IOptions<IotDbWriteOptions> opts)
    {
        _iotdb = iotdb;
        _opts = opts.Value;
    }

    /// <summary>True when an older range can be served from the historian at all.</summary>
    public bool Tiered => _opts.Enabled && _opts.IsLayoutV2;

    /// <summary>GET loops/{id}/kpis — extends the Postgres page (KpiSql.Short / KpiSql.Long rows).</summary>
    public async Task<TieredRows> ExtendKpisAsync(string loopId, string resolution, bool isLong,
        DateTimeOffset? from, DateTimeOffset? to, DateTimeOffset? before, int limit,
        IReadOnlyList<object> pgRows, CancellationToken ct)
    {
        var rows = Tag(pgRows);
        var kind = isLong ? KpiResultKind.Long : KpiResultKind.Short;
        var family = KpiHistorianRows.Family(resolution, kind);
        if (!Tiered || family is null || rows.Count >= limit) return new(rows, false, 0);

        var edge = Edge(rows, "window_end", to, before);
        var fromMs = from?.ToUnixTimeMilliseconds();
        if (fromMs is long f && edge is long e && e <= f) return new(rows, false, 0);

        var db = isLong ? _opts.KpiDatabase : _opts.ShortKpiDatabase;
        var device = $"{db}.{family}.{IotDbWriteClient.SafeNode(loopId)}";
        var read = await _iotdb.ReadNewestAsync(device, KpiHistorianRows.Columns(kind), fromMs, edge,
            limit - rows.Count, null, ct);
        if (read.Degraded) return new(rows, true, 0);
        foreach (var r in read.Rows)
            rows.Add(isLong ? KpiHistorianRows.Long(r) : KpiHistorianRows.Short(r));
        return new(rows, false, read.Rows.Count);
    }

    /// <summary>
    /// GET loops/{id}/gates?projection=summary — extends the Postgres summaries (dictionaries with
    /// <c>windowEnd</c>). The history holds LIVE verdicts only, so any other purpose stays Postgres-only.
    /// </summary>
    public async Task<TieredRows> ExtendGateSummariesAsync(string loopId, string windowKind,
        DateTimeOffset? from, DateTimeOffset? to, int limit, bool includeInsufficient, string purpose,
        IReadOnlyList<object> pgSummaries, CancellationToken ct)
    {
        var rows = Tag(pgSummaries);
        var family = KpiHistorianRows.Family(windowKind, KpiResultKind.Gate);
        if (!Tiered || family is null || rows.Count >= limit
            || !string.Equals(purpose, "LIVE", StringComparison.OrdinalIgnoreCase))
            return new(rows, false, 0);

        var edge = Edge(rows, "windowEnd", to, null);
        var fromMs = from?.ToUnixTimeMilliseconds();
        if (fromMs is long f && edge is long e && e <= f) return new(rows, false, 0);

        var device = $"{_opts.KpiDatabase}.{family}.{IotDbWriteClient.SafeNode(loopId)}";
        var read = await _iotdb.ReadNewestAsync(device, KpiHistorianRows.Columns(KpiResultKind.Gate), fromMs, edge,
            limit - rows.Count, includeInsufficient ? null : ExcludeInsufficient, ct);
        if (read.Degraded) return new(rows, true, 0);
        foreach (var r in read.Rows)
            rows.Add(KpiHistorianRows.GateSummary(r, loopId, windowKind));
        return new(rows, false, read.Rows.Count);
    }

    /// <summary>
    /// The exclusive upper bound (ms) of the historian part: the oldest window end in the Postgres page;
    /// with an empty page the request's bound (<paramref name="before"/> exclusive, <paramref name="to"/>
    /// inclusive → +1 ms), the tighter of the two; null = unbounded.
    /// </summary>
    public static long? Edge(IReadOnlyList<object> pgRows, string endKey, DateTimeOffset? to, DateTimeOffset? before)
    {
        long? oldest = null;
        foreach (var row in pgRows)
            if (WindowEndMs(row, endKey) is long ms && (oldest is null || ms < oldest)) oldest = ms;
        if (oldest is not null) return oldest;
        long? edge = before?.ToUnixTimeMilliseconds();
        if (to is DateTimeOffset t)
        {
            var toEx = t.ToUnixTimeMilliseconds() + 1;
            edge = edge is null ? toEx : Math.Min(edge.Value, toEx);
        }
        return edge;
    }

    /// <summary>The window end of a Dapper row / projection dictionary as epoch ms (Npgsql timestamptz = UTC DateTime).</summary>
    public static long? WindowEndMs(object row, string endKey)
    {
        object? v = null;
        if (row is IDictionary<string, object?> d) d.TryGetValue(endKey, out v);
        return v switch
        {
            DateTime dt => new DateTimeOffset(dt.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(dt, DateTimeKind.Utc) : dt.ToUniversalTime()).ToUnixTimeMilliseconds(),
            DateTimeOffset dto => dto.ToUnixTimeMilliseconds(),
            _ => null,
        };
    }

    /// <summary>The newest-first keyset cursor: the oldest window end of a FULL page, else null.</summary>
    public static DateTimeOffset? NextBefore(IReadOnlyList<object> rows, int limit, string endKey)
    {
        if (rows.Count != limit || rows[^1] is not IDictionary<string, object?> last
            || !last.TryGetValue(endKey, out var v)) return null;
        return v switch
        {
            // exact (microsecond) value, as before CHG-102: the next page's `window_end < before` must not skip
            DateTime dt => new DateTimeOffset(dt.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(dt, DateTimeKind.Utc) : dt.ToUniversalTime()),
            DateTimeOffset dto => dto,
            _ => null,
        };
    }

    /// <summary>Copies the Postgres rows into a mutable list, stamping each with <c>source = postgres</c>.</summary>
    private static List<object> Tag(IReadOnlyList<object> pgRows)
    {
        var rows = new List<object>(pgRows.Count);
        foreach (var row in pgRows)
        {
            if (row is IDictionary<string, object?> d) d["source"] = KpiHistorianRows.SourcePostgres;
            rows.Add(row);
        }
        return rows;
    }
}
