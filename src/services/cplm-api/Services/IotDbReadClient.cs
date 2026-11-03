using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Traverse.CplmApi.Services;

/// <summary>One IoTDB row: window-end timestamp and the selected measurements (bare names → value, null = no point).</summary>
public sealed record IotDbRow(long TimestampMs, IReadOnlyDictionary<string, object?> Values);

/// <summary>
/// A read's outcome. <see cref="Degraded"/> = the historian could not be asked or did not answer
/// (transport, auth, timeout, refused query): the caller serves what it has and says so.
/// </summary>
public sealed record IotDbRows(IReadOnlyList<IotDbRow> Rows, bool Degraded, string? Error)
{
    public static readonly IotDbRows Empty = new(Array.Empty<IotDbRow>(), false, null);
    public static IotDbRows Fail(string error) => new(Array.Empty<IotDbRow>(), true, error);
}

/// <summary>The historian read seam (CHG-102 Phase 3) — faked in KpiHistoryReaderTests.</summary>
public interface IIotDbReader
{
    /// <summary>
    /// Newest-first rows of one device with <paramref name="fromMs"/> ≤ time &lt; <paramref name="beforeMs"/>
    /// (either bound optional), at most <paramref name="limit"/>. <paramref name="predicate"/> is an extra
    /// WHERE term (trusted, built by the caller from constants). Never throws for an IoTDB failure.
    /// </summary>
    Task<IotDbRows> ReadNewestAsync(string device, IReadOnlyList<string> columns, long? fromMs, long? beforeMs,
        int limit, string? predicate, CancellationToken ct);
}

/// <summary>
/// CHG-102 Phase 3 — read-side IoTDB REST v2 client for the KPI history (layout v2 template devices).
/// POST /rest/v2/query, Basic auth from <see cref="IotDbWriteOptions"/>, a 5 s budget per read on top of
/// the factory's resilience pipeline. Measurement names are bare: IoTDB 1.3.2 keeps back-quoted names
/// literally (`g0` would be a different series from g0).
/// </summary>
public sealed class IotDbReadClient : IIotDbReader
{
    public static readonly TimeSpan Budget = TimeSpan.FromSeconds(5);

    private readonly IHttpClientFactory _httpFactory;
    private readonly IotDbWriteOptions _opts;
    private readonly ILogger<IotDbReadClient> _logger;
    private readonly string _authHeader;

    public IotDbReadClient(IHttpClientFactory httpFactory, IOptions<IotDbWriteOptions> opts, ILogger<IotDbReadClient> logger)
    {
        _httpFactory = httpFactory;
        _opts = opts.Value;
        _logger = logger;
        _authHeader = Convert.ToBase64String(Encoding.ASCII.GetBytes($"{_opts.Username}:{_opts.Password}"));
    }

    public async Task<IotDbRows> ReadNewestAsync(string device, IReadOnlyList<string> columns, long? fromMs,
        long? beforeMs, int limit, string? predicate, CancellationToken ct)
    {
        if (!_opts.Enabled) return IotDbRows.Fail("IotDb:Enabled=false");
        if (columns.Count == 0 || limit <= 0) return IotDbRows.Empty;
        var sql = BuildNewestSql(device, columns, fromMs, beforeMs, limit, predicate);
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(Budget);
        try
        {
            var http = _httpFactory.CreateClient("IotDbRead");
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{_opts.RestUrl.TrimEnd('/')}/rest/v2/query")
            {
                Content = new StringContent(JsonSerializer.Serialize(new { sql }), Encoding.UTF8, "application/json"),
            };
            req.Headers.Authorization = new AuthenticationHeaderValue("Basic", _authHeader);
            using var res = await http.SendAsync(req, cts.Token);
            var json = await res.Content.ReadAsStringAsync(cts.Token);
            var parsed = Parse(json);
            if (parsed.Degraded || !res.IsSuccessStatusCode)
            {
                var error = parsed.Error ?? $"HTTP {(int)res.StatusCode}";
                if (parsed.Degraded && IsMissingPath(error)) return IotDbRows.Empty;   // device never written = no history
                _logger.LogWarning("IoTDB KPI history read failed ({Status}): {Error} — SQL: {Sql}", res.StatusCode, error, sql);
                return IotDbRows.Fail(error);
            }
            return parsed;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;   // the caller went away; not an IoTDB failure
        }
        catch (Exception ex)
        {
            // Includes the 5 s budget (cancellation with ct un-cancelled), transport and an open circuit breaker.
            _logger.LogWarning("IoTDB KPI history read unavailable: {Error} — SQL: {Sql}", ex.Message, sql);
            return IotDbRows.Fail(ex.GetType().Name + ": " + ex.Message);
        }
    }

