using Traverse.IngestionService.Models;

namespace Traverse.IngestionService.Services;

/// <summary>
/// CHG-062: two active MQTT_LOOP_SAMPLES sources on one broker feed that overlap deliver every
/// sample once per source (the lab saw 6x). Pure rules, shared by the REST endpoints (409)
/// and the subscriber manager (oldest wins) so the two can never disagree.
/// </summary>
public static class LoopSourceConflicts
{
    public const string LoopProfile = "MQTT_LOOP_SAMPLES";

    public static bool IsLoop(DataSourceRow r) =>
        string.Equals(r.ProfileType, LoopProfile, StringComparison.Ordinal);

    /// <summary>scheme://host:port, lower-case, default port 1883 (8883 for mqtts/ssl). Null if unparseable.</summary>
    public static string? NormalizeEndpoint(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri) || string.IsNullOrEmpty(uri.Host)) return null;
        var scheme = uri.Scheme.ToLowerInvariant();
        var isTls = scheme is "mqtts" or "ssl";
        var port = uri.IsDefaultPort || uri.Port <= 0 ? (isTls ? 8883 : 1883) : uri.Port;
        return $"{scheme}://{uri.Host.ToLowerInvariant()}:{port}";
    }

    public static List<string> Topics(DataSourceRow r) =>
        (ProfileConfig.FromJson(r.ProfileConfig).Mqtt?.Topics ?? new List<string>())
            .Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()).ToList();

    public static string ClientId(DataSourceRow r) =>
        DataSourceDto.DeriveClientId(r.ConfigId, ProfileConfig.FromJson(r.ProfileConfig).Mqtt);

    /// <summary>MQTT filter overlap, level by level: '+' matches one level, '#' the rest.</summary>
    public static bool FiltersOverlap(string a, string b)
    {
        var x = a.Split('/'); var y = b.Split('/');
        for (var i = 0; ; i++)
        {
            if ((i < x.Length && x[i] == "#") || (i < y.Length && y[i] == "#")) return true;
            if (i >= x.Length || i >= y.Length) return i >= x.Length && i >= y.Length;
            if (x[i] != "+" && y[i] != "+" && x[i] != y[i]) return false;
        }
    }

    public static bool TopicsOverlap(IEnumerable<string> a, IEnumerable<string> b)
    {
        var bl = b.ToList();
        return a.Any(fa => bl.Any(fb => FiltersOverlap(fa, fb)));
    }

    public static bool SameEndpoint(DataSourceRow a, DataSourceRow b)
    {
        var ea = NormalizeEndpoint(a.ConnectionUrl);
        return ea is not null && ea == NormalizeEndpoint(b.ConnectionUrl);
    }

    /// <summary>True when the two loop sources would double-deliver (same endpoint AND overlap or client-id clash).</summary>
    public static bool Conflicts(DataSourceRow a, DataSourceRow b) =>
        a.ConfigId != b.ConfigId && IsLoop(a) && IsLoop(b) && SameEndpoint(a, b)
        && (TopicsOverlap(Topics(a), Topics(b))
            || string.Equals(ClientId(a), ClientId(b), StringComparison.Ordinal));

    /// <summary>The oldest active source the candidate collides with, or null. Self and inactive rows are ignored.</summary>
    public static DataSourceRow? FindConflict(DataSourceRow candidate, IEnumerable<DataSourceRow> others) =>
        !IsLoop(candidate) ? null
            : Order(others).FirstOrDefault(o => o.IsActive && Conflicts(candidate, o));

    /// <summary>True when a field that defines the feed (endpoint, topics, client id, profile) differs.</summary>
    public static bool FeedChanged(DataSourceRow before, DataSourceRow after) =>
        before.ProfileType != after.ProfileType
        || NormalizeEndpoint(before.ConnectionUrl) != NormalizeEndpoint(after.ConnectionUrl)
        || ClientId(before) != ClientId(after)
        || !Topics(before).SequenceEqual(Topics(after), StringComparer.Ordinal);

    public static string ConflictMessage(DataSourceRow other) =>
        $"overlaps active source '{other.Name}' ({other.ConfigId})";

    public static IEnumerable<DataSourceRow> Order(IEnumerable<DataSourceRow> rows) =>
        rows.OrderBy(r => r.CreatedAt).ThenBy(r => r.ConfigId);

    /// <summary>Oldest wins: loser config id -> the winner it collides with. Inactive rows are skipped.</summary>
    public static Dictionary<Guid, DataSourceRow> ResolveLosers(IEnumerable<DataSourceRow> rows)
    {
        var losers = new Dictionary<Guid, DataSourceRow>();
        var winners = new List<DataSourceRow>();
        foreach (var r in Order(rows.Where(x => x.IsActive && IsLoop(x))))
        {
            var hit = winners.FirstOrDefault(w => Conflicts(r, w));
            if (hit is null) winners.Add(r); else losers[r.ConfigId] = hit;
        }
        return losers;
    }

    /// <summary>Active loop sources on one endpoint whose filters do NOT overlap (the diagnostics-vs-PIDParams trap).</summary>
    public static List<(DataSourceRow A, DataSourceRow B)> SameEndpointPairs(IEnumerable<DataSourceRow> winners)
    {
        var l = Order(winners.Where(x => x.IsActive && IsLoop(x))).ToList();
        var pairs = new List<(DataSourceRow, DataSourceRow)>();
        for (var i = 0; i < l.Count; i++)
            for (var j = i + 1; j < l.Count; j++)
                if (SameEndpoint(l[i], l[j]) && !Conflicts(l[i], l[j])) pairs.Add((l[i], l[j]));
        return pairs;
    }
}
