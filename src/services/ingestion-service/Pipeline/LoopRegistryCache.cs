using System.Text.Json;

namespace Traverse.IngestionService.Pipeline;

/// <summary>The registry fields the pipeline enriches from (cpm.loop_registry row).</summary>
public sealed record RegistryLoop(
    string LoopId, string? AssetUuid, string Site, string? Area, string? Unit,
    string LoopType, bool IsActive);

/// <summary>
/// Pulls the CPM Loop Registry over REST. cplm-api's internal service principal
/// grants analytics.view (compose Auth__ServicePermissions), so the shared
/// X-Service-Key authorizes the read — the registry service stays the single
/// owner of its schema (doc 03 §3: prefer REST over reading traverse_cplm).
/// </summary>
public sealed class CplmRegistryClient
{
    private readonly HttpClient _http;

    public CplmRegistryClient(HttpClient http, IConfiguration config)
    {
        _http = http;
        _http.BaseAddress = new Uri(config["Services:CplmApi"] ?? "http://cplm-api:5000");
        _http.Timeout = TimeSpan.FromSeconds(15);
        var serviceKey = config["Auth:ServiceKey"];
        if (!string.IsNullOrEmpty(serviceKey))
            _http.DefaultRequestHeaders.Add("X-Service-Key", serviceKey);
    }

    public async Task<IReadOnlyList<RegistryLoop>> FetchLoopsAsync(CancellationToken ct)
    {
        using var response = await _http.GetAsync("/api/v1/cpm/loops", ct);
        response.EnsureSuccessStatusCode();
        return ParseLoops(await response.Content.ReadAsStringAsync(ct));
    }

    /// <summary>Parses the { loops: [CpmLoopDto...], count } wrapper (camelCase);
    /// tolerates a bare array. Kept static + public for tests.</summary>
    public static IReadOnlyList<RegistryLoop> ParseLoops(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var array = doc.RootElement.ValueKind == JsonValueKind.Array
            ? doc.RootElement
            : doc.RootElement.GetProperty("loops");

        var loops = new List<RegistryLoop>();
        foreach (var el in array.EnumerateArray())
        {
            var loopId = Str(el, "loopId");
            if (string.IsNullOrWhiteSpace(loopId)) continue;
            loops.Add(new RegistryLoop(
                loopId!,
                Str(el, "assetId"),
                Str(el, "site") ?? "",
                Str(el, "area"),
                Str(el, "unit"),
                Str(el, "loopType") ?? "UNKNOWN",
                !el.TryGetProperty("isActive", out var ia) || ia.ValueKind != JsonValueKind.False));
        }
        return loops;

        static string? Str(JsonElement e, string name) =>
            e.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
    }
}

/// <summary>
/// O(1) per-message resolver: case-insensitive loop_id → registry row, swapped
/// atomically on refresh. A refresh failure keeps the previous map (fail loud, not
/// empty). A newly activated loop starts flowing on the next refresh — no restart.
/// </summary>
public sealed class LoopRegistryCache
{
    private volatile Dictionary<string, RegistryLoop> _byId;
    public DateTimeOffset? LastRefreshed { get; private set; }
    public int Count => _byId.Count;

    public LoopRegistryCache() : this(Array.Empty<RegistryLoop>()) { }
    public LoopRegistryCache(IReadOnlyList<RegistryLoop> initial) => _byId = Build(initial);

    public bool TryResolve(string loopTag, out RegistryLoop loop)
    {
        if (_byId.TryGetValue(loopTag, out var found) && found.IsActive)
        {
            loop = found;
            return true;
        }
        loop = default!;
        return false;
    }

    public async Task<bool> RefreshAsync(CplmRegistryClient client, ILogger logger, CancellationToken ct)
    {
        try
        {
            _byId = Build(await client.FetchLoopsAsync(ct));
            LastRefreshed = DateTimeOffset.UtcNow;
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning("Loop registry refresh failed: {Message} — keeping previous map ({Count} loops)",
                ex.Message, Count);
            return false;
        }
    }

    private static Dictionary<string, RegistryLoop> Build(IReadOnlyList<RegistryLoop> loops) =>
        loops.GroupBy(l => l.LoopId, StringComparer.OrdinalIgnoreCase)
             .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
}