    /// <summary><c>select c1,c2 from dev where time &gt;= a and time &lt; b [and p] order by time desc limit n</c>.</summary>
    public static string BuildNewestSql(string device, IReadOnlyList<string> columns, long? fromMs, long? beforeMs,
        int limit, string? predicate)
    {
        var where = new List<string>();
        if (fromMs is long f) where.Add("time >= " + f.ToString(CultureInfo.InvariantCulture));
        if (beforeMs is long b) where.Add("time < " + b.ToString(CultureInfo.InvariantCulture));
        if (!string.IsNullOrWhiteSpace(predicate)) where.Add("(" + predicate + ")");
        var sb = new StringBuilder("select ").Append(string.Join(',', columns)).Append(" from ").Append(device);
        if (where.Count > 0) sb.Append(" where ").Append(string.Join(" and ", where));
        sb.Append(" order by time desc limit ").Append(limit.ToString(CultureInfo.InvariantCulture));
        return sb.ToString();
    }

    /// <summary>
    /// Maps the column-oriented REST v2 answer — <c>expressions[]</c> full paths, <c>timestamps[]</c>,
    /// <c>values[col][row]</c> — to rows keyed by the bare measurement (last path segment). An error
    /// body (<c>{"code":…,"message":…}</c>) or unparseable text comes back degraded with the message.
    /// </summary>
    public static IotDbRows Parse(string json)
    {
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { return IotDbRows.Fail("unparseable IoTDB reply: " + Trim(json)); }
        if (root.ValueKind != JsonValueKind.Object) return IotDbRows.Fail("unexpected IoTDB reply: " + Trim(json));

        if (!root.TryGetProperty("timestamps", out var ts) || root.TryGetProperty("code", out _))
        {
            var msg = root.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString() : null;
            var code = root.TryGetProperty("code", out var c) ? c.ToString() : "?";
            return IotDbRows.Fail($"IoTDB {code}: {msg ?? Trim(json)}");
        }
        if (ts.ValueKind != JsonValueKind.Array) return IotDbRows.Empty;

        var names = new List<string>();
        if (root.TryGetProperty("expressions", out var ex) && ex.ValueKind == JsonValueKind.Array)
            foreach (var e in ex.EnumerateArray())
            {
                var path = e.GetString() ?? "";
                var dot = path.LastIndexOf('.');
                names.Add(dot >= 0 ? path[(dot + 1)..] : path);
            }
        var cols = new List<JsonElement>();
        if (root.TryGetProperty("values", out var vs) && vs.ValueKind == JsonValueKind.Array)
            cols.AddRange(vs.EnumerateArray());

        var rows = new List<IotDbRow>(ts.GetArrayLength());
        var r = 0;
        foreach (var t in ts.EnumerateArray())
        {
            var values = new Dictionary<string, object?>(names.Count, StringComparer.Ordinal);
            for (var ci = 0; ci < names.Count && ci < cols.Count; ci++)
            {
                var col = cols[ci];
                values[names[ci]] = col.ValueKind == JsonValueKind.Array && r < col.GetArrayLength() ? Value(col[r]) : null;
            }
            rows.Add(new IotDbRow(t.GetInt64(), values));
            r++;
        }
        return new IotDbRows(rows, false, null);
    }

    private static object? Value(JsonElement v) => v.ValueKind switch
    {
        JsonValueKind.Number => v.GetDouble(),
        JsonValueKind.String => v.GetString(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        _ => null,
    };

    /// <summary>A select over a path IoTDB has never seen is "no rows", not an outage.</summary>
    public static bool IsMissingPath(string error) =>
        error.Contains("does not exist", StringComparison.OrdinalIgnoreCase)
        || error.Contains("not exist", StringComparison.OrdinalIgnoreCase) && error.Contains("path", StringComparison.OrdinalIgnoreCase);

    private static string Trim(string s) => s.Length <= 300 ? s : s[..300] + "…";
}
