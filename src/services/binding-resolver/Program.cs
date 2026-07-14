using StackExchange.Redis;
using Traverse.BindingResolver.Models;
using Traverse.BindingResolver.Services;

using Traverse.Auth;

var builder = WebApplication.CreateBuilder(args);

// ── Redis ───────────────────────────────────────────────────────────────────
var redisHost = builder.Configuration["Redis:Host"] ?? "redis";
var redisPort = builder.Configuration.GetValue<int>("Redis:Port", 6379);
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect($"{redisHost}:{redisPort},abortConnect=false"));

// ── HTTP Clients ─────────────────────────────────────────────────────────────
builder.Services.AddHttpClient("AssetModel", client =>
{
    var baseUrl = builder.Configuration["Services:AssetModel"] ?? "http://asset-model:5000";
    client.BaseAddress = new Uri(baseUrl);
    client.Timeout = TimeSpan.FromSeconds(5);
    // asset-model now requires authorization. This call has no user context (it happens while resolving
    // a binding), so it authenticates as a service principal with the shared internal key.
    var serviceKey = builder.Configuration["Auth:ServiceKey"];
    if (!string.IsNullOrEmpty(serviceKey))
        client.DefaultRequestHeaders.Add(TraverseAuthExtensions.ServiceKeyHeader, serviceKey);
});

// ── Services ─────────────────────────────────────────────────────────────────
builder.Services.AddScoped<PathResolver>();

// ── Auth (platform RBAC) ────────────────────────────────────────────────────
// RS256 bearer validation against auth-service JWKS + a policy per permission key.
// Internal callers (e.g. binding-resolver → asset-model) authenticate with X-Service-Key.
builder.AddTraverseAuth();

var app = builder.Build();

app.UseTraverseAuth();

// ── GET /health ─────────────────────────────────────────────────────────────
app.MapGet("/health", async (IConnectionMultiplexer redis) =>
{
    var checks = new Dictionary<string, object>();
    var redisStatus = "Healthy";

    try
    {
        var db = redis.GetDatabase();
        var latency = await db.PingAsync();
        checks["redis"] = new { status = "Healthy", description = $"PING {latency.TotalMilliseconds:F1} ms" };
    }
    catch (Exception ex)
    {
        redisStatus = "Unhealthy";
        checks["redis"] = new { status = "Unhealthy", description = ex.Message };
    }

    var overall = redisStatus == "Healthy" ? "Healthy" : "Degraded";
    return overall == "Healthy"
        ? Results.Json(new { status = overall, checks })
        : Results.Json(new { status = overall, checks }, statusCode: StatusCodes.Status503ServiceUnavailable);
});

// ── GET /resolve ─────────────────────────────────────────────────────────────
// Resolves a single path to transport bindings.
// Query params: path (required), roles (optional, comma-separated: live,history,alarm or all)
app.MapGet("/resolve", async (
    string path,
    string? roles,
    PathResolver resolver) =>
{
    if (string.IsNullOrWhiteSpace(path))
        return Results.BadRequest("'path' is required");
    
    var roleList = string.IsNullOrWhiteSpace(roles)
        ? new[] { "all" }
        : roles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    
    var binding = await resolver.ResolveAsync(path, roleList);
    return binding.Resolved 
        ? Results.Ok(binding) 
        : Results.NotFound(binding);
}).RequireAuthorization("binding.resolve");

// ── POST /resolve/batch ──────────────────────────────────────────────────────
// Resolves multiple paths in a single request.
app.MapPost("/resolve/batch", async (
    BatchBindingRequest request,
    PathResolver resolver) =>
{
    if (request.Bindings is null || request.Bindings.Length == 0)
        return Results.BadRequest("At least one binding is required");
    
    if (request.Bindings.Length > 100)
        return Results.BadRequest("Maximum 100 bindings per request");
    
    var results = await Task.WhenAll(
        request.Bindings.Select(b => resolver.ResolveAsync(b.Path, b.Roles)));
    
    return Results.Ok(new { bindings = results });
}).RequireAuthorization("binding.resolve");

// ── GET /resolve/alias ───────────────────────────────────────────────────────
// Resolves a legacy path to canonical path and then to bindings.
// Query params: legacy (required), source (optional), roles (optional)
app.MapGet("/resolve/alias", async (
    string legacy,
    string? source,
    string? roles,
    PathResolver resolver) =>
{
    if (string.IsNullOrWhiteSpace(legacy))
        return Results.BadRequest("'legacy' path is required");
    
    var canonicalPath = await resolver.TryResolveAliasAsync(legacy, source);
    if (canonicalPath is null)
        return Results.NotFound(new { error = $"No alias mapping found for '{legacy}'" });
    
    var roleList = string.IsNullOrWhiteSpace(roles)
        ? new[] { "all" }
        : roles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    
    var binding = await resolver.ResolveAsync(canonicalPath, roleList);
    return Results.Ok(new { legacyPath = legacy, canonicalPath, binding });
}).RequireAuthorization("binding.resolve");

// ── GET /preview ─────────────────────────────────────────────────────────────
// Preview binding resolution without hitting Asset Model (pattern-based only).
// Useful for testing path formats.
app.MapGet("/preview", (string path, PathResolver resolver) =>
{
    if (string.IsNullOrWhiteSpace(path))
        return Results.BadRequest("'path' is required");
    
    // Parse path and show what the generated bindings would be
    var parts = path.Split('/');
    if (parts.Length < 2)
        return Results.BadRequest("Invalid path format. Expected: site/[area/]unit/device[.measurement]");
    
    var site = parts[0];
    var edgeNode = $"{site}_edge1";
    var lastPart = parts[^1];
    var dotIndex = lastPart.IndexOf('.');
    var device = dotIndex >= 0 ? lastPart[..dotIndex] : lastPart;
    var metric = dotIndex >= 0 ? lastPart[(dotIndex + 1)..] : null;
    var deviceId = parts.Length >= 3 ? $"{parts[^2]}_{device}" : device;
    
    return Results.Ok(new
    {
        input = path,
        parsed = new
        {
            site,
            area = parts.Length > 3 ? parts[1] : null,
            unit = parts.Length >= 3 ? parts[^2] : null,
            device,
            measurement = metric
        },
        generated = new
        {
            iotdbPath = $"root.{path.Replace('/', '.').Replace(' ', '_')}",
            sparkplugTopic = $"spBv1.0/{site}/DDATA/{edgeNode}/{deviceId}",
            sparkplugGroup = site,
            sparkplugEdgeNode = edgeNode,
            sparkplugDevice = deviceId,
            sparkplugMetric = metric,
            alarmSource = $"{site}:{(parts.Length >= 3 ? parts[^2] : "default")}:{device}",
            redisSnapshotKey = metric != null 
                ? $"snapshot:metric:{site}:{edgeNode}:{deviceId}:{metric}" 
                : null
        }
    });
}).RequireAuthorization("binding.resolve");

app.Run();
