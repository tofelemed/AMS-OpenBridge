using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Traverse.CplmApi.Services;

/// <summary>
/// An ascending raw series of one device: timestamps and, per measurement returned, the value of each row converted to
/// double EXACTLY as stored (a FLOAT widened from its float, never re-rounded through decimal) - null where the row has no
/// point. <see cref="Degraded"/> = the historian could not be asked or did not answer.
/// </summary>
public sealed record IotDbSeries(long[] Timestamps, IReadOnlyDictionary<string, double?[]> Values,
    IReadOnlyDictionary<string, string> Types, bool Degraded, string? Error)
{
    public static IotDbSeries Fail(string error) =>
        new(Array.Empty<long>(), new Dictionary<string, double?[]>(), new Dictionary<string, string>(), true, error);
}

/// <summary>CHG-102 Phase 5b-2 — the raw-series read seam of the evidence trace references (faked in the tests).</summary>
public interface IIotDbSeriesReader
{
    /// <summary>
    /// <c>select m1,m2,... from device where time &gt;= fromMs and time &lt;= toMs</c>, ascending, at most
    /// <paramref name="maxRows"/> rows. Never throws for an IoTDB failure (Degraded instead); a device or measurement
    /// IoTDB never saw comes back as no rows / no column.
    /// </summary>
    Task<IotDbSeries> ReadSeriesAsync(string device, IReadOnlyList<string> measurements, long fromMs, long toMs, int maxRows, CancellationToken ct);
}

/// <summary>
/// CHG-102 Phase 5b-2 — REST v2 <c>/rest/v2/query</c> raw-series reader (Basic auth and URL from
/// <see cref="IotDbWriteOptions"/>, the "IotDbRead" client). Values are decoded by the column's declared data type from the
/// JSON number's own text: FLOAT via float (IoTDB prints the shortest text that round-trips the float, which a double
/// parse would turn into a different double), DOUBLE via double, INT32 / INT64 exactly.
/// </summary>
public sealed class IotDbSeriesReader : IIotDbSeriesReader
{
    private readonly IHttpClientFactory _http;
    private readonly IotDbWriteOptions _opts;
    private readonly TimeSpan _budget;
    private readonly ILogger<IotDbSeriesReader>? _log;
    private readonly string _auth;

    public IotDbSeriesReader(IHttpClientFactory http, IOptions<IotDbWriteOptions> opts, IOptions<EvidenceArchiveOptions> archive,
        ILogger<IotDbSeriesReader>? log = null)
    {
        _http = http;
        _opts = opts.Value;
        _budget = TimeSpan.FromSeconds(Math.Max(1, archive.Value.TraceReadTimeoutSeconds));
        _log = log;
        _auth = Convert.ToBase64String(Encoding.ASCII.GetBytes($"{_opts.Username}:{_opts.Password}"));
    }

    public static string BuildSql(string device, IReadOnlyList<string> measurements, long fromMs, long toMs, int maxRows) =>
        $"select {string.Join(',', measurements)} from {device} where time >= {fromMs.ToString(CultureInfo.InvariantCulture)} " +
        $"and time <= {toMs.ToString(CultureInfo.InvariantCulture)} limit {maxRows.ToString(CultureInfo.InvariantCulture)}";

