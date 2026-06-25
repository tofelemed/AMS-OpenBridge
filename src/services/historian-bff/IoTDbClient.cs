using System.Text;
using System.Text.Json;

namespace AMS.HistorianBff;

/// <summary>
/// Thin wrapper around IoTDB REST API v2.
/// REST v2 is enabled by setting enable_rest_service=true in IoTDB config.
/// Default endpoint: http://iotdb:8181/rest/v2
///
/// Note: IoTDB REST v2 uses Basic auth (default root/root).
/// </summary>
public sealed class IoTDbClient(HttpClient http, IConfiguration cfg)
{
    private readonly string _baseUrl = cfg["IoTDB:RestUrl"] ?? "http://iotdb:8181";
    private readonly string _auth    = Convert.ToBase64String(
        Encoding.UTF8.GetBytes(
            $"{cfg["IoTDB:User"] ?? "root"}:{cfg["IoTDB:Password"] ?? "root"}"));

    /// <summary>Executes a raw SQL query against IoTDB REST v2.</summary>
    public async Task<JsonElement> QueryAsync(string sql, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/rest/v2/query");
        req.Headers.Add("Authorization", $"Basic {_auth}");
        req.Content = new StringContent(
            JsonSerializer.Serialize(new { sql }),
            Encoding.UTF8, "application/json");

        var resp = await http.SendAsync(req, ct);
        resp.EnsureSuccessStatusCode();
        var stream = await resp.Content.ReadAsStreamAsync(ct);
        return (await JsonSerializer.DeserializeAsync<JsonElement>(stream, cancellationToken: ct));
    }

    // ── SQL builders ──────────────────────────────────────────────────────

    /// <summary>
    /// Builds a GROUP BY (time interval) query for trend decimation.
    /// Interval = (end - start) / width  → always returns ≤ width points.
    /// </summary>
    public string BuildTrendSql(string series, DateTimeOffset start, DateTimeOffset end,
                                int width, string measurements)
    {
        long startMs    = start.ToUnixTimeMilliseconds();
        long endMs      = end.ToUnixTimeMilliseconds();
        long intervalMs = Math.Max(1, (endMs - startMs) / Math.Max(1, width));

        // Default measurements if not specified
        string cols = string.IsNullOrWhiteSpace(measurements)
            ? "avg(severity), last_value(state), last_value(ack_status), last_value(priority)"
            : string.Join(", ", measurements.Split(',').Select(m => m.Trim())
                .Select(m => m is "severity" ? "avg(severity)" : $"last_value({m})"));

        return $"SELECT {cols} FROM {series} " +
               $"GROUP BY ([{startMs},{endMs}), {intervalMs}ms)";
    }

    /// <summary>Raw (non-decimated) query with LIMIT safeguard.</summary>
    public string BuildRawSql(string series, DateTimeOffset start, DateTimeOffset end,
                              int maxCount, string measurements)
    {
        long startMs = start.ToUnixTimeMilliseconds();
        long endMs   = end.ToUnixTimeMilliseconds();

        string cols = string.IsNullOrWhiteSpace(measurements)
            ? "severity, state, ack_status, condition_name, source_name, priority"
            : measurements;

        return $"SELECT {cols} FROM {series} " +
               $"WHERE time >= {startMs} AND time < {endMs} " +
               $"ORDER BY time ASC LIMIT {Math.Min(maxCount, 10_000)}";
    }

    // ── Response mapper ───────────────────────────────────────────────────

    /// <summary>
    /// Converts IoTDB REST v2 columnar response into a list of time-series points.
    /// IoTDB returns: { "columnNames": [...], "timestamps": [...], "values": [[...], ...] }
    /// </summary>
    public static List<Dictionary<string, object?>> MapPoints(JsonElement result)
    {
        var points = new List<Dictionary<string, object?>>();

        if (!result.TryGetProperty("columnNames", out var cols)
            || !result.TryGetProperty("timestamps", out var ts)
            || !result.TryGetProperty("values", out var vals))
            return points;

        var columnNames = cols.EnumerateArray().Select(c => c.GetString()!).ToList();
        var timestamps  = ts.EnumerateArray().Select(t => t.GetInt64()).ToList();
        var valueRows   = vals.EnumerateArray()
                              .Select(row => row.EnumerateArray().ToList()).ToList();

        for (int i = 0; i < timestamps.Count; i++)
        {
            var point = new Dictionary<string, object?> { ["ts"] = timestamps[i] };
            for (int c = 0; c < columnNames.Count && c < valueRows.Count; c++)
            {
                var cell = (i < valueRows[c].Count) ? valueRows[c][i] : (JsonElement?)null;
                point[StripPrefix(columnNames[c])] = JsonElementToValue(cell);
            }
            points.Add(point);
        }
        return points;
    }

    private static string StripPrefix(string col)
    {
        // Remove "avg(" / "last_value(" wrappers IoTDB adds to column names
        int paren = col.IndexOf('(');
        if (paren < 0) return col;
        return col[(paren + 1)..col.LastIndexOf(')')];
    }

    private static object? JsonElementToValue(JsonElement? el)
    {
        if (el is null) return null;
        var e = el.Value;
        return e.ValueKind switch
        {
            JsonValueKind.Number  => e.TryGetInt64(out var l)  ? l
                                   : e.TryGetDouble(out var d) ? d : (object?)null,
            JsonValueKind.String  => e.GetString(),
            JsonValueKind.True    => true,
            JsonValueKind.False   => false,
            JsonValueKind.Null    => null,
            _                     => e.GetRawText()
        };
    }
}
