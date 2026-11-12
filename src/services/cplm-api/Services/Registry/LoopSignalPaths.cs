// CHG-179 - the loop-signal paths an HMI display needs (GET /api/v1/cpm/loops/signal-paths). A display shows a fallback
// binding on a CPLM loop signal as not read (frontend utils/bindingTrust.ts, CHG-176): the path-derived address is known
// wrong for loop signals. Least information: the paths only - no loop ids, roles, descriptions or states.
using System.Security.Cryptography;
using System.Text;
using Dapper;
using Microsoft.Extensions.Primitives;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>The answer, exactly these three fields: {paths, count, generatedAt}.</summary>
public sealed record LoopSignalPathsResponse(IReadOnlyList<string> Paths, int Count, DateTime GeneratedAt);

/// <summary>One normalised path set as served and cached: the paths, when they were read (UTC), the weak ETag of the paths.</summary>
public sealed record LoopSignalPathSet(IReadOnlyList<string> Paths, DateTime GeneratedAt, string ETag)
{
    public LoopSignalPathsResponse ToResponse() => new(Paths, Paths.Count, GeneratedAt);
}

public static class LoopSignalPaths
{
    /// <summary>
    /// Every active tag-map row (whatever roles the registry stores: PV, SP, OP, MODE, VP ...) of every REGISTERED loop,
    /// in one query - no per-loop calls. Retired loops are included on purpose: retiring keeps the tag map, a display may
    /// still be bound to a retired loop's signals, and treating such a path as a loop signal is the safe side (its
    /// fallback is not read). The rows are the ones GET /loops shows as the loops' tags (t.is_active); there is no filter
    /// on the registry row's is_active or monitoring.
    /// </summary>
    public const string Select = """
        SELECT DISTINCT t.uns_path
        FROM cpm.loop_tag_map t
        JOIN cpm.loop_registry r ON r.loop_id = t.loop_id
        WHERE t.is_active = TRUE
        """;

    /// <summary>The stored paths, as stored (see <see cref="Normalise"/>).</summary>
    public static async Task<IReadOnlyList<string>> LoadAsync(NpgsqlConnection conn, CancellationToken ct) =>
        (await conn.QueryAsync<string>(new CommandDefinition(Select, cancellationToken: ct))).ToList();

    /// <summary>Trimmed, lower-cased (invariant), blanks dropped, de-duplicated, sorted (ordinal): the frontend's normPath.</summary>
    public static IReadOnlyList<string> Normalise(IEnumerable<string?> stored) =>
        stored.Where(p => !string.IsNullOrWhiteSpace(p))
              .Select(p => p!.Trim().ToLowerInvariant())
              .Distinct(StringComparer.Ordinal)
              .OrderBy(p => p, StringComparer.Ordinal)
              .ToList();

    /// <summary>The set to serve and cache. Its ETag covers the paths only, hence weak: generatedAt differs per read.</summary>
    public static LoopSignalPathSet From(IEnumerable<string?> stored, DateTime generatedAtUtc)
    {
        var paths = Normalise(stored);
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(string.Join('\n', paths)));
        return new LoopSignalPathSet(paths, generatedAtUtc, $"W/\"{Convert.ToHexString(hash, 0, 16).ToLowerInvariant()}\"");
    }

    /// <summary>If-None-Match against the set's tag by weak comparison (RFC 9110 13.1.2): W/ is ignored on both sides.</summary>
    public static bool IfNoneMatchHits(StringValues ifNoneMatch, string etag)
    {
        var mine = Opaque(etag);
        foreach (var header in ifNoneMatch)
        foreach (var candidate in (header ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            if (candidate == "*" || Opaque(candidate) == mine)
                return true;
        return false;
    }

    private static string Opaque(string tag) => tag.StartsWith("W/", StringComparison.Ordinal) ? tag[2..] : tag;
}
