using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Data;

/// <summary>One window kind's newest KPI rows for a loop.</summary>
public sealed record KpiSlice(string Tier, int Count, IReadOnlyList<dynamic> Samples);

/// <summary>
/// CHG-024 — GET /loops/{id}/kpis/latest?resolutions=…: the Windows comparator's six
/// per-kind reads answered in one request. Same SQL as the single read (KpiSql), one
/// indexed query per kind on one connection; the HTTP fan-out is what goes away.
/// </summary>
public static class KpiReads
{
    public static async Task<Dictionary<string, KpiSlice>> LatestByResolutionAsync(
        NpgsqlConnection conn, string loopId, IReadOnlyList<(string Kind, bool IsLong)> kinds, int limit)
    {
        var result = new Dictionary<string, KpiSlice>(StringComparer.Ordinal);
        foreach (var (kind, isLong) in kinds)
        {
            var rows = (await conn.QueryAsync(isLong ? KpiSql.Long : KpiSql.Short, new
            {
                loopId,
                resolution = kind,
                from = (DateTimeOffset?)null,
                to = (DateTimeOffset?)null,
                limit,
                before = (DateTimeOffset?)null,
            })).ToList();
            result[kind] = new KpiSlice(isLong ? "long" : "short", rows.Count, rows);
        }
        return result;
    }
}
