using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Traverse.CplmApi.Services;

/// <summary>
/// COPY of AMS.Api.Services.IotDbWriteClient (extraction plan 2.3). The original
/// stays in AMS.Api because RawLoopIotDbConsumer still uses it there; a shared
/// package for one class is over-engineering. If you fix a bug here, fix it in
/// src/backend/AMS.Api/Services/IotDbWriteClient.cs too.
///
/// CPLM Phase 3 (3.5/3.7) — write-side IoTDB REST client for the loop historian.
/// Ported from the CPA IotDbClient with two deliberate changes:
///   * explicit schema: EnsureTimeseriesAsync issues CREATE TIMESERIES with a
///     declared datatype before first write to a device, so types are pinned
///     (DOUBLE/TEXT) instead of inferred from whichever literal lands first —
///     Traverse previously had zero CREATE TIMESERIES statements anywhere
///   * batched inserts are the primary path (InsertBatchAsync), not one REST
///     round-trip per sample
/// Read paths stay in historian-bff; this client is writes/DDL only.
/// </summary>
public sealed class IotDbWriteOptions
{
    public const string SectionName = "IotDb";

    /// <summary>When false, all IoTDB writes are skipped (Postgres persistence still applies).</summary>
    public bool Enabled { get; set; } = true;
    /// <summary>IoTDB REST service (our compose exposes it on 8181, not CPA's 18080).</summary>
    public string RestUrl { get; set; } = "http://iotdb:8181";
    public string Username { get; set; } = "root";
    public string Password { get; set; } = "root";
    /// <summary>
    /// Loop-historian tree root: root.&lt;site&gt;.&lt;unit&gt;. With no asset registry yet
    /// (Phase 4), site defaults to site1 and "cpm" stands in for the unit segment,
    /// giving root.site1.cpm.&lt;loop&gt;.{pv,sp,op,vp,mode} per the intake decision
    /// record. Deliberately NOT root.ams.* — that is the alarm tree.
    /// </summary>
    public string LoopRootPrefix { get; set; } = "root.site1.cpm";
}

