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

    /// <summary>
    /// CHG-102: "v2" = KPI history in its own databases (<see cref="KpiDatabase"/>,
    /// <see cref="ShortKpiDatabase"/>) under device templates (infra/docker/iotdb-layout-v2.sh).
    /// Anything else = the legacy &lt;prefix&gt;.&lt;loop&gt;.kpi.&lt;family&gt; series.
    /// </summary>
    public string Layout { get; set; } = "v1";
    public string KpiDatabase { get; set; } = "root.hdpe.kpi";
    public string ShortKpiDatabase { get; set; } = "root.hdpe.kpis";
    public bool IsLayoutV2 => string.Equals(Layout, "v2", StringComparison.OrdinalIgnoreCase);
}

/// <summary>Why a statement did or did not land (kept in step with AMS.Api's IotDbWriteOutcome).</summary>
public enum IotDbWriteOutcome
{
    /// <summary>Applied (or, for DDL, already in place).</summary>
    Ok,
    /// <summary>IoTDB evaluated the statement and refused it — retrying the same statement will not help.</summary>
    Rejected,
    /// <summary>Never evaluated: disabled, transport, auth, timeout — retry later.</summary>
    Unavailable,
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
        // P2-15 - previously the device was marked ensured BEFORE any statement
        // ran, and each result was discarded. A transient IoTDB outage on first
        // touch then left the device unpinned for the whole process lifetime -
        // silently defeating the declared-type mechanism in exactly the case it
        // exists for. Only cache the device once every CREATE has succeeded (or
        // already existed); otherwise retry on the next write.
        lock (_ensureLock)
        {
            if (_ensuredDevices.Contains(devicePath)) return;
        }
        var allOk = true;
        foreach (var (name, dataType) in measurements)
        {
            var sql = $"create timeseries {devicePath}.{name} with datatype={dataType}";
            allOk &= await NonQueryAsync(sql, ct, expectAlreadyExists: true);
        }
        if (allOk)
        {
            lock (_ensureLock) { _ensuredDevices.Add(devicePath); }
        }
        else
        {
            _logger.LogWarning("Timeseries DDL incomplete for {Device}; will retry on next write", devicePath);
        }
    }

    /// <summary>Execute a write/DDL statement (INSERT/CREATE/SET TTL).</summary>
    public async Task<bool> NonQueryAsync(string sql, CancellationToken ct, bool expectAlreadyExists = false)
        => await ExecuteAsync(sql, ct, expectAlreadyExists) == IotDbWriteOutcome.Ok;

    /// <summary>Execute a write/DDL statement, reporting why it failed.</summary>
    public async Task<IotDbWriteOutcome> ExecuteAsync(string sql, CancellationToken ct, bool expectAlreadyExists = false)
    {
        if (!_opts.Enabled) return IotDbWriteOutcome.Unavailable;
        try
        {
            using var http = CreateClient();
            var body = new StringContent(JsonSerializer.Serialize(new { sql }), Encoding.UTF8, "application/json");
            using var res = await http.PostAsync($"{_opts.RestUrl}/rest/v2/nonQuery", body, ct);
            var json = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("IoTDB nonQuery failed ({Status}): {Body} — SQL: {Sql}", res.StatusCode, Trim(json), Trim(sql));
                return IotDbWriteOutcome.Unavailable;
            }
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("code", out var code) && code.GetInt32() != 200)
            {
                if (expectAlreadyExists && IsSchemaAlreadyInPlace(json))
                    return IotDbWriteOutcome.Ok;
                _logger.LogWarning("IoTDB nonQuery rejected: {Body} — SQL: {Sql}", Trim(json), Trim(sql));
                return IotDbWriteOutcome.Rejected;
            }
            return IotDbWriteOutcome.Ok;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            // Includes the HttpClient timeout (TaskCanceledException with ct un-cancelled).
            _logger.LogWarning(ex, "IoTDB nonQuery exception — SQL: {Sql}", Trim(sql));
            return IotDbWriteOutcome.Unavailable;
        }
    }

    /// <summary>
    /// A CREATE TIMESERIES refused because the series exists, or (CHG-102 layout v2) because a
    /// device template governs the path (code 701 TemplateIncompatibleException — the template
    /// already declares type, encoding and compressor; inserts activate it).
    /// </summary>
    public static bool IsSchemaAlreadyInPlace(string replyJson) =>
        replyJson.Contains("already exist", StringComparison.OrdinalIgnoreCase)
        || replyJson.Contains("TemplateIncompatibleException", StringComparison.OrdinalIgnoreCase)
        || replyJson.Contains("device template", StringComparison.OrdinalIgnoreCase);

    /// <summary>Insert one record (used for low-rate KPI aggregates; samples use the batch path).</summary>
    public async Task<bool> InsertAsync(string devicePath, long timestampMs,
        IReadOnlyList<KeyValuePair<string, object?>> fields, CancellationToken ct)
        => await InsertRowAsync(devicePath, timestampMs, fields, ct) == IotDbWriteOutcome.Ok;

    /// <summary>Insert one record, reporting the outcome. No non-null field = nothing to write = Ok.</summary>
    public Task<IotDbWriteOutcome> InsertRowAsync(string devicePath, long timestampMs,
        IReadOnlyList<KeyValuePair<string, object?>> fields, CancellationToken ct)
    {
        var sql = BuildInsertSql(devicePath, timestampMs, fields);
        return sql is null ? Task.FromResult(IotDbWriteOutcome.Ok) : ExecuteAsync(sql, ct);
    }

    public static string? BuildInsertSql(string devicePath, long timestampMs,
        IReadOnlyList<KeyValuePair<string, object?>> fields)
    {
        var cols = new List<string>();
        var vals = new List<string>();
        foreach (var (name, value) in fields)
        {
            if (value is null) continue;
            cols.Add(name);
            vals.Add(FormatValue(value));
        }
        if (cols.Count == 0) return null;
        return $"insert into {devicePath}(timestamp,{string.Join(',', cols)}) values({timestampMs},{string.Join(',', vals)})";
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