    public async Task<IotDbSeries> ReadSeriesAsync(string device, IReadOnlyList<string> measurements, long fromMs, long toMs, int maxRows, CancellationToken ct)
    {
        if (!_opts.Enabled) return IotDbSeries.Fail("IotDb:Enabled=false");
        var sql = BuildSql(device, measurements, fromMs, toMs, maxRows);
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(_budget);
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{_opts.RestUrl.TrimEnd('/')}/rest/v2/query")
            {
                Content = new StringContent(JsonSerializer.Serialize(new { sql }), Encoding.UTF8, "application/json"),
            };
            req.Headers.Authorization = new AuthenticationHeaderValue("Basic", _auth);
            using var res = await _http.CreateClient("IotDbRead").SendAsync(req, cts.Token);
            var json = await res.Content.ReadAsStringAsync(cts.Token);
            var parsed = Parse(json);
            if (parsed.Degraded && IotDbReadClient.IsMissingPath(parsed.Error ?? "")) return Parse("{\"timestamps\":[]}");
            if (parsed.Degraded || !res.IsSuccessStatusCode)
            {
                var error = parsed.Error ?? $"HTTP {(int)res.StatusCode}";
                _log?.LogWarning("IoTDB trace read failed: {Error} - SQL: {Sql}", error, sql);
                return IotDbSeries.Fail(error);
            }
            return parsed;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            _log?.LogWarning("IoTDB trace read unavailable: {Error} - SQL: {Sql}", ex.Message, sql);
            return IotDbSeries.Fail(ex.GetType().Name + ": " + ex.Message);
        }
    }

    /// <summary>The column-oriented REST v2 answer (expressions, data_types, timestamps, values[col][row]) as a series.</summary>
    public static IotDbSeries Parse(string json)
    {
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { return IotDbSeries.Fail("unparseable IoTDB reply"); }
        if (root.ValueKind != JsonValueKind.Object) return IotDbSeries.Fail("unexpected IoTDB reply");
        if (!root.TryGetProperty("timestamps", out var ts) || root.TryGetProperty("code", out _))
        {
            var msg = root.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString() : null;
            var code = root.TryGetProperty("code", out var c) ? c.ToString() : "?";
            return IotDbSeries.Fail($"IoTDB {code}: {msg}");
        }
        var stamps = ts.ValueKind == JsonValueKind.Array ? ts.EnumerateArray().Select(t => t.GetInt64()).ToArray() : Array.Empty<long>();
        var names = root.TryGetProperty("expressions", out var ex) && ex.ValueKind == JsonValueKind.Array
            ? ex.EnumerateArray().Select(e => { var p = e.GetString() ?? ""; var d = p.LastIndexOf('.'); return d >= 0 ? p[(d + 1)..] : p; }).ToList()
            : new List<string>();
        var types = root.TryGetProperty("data_types", out var dt) && dt.ValueKind == JsonValueKind.Array
            ? dt.EnumerateArray().Select(e => e.GetString() ?? "").ToList() : new List<string>();
        var cols = root.TryGetProperty("values", out var vs) && vs.ValueKind == JsonValueKind.Array ? vs.EnumerateArray().ToList() : new List<JsonElement>();
        var values = new Dictionary<string, double?[]>(StringComparer.Ordinal);
        var typeOf = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var ci = 0; ci < names.Count && ci < cols.Count; ci++)
        {
            var type = ci < types.Count ? types[ci] : "DOUBLE";
            var arr = new double?[stamps.Length];
            var col = cols[ci];
            for (var r = 0; r < stamps.Length && r < col.GetArrayLength(); r++)
            {
                if (!TryValue(col[r], type, out var v)) return IotDbSeries.Fail($"IoTDB column {names[ci]} ({type}) holds a non-numeric value");
                arr[r] = v;
            }
            values[names[ci]] = arr;
            typeOf[names[ci]] = type;
        }
        return new IotDbSeries(stamps, values, typeOf, false, null);
    }

    /// <summary>One cell as the double the series stores (null = no point at this row).</summary>
    public static bool TryValue(JsonElement e, string type, out double? value)
    {
        value = null;
        switch (e.ValueKind)
        {
            case JsonValueKind.Null: return true;
            case JsonValueKind.String when e.GetString() is "NaN": value = EvidenceTraceCodec.JavaNaN; return true;
            case JsonValueKind.Number:
                var text = e.GetRawText();
                switch (type)
                {
                    case "FLOAT":
                        if (!float.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var f)) return false;
                        value = f;
                        return true;
                    case "INT32": case "INT64":
                        if (!e.TryGetInt64(out var l)) return false;
                        value = l;
                        return true;
                    default:
                        if (!double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var d)) return false;
                        value = d;
                        return true;
                }
            default: return false;
        }
    }
}