public sealed class IotDbWriteClient
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly IotDbWriteOptions _opts;
    private readonly ILogger<IotDbWriteClient> _logger;
    private readonly string _authHeader;
    // Devices whose timeseries have been ensured this process lifetime.
    private readonly HashSet<string> _ensuredDevices = new();
    private readonly object _ensureLock = new();

    public IotDbWriteClient(IHttpClientFactory httpFactory, IOptions<IotDbWriteOptions> opts, ILogger<IotDbWriteClient> logger)
    {
        _httpFactory = httpFactory;
        _opts = opts.Value;
        _logger = logger;
        _authHeader = Convert.ToBase64String(Encoding.ASCII.GetBytes($"{_opts.Username}:{_opts.Password}"));
    }

    public bool Enabled => _opts.Enabled;
    public string LoopRootPrefix => _opts.LoopRootPrefix;

    /// <summary>Sanitize a loop id into an IoTDB-safe node name (alphanumeric + underscore).</summary>
    public static string SafeNode(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return "unknown";
        var sb = new StringBuilder(id.Length);
        foreach (var ch in id)
            sb.Append(char.IsLetterOrDigit(ch) ? ch : '_');
        var s = sb.ToString();
        return char.IsDigit(s[0]) ? "_" + s : s;
    }

    /// <summary>
    /// Declare timeseries for a device once per process lifetime. Existing series
    /// make CREATE fail with a "path already exist" error, which is expected and
    /// ignored; anything else is logged. measurement → IoTDB datatype (DOUBLE/TEXT).
    /// </summary>
    public async Task EnsureTimeseriesAsync(string devicePath, IReadOnlyDictionary<string, string> measurements, CancellationToken ct)
    {
        lock (_ensureLock)
        {
            if (!_ensuredDevices.Add(devicePath)) return;
        }
        foreach (var (name, dataType) in measurements)
        {
            var sql = $"create timeseries {devicePath}.{name} with datatype={dataType}";
            await NonQueryAsync(sql, ct, expectAlreadyExists: true);
        }
    }

    /// <summary>Execute a write/DDL statement (INSERT/CREATE/SET TTL).</summary>
    public async Task<bool> NonQueryAsync(string sql, CancellationToken ct, bool expectAlreadyExists = false)
    {
        if (!_opts.Enabled) return false;
        try
        {
            using var http = CreateClient();
            var body = new StringContent(JsonSerializer.Serialize(new { sql }), Encoding.UTF8, "application/json");
            using var res = await http.PostAsync($"{_opts.RestUrl}/rest/v2/nonQuery", body, ct);
            var json = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("IoTDB nonQuery failed ({Status}): {Body} — SQL: {Sql}", res.StatusCode, Trim(json), Trim(sql));
                return false;
            }
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("code", out var code) && code.GetInt32() != 200)
            {
                if (expectAlreadyExists && json.Contains("already exist", StringComparison.OrdinalIgnoreCase))
                    return true;
                _logger.LogWarning("IoTDB nonQuery rejected: {Body} — SQL: {Sql}", Trim(json), Trim(sql));
                return false;
            }
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "IoTDB nonQuery exception — SQL: {Sql}", Trim(sql));
            return false;
        }
    }

    /// <summary>Insert one record (used for low-rate KPI aggregates; samples use the batch path).</summary>
    public Task<bool> InsertAsync(string devicePath, long timestampMs,
        IReadOnlyList<KeyValuePair<string, object?>> fields, CancellationToken ct)
    {
        var cols = new List<string>();
        var vals = new List<string>();
        foreach (var (name, value) in fields)
        {
            if (value is null) continue;
            cols.Add(name);
            vals.Add(FormatValue(value));
        }
        if (cols.Count == 0) return Task.FromResult(false);
        var sql = $"insert into {devicePath}(timestamp,{string.Join(',', cols)}) values({timestampMs},{string.Join(',', vals)})";
        return NonQueryAsync(sql, ct);
    }

    /// <summary>Insert many rows for one device in a single statement — the historian sample path.</summary>
    public Task<bool> InsertBatchAsync(
        string devicePath,
        IReadOnlyList<string> measurements,
        IReadOnlyList<(long TimestampMs, IReadOnlyList<object?> Values)> rows,
        CancellationToken ct)
    {
        if (measurements.Count == 0 || rows.Count == 0) return Task.FromResult(false);

        var valuesSql = new StringBuilder(rows.Count * 64);
        for (var i = 0; i < rows.Count; i++)
        {
            var row = rows[i];
            if (row.Values.Count != measurements.Count)
                throw new ArgumentException("Every IoTDB batch row must match the measurement column count.", nameof(rows));
            if (i > 0) valuesSql.Append(',');
            valuesSql.Append('(').Append(row.TimestampMs);
            foreach (var value in row.Values)
                valuesSql.Append(',').Append(value is null ? "null" : FormatValue(value));
            valuesSql.Append(')');
        }

        var sql = $"insert into {devicePath}(timestamp,{string.Join(',', measurements)}) values{valuesSql}";
        return NonQueryAsync(sql, ct);
    }

    private HttpClient CreateClient()
    {
        var http = _httpFactory.CreateClient("IotDbWrite");
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", _authHeader);
        http.Timeout = TimeSpan.FromSeconds(30);
        return http;
    }

    private static string FormatValue(object value) => value switch
    {
        double d => d.ToString("R", CultureInfo.InvariantCulture),
        float f => f.ToString("R", CultureInfo.InvariantCulture),
        int i => i.ToString(CultureInfo.InvariantCulture),
        long l => l.ToString(CultureInfo.InvariantCulture),
        bool b => b ? "true" : "false",
        string s => "'" + s.Replace("'", "\\'") + "'",
        _ => "'" + value.ToString()!.Replace("'", "\\'") + "'",
    };

    private static string Trim(string s) => s.Length <= 300 ? s : s[..300] + "…";
}
